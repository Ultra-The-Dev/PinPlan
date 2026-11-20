// Integration rows in Supabase (server-only, service role): connections with encrypted tokens, links between local
// documents and remote ones, the audit trail, and single-use OAuth sign-in states. Tables: see
// supabase/migrations/20261124100700_integrations.sql (RLS on, no browser access).
import { decrypt, encrypt } from "../secrets";
import { serviceConfigured, serviceFetch } from "../supabaseAdmin";
import type { Connection, ConnectionStatus, Link, LocalType, Owner, ProviderId, TokenSet } from "./types";

/** Providers plus the accountant export, whose account names are saved per company in the same table. */
export type StoreProvider = ProviderId | "export";

export const MIGRATION_HINT = "Run supabase/migrations/20261124100700_integrations.sql.";

/** Can this server keep integration connections at all? */
export function storageReady(): { ok: boolean; reason: string | null } {
  if (!serviceConfigured()) return { ok: false, reason: "The server needs the cloud database (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) to connect accounting apps." };
  if (!process.env.PINPLAN_ENCRYPTION_KEY) return { ok: false, reason: "The server needs PINPLAN_ENCRYPTION_KEY to store accounting connections encrypted." };
  return { ok: true, reason: null };
}

const missingTable = (status: number, body: string) => status === 404 || /PGRST205|42P01|does not exist|Could not find the table/i.test(body);

async function fail(r: Response, what: string): Promise<never> {
  const body = await r.text().catch(() => "");
  throw new Error(missingTable(r.status, body) ? `The database isn't ready for accounting connections. ${MIGRATION_HINT}` : `Couldn't ${what} (${r.status}).`);
}

const enc = encodeURIComponent;
const ownerFilter = (o: Owner) => `owner_kind=eq.${o.kind}&owner_id=eq.${enc(o.id)}`;
const connFilter = (o: Owner, p: StoreProvider) => `${ownerFilter(o)}&provider=eq.${p}`;
/** The ciphertext only decrypts for the owner and provider it was written for. */
export const tokenAad = (o: Owner, p: StoreProvider) => `pinplan:integration:${o.kind}:${o.id}:${p}`;

const JSON_HEADERS = { "Content-Type": "application/json" };

// ---------------------------------------------------------------- connections

interface ConnectionRow {
  owner_kind: Owner["kind"];
  owner_id: string;
  provider: ProviderId;
  status: ConnectionStatus;
  token_payload: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  meta: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  version: number;
  connected_by: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

const stringSettings = (s: Record<string, unknown> | null | undefined) =>
  Object.fromEntries(Object.entries(s ?? {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;

function fromRow(owner: Owner, row: ConnectionRow): Connection {
  let tokens: TokenSet | null = null;
  let tokenError: string | null = null;
  if (row.token_payload) {
    try {
      tokens = JSON.parse(decrypt(row.token_payload, tokenAad(owner, row.provider))) as TokenSet;
    } catch {
      tokenError = "The saved connection can't be read on this server (was PINPLAN_ENCRYPTION_KEY changed?). Connect again.";
    }
  }
  return {
    owner,
    provider: row.provider,
    status: row.status,
    tokens,
    tokenError,
    meta: row.meta ?? {},
    settings: stringSettings(row.settings),
    version: row.version,
    connectedBy: row.connected_by,
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
  };
}

export async function readConnection(owner: Owner, provider: StoreProvider): Promise<Connection | null> {
  const r = await serviceFetch(`/rest/v1/integration_connections?${connFilter(owner, provider)}&select=*`);
  if (!r.ok) {
    const body = await r.text();
    if (missingTable(r.status, body)) return null;
    throw new Error(`Couldn't read the connection (${r.status}).`);
  }
  const row = ((await r.json()) as ConnectionRow[])[0];
  return row ? fromRow(owner, row) : null;
}

/** Store a new connection (after OAuth), replacing any earlier one for this provider. Keeps the mapping settings. */
export async function saveConnection(owner: Owner, provider: ProviderId, input: { tokens: TokenSet; meta: Record<string, unknown>; connectedBy: string | null }) {
  const before = await readConnection(owner, provider);
  const now = new Date().toISOString();
  const r = await serviceFetch(`/rest/v1/integration_connections?on_conflict=owner_kind,owner_id,provider`, {
    method: "POST",
    headers: { ...JSON_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      owner_kind: owner.kind,
      owner_id: owner.id,
      provider,
      status: "connected",
      token_payload: encrypt(JSON.stringify(input.tokens), tokenAad(owner, provider)),
      expires_at: input.tokens.expiresAt,
      refresh_expires_at: input.tokens.refreshExpiresAt,
      meta: input.meta,
      settings: before?.settings ?? {},
      version: (before?.version ?? 0) + 1,
      connected_by: input.connectedBy,
      connected_at: now,
      last_error: null,
      updated_at: now,
    }),
  });
  if (!r.ok) await fail(r, "save the connection");
}

/**
 * Write refreshed tokens only if nobody else has since `version` (compare-and-swap). Returns false when another
 * request won the race: the caller then re-reads and uses the tokens that request stored.
 */
export async function swapTokens(owner: Owner, provider: ProviderId, version: number, tokens: TokenSet): Promise<boolean> {
  const r = await serviceFetch(`/rest/v1/integration_connections?${connFilter(owner, provider)}&version=eq.${version}`, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify({
      token_payload: encrypt(JSON.stringify(tokens), tokenAad(owner, provider)),
      expires_at: tokens.expiresAt,
      refresh_expires_at: tokens.refreshExpiresAt,
      version: version + 1,
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) await fail(r, "save the refreshed connection");
  return ((await r.json()) as unknown[]).length > 0;
}

export async function setConnectionStatus(owner: Owner, provider: ProviderId, patch: { status?: ConnectionStatus; lastError?: string | null; lastSyncAt?: string | null }) {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) body.status = patch.status;
  if (patch.lastError !== undefined) body.last_error = patch.lastError ? patch.lastError.slice(0, 1000) : null;
  if (patch.lastSyncAt !== undefined) body.last_sync_at = patch.lastSyncAt;
  const r = await serviceFetch(`/rest/v1/integration_connections?${connFilter(owner, provider)}`, { method: "PATCH", headers: { ...JSON_HEADERS, Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) await fail(r, "update the connection");
}

/** Save mapping settings (or the export's account names). Creates a settings-only row when there is no connection. */
export async function saveSettings(owner: Owner, provider: StoreProvider, settings: Record<string, string>) {
  const existing = await readConnection(owner, provider);
  if (existing) {
    const r = await serviceFetch(`/rest/v1/integration_connections?${connFilter(owner, provider)}`, {
      method: "PATCH",
      headers: { ...JSON_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify({ settings, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) await fail(r, "save the settings");
    return;
  }
  const r = await serviceFetch(`/rest/v1/integration_connections`, {
    method: "POST",
    headers: { ...JSON_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify({ owner_kind: owner.kind, owner_id: owner.id, provider, status: provider === "export" ? "connected" : "disconnected", settings }),
  });
  if (!r.ok) await fail(r, "save the settings");
}

/** Forget the tokens (keeps the mapping settings and links, so connecting the same books again carries on). */
export async function clearConnection(owner: Owner, provider: ProviderId) {
  const r = await serviceFetch(`/rest/v1/integration_connections?${connFilter(owner, provider)}`, {
    method: "PATCH",
    headers: { ...JSON_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify({ status: "disconnected", token_payload: null, expires_at: null, refresh_expires_at: null, last_error: null, updated_at: new Date().toISOString() }),
  });
  if (!r.ok && !missingTable(r.status, await r.text())) throw new Error(`Couldn't disconnect (${r.status}).`);
}

// ---------------------------------------------------------------- links

interface LinkRow {
  local_type: LocalType;
  local_id: string;
  remote_id: string | null;
  remote_number: string | null;
  sync_token: string | null;
  hash: string | null;
  remote_total: number | string | null;
  remote_status: string | null;
  last_error: string | null;
}

const linkFromRow = (r: LinkRow): Link => ({
  localType: r.local_type,
  localId: r.local_id,
  remoteId: r.remote_id,
  remoteNumber: r.remote_number,
  syncToken: r.sync_token,
  hash: r.hash,
  remoteTotal: r.remote_total == null ? null : Number(r.remote_total),
  remoteStatus: r.remote_status,
  lastError: r.last_error,
});

export async function readLink(owner: Owner, provider: ProviderId, localType: LocalType, localId: string): Promise<Link | null> {
  const r = await serviceFetch(`/rest/v1/integration_links?${connFilter(owner, provider)}&local_type=eq.${localType}&local_id=eq.${enc(localId)}&select=*`);
  if (!r.ok) await fail(r, "read the link");
  const row = ((await r.json()) as LinkRow[])[0];
  return row ? linkFromRow(row) : null;
}

export async function saveLink(owner: Owner, provider: ProviderId, link: Partial<Link> & Pick<Link, "localType" | "localId">, pushed = true) {
  const now = new Date().toISOString();
  const body: Record<string, unknown> = { owner_kind: owner.kind, owner_id: owner.id, provider, local_type: link.localType, local_id: link.localId, updated_at: now };
  if (link.remoteId !== undefined) body.remote_id = link.remoteId;
  if (link.remoteNumber !== undefined) body.remote_number = link.remoteNumber ? String(link.remoteNumber).slice(0, 100) : null;
  if (link.syncToken !== undefined) body.sync_token = link.syncToken;
  if (link.hash !== undefined) body.hash = link.hash;
  if (link.remoteTotal !== undefined) body.remote_total = link.remoteTotal;
  if (link.remoteStatus !== undefined) body.remote_status = link.remoteStatus;
  if (link.lastError !== undefined) body.last_error = link.lastError ? link.lastError.slice(0, 1000) : null;
  if (pushed) body.last_pushed_at = now;
  const r = await serviceFetch(`/rest/v1/integration_links?on_conflict=owner_kind,owner_id,provider,local_type,local_id`, {
    method: "POST",
    headers: { ...JSON_HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) await fail(r, "save the link");
}

/** Links for a set of local documents (for "Sent to QuickBooks" badges). */
export async function readLinks(owner: Owner, provider: ProviderId, localIds: string[]): Promise<(Link & { lastPushedAt: string | null })[]> {
  if (!localIds.length) return [];
  const list = localIds.slice(0, 200).map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  const r = await serviceFetch(`/rest/v1/integration_links?${connFilter(owner, provider)}&local_id=in.(${enc(list)})&select=*`);
  if (!r.ok) await fail(r, "read the links");
  return ((await r.json()) as (LinkRow & { last_pushed_at: string | null })[]).map((row) => ({ ...linkFromRow(row), lastPushedAt: row.last_pushed_at }));
}

// ---------------------------------------------------------------- events

export type EventKind = "connect" | "disconnect" | "refresh" | "test" | "push" | "void" | "error" | "settings";

export interface IntegrationEvent {
  kind: EventKind;
  ok: boolean;
  localType?: LocalType | null;
  localId?: string | null;
  remoteId?: string | null;
  message?: string | null;
  actor?: string | null;
}

/** Append to the audit trail. Best effort: a failed write never fails the request it describes. */
export async function addEvent(owner: Owner, provider: ProviderId, e: IntegrationEvent) {
  try {
    await serviceFetch(`/rest/v1/integration_events`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify({
        owner_kind: owner.kind,
        owner_id: owner.id,
        provider,
        kind: e.kind,
        ok: e.ok,
        local_type: e.localType ?? null,
        local_id: e.localId ?? null,
        remote_id: e.remoteId ?? null,
        message: e.message ? e.message.slice(0, 1000) : null,
        actor: e.actor ?? null,
      }),
    });
  } catch {
    /* audit only */
  }
}

export interface EventRow {
  kind: EventKind;
  ok: boolean;
  local_type: string | null;
  local_id: string | null;
  remote_id: string | null;
  message: string | null;
  created_at: string;
}

export async function recentEvents(owner: Owner, provider: ProviderId, limit = 20): Promise<EventRow[]> {
  const r = await serviceFetch(`/rest/v1/integration_events?${connFilter(owner, provider)}&select=kind,ok,local_type,local_id,remote_id,message,created_at&order=created_at.desc&limit=${limit}`);
  if (!r.ok) {
    if (missingTable(r.status, await r.text())) return [];
    throw new Error(`Couldn't read the activity (${r.status}).`);
  }
  return (await r.json()) as EventRow[];
}

// ---------------------------------------------------------------- OAuth sign-in states

const stateAad = (nonce: string) => `pinplan:oauth-state:${nonce}`;

export async function saveOAuthState(input: { nonce: string; owner: Owner; provider: ProviderId; verifier: string; redirectUri: string; userId: string | null }) {
  // Expired states are cleared now and then (best effort).
  if (Math.random() < 0.05) void serviceFetch(`/rest/v1/rpc/prune_integration_rows`, { method: "POST", headers: JSON_HEADERS, body: "{}" }).catch(() => undefined);
  const r = await serviceFetch(`/rest/v1/integration_oauth_states`, {
    method: "POST",
    headers: { ...JSON_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify({
      nonce: input.nonce,
      owner_kind: input.owner.kind,
      owner_id: input.owner.id,
      provider: input.provider,
      verifier: encrypt(input.verifier, stateAad(input.nonce)),
      redirect_uri: input.redirectUri,
      created_by: input.userId,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
  });
  if (!r.ok) await fail(r, "start the sign-in");
}

/** Delete the state and return it (only once, only before it expires, only for the owner it was made for). */
export async function consumeOAuthState(nonce: string, owner: Owner, provider: ProviderId): Promise<{ verifier: string; redirectUri: string } | null> {
  const r = await serviceFetch(
    `/rest/v1/integration_oauth_states?nonce=eq.${enc(nonce)}&${ownerFilter(owner)}&provider=eq.${provider}&expires_at=gt.${enc(new Date().toISOString())}`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
  );
  if (!r.ok) await fail(r, "finish the sign-in");
  const row = ((await r.json()) as { verifier: string; redirect_uri: string }[])[0];
  if (!row) return null;
  return { verifier: decrypt(row.verifier, stateAad(nonce)), redirectUri: row.redirect_uri };
}
