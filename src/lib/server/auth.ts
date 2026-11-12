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
