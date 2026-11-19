// The /api/integrations/* route handlers (server-only). The files under src/app/api/integrations only forward here.
//   GET  /api/integrations                       every provider with this company's status
//   GET  /api/integrations/[provider]/status     one provider: connection, mapping settings, last 20 events
//   POST /api/integrations/[provider]/connect    → { url } to send the browser to (OAuth sign-in)
//   GET  /api/integrations/[provider]/callback   the provider sends the browser back here
//   POST /api/integrations/[provider]/test       check the connection
//   POST /api/integrations/[provider]/push       { doc, payments } → send an issued invoice / credit note
//   POST /api/integrations/[provider]/disconnect forget the tokens (revoked at the provider, best effort)
//   GET/POST /api/integrations/[provider]/settings  mapping settings ("export": the accountant export's account names)
// Office only (techs 403); connect / test / push need an active subscription (402 subscription_inactive).
import { normalizeAccounts, DEFAULT_ACCOUNTS } from "@/lib/accountingExport";
import { documentTotals } from "@/lib/documents";
import type { DocPayment, SalesDoc } from "@/lib/types";
import { effectiveCreds } from "../billduCreds";
import { appOrigin } from "../email";
import { clientIp, rateLimit } from "../rateLimit";
import { jsonError, resolveIntegrationCaller, type IntegrationCaller } from "./caller";
import { getProvider, PROVIDERS, providerSummaries } from "./registry";
import { markReconnect, makeContext, pushDocument } from "./service";
import { newNonce, pkcePair, signState, verifyState } from "./state";
import { addEvent, clearConnection, consumeOAuthState, readConnection, readLinks, recentEvents, saveConnection, saveOAuthState, saveSettings, setConnectionStatus, storageReady } from "./store";
import { IntegrationError, type Connection, type Provider } from "./types";

const PUSH_LIMIT = { limit: 60, windowMs: 60_000 };
const CONNECT_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

function unknownProvider() {
  return jsonError("Unknown accounting app.", "unknown_provider", 404);
}

function notEnabled(p: Provider) {
  return jsonError(`${p.label} isn't switched on for this PinPlan server yet.`, "provider_not_configured", 501, { missing: p.requiredEnv.filter((k) => !process.env[k]) });
}

function needsOwner() {
  return jsonError("Sign in with your company account to connect accounting apps.", "needs_account", 400);
}

function needsStorage(reason: string | null) {
  return jsonError(reason ?? "Accounting connections aren't set up on this server.", "storage_not_ready", 501);
}

/** Errors from providers become JSON; a dead refresh token marks the connection "needs reconnect". */
async function failure(p: Provider, ic: IntegrationCaller, e: unknown, what: string): Promise<Response> {
  if (e instanceof IntegrationError) {
    if (e.reconnect) await markReconnect(p, ic, e.message);
    else if (ic.owner && e.code !== "draft" && e.code !== "wrong_kind") await setConnectionStatus(ic.owner, p.id, { lastError: e.message }).catch(() => undefined);
    return jsonError(e.message, e.code, e.status);
  }
  const msg = e instanceof Error ? e.message : String(e);
  return jsonError(`${what} failed: ${msg}`, "server_error", 500);
}

/** What the browser may see about a connection (no tokens). */
function publicConnection(c: Connection | null) {
  if (!c) return null;
  return {
    status: c.tokenError ? "needs_reconnect" : c.status,
    companyName: typeof c.meta.companyName === "string" ? c.meta.companyName : null,
    environment: typeof c.meta.environment === "string" ? c.meta.environment : null,
    connectedAt: c.connectedAt,
    lastSyncAt: c.lastSyncAt,
    lastError: c.tokenError ?? c.lastError,
    refreshExpiresAt: c.tokens?.refreshExpiresAt ?? null,
  };
}

async function describe(p: Provider, ic: IntegrationCaller, withEvents: boolean) {
  const base = { id: p.id, label: p.label, auth: p.auth, beta: p.beta, enabled: p.enabled(), settingsFields: p.settingsFields };
  if (p.auth === "api_key") {
    let configured = false;
    try {
      configured = !!(await effectiveCreds(ic.caller)).creds;
    } catch {
      configured = false;
    }
    const conn = ic.owner && storageReady().ok ? await readConnection(ic.owner, p.id).catch(() => null) : null;
    const events = withEvents && ic.owner && storageReady().ok ? await recentEvents(ic.owner, p.id).catch(() => []) : [];
    return { ...base, connection: configured ? { status: "connected", companyName: null, environment: null, connectedAt: null, lastSyncAt: conn?.lastSyncAt ?? null, lastError: conn?.lastError ?? null, refreshExpiresAt: null } : null, settings: conn?.settings ?? {}, events, manageAt: "/settings#billdu" };
  }
  if (!ic.owner || !storageReady().ok) return { ...base, connection: null, settings: {}, events: [] };
  const conn = await readConnection(ic.owner, p.id);
  const live = conn && (conn.tokens || conn.tokenError) ? conn : null;
  return { ...base, connection: publicConnection(live), settings: conn?.settings ?? {}, events: withEvents ? await recentEvents(ic.owner, p.id) : [] };
}

// ---------------------------------------------------------------- list / status

export async function listRoute(request: Request): Promise<Response> {
  const auth = await resolveIntegrationCaller(request);
  if (!auth.ok) return auth.response;
  const ic = auth.value;
  const ready = storageReady();
  try {
    const providers = await Promise.all(Object.values(PROVIDERS).map((p) => describe(p, ic, false)));
    const exportSettings = ic.owner && ready.ok ? ((await readConnection(ic.owner, "export").catch(() => null))?.settings ?? {}) : {};
    return Response.json({ providers, storageReady: ready.ok, storageMessage: ready.reason, mode: ic.caller.mode, exportAccounts: normalizeAccounts(exportSettings) });
  } catch (e) {
    return jsonError((e as Error).message, "server_error", 500, { providers: providerSummaries() });
  }
}

export async function statusRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p) return unknownProvider();
  const auth = await resolveIntegrationCaller(request);
  if (!auth.ok) return auth.response;
  try {
    return Response.json(await describe(p, auth.value, true));
  } catch (e) {
    return jsonError((e as Error).message, "server_error", 500);
  }
}

// ---------------------------------------------------------------- connect / callback / disconnect

export async function connectRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p) return unknownProvider();
  const auth = await resolveIntegrationCaller(request, { requirePlan: true });
  if (!auth.ok) return auth.response;
  const ic = auth.value;
  if (p.auth === "api_key") return Response.json({ url: p.connect({ state: "", codeChallenge: "", redirectUri: "" }) });
  if (!p.enabled()) return notEnabled(p);
  if (!ic.owner) return needsOwner();
  const ready = storageReady();
  if (!ready.ok) return needsStorage(ready.reason);
  const limited = rateLimit(`integrations-connect:${ic.userId ?? clientIp(request)}`, CONNECT_LIMIT);
  if (!limited.ok) return jsonError(`Too many tries. Try again in ${limited.retryAfter} seconds.`, "rate_limited", 429);
  try {
    const nonce = newNonce();
    const { verifier, challenge } = pkcePair();
    const redirectUri = `${appOrigin(request)}/api/integrations/${p.id}/callback`;
    await saveOAuthState({ nonce, owner: ic.owner, provider: p.id, verifier, redirectUri, userId: ic.userId });
    const state = signState({ provider: p.id, owner: ic.owner, userId: ic.userId, nonce });
    return Response.json({ url: p.connect({ state, codeChallenge: challenge, redirectUri }) });
  } catch (e) {
    return failure(p, ic, e, "Connecting");
  }
}

/** Back to Settings with a short result code (never provider text in the URL). */
function backToSettings(request: Request, provider: string, result: string) {
  const u = new URL("/settings", appOrigin(request));
  u.searchParams.set("integration", provider);
  u.searchParams.set("result", result);
  u.hash = "integrations";
  return Response.redirect(u.toString(), 303);
}

export async function callbackRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p || p.auth !== "oauth2") return unknownProvider();
  const params = new URL(request.url).searchParams;
  let st;
  try {
    st = verifyState(params.get("state"), p.id);
  } catch {
    st = null;
  }
  if (!st) return backToSettings(request, p.id, "expired");
  const owner = { kind: st.o, id: st.i };
  if (!p.enabled() || !storageReady().ok) return backToSettings(request, p.id, "not_configured");
  let saved;
  try {
    // Single use: the nonce row is deleted here, so replaying this URL fails.
    saved = await consumeOAuthState(st.n, owner, p.id);
  } catch {
    return backToSettings(request, p.id, "error");
  }
  if (!saved) return backToSettings(request, p.id, "expired");
  if (params.get("error")) {
    await addEvent(owner, p.id, { kind: "connect", ok: false, message: "Sign-in cancelled.", actor: st.u });
    return backToSettings(request, p.id, "cancelled");
  }
  const code = params.get("code");
  if (!code) return backToSettings(request, p.id, "error");
  try {
    const result = await p.callback({ code, codeVerifier: saved.verifier, redirectUri: saved.redirectUri, params });
    await saveConnection(owner, p.id, { tokens: result.tokens, meta: result.meta, connectedBy: st.u });
    const name = typeof result.meta.companyName === "string" ? result.meta.companyName : null;
    await addEvent(owner, p.id, { kind: "connect", ok: true, message: name ? `Connected to ${name}` : "Connected", actor: st.u });
    return backToSettings(request, p.id, "connected");
  } catch (e) {
    await addEvent(owner, p.id, { kind: "connect", ok: false, message: e instanceof Error ? e.message : "Sign-in failed", actor: st.u });
    return backToSettings(request, p.id, "error");
  }
}

export async function disconnectRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p) return unknownProvider();
  // No subscription check: a company can always disconnect.
  const auth = await resolveIntegrationCaller(request);
  if (!auth.ok) return auth.response;
  const ic = auth.value;
  if (p.auth === "api_key") return jsonError(`Disconnect ${p.label} in Settings → ${p.label}.`, "manage_elsewhere", 400);
  if (!ic.owner) return needsOwner();
  const ready = storageReady();
  if (!ready.ok) return needsStorage(ready.reason);
  try {
    const conn = await readConnection(ic.owner, p.id);
    if (conn?.tokens) await p.disconnect(makeContext(p, ic, conn)).catch(() => undefined);
    await clearConnection(ic.owner, p.id);
    await addEvent(ic.owner, p.id, { kind: "disconnect", ok: true, message: "Disconnected", actor: ic.userId });
    return Response.json(await describe(p, ic, true));
  } catch (e) {
    return failure(p, ic, e, "Disconnecting");
  }
}

// ---------------------------------------------------------------- test / push

export async function testRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p) return unknownProvider();
  const auth = await resolveIntegrationCaller(request, { requirePlan: true });
  if (!auth.ok) return auth.response;
  const ic = auth.value;
  if (p.auth === "oauth2") {
    if (!p.enabled()) return notEnabled(p);
    if (!ic.owner) return needsOwner();
    const ready = storageReady();
    if (!ready.ok) return needsStorage(ready.reason);
  }
  const limited = rateLimit(`integrations-test:${ic.userId ?? clientIp(request)}`, CONNECT_LIMIT);
  if (!limited.ok) return jsonError(`Too many tests. Try again in ${limited.retryAfter} seconds.`, "rate_limited", 429);
  try {
    const conn = ic.owner && storageReady().ok ? await readConnection(ic.owner, p.id) : null;
    const result = await p.test(makeContext(p, ic, conn));
    if (ic.owner && storageReady().ok) await addEvent(ic.owner, p.id, { kind: "test", ok: true, message: result.message, actor: ic.userId });
    return Response.json(result);
  } catch (e) {
    if (ic.owner && storageReady().ok) await addEvent(ic.owner, p.id, { kind: "test", ok: false, message: e instanceof Error ? e.message : "Test failed", actor: ic.userId });
    return failure(p, ic, e, "The test");
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Minimal shape check of a document sent by the browser; money fields are recomputed from its lines. */
export function readPushBody(body: unknown): { doc: SalesDoc; payments: DocPayment[] } | string {
  if (!isObj(body) || !isObj(body.doc)) return "Send { doc, payments }.";
  const d = body.doc as unknown as SalesDoc;
  if (typeof d.id !== "string" || !d.id || d.id.length > 200) return "The document has no id.";
  if (!["quote", "invoice", "credit_note"].includes(d.kind)) return "Unknown document kind.";
  if (typeof d.status !== "string") return "The document has no status.";
  if (!Array.isArray(d.lines) || d.lines.length > 2000) return "The document's lines are missing.";
  if (!Array.isArray(d.taxes)) return "The document's taxes are missing.";
  if (!isObj(d.client)) return "The document has no client.";
  if (typeof d.currency !== "string" || !/^[A-Za-z]{3}$/.test(d.currency)) return "The document's currency is missing.";
  const t = documentTotals(d);
  const doc: SalesDoc = { ...d, subtotal: t.subtotal, discountTotal: t.discountTotal, taxTotal: t.taxTotal, total: t.total };
  const raw = Array.isArray(body.payments) ? body.payments.slice(0, 500) : [];
  const payments = raw.filter(
    (p): p is DocPayment => isObj(p) && typeof p.id === "string" && p.documentId === d.id && typeof p.amount === "number" && Number.isFinite(p.amount) && typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date),
  );
  return { doc, payments };
}

export async function pushRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p) return unknownProvider();
  const auth = await resolveIntegrationCaller(request, { requirePlan: true });
  if (!auth.ok) return auth.response;
  const ic = auth.value;
  if (!p.enabled()) return notEnabled(p);
  if (!ic.owner) return needsOwner();
  const ready = storageReady();
  if (!ready.ok) return needsStorage(ready.reason);
  const limited = rateLimit(`integrations-push:${ic.userId ?? clientIp(request)}`, PUSH_LIMIT);
  if (!limited.ok) return jsonError(`Too many at once. Try again in ${limited.retryAfter} seconds.`, "rate_limited", 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", "bad_request", 400);
  }
  const parsed = readPushBody(body);
  if (typeof parsed === "string") return jsonError(parsed, "bad_request", 400);
  try {
    const conn = p.auth === "oauth2" ? await readConnection(ic.owner, p.id) : null;
    if (p.auth === "oauth2" && !conn?.tokens && !conn?.tokenError) return jsonError(`${p.label} isn't connected for your company.`, "not_connected", 412);
    const report = await pushDocument(p, ic, makeContext(p, ic, conn), parsed.doc, parsed.payments);
    return Response.json(report);
  } catch (e) {
    return failure(p, ic, e, "Sending");
  }
}

/** Sent-to-accounting badges: which of these documents are linked, and their last error. */
export async function linksRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p) return unknownProvider();
  const auth = await resolveIntegrationCaller(request);
  if (!auth.ok) return auth.response;
  const ic = auth.value;
  if (!ic.owner || !storageReady().ok) return Response.json({ links: [] });
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const links = await readLinks(ic.owner, p.id, ids);
    return Response.json({ links: links.filter((l) => l.localType !== "customer").map((l) => ({ localType: l.localType, localId: l.localId, remoteNumber: l.remoteNumber, remoteStatus: l.remoteStatus, lastError: l.lastError, lastPushedAt: l.lastPushedAt })) });
  } catch (e) {
    return jsonError((e as Error).message, "server_error", 500);
  }
}

// ---------------------------------------------------------------- settings

export async function settingsRoute(request: Request, providerId: string): Promise<Response> {
  const isExport = providerId === "export";
  const p = isExport ? null : getProvider(providerId);
  if (!isExport && !p) return unknownProvider();
  const auth = await resolveIntegrationCaller(request);
  if (!auth.ok) return auth.response;
  const ic = auth.value;
  if (!ic.owner) return needsOwner();
  const ready = storageReady();
  if (!ready.ok) return needsStorage(ready.reason);
  const target = isExport ? "export" : p!.id;
  if (request.method === "GET") {
    const conn = await readConnection(ic.owner, target).catch(() => null);
    return Response.json({ settings: isExport ? normalizeAccounts(conn?.settings) : (conn?.settings ?? {}) });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", "bad_request", 400);
  }
  const given = isObj(body) && isObj(body.settings) ? body.settings : null;
  if (!given) return jsonError("Send { settings }.", "bad_request", 400);
  const allowed = isExport ? Object.keys(DEFAULT_ACCOUNTS) : p!.settingsFields.map((f) => f.key);
  const settings: Record<string, string> = {};
  for (const k of allowed) {
    const v = given[k];
    if (typeof v === "string" && v.trim()) settings[k] = v.trim().slice(0, 100);
  }
  try {
    await saveSettings(ic.owner, target, isExport ? (normalizeAccounts(settings) as unknown as Record<string, string>) : settings);
    if (p) await addEvent(ic.owner, p.id, { kind: "settings", ok: true, message: "Mapping saved", actor: ic.userId });
    return Response.json({ settings: isExport ? normalizeAccounts(settings) : settings });
  } catch (e) {
    return jsonError((e as Error).message, "server_error", 500);
  }
}
