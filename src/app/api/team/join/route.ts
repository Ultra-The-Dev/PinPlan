// Creates a worker's account from a team invite, so they can join their team.
// Only works when SUPABASE_SERVICE_ROLE_KEY is set on the server, and only for a live invite code that Northpin itself
// emailed. The key never leaves the server. Otherwise this answers 501 and the join page falls back to a normal
// sign-up (Supabase's own sign-up, with its own confirmation email and limits).
//
// Abuse rules (a live invite code must not become a free account factory or a way to send email):
// - Only for an invite that was emailed by /api/team/invite-email (team_invites.email and invite_emailed_at, both set
//   by the server), and only for that address. A code shared by text or copied link uses the normal sign-up.
// - One account per code: the account created is remembered on the invite (team_invites.created_user_id), and the
//   code creates no more. A short claim (signup_claimed_at) stops two sign-ups racing with one code.
// - The email Supabase sends counts against the inviting company's invite allowance (sendGuard reserveSend with the
//   invite's created_by), so it can't be used to send unlimited auth email.
// - No password from the requester: the account is created without one and Supabase emails an invite link to the
//   address. Only whoever reads that inbox can get in, so nobody can make (and keep the password of) an account for
//   someone else's address before they sign up.
// - An address that already has an account gets the same answer ({ ok: true, confirmEmail: true }) and a sign-in link
//   instead, so this can't be used to find out who has an account.
// - The terms must be accepted (acceptedTerms: true); the version is kept in the user's metadata and recorded in
//   terms_acceptances by the database when the account is created.
// - Shared rate limits per IP and per code (src/lib/server/rateLimit.ts durableRateLimit), and a Cloudflare
//   Turnstile check when TURNSTILE_SECRET_KEY is set: the page sends the widget's token as `captchaToken` (the name
//   Supabase Auth uses too; `turnstileToken` is still read for older pages), and it is checked with Cloudflare.
import { connection } from "next/server";
import { joinUrl, normalizeCode } from "@/lib/teamLogic";
import { appOrigin, validEmail } from "@/lib/server/email";
import { clientIp, durableRateLimit, waitText } from "@/lib/server/rateLimit";
import { finishSend, reserveSend } from "@/lib/server/sendGuard";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

// Per hour. A code is single-use, so a handful of tries per code is plenty for typos.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_CODE = 5;
const MAX_PER_IP = 20;
/** A claim older than this was left by a request that died; the next sign-up may take over. */
const CLAIM_TTL_MS = 2 * 60 * 1000;
/** Terms version recorded when the page doesn't say which one the person accepted. */
const DEFAULT_TERMS_VERSION = () => process.env.PINPLAN_TERMS_VERSION?.trim() || "2026-11";
/** The join form is a few short fields. */
const MAX_BODY_BYTES = 8 * 1024;

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The same answer whether the account is new or the address already had one. */
const CHECK_EMAIL = { ok: true, confirmEmail: true } as const;
/** Use the normal sign-up (the page falls back on 501). */
const normalSignup = () => json({ error: "Sign up with your email and a password instead.", code: "signup_required" }, 501);

/** GET: does this server create accounts here, and does it want a Turnstile check? (No secrets.) */
export async function GET() {
  await connection();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
  return json({ available: !!(supabaseUrl() && anonKey() && serviceKey()), captcha: !!process.env.TURNSTILE_SECRET_KEY && !!siteKey, turnstileSiteKey: siteKey });
}

// TODO: use readJsonLimited from src/lib/server/readBody.ts once it is merged (package 03); this is a minimal copy.
async function readJsonLimited(req: Request, max: number): Promise<{ ok: true; value: unknown } | { ok: false; status: number }> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return { ok: false, status: 413 };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400 };
  }
  if (new TextEncoder().encode(text).length > max) return { ok: false, status: 413 };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}

async function turnstileOk(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY!;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip !== "unknown") form.set("remoteip", ip);
    const r = await fetch(TURNSTILE_VERIFY, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return false;
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

interface InviteRow {
  code: string;
  email: string | null;
  created_by: string | null;
  created_user_id: string | null;
  signup_claimed_at: string | null;
  invite_emailed_at: string | null;
}

export async function POST(req: Request) {
  const url = supabaseUrl();
  const service = serviceKey();
  if (!url || !anonKey() || !service) return json({ error: "Instant sign-up isn't set up on this server.", code: "unavailable" }, 501);
  const admin = { apikey: service, Authorization: `Bearer ${service}` };

  const read = await readJsonLimited(req, MAX_BODY_BYTES);
  if (!read.ok) return json({ error: read.status === 413 ? "That request is too large." : "Invalid request.", code: "bad_request" }, read.status);
  const body = (read.value && typeof read.value === "object" ? read.value : {}) as {
    code?: unknown;
    email?: unknown;
    name?: unknown;
    acceptedTerms?: unknown;
    termsVersion?: unknown;
    captchaToken?: unknown;
    turnstileToken?: unknown;
  };
  const code = typeof body.code === "string" ? normalizeCode(body.code) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (code.length < 8 || code.length > 64) return json({ error: "Enter the invite code you were sent.", code: "bad_request" }, 400);
  if (!validEmail(email)) return json({ error: "Enter a valid email address.", code: "bad_request" }, 400);
  if (name.length > 80) return json({ error: "Keep your name under 80 characters.", code: "bad_request" }, 400);
  if (body.acceptedTerms !== true) return json({ error: "Accept the terms to create your account.", code: "terms_required" }, 400);

  const ip = clientIp(req);
  for (const [key, max] of [
    [`join-ip:${ip}`, MAX_PER_IP],
    [`join-code:${code}`, MAX_PER_CODE],
  ] as const) {
    const r = await durableRateLimit(key, { limit: max, windowMs: WINDOW_MS });
    if (!r.ok)
      return json({ error: `Too many tries. Wait ${waitText(r.retryAfter)} and try again.`, code: "rate_limited", retryAfter: r.retryAfter }, 429, {
        "Retry-After": String(r.retryAfter),
      });
  }

  if (process.env.TURNSTILE_SECRET_KEY) {
    const raw = typeof body.captchaToken === "string" && body.captchaToken ? body.captchaToken : body.turnstileToken;
    const token = typeof raw === "string" && raw.length <= 2048 ? raw : "";
    if (!token || !(await turnstileOk(token, ip))) return json({ error: "Finish the security check, then try again.", code: "captcha_failed" }, 400);
  }

  // The code must be live (not used, revoked or expired). Asked as the public would ask (anon key).
  try {
    const info = await fetch(`${url}/rest/v1/rpc/team_invite_info`, {
      method: "POST",
      headers: { apikey: anonKey()!, Authorization: `Bearer ${anonKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code }),
      cache: "no-store",
    });
    if (info.status === 404) return json({ error: "Teams aren't set up on this server yet.", code: "unavailable" }, 501);
    if (!info.ok) return json({ error: "Couldn't check the invite code. Try again.", code: "upstream" }, 502);
    const data = (await info.json()) as unknown;
    if (!data) return json({ error: "That invite code isn't valid any more. Ask for a new one.", code: "invalid_code" }, 400);
  } catch {
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }

  const invitePath = `${url}/rest/v1/team_invites?code=eq.${encodeURIComponent(code)}`;
  const patchInvite = (filter: string, patch: Record<string, unknown>) =>
    fetch(`${invitePath}${filter}`, {
      method: "PATCH",
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(patch),
      cache: "no-store",
    });

  // Who the invite is for, whether Northpin emailed it, and whether it already made an account (service role: these
  // columns aren't public).
  let invite: InviteRow | undefined;
  try {
    const r = await fetch(`${invitePath}&select=code,email,created_by,created_user_id,signup_claimed_at,invite_emailed_at`, { headers: admin, cache: "no-store" });
    // Columns missing (migrations not run) or a bad key: let the page use the normal sign-up.
    if (!r.ok) {
      console.error("[team join] invite lookup failed", r.status);
      return json({ error: "Instant sign-up isn't working on this server.", code: "unavailable" }, 501);
    }
    invite = ((await r.json()) as InviteRow[])[0];
  } catch {
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }
  if (!invite) return json({ error: "That invite code isn't valid any more. Ask for a new one.", code: "invalid_code" }, 400);
  // Not emailed by Northpin (shared by text or link): the normal sign-up, which proves the address itself.
  if (!invite.email || !invite.invite_emailed_at || !invite.created_by) return normalSignup();
  if (invite.created_user_id)
    return json({ error: "An account was already made with this invite. Open the link we emailed you, or ask for a new invite.", code: "code_used" }, 409);
  if (invite.email !== email)
    return json({ error: "This invite was sent to a different email address. Use that address, or ask for a new invite.", code: "email_mismatch" }, 403);

  // Claim the code so a second sign-up running at the same moment can't make a second account.
  const now = new Date();
  const stale = new Date(now.getTime() - CLAIM_TTL_MS).toISOString();
  try {
    const claim = await patchInvite(`&created_user_id=is.null&or=(signup_claimed_at.is.null,signup_claimed_at.lt.${encodeURIComponent(`"${stale}"`)})`, {
      signup_claimed_at: now.toISOString(),
    });
    if (!claim.ok) return json({ error: "Instant sign-up isn't working on this server.", code: "unavailable" }, 501);
    if (!((await claim.json()) as unknown[]).length)
      return json({ error: "Someone is already signing up with this invite. Try again in a minute.", code: "code_busy" }, 409);
  } catch {
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }
  const release = () => patchInvite("&created_user_id=is.null", { signup_claimed_at: null }).catch(() => undefined);

  // The email Supabase is about to send counts against the inviting company (confirmed sender, active plan, daily
  // invite cap, Northpin's platform cap). Refused: the normal sign-up instead.
  const guard = await reserveSend(invite.created_by, "invite", email);
  if (!guard.ok) {
    await release();
    return normalSignup();
  }

  const origin = appOrigin(req);
  const redirect = origin ? `?redirect_to=${encodeURIComponent(joinUrl(origin, code))}` : "";
  const meta: Record<string, unknown> = {
    terms_accepted_at: now.toISOString(),
    terms_version: typeof body.termsVersion === "string" && /^[\w.-]{1,32}$/.test(body.termsVersion) ? body.termsVersion : DEFAULT_TERMS_VERSION(),
  };
  if (name) meta.name = name;

  // Supabase creates the account without a password and emails the invite link (it signs them in and brings them
  // back to this invite).
  let userId: string;
  try {
    const r = await fetch(`${url}/auth/v1/invite${redirect}`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ email, data: meta }),
      cache: "no-store",
    });
    const res = (await r.json().catch(() => ({}))) as { id?: string; user?: { id?: string }; msg?: string; message?: string; error_code?: string };
    if (!r.ok) {
      await release();
      const msg = res.msg ?? res.message ?? "";
      if (res.error_code === "email_exists" || /already (been )?registered|already exists/i.test(msg)) {
        // Same answer as a new account (no way to tell who has one); they get a sign-in link back to the invite.
        const sent = await signInLink(url, admin, email, redirect);
        await finishSend(guard, sent ? { ok: true, id: null } : { ok: false });
        return json(CHECK_EMAIL);
      }
      await finishSend(guard, { ok: false });
      // A wrong or revoked service key: let the page fall back to the normal sign-up.
      if (r.status === 401 || r.status === 403) return json({ error: "Instant sign-up isn't working on this server.", code: "unavailable" }, 501);
      console.error("[team join] invite user failed", r.status, res.error_code ?? "");
      return json({ error: "Couldn't create the account. Try again in a minute.", code: "upstream" }, 502);
    }
    const id = res.id ?? res.user?.id;
    if (!id) {
      await release();
      await finishSend(guard, { ok: false });
      return json({ error: "Couldn't create the account. Try again in a minute.", code: "upstream" }, 502);
    }
    userId = id;
  } catch {
    await release();
    await finishSend(guard, { ok: false });
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }
  await finishSend(guard, { ok: true, id: null });

  // Remember the account on the invite: the code makes no more.
  try {
    const done = await patchInvite("", { created_user_id: userId });
    if (!done.ok) console.error("[team join] couldn't record the account on the invite", done.status);
  } catch (e) {
    console.error("[team join] couldn't record the account on the invite", e);
  }
  return json(CHECK_EMAIL);
}

/** A one-time sign-in link for an address that already has an account (never creates one). Best effort. */
async function signInLink(url: string, admin: Record<string, string>, email: string, redirect: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/auth/v1/otp${redirect}`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ email, create_user: false }),
      cache: "no-store",
    });
    if (!r.ok) console.error("[team join] sign-in link failed", r.status);
    return r.ok;
  } catch {
    console.error("[team join] sign-in link failed");
    return false;
  }
}
