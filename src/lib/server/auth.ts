// Request authentication for API routes (server-only).
// - Supabase configured: the caller must send a valid Supabase access token (Authorization: Bearer …). The team
//   access code (x-pinplan-access) is ignored unless PINPLAN_ALLOW_ACCESS_CODE=1: on a multi-company server a shared
//   code would let anyone holding it act without an account.
// - Otherwise, if PINPLAN_ACCESS_CODE is set: the caller must send it in the x-pinplan-access header.
// - Otherwise (local / development use): open. In production (VERCEL_ENV or NODE_ENV "production") an open server
//   fails closed (503 "Server not configured") unless PINPLAN_ALLOW_OPEN=1 says it is meant to be open, so a
//   deployment that lost its Supabase settings never quietly serves everyone.
import { createHash, timingSafeEqual } from "node:crypto";

export type AuthResult = { ok: true; userId: string | null } | { ok: false; response: Response };

const deny = (message: string, code: string): AuthResult => ({ ok: false, response: Response.json({ error: message, code }, { status: 401 }) });
const unconfigured = (): AuthResult => ({
  ok: false,
  response: Response.json({ error: "Server not configured", code: "server_not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } }),
});

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function authMode(): "supabase" | "access_code" | "open" {
  if (supabaseUrl() && anonKey()) return "supabase";
  if (process.env.PINPLAN_ACCESS_CODE) return "access_code";
  return "open";
}

/**
 * A production deployment (PINPLAN_ENV=production, e.g. Cloudflare Workers; Vercel production; or a production Node
 * build). Previews and `next dev` are not.
 */
export function isProduction(): boolean {
  const pinplan = process.env.PINPLAN_ENV;
  if (pinplan) return pinplan === "production";
  const vercel = process.env.VERCEL_ENV;
  if (vercel) return vercel === "production";
  return process.env.NODE_ENV === "production";
}

/** Open mode in production without PINPLAN_ALLOW_OPEN=1: every protected route answers 503. */
export function openModeRefused(): boolean {
  return authMode() === "open" && isProduction() && process.env.PINPLAN_ALLOW_OPEN !== "1";
}

/** Does this server accept the team access code? Always in access-code mode; with Supabase only when opted in. */
export function accessCodeAccepted(): boolean {
  const code = process.env.PINPLAN_ACCESS_CODE;
  if (!code) return false;
  const mode = authMode();
  return mode === "access_code" || (mode === "supabase" && process.env.PINPLAN_ALLOW_ACCESS_CODE === "1");
}

function sameSecret(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function requireUser(request: Request): Promise<AuthResult> {
  const mode = authMode();
  if (mode === "open") return openModeRefused() ? unconfigured() : { ok: true, userId: null };
  if (mode === "access_code") {
    const given = request.headers.get("x-pinplan-access") ?? "";
    return given && sameSecret(given, process.env.PINPLAN_ACCESS_CODE!) ? { ok: true, userId: null } : deny("Enter the team access code in Settings.", "access_code_required");
  }
  // Older native builds signed in with the team access code. With accounts on, that only works when the server opts
  // in (PINPLAN_ALLOW_ACCESS_CODE=1, e.g. a single-company server during the move to accounts); otherwise it's ignored.
  const code = request.headers.get("x-pinplan-access");
  if (code && accessCodeAccepted() && sameSecret(code, process.env.PINPLAN_ACCESS_CODE!)) return { ok: true, userId: null };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return deny("Sign in to use this feature.", "sign_in_required");
  try {
    const r = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey()! }, cache: "no-store" });
    if (!r.ok) return deny("Your session has expired. Sign in again.", "sign_in_required");
    const u = (await r.json()) as { id?: string };
    return { ok: true, userId: u.id ?? null };
  } catch {
    return deny("Could not verify your session.", "sign_in_required");
  }
}

/** The caller's team role, read with their own token (RLS lets members see their own row). Null: not on a team. */
export async function teamRole(request: Request, userId: string): Promise<"owner" | "admin" | "tech" | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !supabaseUrl() || !anonKey()) return null;
  const r = await fetch(`${supabaseUrl()}/rest/v1/team_members?select=role&user_id=eq.${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey()!, Accept: "application/json" },
    cache: "no-store",
  });
  // No team tables yet (migration not run): nobody is a technician.
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Could not check your team role (${r.status}).`);
  const rows = (await r.json()) as { role?: string }[];
  const role = rows[0]?.role;
  return role === "owner" || role === "admin" || role === "tech" ? role : null;
}

/** Like requireUser, but technicians are refused: prices, estimates and Billdu are office work. */
export async function requireOffice(request: Request): Promise<AuthResult> {
  const auth = await requireUser(request);
  if (!auth.ok || !auth.userId) return auth;
  try {
    if ((await teamRole(request, auth.userId)) === "tech")
      return { ok: false, response: Response.json({ error: "Billdu and prices are handled by the office. Ask an admin on your team.", code: "office_only" }, { status: 403 }) };
  } catch (e) {
    return { ok: false, response: Response.json({ error: (e as Error).message, code: "role_check_failed" }, { status: 503 }) };
  }
  return auth;
}

/** Sign-in methods that prove the person is here now: their password, or a code or link sent to their email. */
const FRESH_METHODS = new Set(["password", "otp", "magiclink"]);

function claimsOf(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const v = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * When the person last actually signed in with a password, an emailed code or a sign-in link: the newest such entry in
 * the token's `amr` (seconds since 1970), or null. A refreshed token gets a new `iat`, and the browser refreshes on its
 * own, as can anyone holding a stolen refresh token, so `iat` never counts. Only call this on a token Supabase has
 * already accepted (requireUser / /auth/v1/user): it decodes, it doesn't verify.
 */
export function lastSignInAt(token: string): number | null {
  const amr = claimsOf(token)?.amr;
  if (!Array.isArray(amr)) return null;
  const times = amr
    .filter((m): m is { method?: unknown; timestamp?: unknown } => !!m && typeof m === "object")
    .filter((m) => typeof m.method === "string" && FRESH_METHODS.has(m.method))
    .map((m) => m.timestamp)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  return times.length ? Math.max(...times) : null;
}

/**
 * For actions a stolen session must not be able to take (deleting the account): the token must carry a sign-in from
 * the last `maxAgeSec` seconds. Otherwise 401 { code: "reauth_required" }: the apps ask for the password (or send a
 * sign-in link) and try again. Same caveat as lastSignInAt: only on a token Supabase has accepted.
 */
export function requireFreshAuth(token: string, maxAgeSec: number, message: string, now = Date.now()): { ok: true } | { ok: false; response: Response } {
  const at = lastSignInAt(token);
  const age = at == null ? Infinity : now / 1000 - at;
  // A sign-in time in the future (beyond a minute of clock skew) isn't believed either.
  if (age < maxAgeSec && age > -60) return { ok: true };
  return { ok: false, response: Response.json({ error: message, code: "reauth_required" }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
}

/**
 * When the caller's access token was issued (JWT `iat`, seconds since 1970), or null when it can't be read.
 * Only call this on a token Supabase has already accepted (requireUser / /auth/v1/user): it decodes, it doesn't verify.
 */
export function tokenIssuedAt(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { iat?: unknown };
    return typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null;
  } catch {
    return null;
  }
}
