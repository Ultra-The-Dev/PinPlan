// Platform admin (the people who run Northpin, not a customer's team admins). Server-only.
// Access: the caller's Supabase session → their email must be in PLATFORM_ADMIN_EMAILS (comma-separated).
// Data: read with SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS — never send it to the browser.

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type AdminAuth = { ok: true; email: string } | { ok: false; response: Response };

const fail = (status: number, error: string, code: string): AdminAuth => ({
  ok: false,
  response: Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } }),
});

/** 501 when not configured, 401 without a valid session, 403 when the email isn't a platform admin. */
export async function requirePlatformAdmin(request: Request): Promise<AdminAuth> {
  if (!url() || !anonKey() || !serviceKey() || !adminEmails().length)
    return fail(501, "The admin dashboard is not configured: set SUPABASE_SERVICE_ROLE_KEY and PLATFORM_ADMIN_EMAILS on the server.", "not_configured");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Sign in to use the admin dashboard.", "sign_in_required");
  let user: { email?: string; email_confirmed_at?: string | null };
  try {
    const r = await fetch(`${url()}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey()! }, cache: "no-store" });
    if (!r.ok) return fail(401, "Your session has expired. Sign in again.", "sign_in_required");
    user = await r.json();
  } catch {
    return fail(503, "Could not verify your session.", "auth_unavailable");
  }
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.email_confirmed_at || !adminEmails().includes(email)) return fail(403, "This account is not a Northpin platform admin.", "forbidden");
  return { ok: true, email };
}

// ---------- reading with the service role ----------

async function service(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${url()}${path}`, {
    ...init,
    headers: { apikey: serviceKey()!, Authorization: `Bearer ${serviceKey()}`, Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}

/** JSON rows, or null when the table/function doesn't exist yet (migration not run). */
async function rows<T>(path: string, init?: RequestInit): Promise<T[] | null> {
  const r = await service(path, init);
  if (r.status === 404) return null;
  if (!r.ok) {
    // PostgREST answers 400/42P01-style errors for missing relations in some versions.
    const body = await r.text();
    if (/does not exist|Could not find/i.test(body)) return null;
    throw new Error(`Supabase ${path.split("?")[0]}: ${r.status}`);
  }
  return (await r.json()) as T[];
}

export interface RawUser {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
}

async function allUsers(): Promise<RawUser[]> {
  const out: RawUser[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await service(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!r.ok) throw new Error(`Supabase auth users: ${r.status}`);
    const j = (await r.json()) as { users?: RawUser[] };
    const users = j.users ?? [];
    out.push(...users);
    if (users.length < 1000) break;
  }
  return out;
}

export type RawTeam = Record<string, unknown> & { id: string; name?: string; owner_id?: string; created_at?: string };
export interface RawMember {
  team_id: string;
  user_id: string;
  role?: string;
}
export interface RawUsage {
  user_id: string;
  projects: number;
  photos: number;
  storage_bytes: number;
}
export interface RawError {
  id: string;
  created_at: string;
  user_id: string | null;
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  app_version: string | null;
  platform: string | null;
  context: Record<string, unknown> | null;
}

export interface Raw {
  users: RawUser[];
  teams: RawTeam[] | null;
  members: RawMember[] | null;
  usage: RawUsage[] | null;
  errors: RawError[] | null;
  /** Every error report in the last 24 hours (an exact count), or null/absent when it couldn't be counted. */
  errors24h?: number | null;
}

/** How many rows match (PostgREST's exact count from Content-Range), or null when it couldn't be counted. */
async function countRows(path: string): Promise<number | null> {
  try {
    const r = await service(path, { headers: { Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" } });
    if (!r.ok) return null;
    const total = /\/(\d+)$/.exec(r.headers.get("content-range") ?? "")?.[1];
    return total == null ? null : Number(total);
  } catch {
    return null;
  }
}

/** The newest reports of both lists, once each, newest first. */
export function mergeErrors(...lists: (RawError[] | null)[]): RawError[] | null {
  if (lists.every((l) => l === null)) return null;
  const byId = new Map<string, RawError>();
  for (const l of lists) for (const e of l ?? []) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

export async function loadRaw(now = new Date()): Promise<Raw> {
  const since = encodeURIComponent(new Date(now.getTime() - 864e5).toISOString());
  // select=* so billing columns (plan_status, trial_ends_at, current_period_end, seat_limit) come along once they exist.
  // Server errors are read on their own as well: a client stuck in a crash loop can fill the newest 50 by itself, and
  // the server's own failures must still show.
  const [users, teams, members, usage, recent, server, errors24h] = await Promise.all([
    allUsers(),
    rows<RawTeam>("/rest/v1/teams?select=*&order=created_at.desc"),
    rows<RawMember>("/rest/v1/team_members?select=team_id,user_id,role"),
    rows<RawUsage>("/rest/v1/rpc/admin_usage", { method: "POST", body: "{}" }),
    rows<RawError>("/rest/v1/app_errors?select=*&order=created_at.desc&limit=50"),
    rows<RawError>("/rest/v1/app_errors?select=*&platform=eq.server&order=created_at.desc&limit=50").catch(() => null),
    countRows(`/rest/v1/app_errors?select=id&created_at=gt.${since}`),
  ]);
  return { users, teams, members, usage, errors: mergeErrors(recent, server), errors24h };
}

// ---------- shaping (pure) ----------

export interface Company {
  id: string;
  name: string;
  ownerEmail: string | null;
  members: number;
  createdAt: string | null;
  planStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  seatLimit: number | null;
  jobs: number;
  photos: number;
  storageBytes: number;
  lastSignInAt: string | null;
}

export interface Overview {
  generatedAt: string;
  totals: { users: number; companies: number; soloUsers: number; jobs: number; photos: number; storageBytes: number; signups7d: number; errors24h: number };
  companies: Company[];
  errors: (RawError & { email: string | null })[];
  missing: string[];
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
const later = (a: string | null, b: string | null | undefined) => (!b ? a : !a || b > a ? b : a);

export function buildOverview(raw: Raw, now = new Date()): Overview {
  const byId = new Map(raw.users.map((u) => [u.id, u]));
  const usage = new Map((raw.usage ?? []).map((u) => [u.user_id, u]));
  const members = raw.members ?? [];
  const teamOf = new Map(members.map((m) => [m.user_id, m.team_id]));
  const companies: Company[] = (raw.teams ?? []).map((t) => {
    const ms = members.filter((m) => m.team_id === t.id);
    const ids = new Set([...ms.map((m) => m.user_id), ...(t.owner_id ? [t.owner_id] : [])]);
    let jobs = 0,
      photos = 0,
      storageBytes = 0,
      lastSignInAt: string | null = null;
    for (const id of ids) {
      const u = usage.get(id);
      jobs += Number(u?.projects ?? 0);
      photos += Number(u?.photos ?? 0);
      storageBytes += Number(u?.storage_bytes ?? 0);
      lastSignInAt = later(lastSignInAt, byId.get(id)?.last_sign_in_at);
    }
    return {
      id: t.id,
      name: str(t.name) ?? "(unnamed)",
      ownerEmail: (t.owner_id && byId.get(t.owner_id)?.email) || null,
      members: ms.length,
      createdAt: str(t.created_at),
      planStatus: str(t.plan_status),
      trialEndsAt: str(t.trial_ends_at),
      currentPeriodEnd: str(t.current_period_end),
      seatLimit: num(t.seat_limit),
      jobs,
      photos,
      storageBytes,
      lastSignInAt,
    };
  });
  const all = [...usage.values()];
  const weekAgo = now.getTime() - 7 * 864e5;
  const dayAgo = now.getTime() - 864e5;
  const missing = [
    ...(raw.teams === null ? ["teams (run 20261120000000_teams.sql)"] : []),
    ...(raw.usage === null ? ["admin_usage() (run 20261121020000_ops.sql)"] : []),
    ...(raw.errors === null ? ["app_errors (run 20261121020000_ops.sql)"] : []),
  ];
  return {
    generatedAt: now.toISOString(),
    totals: {
      users: raw.users.length,
      companies: companies.length,
      soloUsers: raw.users.filter((u) => !teamOf.has(u.id)).length,
      jobs: all.reduce((n, u) => n + Number(u.projects), 0),
      photos: all.reduce((n, u) => n + Number(u.photos), 0),
      storageBytes: all.reduce((n, u) => n + Number(u.storage_bytes), 0),
      signups7d: raw.users.filter((u) => u.created_at && Date.parse(u.created_at) > weekAgo).length,
      // The exact count when the database gave one; otherwise what the lists hold (each report once).
      errors24h: raw.errors24h ?? new Set((raw.errors ?? []).filter((e) => Date.parse(e.created_at) > dayAgo).map((e) => e.id)).size,
    },
    companies,
    errors: (raw.errors ?? []).map((e) => ({ ...e, email: (e.user_id && byId.get(e.user_id)?.email) || null })),
    missing,
  };
}
