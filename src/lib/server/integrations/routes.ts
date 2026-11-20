// The /api/integrations/* route handlers (server-only). The files under src/app/api/integrations only forward here.
//   GET  /api/integrations                       every provider with this company's status
//   GET  /api/integrations/[provider]/status     one provider: connection, mapping settings, last 20 events
//   POST /api/integrations/[provider]/connect    → { url }: the GET connect link for this browser (sets pp_oauth_start)
//   GET  /api/integrations/[provider]/connect    ?ticket=… top-level navigation: swaps pp_oauth_start for pp_oauth and
//                                                sends the browser on to the provider (303). See state.ts for why.
//   GET  /api/integrations/[provider]/callback   the provider sends the browser back here (needs the pp_oauth cookie)
//   POST /api/integrations/[provider]/test       check the connection
//   POST /api/integrations/[provider]/push       { docId } → send an issued invoice / credit note as the database has it
//   POST /api/integrations/[provider]/disconnect forget the tokens (revoked at the provider, best effort)
//   GET/POST /api/integrations/[provider]/settings  mapping settings ("export": the accountant export's account names)
// Office only (techs 403); connect / test / push need an active subscription (402 subscription_inactive).
import { normalizeAccounts, DEFAULT_ACCOUNTS } from "@/lib/accountingExport";
import { effectiveCreds } from "../billduCreds";
import { appOrigin, appOriginMissing } from "../email";
import { clientIp, durableRateLimit, tooManyRequests, waitText } from "../rateLimit";
import { jsonError, resolveIntegrationCaller, type IntegrationCaller } from "./caller";
import { loadServerDocument } from "./documents";
import { getProvider, PROVIDERS, providerSummaries } from "./registry";
import { markReconnect, makeContext, pushDocument } from "./service";
import { cookieHash, newCookieValue, newNonce, OAUTH_COOKIE, oauthCookie, pkceChallenge, pkcePair, readCookie, signState, signTicket, START_COOKIE, verifyState, verifyTicket } from "./state";
import {
  addEvent,
  clearConnection,
  consumeOAuthState,
  readConnection,
  readLinks,
  readOAuthState,
  rebindOAuthState,
  recentEvents,
  saveConnection,
  saveOAuthState,
  saveSettings,
  setConnectionStatus,
  stillManages,
  storageReady,
} from "./store";
import { IntegrationError, type Connection, type Provider } from "./types";

const PUSH_LIMIT = { limit: 60, windowMs: 60_000 };
const CONNECT_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

/** Counted in the shared store (every server instance), per signed-in user. */
async function limit(request: Request, ic: IntegrationCaller, what: string, rule: { limit: number; windowMs: number }, message: string): Promise<Response | null> {
  const r = await durableRateLimit(`integrations-${what}:${ic.userId ?? clientIp(request)}`, rule);
  return r.ok ? null : tooManyRequests(r, `${message} Try again in ${waitText(r.retryAfter)}.`);
}

const connectPath = (provider: string) => `/api/integrations/${provider}/connect`;
const callbackPath = (provider: string) => `/api/integrations/${provider}/callback`;
/** Codes about the request, not the connection: they never become the connection's last error. */
const REQUEST_CODES = new Set(["draft", "wrong_kind", "void", "deleted", "not_found"]);

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
    else if (ic.owner && !REQUEST_CODES.has(e.code)) await setConnectionStatus(ic.owner, p.id, { lastError: e.message }).catch(() => undefined);
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
  const limited = await limit(request, ic, "connect", CONNECT_LIMIT, "Too many tries.");
  if (limited) return limited;
  const origin = appOrigin(request);
  if (!origin) return appOriginMissing();
  try {
    const nonce = newNonce();
    const { verifier } = pkcePair();
    const start = newCookieValue();
    await saveOAuthState({ nonce, owner: ic.owner, provider: p.id, verifier, redirectUri: `${origin}${callbackPath(p.id)}`, userId: ic.userId, cookieHash: cookieHash(start) });
    const url = `${origin}${connectPath(p.id)}?ticket=${encodeURIComponent(signTicket(p.id, nonce))}`;
    return Response.json({ url }, { headers: { "Set-Cookie": oauthCookie(START_COOKIE, start, connectPath(p.id)), "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(p, ic, e, "Connecting");
  }
}

/** A 303 with cookies (Response.redirect's headers can't be added to). */
function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers: h });
}

/**
 * GET /connect?ticket=…: the browser that asked for the sign-in (it holds pp_oauth_start) goes on to the provider with
 * a fresh pp_oauth cookie for the callback. Any other browser lands back on Settings ("expired").
 */
export async function connectStartRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p || p.auth !== "oauth2") return unknownProvider();
  if (!p.enabled() || !storageReady().ok) return backToSettings(request, p.id, "not_configured");
  const clearStart = oauthCookie(START_COOKIE, "", connectPath(p.id), 0);
  let ticket: { nonce: string } | null;
  try {
    ticket = verifyTicket(new URL(request.url).searchParams.get("ticket"), p.id);
  } catch {
    ticket = null;
  }
  const start = readCookie(request, START_COOKIE);
  if (!ticket || !start) return backToSettings(request, p.id, "expired", [clearStart]);
  try {
    const pending = await readOAuthState(ticket.nonce, p.id, cookieHash(start));
    if (!pending) return backToSettings(request, p.id, "expired", [clearStart]);
    const value = newCookieValue();
    // Only one browser can move the sign-in on (compare-and-swap on the start cookie's hash).
    if (!(await rebindOAuthState(ticket.nonce, p.id, cookieHash(start), cookieHash(value)))) return backToSettings(request, p.id, "expired", [clearStart]);
    const state = signState({ provider: p.id, owner: pending.owner, userId: pending.userId, nonce: ticket.nonce });
    const location = p.connect({ state, codeChallenge: pkceChallenge(pending.verifier), redirectUri: pending.redirectUri });
    return redirect(location, [oauthCookie(OAUTH_COOKIE, value, callbackPath(p.id)), clearStart]);
  } catch {
    return backToSettings(request, p.id, "error", [clearStart]);
  }
}

/** Back to Settings with a short result code (never provider text in the URL). */
function backToSettings(request: Request, provider: string, result: string, cookies: string[] = []) {
  const origin = appOrigin(request);
  if (!origin) return appOriginMissing();
  const u = new URL("/settings", origin);
  u.searchParams.set("integration", provider);
  u.searchParams.set("result", result);
  u.hash = "integrations";
  return redirect(u.toString(), cookies);
}

export async function callbackRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p || p.auth !== "oauth2") return unknownProvider();
  const params = new URL(request.url).searchParams;
  // The cookie is single use too: cleared whatever happens.
  const back = (result: string) => backToSettings(request, p.id, result, [oauthCookie(OAUTH_COOKIE, "", callbackPath(p.id), 0)]);
  let st;
  try {
    st = verifyState(params.get("state"), p.id);
  } catch {
    st = null;
  }
  const cookie = readCookie(request, OAUTH_COOKIE);
  // No cookie: this browser didn't start the sign-in (or it took too long).
  if (!st || !cookie) return back("expired");
  const owner = { kind: st.o, id: st.i };
  if (!p.enabled() || !storageReady().ok) return back("not_configured");
  let saved;
  try {
    // Single use, and only with the cookie it is bound to: the nonce row is deleted here, so replaying fails.
    saved = await consumeOAuthState(st.n, owner, p.id, cookieHash(cookie));
  } catch {
    return back("error");
  }
  if (!saved) return back("expired");
  if (params.get("error")) {
    await addEvent(owner, p.id, { kind: "connect", ok: false, message: "Sign-in cancelled.", actor: st.u });
    return back("cancelled");
  }
  // Whoever started it may have lost the role (or left the team) in the meantime.
  let allowed: boolean;
  try {
    allowed = await stillManages(owner, st.u);
  } catch {
    return back("error");
  }
  if (!allowed) {
    await addEvent(owner, p.id, { kind: "connect", ok: false, message: "Sign-in refused: only the owner or an admin can connect accounting apps.", actor: st.u });
    return back("error");
  }
  const code = params.get("code");
  if (!code) return back("error");
  try {
    const result = await p.callback({ code, codeVerifier: saved.verifier, redirectUri: saved.redirectUri, params });
    await saveConnection(owner, p.id, { tokens: result.tokens, meta: result.meta, connectedBy: st.u });
    const name = typeof result.meta.companyName === "string" ? result.meta.companyName : null;
    await addEvent(owner, p.id, { kind: "connect", ok: true, message: name ? `Connected to ${name}` : "Connected", actor: st.u });
    return back("connected");
  } catch (e) {
    await addEvent(owner, p.id, { kind: "connect", ok: false, message: e instanceof Error ? e.message : "Sign-in failed", actor: st.u });
    return back("error");
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
  const limited = await limit(request, ic, "test", CONNECT_LIMIT, "Too many tests.");
  if (limited) return limited;
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

/** The push body is only { docId }: what goes out is read from the database, never taken from the browser. */
export function readPushBody(body: unknown): { docId: string } | string {
  if (!isObj(body) || typeof body.docId !== "string") return "Send { docId }.";
  const docId = body.docId.trim();
  if (!docId || docId.length > 200) return "The document id is missing.";
  return { docId };
}

export async function pushRoute(request: Request, providerId: string): Promise<Response> {
  const p = getProvider(providerId);
  if (!p) return unknownProvider();
  const auth = await resolveIntegrationCaller(request, { requirePlan: true });
  if (!auth.ok) return auth.response;
  const ic = auth.value;
  if (!p.enabled()) return notEnabled(p);
  if (!ic.owner || ic.caller.mode === "single_company") return needsOwner();
  const ready = storageReady();
  if (!ready.ok) return needsStorage(ready.reason);
  const limited = await limit(request, ic, "push", PUSH_LIMIT, "Too many at once.");
  if (limited) return limited;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", "bad_request", 400);
  }
  const parsed = readPushBody(body);
  if (typeof parsed === "string") return jsonError(parsed, "bad_request", 400);
  try {
    // The cloud copy, read as the caller (row-level security: the office of that job only).
    const loaded = await loadServerDocument(ic.caller.token, parsed.docId);
    if (!loaded) return jsonError("This document isn't in the cloud yet. Let it sync, then send it again.", "not_found", 404);
    const { doc, payments } = loaded;
    if (doc.deleted) return jsonError("This document was deleted.", "deleted", 400);
    if (doc.status === "draft") return jsonError("Drafts are never sent. Send the invoice to the client first, then to accounting.", "draft", 400);
    const conn = p.auth === "oauth2" ? await readConnection(ic.owner, p.id) : null;
    if (p.auth === "oauth2" && !conn?.tokens && !conn?.tokenError) return jsonError(`${p.label} isn't connected for your company.`, "not_connected", 412);
    const report = await pushDocument(p, ic, makeContext(p, ic, conn), doc, payments);
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
