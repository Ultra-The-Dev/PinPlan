// Per-company Billdu credentials (server-only). Never import from client components.
//
// Who is calling decides whose Billdu account a request uses:
// - Single-company servers (no Supabase accounts: access code or open), and on a Supabase server callers that use the
//   team access code only (allowed only with PINPLAN_ALLOW_ACCESS_CODE=1, see ./auth.ts): the server-wide credentials
//   (env vars, .data file or app_secrets 'billdu'). On a Supabase server such callers may use them but never save or
//   remove them.
// - A signed-in owner/admin of a team: that team's own row in team_secrets. Only the founder's company (the team whose
//   id is PINPLAN_FOUNDER_TEAM_ID) may fall back to the server-wide credentials; every other team must connect its own.
//   (Not plan_status 'comped': a team can be comped for other reasons and must not get the founder's Billdu account.)
// - A signed-in user without a team: their own row in user_secrets. No server-wide fallback.
// - Technicians: refused (403), as before.
import { authMode, requireUser } from "./auth";
import { decryptDetailed, encrypt, encryptionReady, keyHint, loadBillduCreds, type CredsSource, type StoredCreds } from "./secrets";
import { anonKey, bearer, serviceConfigured, serviceFetch, supabaseUrl, userFetch } from "./supabaseAdmin";

export const BILLDU_SECRET = "billdu";

export type SecretOwner = { kind: "team"; id: string } | { kind: "user"; id: string };

export type BillduCaller =
  | { mode: "single_company"; userId: null; via: "open" | "access_code" }
  | { mode: "team"; userId: string; token: string; owner: { kind: "team"; id: string }; role: "owner" | "admin"; teamName: string; founder: boolean }
  | { mode: "solo"; userId: string; token: string; owner: { kind: "user"; id: string } };

export type CallerResult = { ok: true; caller: BillduCaller } | { ok: false; response: Response };

const fail = (status: number, error: string, code: string): CallerResult => ({ ok: false, response: Response.json({ error, code }, { status }) });

/** Where a company connects Billdu, for messages. */
export const BILLDU_SETTINGS = "Settings → Connected apps → Billdu";
export const NOT_CONNECTED = `Billdu isn't connected for your company. Add your Billdu API key and secret in ${BILLDU_SETTINGS}.`;

/**
 * A credentials problem with a fixed, user-safe message and a code. The detail (status codes, PostgREST text) stays in
 * `detail` for the server log; routes show it only in development or on a single-company server.
 */
export class CredsError extends Error {
  constructor(message: string, public code: string, public detail?: string) {
    super(message);
  }
}

/** Is this team the founder's company (PINPLAN_FOUNDER_TEAM_ID)? */
export function isFounderTeam(teamId: string | null | undefined): boolean {
  const founder = process.env.PINPLAN_FOUNDER_TEAM_ID?.trim();
  return !!founder && !!teamId && teamId === founder;
}

/** May this caller use the server-wide credentials? Only single-company callers and the founder's team. */
export function allowsServerCreds(c: BillduCaller): boolean {
  return c.mode === "single_company" || (c.mode === "team" && c.founder);
}

/**
 * May this caller save or remove the server-wide credentials? Only a real single-company server (no accounts), or the
 * founder's team. On a Supabase server an access-code caller can use them but never change them.
 */
export function mayChangeServerCreds(c: BillduCaller): boolean {
  if (c.mode === "single_company") return authMode() !== "supabase";
  return c.mode === "team" && c.founder;
}

/** Authenticate the caller and work out whose Billdu credentials they use. Techs get 403. */
export async function resolveBillduCaller(request: Request): Promise<CallerResult> {
  const mode = authMode();
  if (mode !== "supabase") {
    const auth = await requireUser(request);
    if (!auth.ok) return auth;
    return { ok: true, caller: { mode: "single_company", userId: null, via: mode } };
  }
  const token = bearer(request);
  if (!token) {
    // No session: only the team access code (iPad app) gets in, with today's server-wide behaviour.
    const auth = await requireUser(request);
    if (!auth.ok) return auth;
    return { ok: true, caller: { mode: "single_company", userId: null, via: "access_code" } };
  }
  // A session token wins over an access code sent alongside it: a signed-in user always gets their own company.
  let userId: string | null = null;
  try {
    const r = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey()! }, cache: "no-store" });
    if (!r.ok) return fail(401, "Your session has expired. Sign in again.", "sign_in_required");
    userId = ((await r.json()) as { id?: string }).id ?? null;
  } catch {
    return fail(401, "Could not verify your session.", "sign_in_required");
  }
  if (!userId) return fail(401, "Your session has expired. Sign in again.", "sign_in_required");

  let row: { role?: string; team_id?: string; teams?: { name?: string } | null } | undefined;
  try {
    // Read with the caller's own token: RLS shows members their own row and team.
    const r = await userFetch(token, `/rest/v1/team_members?select=role,team_id,teams(name)&user_id=eq.${encodeURIComponent(userId)}`);
    if (r.status !== 404) {
      if (!r.ok) {
        console.error("[billdu] team role check failed", r.status);
        return fail(503, "Could not check your team role. Try again in a minute.", "role_check_failed");
      }
      row = ((await r.json()) as (typeof row)[])[0];
    }
  } catch (e) {
    console.error("[billdu] team role check failed", e);
    return fail(503, "Could not check your team role. Try again in a minute.", "role_check_failed");
  }
  if (!row?.team_id) return { ok: true, caller: { mode: "solo", userId, token, owner: { kind: "user", id: userId } } };
  if (row.role !== "owner" && row.role !== "admin")
    return fail(403, "Billdu and prices are handled by the office. Ask an admin on your team.", "office_only");
  return {
    ok: true,
    caller: {
      mode: "team",
      userId,
      token,
      owner: { kind: "team", id: row.team_id },
      role: row.role,
      teamName: row.teams?.name ?? "",
      founder: isFounderTeam(row.team_id),
    },
  };
}

// ---------- storage (team_secrets / user_secrets, service role only) ----------

const table = (o: SecretOwner) => (o.kind === "team" ? "team_secrets" : "user_secrets");
const column = (o: SecretOwner) => (o.kind === "team" ? "team_id" : "user_id");
/** Additional authenticated data: the ciphertext only decrypts for the owner (and secret name) it was written for. */
export const secretAad = (o: SecretOwner, name = BILLDU_SECRET) => `pinplan:${o.kind}:${o.id}:${name}`;
const rowFilter = (o: SecretOwner, name = BILLDU_SECRET) => `${column(o)}=eq.${encodeURIComponent(o.id)}&name=eq.${encodeURIComponent(name)}`;

export interface OwnCreds {
  creds: StoredCreds | null;
  /** Set when the row exists but can't be decrypted (PINPLAN_ENCRYPTION_KEY changed, or the row was tampered with). */
  error: string | null;
  keyHint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastTest: { at: string; ok: boolean; message: string | null } | null;
}

interface SecretRow {
  payload: string;
  key_hint: string | null;
  updated_at: string | null;
  updated_by: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
}

const missingTable = (status: number, body: string) => status === 404 || /PGRST205|42P01|does not exist|Could not find the table/i.test(body);
const UNAVAILABLE = "Billdu can't be connected on this server right now. Contact support.";

/**
 * Can this server store per-company credentials at all? `reason` is safe to show; `code` says what's missing
 * (missing_service_key / missing_encryption_key) for whoever runs the server.
 */
export function companyStorageReady(): { ok: boolean; reason: string | null; code: string | null } {
  if (!serviceConfigured()) return { ok: false, reason: UNAVAILABLE, code: "missing_service_key" };
  if (!encryptionReady()) return { ok: false, reason: UNAVAILABLE, code: "missing_encryption_key" };
  return { ok: true, reason: null, code: null };
}

/** The owner's own stored credentials, or null when none are stored (or storage isn't set up yet). */
export async function readOwnCreds(owner: SecretOwner): Promise<OwnCreds | null> {
  if (!serviceConfigured()) return null;
  const r = await serviceFetch(`/rest/v1/${table(owner)}?${rowFilter(owner)}&select=payload,key_hint,updated_at,updated_by,last_test_at,last_test_ok,last_test_message`);
  if (!r.ok) {
    const body = await r.text();
    if (missingTable(r.status, body)) return null;
    throw new CredsError("Couldn't load your Billdu connection. Try again in a minute.", "secret_store_read_failed", `read ${table(owner)}: ${r.status}`);
  }
  const row = ((await r.json()) as SecretRow[])[0];
  if (!row) return null;
  let creds: StoredCreds | null = null;
  let error: string | null = null;
  try {
    const d = decryptDetailed(row.payload, secretAad(owner));
    creds = JSON.parse(d.plain) as StoredCreds;
    if (d.stale) await reencryptRow(owner, creds);
  } catch {
    error = `The saved Billdu connection can't be read any more. Connect Billdu again in ${BILLDU_SETTINGS}.`;
  }
  return {
    creds,
    error,
    keyHint: row.key_hint ?? (creds ? keyHint(creds.apiKey) : null),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    lastTest: row.last_test_at ? { at: row.last_test_at, ok: !!row.last_test_ok, message: row.last_test_message } : null,
  };
}

/** Re-seal a row opened with the previous key (or in the old format) with the current key. Best effort. */
async function reencryptRow(owner: SecretOwner, creds: StoredCreds) {
  try {
    await serviceFetch(`/rest/v1/${table(owner)}?${rowFilter(owner)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ payload: encrypt(JSON.stringify({ apiKey: creds.apiKey, apiSecret: creds.apiSecret }), secretAad(owner)) }),
    });
  } catch (e) {
    console.error("[billdu] re-encrypting credentials failed", e);
  }
}

export async function saveOwnCreds(owner: SecretOwner, creds: StoredCreds, updatedBy: string | null) {
  const ready = companyStorageReady();
  if (!ready.ok) throw new CredsError(ready.reason!, "storage_unavailable", ready.code ?? undefined);
  const payload = encrypt(JSON.stringify({ apiKey: creds.apiKey, apiSecret: creds.apiSecret }), secretAad(owner));
  const r = await serviceFetch(`/rest/v1/${table(owner)}?on_conflict=${column(owner)},name`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      [column(owner)]: owner.id,
      name: BILLDU_SECRET,
      payload,
      key_hint: keyHint(creds.apiKey),
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
      // New credentials haven't been tested yet.
      last_test_at: null,
      last_test_ok: null,
      last_test_message: null,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw missingTable(r.status, body)
      ? new CredsError(UNAVAILABLE, "storage_unavailable", `${table(owner)} is missing: run the Supabase migrations`)
      : new CredsError("Couldn't save your Billdu connection. Try again in a minute.", "secret_store_write_failed", `write ${table(owner)}: ${r.status}`);
  }
}

export async function deleteOwnCreds(owner: SecretOwner) {
  if (!serviceConfigured()) return;
  const r = await serviceFetch(`/rest/v1/${table(owner)}?${rowFilter(owner)}`, { method: "DELETE" });
  if (!r.ok && !missingTable(r.status, await r.text()))
    throw new CredsError("Couldn't disconnect Billdu. Try again in a minute.", "secret_store_delete_failed", `delete ${table(owner)}: ${r.status}`);
}

/** Remember the last connection test on the owner's row (best effort). */
export async function recordTest(owner: SecretOwner, ok: boolean, message: string | null) {
  if (!serviceConfigured()) return;
  try {
    await serviceFetch(`/rest/v1/${table(owner)}?${rowFilter(owner)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_message: message ? message.slice(0, 500) : null }),
    });
  } catch {
    /* status only */
  }
}

// ---------- what a request uses ----------

export type EffectiveSource = "team" | "user" | Exclude<CredsSource, null>;

export interface Effective {
  creds: StoredCreds | null;
  source: EffectiveSource | null;
  /** The caller's own row (team/solo callers), if any. */
  own: OwnCreds | null;
}

/** The credentials this caller's Billdu requests use. Never the server-wide ones for a non-founder team. */
export async function effectiveCreds(caller: BillduCaller): Promise<Effective> {
  if (caller.mode === "single_company") {
    const g = await loadBillduCreds();
    return { creds: g.creds, source: g.source, own: null };
  }
  const own = await readOwnCreds(caller.owner);
  if (own?.creds) return { creds: own.creds, source: caller.owner.kind, own };
  if (own?.error) throw new CredsError(own.error, "credentials_unreadable");
  if (allowsServerCreds(caller)) {
    const g = await loadBillduCreds();
    if (g.creds) return { creds: g.creds, source: g.source, own };
  }
  return { creds: null, source: null, own };
}

/** Display name for whoever last saved the credentials (read with the caller's token: RLS shows their teammates). */
export async function describeUser(caller: BillduCaller, id: string | null): Promise<string | null> {
  if (!id) return null;
  if (caller.mode === "single_company") return null;
  if (id === caller.userId) return "you";
  try {
    const r = await userFetch(caller.token, `/rest/v1/team_members?select=name,email&user_id=eq.${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const m = ((await r.json()) as { name?: string; email?: string | null }[])[0];
    return m?.name || m?.email || "a former team member";
  } catch {
    return null;
  }
}
