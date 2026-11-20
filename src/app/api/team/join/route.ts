// Creates a worker's account from a team invite code, so they can join their team.
// Only works when SUPABASE_SERVICE_ROLE_KEY is set on the server, and only for a live invite code. The key never
// leaves the server. Without it this answers 501 and the join page falls back to a normal sign-up.
//
// Abuse rules (a live invite code must not become a free account factory):
// - One account per code: the account created is remembered on the invite (team_invites.created_user_id), and the
//   code creates no more. A short claim (signup_claimed_at) stops two sign-ups racing with one code.
// - When the invite was sent to an email address (team_invites.email), only that address can sign up with it.
// - The account is always created unconfirmed and Supabase emails a confirmation link (answer:
//   { ok: true, confirmEmail: true }). Never pre-confirmed, even for an invite with an email: the team's owner and
//   admins choose that address and can see the code, so a matching email doesn't prove the person owns the inbox.
// - Shared rate limits per IP and per code (src/lib/server/rateLimit.ts durableRateLimit), and a Cloudflare
//   Turnstile check when TURNSTILE_SECRET_KEY is set.
// Terms: when the page sends acceptedTerms: true, the time and terms version are kept in the user's metadata.
import { connection } from "next/server";
import { joinUrl, normalizeCode, PASSWORD_MIN, signupProblem } from "@/lib/teamLogic";
import { appOrigin } from "@/lib/server/email";
import { clientIp, durableRateLimit, waitText } from "@/lib/server/rateLimit";

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

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** GET: does this server create accounts here, and does it want a Turnstile check? (No secrets.) */
export async function GET() {
  await connection();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
  return json({ available: !!(supabaseUrl() && anonKey() && serviceKey()), captcha: !!process.env.TURNSTILE_SECRET_KEY && !!siteKey, turnstileSiteKey: siteKey });
}

/** Supabase's password complaints, in plain words (never its raw text). */
function passwordMessage(err: { error_code?: string; weak_password?: { reasons?: string[] } | null }): string {
  const reasons = err.weak_password?.reasons ?? [];
  if (reasons.includes("pwned")) return "That password has shown up in a data leak. Choose a different one.";
  if (reasons.includes("length")) return `Use a longer password (at least ${PASSWORD_MIN} characters).`;
  if (reasons.includes("characters")) return "Use a mix of upper and lower case letters, numbers and symbols in your password.";
  return "Choose a stronger password.";
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
  created_user_id: string | null;
  signup_claimed_at: string | null;
}

export async function POST(req: Request) {
  const url = supabaseUrl();
  const service = serviceKey();
  if (!url || !anonKey() || !service) return json({ error: "Instant sign-up isn't set up on this server.", code: "unavailable" }, 501);
  const admin = { apikey: service, Authorization: `Bearer ${service}` };

  let body: { code?: unknown; email?: unknown; password?: unknown; name?: unknown; acceptedTerms?: unknown; termsVersion?: unknown; turnstileToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request.", code: "bad_request" }, 400);
  }
  const code = typeof body.code === "string" ? normalizeCode(body.code) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const problem = signupProblem({ code, email, password, name });
  if (problem) return json({ error: problem, code: "bad_request" }, 400);

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
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken.slice(0, 2048) : "";
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

  // Who the invite is for, and whether it already made an account (service role: these columns aren't public).
  let invite: InviteRow | undefined;
  try {
    const r = await fetch(`${invitePath}&select=code,email,created_user_id,signup_claimed_at`, { headers: admin, cache: "no-store" });
    // Columns missing (migration 20261124100400 not run) or a bad key: let the page use the normal sign-up.
    if (!r.ok) {
      console.error("[team join] invite lookup failed", r.status);
      return json({ error: "Instant sign-up isn't working on this server.", code: "unavailable" }, 501);
    }
    invite = ((await r.json()) as InviteRow[])[0];
  } catch {
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }
  if (!invite) return json({ error: "That invite code isn't valid any more. Ask for a new one.", code: "invalid_code" }, 400);
  if (invite.created_user_id)
    return json({ error: "An account was already made with this invite. Confirm it from the email we sent, then sign in, or ask for a new invite.", code: "code_used" }, 409);
  if (invite.email && invite.email !== email)
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

  const meta: Record<string, unknown> = {};
  if (name) meta.name = name;
  if (body.acceptedTerms === true) {
    meta.terms_accepted_at = now.toISOString();
    meta.terms_version = typeof body.termsVersion === "string" && /^[\w.-]{1,32}$/.test(body.termsVersion) ? body.termsVersion : DEFAULT_TERMS_VERSION();
  }

  let userId: string;
  try {
    const r = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: false, user_metadata: meta }),
      cache: "no-store",
    });
    const res = (await r.json().catch(() => ({}))) as {
      id?: string;
      user?: { id?: string };
      msg?: string;
      message?: string;
      error_code?: string;
      weak_password?: { reasons?: string[] } | null;
    };
    if (!r.ok) {
      await release();
      const msg = res.msg ?? res.message ?? "";
      if (res.error_code === "weak_password" || (/password/i.test(msg) && !/already/i.test(msg))) return json({ error: passwordMessage(res), code: "weak_password" }, 400);
      if (res.error_code === "email_exists" || /already (been )?registered|already exists/i.test(msg))
        return json({ error: "There's already an account with this email. Sign in instead.", code: "exists" }, 409);
      // A wrong or revoked service key: let the page fall back to the normal sign-up.
      if (r.status === 401 || r.status === 403) return json({ error: "Instant sign-up isn't working on this server.", code: "unavailable" }, 501);
      console.error("[team join] create user failed", r.status, res.error_code ?? "");
      return json({ error: "Couldn't create the account. Try again in a minute.", code: "upstream" }, 502);
    }
    const id = res.id ?? res.user?.id;
    if (!id) {
      await release();
      return json({ error: "Couldn't create the account. Try again in a minute.", code: "upstream" }, 502);
    }
    userId = id;
  } catch {
    await release();
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }

  // Remember the account on the invite: the code makes no more.
  try {
    const done = await patchInvite("", { created_user_id: userId });
    if (!done.ok) console.error("[team join] couldn't record the account on the invite", done.status);
  } catch (e) {
    console.error("[team join] couldn't record the account on the invite", e);
  }

  // Ask Supabase to send its confirmation email, which brings them back to this invite.
  try {
    const redirect = encodeURIComponent(joinUrl(appOrigin(req), code));
    const r = await fetch(`${url}/auth/v1/resend?redirect_to=${redirect}`, {
      method: "POST",
      headers: { apikey: anonKey()!, Authorization: `Bearer ${anonKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "signup", email }),
      cache: "no-store",
    });
    if (!r.ok) console.error("[team join] confirmation email failed", r.status);
  } catch (e) {
    console.error("[team join] confirmation email failed", e);
  }
  return json({ ok: true, confirmEmail: true });
}
