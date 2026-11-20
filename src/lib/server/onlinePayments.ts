// Online invoice payments on the server (docs/payments.md): Stripe Connect with the company's own Standard-type
// account, Checkout pages created as direct charges on that account, and the Connect webhook that records the payment.
// Never import from client components: it reads STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY.
//
// Safety rules, in order:
//   - nothing runs until STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET and the service-role database settings are set;
//   - a Checkout page is only opened for a live client link of an issued, unpaid invoice whose company has a connected
//     account that Stripe lets take payments, for the balance the database works out (less bank payments in flight);
//   - the webhook only applies an event to a page the server opened, on the account it opened it on
//     (online_payment_sessions); record_online_payment() records it once, never more than the invoice still owes, and
//     whatever came in beyond that is refunded here (once: idempotency key per page).
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { feeBps, fromMinor, onlineCurrencyOk, platformFee, toMinor, type PaymentAccountStatus } from "@/lib/onlinePay";
import { getStripe } from "./billing";
import { validEmail } from "./email";
import { serviceFetch } from "./supabaseAdmin";

export interface PaymentsConfig {
  secretKey: string;
  connectWebhookSecret: string;
  /** Platform fee in basis points (PINPLAN_PAYMENTS_FEE_BPS, default 0). */
  feeBps: number;
}

type Env = Record<string, string | undefined>;

/** The settings online payments need, or the names of the missing ones (the feature is then off and invisible). */
export function paymentsConfig(env: Env = process.env): { ok: true; config: PaymentsConfig } | { ok: false; missing: string[] } {
  const need = {
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY?.trim(),
    STRIPE_CONNECT_WEBHOOK_SECRET: env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim(),
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { ok: false, missing };
  return { ok: true, config: { secretKey: need.STRIPE_SECRET_KEY!, connectWebhookSecret: need.STRIPE_CONNECT_WEBHOOK_SECRET!, feeBps: feeBps(env.PINPLAN_PAYMENTS_FEE_BPS) } };
}

export const payJson = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const payError = (error: string, code: string, status: number) => payJson({ error, code }, status);

/** 501 for the public routes: says nothing about which settings are missing. */
export const paymentsOff = () => payError("Online payment isn't available. Please use the other ways to pay on the invoice.", "payments_not_configured", 501);

export function stripeFor(cfg: PaymentsConfig): Stripe {
  return getStripe({ secretKey: cfg.secretKey });
}

/** A Stripe or database failure: details in the server log only. */
export function paymentsFailure(where: string, e: unknown, message: string, status = 502): Response {
  const err = e as { type?: string; code?: string; statusCode?: number; requestId?: string; message?: string } | null;
  const stripe = typeof err?.type === "string" && err.type.startsWith("Stripe");
  console.error(`[payments] ${where} failed:`, stripe ? `${err!.type} ${err!.code ?? ""} ${err!.statusCode ?? ""} ${err!.requestId ?? ""}`.trim() : "", err?.message ?? String(e));
  return payError(message, stripe ? "stripe_error" : "payments_error", status);
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
export const SESSION_RE = /^cs_[A-Za-z0-9_]{6,250}$/;
export const tokenKey = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 32);

// ---------- the database (service role) ----------

export type TargetRefusal = "link" | "not_invoice" | "not_issued" | "void" | "not_enabled" | "paid" | "processing";
export type Target =
  | { ok: false; reason: TargetRefusal }
  | {
      ok: true;
      documentId: string;
      projectId: string;
      ownerId: string;
      linkId: string;
      account: string;
      ach: boolean;
      currency: string;
      number: string | null;
      title: string;
      businessName: string | null;
      clientEmail: string | null;
      balance: number;
      payable: number;
      reuse: { id: string; url: string } | null;
      openSessions: { id: string; account: string }[];
    };

export interface SessionRow {
  id: string;
  account_id: string;
  document_id: string;
  project_id: string;
  link_id: string | null;
  status: string;
}

export interface AccountRow {
  owner_id: string;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
  enabled: boolean;
  ach: boolean;
  country: string | null;
  default_currency: string | null;
}

export type AccountPatch = Partial<Omit<AccountRow, "owner_id">> & { connected_by?: string | null; connected_at?: string | null };

export interface RecordResult {
  result: "recorded" | "overpaid" | "refused" | "duplicate" | "unknown_session" | "wrong_account" | "wrong_currency" | "invalid";
  applied: number;
  excess: number;
  paymentId?: string | null;
  documentId?: string;
}

/** What the routes need from the database. Real one: serviceDb(); tests pass a fake. */
export interface PaymentsDb {
  target(token: string): Promise<Target>;
  openSession(s: { id: string; account: string; owner: string; document: string; project: string; link: string; amount: number; currency: string; url: string; expiresAt: string }): Promise<void>;
  updateSession(id: string, account: string, status: "processing" | "failed" | "expired", intent?: string | null): Promise<string | null>;
  recordPayment(p: { session: string; account: string; intent: string; amount: number; currency: string; method: "card" | "ach"; paidOn: string }): Promise<RecordResult>;
  recordRefund(r: { account: string; intent: string; refund: string; amount: number; paidOn: string }): Promise<{ result: string; amount?: number }>;
  getSession(id: string): Promise<SessionRow | null>;
  accountByOwner(owner: string): Promise<AccountRow | null>;
  /** Insert or update the company's row. `onlyIfNoAccount`: only when it has no connected account yet. Returns rows written. */
  saveAccount(owner: string, patch: AccountPatch, onlyIfNoAccount?: boolean): Promise<number>;
  patchAccountByStripeId(account: string, patch: AccountPatch): Promise<number>;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = await serviceFetch(`/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (r.status === 404) throw new Error(`The cloud database needs the online payments update (${name}): run supabase/migrations/20261125002100_online_payments.sql.`);
  if (!r.ok) throw new Error(`${name} failed (${r.status}).`);
  return (await r.json()) as T;
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await serviceFetch(`/rest/v1/${path}`, init);
  if (r.status === 404) throw new Error("The cloud database needs the online payments update: run supabase/migrations/20261125002100_online_payments.sql.");
  if (!r.ok) throw new Error(`Couldn't reach the payments tables (${r.status}).`);
  return (await r.json()) as T;
}

const ACCOUNT_COLS = "owner_id,stripe_account_id,charges_enabled,details_submitted,payouts_enabled,enabled,ach,country,default_currency";
const enc = encodeURIComponent;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export function serviceDb(): PaymentsDb {
  return {
    target: (token) => rpc<Target>("online_payment_target", { p_token: token }),
    openSession: (s) =>
      rpc<null>("online_payment_session_open", {
        p_id: s.id,
        p_account: s.account,
        p_owner: s.owner,
        p_document: s.document,
        p_project: s.project,
        p_link: s.link,
        p_amount: s.amount,
        p_currency: s.currency,
        p_url: s.url,
        p_expires_at: s.expiresAt,
      }).then(() => undefined),
    updateSession: (id, account, status, intent = null) => rpc<string | null>("online_payment_session_update", { p_id: id, p_account: account, p_status: status, p_intent: intent }),
    recordPayment: async (p) => {
      const j = await rpc<Record<string, unknown>>("record_online_payment", {
        p_session: p.session,
        p_account: p.account,
        p_intent: p.intent,
        p_amount: p.amount,
        p_currency: p.currency,
        p_method: p.method,
        p_paid_on: p.paidOn,
      });
      return { ...(j as unknown as RecordResult), applied: num(j.applied), excess: num(j.excess) };
    },
    recordRefund: (r) => rpc("record_online_refund", { p_account: r.account, p_intent: r.intent, p_refund: r.refund, p_amount: r.amount, p_paid_on: r.paidOn }),
    getSession: async (id) => (await rest<SessionRow[]>(`online_payment_sessions?id=eq.${enc(id)}&select=id,account_id,document_id,project_id,link_id,status`))[0] ?? null,
    accountByOwner: async (owner) => (await rest<AccountRow[]>(`payment_accounts?owner_id=eq.${enc(owner)}&select=${ACCOUNT_COLS}`))[0] ?? null,
    saveAccount: async (owner, patch, onlyIfNoAccount = false) => {
      const body = JSON.stringify({ ...patch, updated_at: new Date().toISOString() });
      const updated = await rest<unknown[]>(`payment_accounts?owner_id=eq.${enc(owner)}${onlyIfNoAccount ? "&stripe_account_id=is.null" : ""}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body,
      });
      if (updated.length) return updated.length;
      // No row yet: insert one (a row made meanwhile by another request wins; it is read back by the caller).
      const r = await serviceFetch(`/rest/v1/payment_accounts?on_conflict=owner_id`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ owner_id: owner, ...patch }),
      });
      if (!r.ok) throw new Error(`Couldn't save the payment account (${r.status}).`);
      return ((await r.json()) as unknown[]).length;
    },
    patchAccountByStripeId: async (account, patch) =>
      (
        await rest<unknown[]>(`payment_accounts?stripe_account_id=eq.${enc(account)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
        })
      ).length,
  };
}

// ---------- the client: open a Checkout page ----------

/** What the client is told when an invoice can't be paid online (English: the client page is never translated). */
export const REFUSALS: Record<TargetRefusal | "currency" | "too_small", { status: number; error: string }> = {
  link: { status: 404, error: "This link isn't available. Please contact the company that sent it." },
  not_invoice: { status: 400, error: "Only invoices can be paid online." },
  not_issued: { status: 409, error: "This invoice can't be paid yet." },
  void: { status: 409, error: "This invoice was voided. Nothing is due on it." },
  not_enabled: { status: 409, error: "Online payment isn't available for this invoice. Please use the other ways to pay on the invoice." },
  paid: { status: 409, error: "This invoice is already paid. Thank you!" },
  processing: { status: 409, error: "Your bank payment for this invoice is still processing. Nothing more is due right now." },
  currency: { status: 409, error: "This invoice's currency can't be paid online. Please use the other ways to pay on the invoice." },
  too_small: { status: 409, error: "The balance is too small to pay online. Please use the other ways to pay on the invoice." },
};

/** Stripe's smallest charge is about 50 cents (it differs a little by currency). */
const MIN_MINOR = 50;
/** How long a Checkout page stays open (Stripe allows 30 minutes to 24 hours). */
const PAGE_MINUTES = 60;
const SLOT_MS = 10 * 60_000;

export type CheckoutResult = { ok: true; url: string; reused: boolean } | { ok: false; reason: keyof typeof REFUSALS };

/**
 * A Stripe Checkout page for what the link's invoice still owes, as a direct charge on the company's connected account.
 * An open page for the same amount is handed back; other open pages for the invoice are closed first, so only one
 * can be paid. A double click within ten minutes gets the same page (Stripe idempotency key).
 */
export async function createCheckout(cfg: PaymentsConfig, db: PaymentsDb, stripe: Stripe, token: string, origin: string, now = Date.now()): Promise<CheckoutResult> {
  const t = await db.target(token);
  if (!t.ok) return { ok: false, reason: t.reason };
  if (!onlineCurrencyOk(t.currency)) return { ok: false, reason: "currency" };
  if (t.reuse?.url) return { ok: true, url: t.reuse.url, reused: true };
  const minor = toMinor(t.payable, t.currency);
  if (minor < MIN_MINOR) return { ok: false, reason: "too_small" };

  // Close the invoice's other open pages (a page paid meanwhile can't be closed: its payment is still recorded, and any
  // excess refunded, by the webhook).
  await Promise.all(
    t.openSessions.map((s) => stripe.checkout.sessions.expire(s.id, {}, { stripeAccount: s.account }).catch((e: Error) => console.warn(`[payments] couldn't close page ${s.id}:`, e?.message))),
  );

  const slot = Math.floor(now / SLOT_MS);
  // Deterministic within the slot, so a replayed create (same idempotency key) has the same parameters.
  const expiresAt = (slot + 1) * (SLOT_MS / 1000) + PAGE_MINUTES * 60;
  const name = [t.title, t.number].filter(Boolean).join(" ").slice(0, 200) || "Invoice";
  const meta = { pinplan_document: t.documentId, pinplan_project: t.projectId };
  const fee = platformFee(minor, cfg.feeBps);
  const back = `${origin}/d?t=${encodeURIComponent(token)}`;
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: t.currency, unit_amount: minor, product_data: { name, ...(t.businessName ? { description: `Balance due to ${t.businessName}`.slice(0, 300) } : {}) } } }],
    allowed_payment_method_types: t.ach ? ["card", "us_bank_account"] : ["card"],
    client_reference_id: t.documentId,
    metadata: meta,
    payment_intent_data: { description: `${name}${t.businessName ? ` — ${t.businessName}` : ""}`.slice(0, 500), metadata: meta, ...(fee > 0 ? { application_fee_amount: fee } : {}) },
    ...(t.clientEmail && validEmail(t.clientEmail) ? { customer_email: t.clientEmail } : {}),
    submit_type: "pay",
    success_url: `${back}&paid=1&cs={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
    expires_at: expiresAt,
  };
  const state = createHash("sha256").update(t.openSessions.map((s) => s.id).sort().join(",")).digest("hex").slice(0, 12);
  const session = await stripe.checkout.sessions.create(params, { stripeAccount: t.account, idempotencyKey: `pinplan-pay-${t.documentId}-${minor}-${t.currency}-${state}-${slot}` });
  if (!session.url) throw new Error("Stripe returned a checkout page without a URL");
  try {
    await db.openSession({
      id: session.id,
      account: t.account,
      owner: t.ownerId,
      document: t.documentId,
      project: t.projectId,
      link: t.linkId,
      amount: fromMinor(minor, t.currency),
      currency: t.currency,
      url: session.url,
      expiresAt: new Date((session.expires_at ?? expiresAt) * 1000).toISOString(),
    });
  } catch (e) {
    // Not remembered: never hand out a page the webhook wouldn't recognise.
    await stripe.checkout.sessions.expire(session.id, {}, { stripeAccount: t.account }).catch(() => undefined);
    throw e;
  }
  return { ok: true, url: session.url, reused: false };
}

// ---------- Stripe's confirmation → a payment ----------

const dayOf = (unixSeconds: number | null | undefined) => new Date((unixSeconds ? unixSeconds * 1000 : Date.now())).toISOString().slice(0, 10);
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

/** card or ach, from the payment method the client used (card when Stripe can't tell us). */
async function methodOf(stripe: Stripe, account: string, intent: string): Promise<"card" | "ach"> {
  try {
    const pi = await stripe.paymentIntents.retrieve(intent, { expand: ["payment_method"] }, { stripeAccount: account });
    const pm = pi.payment_method;
    const type = typeof pm === "object" && pm ? pm.type : (pi.payment_method_types?.length === 1 ? pi.payment_method_types[0] : null);
    return type === "us_bank_account" ? "ach" : "card";
  } catch {
    return "card";
  }
}

export type ApplyResult = RecordResult["result"] | "processing" | "ignored" | "not_complete";

/**
 * Applies a Checkout page on `account` that Stripe says is complete: records the payment (paid), or marks it processing
 * (a bank payment on its way). Refunds whatever was more than the invoice owed. Safe to repeat.
 */
export async function applyCheckoutSession(db: PaymentsDb, stripe: Stripe, account: string, s: Stripe.Checkout.Session, eventCreated?: number): Promise<{ result: ApplyResult; refunded?: number }> {
  if (s.mode !== "payment" || !s.metadata?.pinplan_document) return { result: "ignored" };
  const intent = idOf(s.payment_intent);
  if (s.status !== "complete" || !intent) return { result: "not_complete" };
  if (s.payment_status === "unpaid") {
    const st = await db.updateSession(s.id, account, "processing", intent);
    return { result: st == null ? "unknown_session" : "processing" };
  }
  if (s.payment_status !== "paid") return { result: "not_complete" };
  const currency = (s.currency ?? "").toLowerCase();
  const r = await db.recordPayment({
    session: s.id,
    account,
    intent,
    amount: fromMinor(s.amount_total ?? 0, currency),
    currency,
    method: await methodOf(stripe, account, intent),
    paidOn: dayOf(eventCreated),
  });
  let refunded: number | undefined;
  if (r.excess > 0 && ["recorded", "overpaid", "refused", "duplicate", "wrong_currency"].includes(r.result)) {
    // Money the invoice didn't owe (paid twice, paid after the office recorded a check, a voided invoice): back to the
    // client, once. The platform's fee on it goes back too.
    const amount = toMinor(r.excess, currency);
    await stripe.refunds.create(
      { payment_intent: intent, amount, reason: "duplicate", refund_application_fee: true, metadata: { pinplan: "excess", pinplan_session: s.id } },
      { stripeAccount: account, idempotencyKey: `pinplan-excess-${s.id}` },
    );
    refunded = r.excess;
    if (r.result !== "duplicate") console.warn(`[payments] page ${s.id}: ${r.result}; refunded ${r.excess} ${currency}`);
  }
  return { result: r.result, ...(refunded != null ? { refunded } : {}) };
}

/** Connect webhook events handled (Stripe dashboard → Webhooks → "Events on connected accounts"). */
export const CONNECT_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "account.updated",
  "account.application.deauthorized",
] as const;

/** Copies what Stripe says about the account (whether it can take payments) onto the company's row. */
export function accountPatch(a: Pick<Stripe.Account, "charges_enabled" | "details_submitted" | "payouts_enabled" | "country" | "default_currency">): AccountPatch {
  return {
    charges_enabled: !!a.charges_enabled,
    details_submitted: !!a.details_submitted,
    payouts_enabled: !!a.payouts_enabled,
    country: a.country && /^[A-Z]{2}$/.test(a.country) ? a.country : null,
    default_currency: a.default_currency && /^[a-z]{3}$/.test(a.default_currency) ? a.default_currency : null,
  };
}

const FORGET_ACCOUNT: AccountPatch = { stripe_account_id: null, charges_enabled: false, details_submitted: false, payouts_enabled: false };

/** One Connect event. Throws on a database or Stripe failure (the route answers 500 so Stripe retries). */
export async function handleConnectEvent(db: PaymentsDb, stripe: Stripe, event: Stripe.Event): Promise<{ result: string; refunded?: number }> {
  const account = event.account;
  // Events about the platform's own account belong to /api/billing/webhook.
  if (!account) return { result: "ignored" };
  const obj = event.data.object as unknown;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return applyCheckoutSession(db, stripe, account, obj as Stripe.Checkout.Session, event.created);
    case "checkout.session.async_payment_failed": {
      const s = obj as Stripe.Checkout.Session;
      if (!s.metadata?.pinplan_document) return { result: "ignored" };
      return { result: (await db.updateSession(s.id, account, "failed", idOf(s.payment_intent))) ?? "unknown_session" };
    }
    case "checkout.session.expired": {
      const s = obj as Stripe.Checkout.Session;
      if (!s.metadata?.pinplan_document) return { result: "ignored" };
      return { result: (await db.updateSession(s.id, account, "expired")) ?? "unknown_session" };
    }
    case "charge.refunded": {
      const charge = obj as Stripe.Charge;
      const intent = idOf(charge.payment_intent);
      if (!intent) return { result: "ignored" };
      const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 }, { stripeAccount: account });
      let recorded = 0;
      for (const rf of refunds.data) {
        // Refunds this server made for an excess were never recorded as payments.
        if (rf.metadata?.pinplan === "excess" || (rf.status !== "succeeded" && rf.status !== "pending")) continue;
        const r = await db.recordRefund({ account, intent, refund: rf.id, amount: fromMinor(rf.amount, rf.currency), paidOn: dayOf(rf.created) });
        if (r.result === "recorded") recorded++;
      }
      return { result: recorded ? "refund_recorded" : "no_change" };
    }
    case "account.updated": {
      const a = obj as Stripe.Account;
      return { result: (await db.patchAccountByStripeId(a.id || account, accountPatch(a))) ? "account_updated" : "no_account" };
    }
    case "account.application.deauthorized":
      // The company disconnected Northpin in its Stripe dashboard.
      return { result: (await db.patchAccountByStripeId(account, FORGET_ACCOUNT)) ? "account_disconnected" : "no_account" };
    default:
      return { result: "ignored" };
  }
}

// ---------- the office: who's asking, and the account status ----------

/** The company (billing owner) of a signed-in owner or admin; someone working alone is their own company. */
export async function paymentsOffice(userId: string): Promise<{ ok: true; owner: string; email: string | null } | { ok: false; response: Response }> {
  const me = await rest<{ team_id: string; role: string; email: string | null }[]>(`team_members?user_id=eq.${enc(userId)}&select=team_id,role,email`);
  if (!me[0]) return { ok: true, owner: userId, email: null };
  if (me[0].role !== "owner" && me[0].role !== "admin") return { ok: false, response: payError("Online payments are set up by the owner or an admin. Ask your office.", "office_only", 403) };
  const team = (await rest<{ owner_id: string }[]>(`teams?id=eq.${enc(me[0].team_id)}&select=owner_id`))[0];
  if (!team) return { ok: false, response: payError("Your team wasn't found.", "no_team", 400) };
  return { ok: true, owner: team.owner_id, email: me[0].email };
}

export function statusOf(cfg: PaymentsConfig | null, row: AccountRow | null): PaymentAccountStatus {
  return {
    configured: !!cfg,
    connected: !!row?.stripe_account_id,
    chargesEnabled: !!row?.stripe_account_id && !!row.charges_enabled,
    detailsSubmitted: !!row?.stripe_account_id && !!row.details_submitted,
    payoutsEnabled: !!row?.stripe_account_id && !!row.payouts_enabled,
    enabled: row?.enabled ?? true,
    ach: row?.ach ?? false,
    country: row?.country ?? null,
    currency: row?.default_currency ?? null,
    feeBps: cfg?.feeBps ?? 0,
  };
}

