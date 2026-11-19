// Xero (Beta): OAuth 2.0 with PKCE, then issued invoices (ACCREC), credit notes (ACCRECCREDIT) and payments pushed
// through the Accounting API with an Idempotency-Key. Switched on only when XERO_CLIENT_ID and XERO_CLIENT_SECRET are
// set. See docs/integrations.md.
import { apiJson, tokenRequest } from "./http";
import { customerDisplayName, xeroContact, xeroDocument, xeroPayment, xeroSettings } from "./payload";
import { IntegrationError, type Provider, type ProviderContext } from "./types";

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const REVOKE_URL = "https://identity.xero.com/connect/revocation";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API = "https://api.xero.com/api.xro/2.0";
const DEFAULT_SCOPES = "offline_access accounting.transactions accounting.contacts accounting.settings.read";
/** Xero refresh tokens last 60 days when unused. */
const REFRESH_TTL = 60 * 24 * 3600;
const LABEL = "Xero";

const client = () => ({ id: process.env.XERO_CLIENT_ID ?? "", secret: process.env.XERO_CLIENT_SECRET ?? "" });
const basic = () => {
  const c = client();
  return `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`;
};

function tenant(ctx: ProviderContext): string {
  const id = ctx.connection?.meta.tenantId;
  if (typeof id !== "string" || !id) throw new IntegrationError("Xero isn't connected for your company.", 412, "not_connected");
  return id;
}

/** Xero errors: { Elements: [{ ValidationErrors: [{ Message }] }] } or { Message, Detail }. */
export function xeroErrorMessage(status: number, body: unknown): string {
  const b = body as { Message?: string; Detail?: string; Elements?: { ValidationErrors?: { Message?: string }[] }[] } | null;
  const validation = (b?.Elements ?? []).flatMap((e) => e.ValidationErrors ?? []).map((v) => v.Message).filter(Boolean);
  const text = validation.length ? validation.join(" ") : [b?.Message, b?.Detail].filter(Boolean).join(": ") || (typeof body === "string" ? body : "");
  return `Xero said no (${status})${text ? `: ${String(text).slice(0, 300)}` : ""}.`;
}

function xeroApi<T>(ctx: ProviderContext, path: string, init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; idempotencyKey?: string } = {}) {
  const headers: Record<string, string> = { "Xero-tenant-id": tenant(ctx) };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  return apiJson<T>(ctx, `${API}/${path}`, { method: init.method, body: init.body, headers }, LABEL, xeroErrorMessage);
}

/** Xero's where-clause strings use double quotes. */
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

interface XeroConnection {
  id: string;
  tenantId: string;
  tenantName?: string;
  tenantType?: string;
  createdDateUtc?: string;
  updatedDateUtc?: string;
}

export const xero: Provider = {
  id: "xero",
  label: "Xero",
  auth: "oauth2",
  beta: true,
  requiredEnv: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
  enabled: () => !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET),
  settingsFields: [
    { key: "accountCode", label: "Sales account code", placeholder: "200", help: "Where job lines, fees and deductions post (Accounting → Chart of accounts)." },
    { key: "taxAccountCode", label: "Sales tax account code", help: "A liability account for the tax lines. Defaults to the sales account." },
    { key: "taxType", label: "Tax type on every line", placeholder: "NONE", help: "PinPlan sends its tax as its own line, so lines are not taxed again." },
    { key: "paymentAccountCode", label: "Bank account code for payments", help: "Needed to send payments." },
  ],

  connect({ state, codeChallenge, redirectUri }) {
    const u = new URL(AUTH_URL);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", client().id);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", process.env.XERO_SCOPES?.trim() || DEFAULT_SCOPES);
    u.searchParams.set("state", state);
    u.searchParams.set("code_challenge", codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
    return u.toString();
  },

  async callback({ code, codeVerifier, redirectUri }) {
    const tokens = await tokenRequest(TOKEN_URL, client(), { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier }, { label: LABEL, refreshTtlSeconds: REFRESH_TTL });
    const r = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new IntegrationError(`Xero didn't list the connected organisation (${r.status}).`, 502, "oauth_failed");
    const list = ((await r.json()) as XeroConnection[]).filter((c) => !c.tenantType || c.tenantType === "ORGANISATION");
    // The organisation just authorised is the most recently updated connection.
    list.sort((a, b) => (b.updatedDateUtc ?? b.createdDateUtc ?? "").localeCompare(a.updatedDateUtc ?? a.createdDateUtc ?? ""));
    const t = list[0];
    if (!t?.tenantId) throw new IntegrationError("No Xero organisation was connected. Pick one when Xero asks.", 400, "oauth_failed");
    return { tokens, meta: { tenantId: t.tenantId, connectionId: t.id, companyName: t.tenantName ?? null } };
  },

  refresh(tokens) {
    if (!tokens.refreshToken) throw new IntegrationError("Xero needs to be connected again.", 409, "needs_reconnect", true);
    return tokenRequest(TOKEN_URL, client(), { grant_type: "refresh_token", refresh_token: tokens.refreshToken }, { label: LABEL, refreshTtlSeconds: REFRESH_TTL, previousRefresh: tokens.refreshToken });
  },

  async disconnect(ctx) {
    const t = ctx.connection?.tokens;
    const connectionId = ctx.connection?.meta.connectionId;
    if (t?.accessToken && typeof connectionId === "string")
      await fetch(`${CONNECTIONS_URL}/${encodeURIComponent(connectionId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${t.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
    if (t?.refreshToken)
      await fetch(REVOKE_URL, {
        method: "POST",
        headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t.refreshToken }).toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }).catch(() => undefined);
  },

  async test(ctx) {
    const j = await xeroApi<{ Organisations?: { Name?: string }[] }>(ctx, "Organisation");
    const name = j.Organisations?.[0]?.Name ?? null;
    return { ok: true, message: name ? `Connected to ${name}.` : "Connected.", meta: name ? { companyName: name } : undefined };
  },

  async pushCustomer(ctx, c, link) {
    if (link?.remoteId) return { remoteId: link.remoteId };
    const name = customerDisplayName(c);
    const found = await xeroApi<{ Contacts?: { ContactID: string }[] }>(ctx, `Contacts?where=${encodeURIComponent(`Name==${quote(name)}`)}`);
    if (found.Contacts?.[0]?.ContactID) return { remoteId: found.Contacts[0].ContactID };
    const j = await xeroApi<{ Contacts?: { ContactID: string }[] }>(ctx, "Contacts", { method: "POST", body: { Contacts: [xeroContact(c)] } });
    const id = j.Contacts?.[0]?.ContactID;
    if (!id) throw new IntegrationError("Xero didn't return the contact it saved.", 502);
    return { remoteId: id };
  },

  async pushInvoice(ctx, { doc, customerId, link, idempotencyKey }) {
    const credit = doc.kind === "credit_note";
    const path = credit ? "CreditNotes" : "Invoices";
    const idField = credit ? "CreditNoteID" : "InvoiceID";
    const numberField = credit ? "CreditNoteNumber" : "InvoiceNumber";
    type Saved = Record<string, unknown> & { Total?: number; Status?: string };
    if (doc.status === "void") {
      if (!link?.remoteId) return { remoteId: "", remoteStatus: "void" };
      const j = await xeroApi<Record<string, Saved[]>>(ctx, `${path}/${encodeURIComponent(link.remoteId)}`, { method: "POST", body: { [path]: [{ [idField]: link.remoteId, Status: "VOIDED" }] }, idempotencyKey });
      return { remoteId: link.remoteId, remoteStatus: String(j[path]?.[0]?.Status ?? "VOIDED").toLowerCase(), remoteTotal: 0 };
    }
    const body = xeroDocument(doc, customerId, ctx.settings);
    if (link?.remoteId) body[idField] = link.remoteId;
    const j = await xeroApi<Record<string, Saved[]>>(ctx, path, { method: "POST", body: { [path]: [body] }, idempotencyKey });
    const saved = j[path]?.[0];
    const id = saved?.[idField];
    if (typeof id !== "string" || !id) throw new IntegrationError("Xero didn't return the document it saved.", 502);
    return { remoteId: id, remoteNumber: (saved?.[numberField] as string | undefined) ?? null, remoteTotal: typeof saved?.Total === "number" ? saved.Total : null, remoteStatus: String(saved?.Status ?? "").toLowerCase() || null };
  },

  async pushPayment(ctx, { payment, invoice, link, idempotencyKey }) {
    const remove = async (id: string) => {
      await xeroApi(ctx, `Payments/${encodeURIComponent(id)}`, { method: "POST", body: { Payments: [{ PaymentID: id, Status: "DELETED" }] }, idempotencyKey: `${idempotencyKey}-del` });
    };
    if (payment.voided || payment.deleted) {
      if (!link?.remoteId) return null;
      await remove(link.remoteId);
      return { remoteId: link.remoteId, remoteStatus: "deleted" };
    }
    if (!(payment.amount > 0)) throw new IntegrationError("Refunds aren't sent to Xero. Record the refund in Xero.", 400, "unsupported");
    if (!invoice.remoteId) throw new IntegrationError("Send the invoice before its payments.", 409, "invoice_not_sent");
    if (!xeroSettings(ctx.settings).paymentAccountCode)
      throw new IntegrationError("Choose the bank account code for payments (Settings → Integrations → Xero → More).", 412, "mapping_needed");
    // Xero payments can't be edited: a changed payment is deleted and sent again.
    if (link?.remoteId) await remove(link.remoteId);
    const j = await xeroApi<{ Payments?: { PaymentID: string; Amount?: number; Status?: string }[] }>(ctx, "Payments", { method: "PUT", body: { Payments: [xeroPayment(payment, invoice.remoteId, ctx.settings)] }, idempotencyKey });
    const p = j.Payments?.[0];
    if (!p?.PaymentID) throw new IntegrationError("Xero didn't return the payment it saved.", 502);
    return { remoteId: p.PaymentID, remoteTotal: p.Amount ?? null, remoteStatus: (p.Status ?? "authorised").toLowerCase() };
  },
};
