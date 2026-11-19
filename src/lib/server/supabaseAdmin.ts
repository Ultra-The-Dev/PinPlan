// Server-only Supabase calls made with the service-role key (bypasses row-level security). Never import from the browser.
// Everything here returns null when the key or URL isn't configured, so callers can no-op quietly.

export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || null;
export const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
export const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || null;

export function serviceConfigured(): boolean {
  return !!(supabaseUrl() && serviceKey());
}

function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const k = serviceKey()!;
  return { apikey: k, Authorization: `Bearer ${k}`, Accept: "application/json", ...extra };
}

/** fetch() against the project with the service key. `path` starts with "/rest/v1/…" or "/auth/v1/…". */
export function serviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${supabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders(Object.fromEntries(new Headers(init.headers).entries())),
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
}

/** fetch() as the signed-in caller (their own token + the anon key), so row-level security applies. */
export function userFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${supabaseUrl()}${path}`, {
    ...init,
    headers: { apikey: anonKey()!, Authorization: `Bearer ${token}`, Accept: "application/json", ...Object.fromEntries(new Headers(init.headers).entries()) },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
}

export const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";

export interface AuthUser {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
}

/** A user by id from the auth admin API. Null when not found. Throws on other failures. */
export async function getAuthUser(id: string): Promise<AuthUser | null> {
  const r = await serviceFetch(`/auth/v1/admin/users/${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`auth admin lookup failed (${r.status})`);
  const u = (await r.json()) as Partial<AuthUser> & { user?: Partial<AuthUser> };
  const user = u.user ?? u;
  if (!user.id) return null;
  return { id: user.id, email: user.email ?? null, app_metadata: user.app_metadata ?? {}, user_metadata: user.user_metadata ?? {} };
}

/** Merge keys into a user's app_metadata (only the server can write it; users can't edit it themselves). */
export async function mergeAppMetadata(id: string, current: Record<string, unknown>, patch: Record<string, unknown>): Promise<boolean> {
  const r = await serviceFetch(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_metadata: { ...current, ...patch } }),
  });
  return r.ok;
}
