// QuickBooks Online (Beta): OAuth 2.0 connect, then issued invoices, credit memos and payments pushed through the
// Accounting API. Switched on only when QBO_CLIENT_ID and QBO_CLIENT_SECRET are set. See docs/integrations.md.
import { apiJson, tokenRequest } from "./http";
import { customerDisplayName, qboCustomer, qboDocument, qboPayment } from "./payload";
import { IntegrationError, type Provider, type ProviderContext } from "./types";

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const SCOPE = "com.intuit.quickbooks.accounting";
const MINOR_VERSION = "75";
const LABEL = "QuickBooks";

const client = () => ({ id: process.env.QBO_CLIENT_ID ?? "", secret: process.env.QBO_CLIENT_SECRET ?? "" });
export const qboApiBase = () => (process.env.QBO_ENVIRONMENT === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");

function realm(ctx: ProviderContext): string {
  const id = ctx.connection?.meta.realmId;
  if (typeof id !== "string" || !/^\d{1,30}$/.test(id)) throw new IntegrationError("QuickBooks isn't connected for your company.", 412, "not_connected");
  return id;
}

function url(ctx: ProviderContext, path: string, query: Record<string, string> = {}) {
  const u = new URL(`${qboApiBase()}/v3/company/${realm(ctx)}/${path}`);
  u.searchParams.set("minorversion", MINOR_VERSION);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

/** QuickBooks errors come as { Fault: { Error: [{ Message, Detail, code }] } }. */
export function qboErrorMessage(status: number, body: unknown): string {
  const errs = (body as { Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] } })?.Fault?.Error;
  const e = Array.isArray(errs) ? errs[0] : null;
  const text = e ? [e.Message, e.Detail].filter(Boolean).join(": ") : typeof body === "string" ? body : "";
  return `QuickBooks said no (${status})${text ? `: ${text.slice(0, 300)}` : ""}.`;
}

const qbo = <T>(ctx: ProviderContext, u: string, init: Parameters<typeof apiJson>[2] = {}) => apiJson<T>(ctx, u, init, LABEL, qboErrorMessage);

interface QboTxn {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TotalAmt?: number;
}

/** QuickBooks query strings quote with ' and escape it with a backslash. */
const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

async function current(ctx: ProviderContext, entity: "invoice" | "creditmemo" | "payment", id: string): Promise<QboTxn | null> {
  try {
    const key = entity === "invoice" ? "Invoice" : entity === "creditmemo" ? "CreditMemo" : "Payment";
    const j = await qbo<Record<string, QboTxn>>(ctx, url(ctx, `${entity}/${encodeURIComponent(id)}`));
    return j[key] ?? null;
  } catch (e) {
    // Deleted in QuickBooks: make a new one.
    if (e instanceof IntegrationError && /Object Not Found/i.test(e.message)) return null;
    throw e;
  }
}

export const quickbooks: Provider = {
  id: "quickbooks",
  label: "QuickBooks Online",
  auth: "oauth2",
  beta: true,
  requiredEnv: ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET"],
  enabled: () => !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET),
  settingsFields: [
    { key: "itemId", label: "Product/service id for job lines", placeholder: "1", help: "The id of a product or service in QuickBooks (Sales → Products and services)." },
    { key: "taxItemId", label: "Product/service id for sales tax lines", help: "A non-taxable service that posts to your sales tax liability account." },
    { key: "feeItemId", label: "Product/service id for fees", help: "Defaults to the job lines item." },
    { key: "deductionItemId", label: "Product/service id for “already invoiced” lines", help: "Defaults to the job lines item." },
    { key: "taxCode", label: "Tax code on every line", placeholder: "NON", help: "NON in US companies. Northpin sends its tax as its own line so totals match." },
    { key: "depositAccountId", label: "Deposit account id for payments", help: "Leave empty for Undeposited Funds." },
  ],

  connect({ state, redirectUri }) {
    const u = new URL(AUTH_URL);
    u.searchParams.set("client_id", client().id);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPE);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    return u.toString();
  },

  async callback({ code, redirectUri, params }) {
    const realmId = params.get("realmId") ?? "";
    if (!/^\d{1,30}$/.test(realmId)) throw new IntegrationError("QuickBooks didn't say which company was connected.", 400, "oauth_failed");
    const tokens = await tokenRequest(TOKEN_URL, client(), { grant_type: "authorization_code", code, redirect_uri: redirectUri }, { label: LABEL });
    let companyName: string | null = null;
    try {
      const r = await fetch(`${qboApiBase()}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=${MINOR_VERSION}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) companyName = ((await r.json()) as { CompanyInfo?: { CompanyName?: string } }).CompanyInfo?.CompanyName ?? null;
    } catch {
      /* the name is only for display */
    }
    return { tokens, meta: { realmId, companyName, environment: process.env.QBO_ENVIRONMENT === "sandbox" ? "sandbox" : "production" } };
  },

  refresh(tokens) {
    if (!tokens.refreshToken) throw new IntegrationError("QuickBooks needs to be connected again.", 409, "needs_reconnect", true);
    return tokenRequest(TOKEN_URL, client(), { grant_type: "refresh_token", refresh_token: tokens.refreshToken }, { label: LABEL, previousRefresh: tokens.refreshToken });
  },

  async disconnect(ctx) {
    const token = ctx.connection?.tokens?.refreshToken ?? ctx.connection?.tokens?.accessToken;
    if (!token) return;
    const c = client();
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
  },

  async test(ctx) {
    const id = realm(ctx);
    const j = await qbo<{ CompanyInfo?: { CompanyName?: string } }>(ctx, url(ctx, `companyinfo/${id}`));
    const name = j.CompanyInfo?.CompanyName ?? null;
    return { ok: true, message: name ? `Connected to ${name}.` : "Connected.", meta: name ? { companyName: name } : undefined };
  },

  async pushCustomer(ctx, c, link) {
    if (link?.remoteId) return { remoteId: link.remoteId };
    const name = customerDisplayName(c);
    const find = async () => {
      const j = await qbo<{ QueryResponse?: { Customer?: { Id: string }[] } }>(ctx, url(ctx, "query", { query: `select Id from Customer where DisplayName = ${quote(name)}` }));
      return j.QueryResponse?.Customer?.[0]?.Id ?? null;
    };
    const found = await find();
    if (found) return { remoteId: found };
    try {
      const j = await qbo<{ Customer: { Id: string } }>(ctx, url(ctx, "customer"), { method: "POST", body: qboCustomer(c) });
      return { remoteId: j.Customer.Id };
    } catch (e) {
      // "Duplicate Name Exists" (made meanwhile, or an inactive customer): use the existing one when we can see it.
      const again = await find().catch(() => null);
      if (again) return { remoteId: again };
      throw e;
    }
  },

  async pushInvoice(ctx, { doc, customerId, link, idempotencyKey }) {
    const entity = doc.kind === "credit_note" ? "creditmemo" : "invoice";
    const key = doc.kind === "credit_note" ? "CreditMemo" : "Invoice";
    const existing = link?.remoteId ? await current(ctx, entity, link.remoteId) : null;
    if (doc.status === "void") {
      if (!existing) return { remoteId: link?.remoteId ?? "", remoteStatus: "void" };
      // Invoices are voided (kept, at zero); credit memos can't be voided through the API, so they are deleted.
      const op = entity === "invoice" ? "void" : "delete";
      await qbo(ctx, url(ctx, entity, { operation: op, requestid: idempotencyKey }), { method: "POST", body: { Id: existing.Id, SyncToken: existing.SyncToken } });
      return { remoteId: existing.Id, remoteStatus: op === "void" ? "void" : "deleted", remoteTotal: 0 };
    }
    const body = qboDocument(doc, customerId, ctx.settings);
    const sent = existing ? { ...body, Id: existing.Id, SyncToken: existing.SyncToken, sparse: true } : body;
    const j = await qbo<Record<string, QboTxn>>(ctx, url(ctx, entity, { requestid: idempotencyKey }), { method: "POST", body: sent });
    const t = j[key];
    if (!t?.Id) throw new IntegrationError("QuickBooks didn't return the document it saved.", 502);
    return { remoteId: t.Id, remoteNumber: t.DocNumber ?? null, syncToken: t.SyncToken ?? null, remoteTotal: typeof t.TotalAmt === "number" ? t.TotalAmt : null, remoteStatus: "open" };
  },

  async pushPayment(ctx, { payment, invoice, customerId, link, idempotencyKey }) {
    const existing = link?.remoteId ? await current(ctx, "payment", link.remoteId) : null;
    if (payment.voided || payment.deleted) {
      if (!existing) return null;
      await qbo(ctx, url(ctx, "payment", { operation: "delete", requestid: idempotencyKey }), { method: "POST", body: { Id: existing.Id, SyncToken: existing.SyncToken } });
      return { remoteId: existing.Id, remoteStatus: "deleted" };
    }
    if (!(payment.amount > 0)) throw new IntegrationError("Refunds aren't sent to QuickBooks. Record the refund in QuickBooks.", 400, "unsupported");
    if (!invoice.remoteId) throw new IntegrationError("Send the invoice before its payments.", 409, "invoice_not_sent");
    const body = qboPayment(payment, invoice.remoteId, customerId, ctx.settings);
    const sent = existing ? { ...body, Id: existing.Id, SyncToken: existing.SyncToken, sparse: true } : body;
    const j = await qbo<{ Payment?: QboTxn }>(ctx, url(ctx, "payment", { requestid: idempotencyKey }), { method: "POST", body: sent });
    if (!j.Payment?.Id) throw new IntegrationError("QuickBooks didn't return the payment it saved.", 502);
    return { remoteId: j.Payment.Id, syncToken: j.Payment.SyncToken ?? null, remoteTotal: j.Payment.TotalAmt ?? null, remoteStatus: "recorded" };
  },
};
