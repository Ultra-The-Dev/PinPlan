// Request authentication for API routes (server-only).
// - Supabase configured: the caller must send a valid Supabase access token (Authorization: Bearer …).
// - Otherwise, if PINPLAN_ACCESS_CODE is set: the caller must send it in the x-pinplan-access header.
// - Otherwise (local / development use): open.
import { createHash, timingSafeEqual } from "node:crypto";

export type AuthResult = { ok: true; userId: string | null } | { ok: false; response: Response };

const deny = (message: string, code: string): AuthResult => ({ ok: false, response: Response.json({ error: message, code }, { status: 401 }) });

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function authMode(): "supabase" | "access_code" | "open" {
  if (supabaseUrl() && anonKey()) return "supabase";
  if (process.env.PINPLAN_ACCESS_CODE) return "access_code";
  return "open";
}

function sameSecret(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function requireUser(request: Request): Promise<AuthResult> {
  const mode = authMode();
  if (mode === "open") return { ok: true, userId: null };
  if (mode === "access_code") {
    const given = request.headers.get("x-pinplan-access") ?? "";
    return given && sameSecret(given, process.env.PINPLAN_ACCESS_CODE!) ? { ok: true, userId: null } : deny("Enter the team access code in Settings.", "access_code_required");
  }
  // The native app signs in with the team access code; keep that working when Supabase accounts are also enabled.
  const code = request.headers.get("x-pinplan-access");
  if (code && process.env.PINPLAN_ACCESS_CODE && sameSecret(code, process.env.PINPLAN_ACCESS_CODE)) return { ok: true, userId: null };
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
