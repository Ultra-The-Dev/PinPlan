// Online invoice payments (docs/payments.md): the pure rules (src/lib/onlinePay.ts) and the server logic
// (src/lib/server/onlinePayments.ts) with a fake database and a fake Stripe. The database's own decisions (balance,
// once-only, wrong account) are tested for real in supabase/tests/online_payments_test.sql; here the fake follows the
// same contract so the server's side (what it sends Stripe, what it refunds) is checked.
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { accountStage, clientPayView, feeBps, fromMinor, isOnlinePayment, onlineCurrencyOk, platformFee, toMinor, type PaymentAccountStatus } from "@/lib/onlinePay";
import {
  accountPatch,
  applyCheckoutSession,
  createCheckout,
  handleConnectEvent,
  paymentsConfig,
  statusOf,
  type PaymentsConfig,
  type PaymentsDb,
  type RecordResult,
  type Target,
} from "@/lib/server/onlinePayments";

describe("money in Stripe's units", () => {
  it("converts to and from the smallest unit", () => {
    expect(toMinor(1234.5, "USD")).toBe(123450);
    expect(toMinor(0.1 + 0.2, "usd")).toBe(30);
    expect(toMinor(1500, "JPY")).toBe(1500);
    expect(fromMinor(123450, "usd")).toBe(1234.5);
    expect(fromMinor(1500, "jpy")).toBe(1500);
    expect(onlineCurrencyOk("USD")).toBe(true);
    expect(onlineCurrencyOk("kwd")).toBe(false);
    expect(onlineCurrencyOk("")).toBe(false);
  });

  it("takes a platform fee only when one is set, never the whole charge", () => {
    expect(platformFee(10000, 0)).toBe(0);
    expect(platformFee(10000, 100)).toBe(100);
    expect(platformFee(999, 150)).toBe(14);
    expect(platformFee(100, 10_000)).toBe(99);
    expect(feeBps(undefined)).toBe(0);
    expect(feeBps("")).toBe(0);
    expect(feeBps("150")).toBe(150);
    expect(feeBps("1.5")).toBe(0);
    expect(feeBps("5000")).toBe(0); // over 10 %: ignored
    expect(feeBps("-5")).toBe(0);
  });

  it("knows the payments the server recorded from Stripe", () => {
    expect(isOnlinePayment({ id: "stripe_pi_123" })).toBe(true);
    expect(isOnlinePayment({ id: "stripe_re_re_1" })).toBe(true);
    expect(isOnlinePayment({ id: "V1StGXR8_Z5jdHi6B" })).toBe(false);
  });
});

describe("what the client page shows", () => {
  const po = (p: Partial<NonNullable<Parameters<typeof clientPayView>[0]["payOnline"]>> = {}) => ({ available: true, ach: false, payable: 400, processing: 0, paidOnline: 0, ...p });
  const inv = { kind: "invoice", status: "sent", balanceDue: 400 };

  it("offers to pay the balance when the company takes card payments", () => {
    expect(clientPayView({ ...inv, payOnline: po() })).toEqual({ kind: "pay", amount: 400, ach: false });
    expect(clientPayView({ ...inv, payOnline: po({ ach: true, payable: 150 }) })).toEqual({ kind: "pay", amount: 150, ach: true });
  });

  it("offers nothing without online payments, for quotes, drafts and void invoices", () => {
    expect(clientPayView({ ...inv, payOnline: null })).toEqual({ kind: "none" });
    expect(clientPayView({ ...inv })).toEqual({ kind: "none" });
    expect(clientPayView({ ...inv, payOnline: po({ available: false }) })).toEqual({ kind: "none" });
    expect(clientPayView({ ...inv, kind: "quote", payOnline: po() })).toEqual({ kind: "none" });
    expect(clientPayView({ ...inv, status: "void", payOnline: po() })).toEqual({ kind: "none" });
    expect(clientPayView({ ...inv, status: "draft", payOnline: po() })).toEqual({ kind: "none" });
  });

  it("says thank you once paid, and whether it was paid online", () => {
    expect(clientPayView({ ...inv, status: "paid", balanceDue: 0, payOnline: po({ available: false, payable: 0, paidOnline: 400 }) })).toEqual({ kind: "paid", online: true });
    expect(clientPayView({ ...inv, status: "paid", balanceDue: 0, payOnline: po({ available: false, payable: 0 }) })).toEqual({ kind: "paid", online: false });
    // Credited in full: nothing due.
    expect(clientPayView({ ...inv, status: "partially_paid", balanceDue: 0, payOnline: po() })).toEqual({ kind: "paid", online: false });
  });

  it("back from Stripe after paying part: thanks, and what is still due", () => {
    expect(clientPayView({ ...inv, status: "partially_paid", balanceDue: 100, returned: true, payOnline: po({ payable: 100, paidOnline: 300 }) })).toEqual({ kind: "thanks", remaining: 100 });
    // Coming back later (no ?paid=1): the button again.
    expect(clientPayView({ ...inv, status: "partially_paid", balanceDue: 100, payOnline: po({ payable: 100, paidOnline: 300 }) })).toEqual({ kind: "pay", amount: 100, ach: false });
  });

  it("a bank payment for the rest is processing: no second payment", () => {
    expect(clientPayView({ ...inv, payOnline: po({ available: false, payable: 0, processing: 400 }) })).toEqual({ kind: "processing", amount: 400 });
  });
});

describe("Settings stages", () => {
  const st = (p: Partial<PaymentAccountStatus> = {}): PaymentAccountStatus => ({
    configured: true,
    connected: true,
    chargesEnabled: true,
    detailsSubmitted: true,
    payoutsEnabled: true,
    enabled: true,
    ach: false,
    country: "US",
    currency: "usd",
    feeBps: 0,
    ...p,
  });
  it("follows the account from not connected to taking payments", () => {
    expect(accountStage(null)).toBe("off");
    expect(accountStage(st({ configured: false }))).toBe("off");
    expect(accountStage(st({ connected: false }))).toBe("not_connected");
    expect(accountStage(st({ detailsSubmitted: false, chargesEnabled: false }))).toBe("onboarding");
    expect(accountStage(st({ chargesEnabled: false }))).toBe("pending");
    expect(accountStage(st())).toBe("ready");
    expect(accountStage(st({ enabled: false }))).toBe("paused");
  });

  it("reports a forgotten account as not connected, whatever its old flags", () => {
    const cfg: PaymentsConfig = { secretKey: "sk", connectWebhookSecret: "wh", feeBps: 25 };
    expect(statusOf(null, null)).toMatchObject({ configured: false, connected: false });
    const s = statusOf(cfg, { owner_id: "o", stripe_account_id: null, charges_enabled: true, details_submitted: true, payouts_enabled: true, enabled: true, ach: true, country: null, default_currency: null });
    expect(s).toMatchObject({ configured: true, connected: false, chargesEnabled: false, ach: true, feeBps: 25 });
    expect(accountPatch({ charges_enabled: true, details_submitted: true, payouts_enabled: false, country: "US", default_currency: "usd" })).toEqual({
      charges_enabled: true,
      details_submitted: true,
      payouts_enabled: false,
      country: "US",
      default_currency: "usd",
    });
  });
});

describe("configuration", () => {
  it("is off until the Connect webhook secret and the service settings are set (names only)", () => {
    const full = { STRIPE_SECRET_KEY: "sk_test", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "srk" };
    expect(paymentsConfig(full)).toEqual({ ok: true, config: { secretKey: "sk_test", connectWebhookSecret: "whsec", feeBps: 0 } });
    expect(paymentsConfig({ ...full, STRIPE_CONNECT_WEBHOOK_SECRET: " " })).toEqual({ ok: false, missing: ["STRIPE_CONNECT_WEBHOOK_SECRET"] });
    expect(paymentsConfig({})).toMatchObject({ ok: false });
    expect(paymentsConfig({ ...full, PINPLAN_PAYMENTS_FEE_BPS: "50" })).toMatchObject({ config: { feeBps: 50 } });
  });
});

// ---------- the server, with a fake database and a fake Stripe ----------

const CFG: PaymentsConfig = { secretKey: "sk_test_x", connectWebhookSecret: "whsec_x", feeBps: 0 };
const ACCT = "acct_company01";
const TOKEN = "tok_invoice_link_000001";

const target = (p: Partial<Extract<Target, { ok: true }>> = {}): Target => ({
  ok: true,
  documentId: "inv1",
  projectId: "job1",
  ownerId: "owner-1",
  linkId: TOKEN,
  account: ACCT,
  ach: false,
  currency: "usd",
  number: "INV-2026-0007",
  title: "Invoice",
  businessName: "Example Electric",
  clientEmail: "client@example.com",
  balance: 1200,
  payable: 1200,
  reuse: null,
  openSessions: [],
  ...p,
});

/** A database that behaves like record_online_payment(): pages it knows, balance, once only. */
function fakeDb(opts: { target?: Target; balance?: number; status?: string; sessions?: Record<string, { account: string; status: string }> } = {}) {
  const sessions: Record<string, { account: string; status: string; result?: RecordResult }> = { ...(opts.sessions ?? {}) };
  let balance = opts.balance ?? 1200;
  const docStatus = opts.status ?? "sent";
  const payments: { id: string; amount: number; method: string }[] = [];
  const db: PaymentsDb = {
    target: vi.fn(async () => opts.target ?? target()),
    openSession: vi.fn(async (s) => {
      sessions[s.id] ??= { account: s.account, status: "open" };
    }),
    updateSession: vi.fn(async (id, account, status) => {
      const s = sessions[id];
      if (!s || s.account !== account) return null;
      if (s.status !== "paid") s.status = status;
      return s.status;
    }),
    recordPayment: vi.fn(async (p): Promise<RecordResult> => {
      const s = sessions[p.session];
      if (!s) return { result: "unknown_session", applied: 0, excess: 0 } as RecordResult;
      if (s.account !== p.account) return { result: "wrong_account", applied: 0, excess: 0 } as RecordResult;
      if (s.status === "paid") return { ...s.result!, result: "duplicate" as const };
      const applied = docStatus === "void" ? 0 : Math.min(p.amount, Math.max(balance, 0));
      const result: RecordResult = { result: applied <= 0 ? "refused" : applied < p.amount ? "overpaid" : "recorded", applied, excess: Math.round((p.amount - applied) * 100) / 100, paymentId: applied > 0 ? `stripe_${p.intent}` : null };
      if (applied > 0) payments.push({ id: `stripe_${p.intent}`, amount: applied, method: p.method });
      balance -= applied;
      s.status = "paid";
      s.result = result;
      return result;
    }),
    recordRefund: vi.fn(async (r) => {
      if (payments.some((p) => p.id === `stripe_re_${r.refund}`)) return { result: "duplicate" };
      payments.push({ id: `stripe_re_${r.refund}`, amount: -r.amount, method: "card" });
      return { result: "recorded", amount: r.amount };
    }),
    getSession: vi.fn(async () => null),
    accountByOwner: vi.fn(async () => null),
    saveAccount: vi.fn(async () => 1),
    patchAccountByStripeId: vi.fn(async () => 1),
  };
  return { db, sessions, payments, balance: () => balance };
}

function fakeStripe() {
  let n = 0;
  const s = {
    checkout: {
      sessions: {
        create: vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({ id: `cs_test_new${++n}`, url: `https://checkout.stripe.com/c/pay/cs_test_new${n}`, expires_at: params.expires_at })),
        expire: vi.fn(async () => ({})),
        retrieve: vi.fn(),
      },
    },
    paymentIntents: { retrieve: vi.fn(async () => ({ payment_method: { type: "card" }, payment_method_types: ["card"] })) },
    refunds: { create: vi.fn(async () => ({ id: "re_excess" })), list: vi.fn(async () => ({ data: [] as unknown[] })) },
  };
  return { fake: s, stripe: s as unknown as Stripe };
}

const paidSession = (p: Record<string, unknown> = {}) =>
  ({ id: "cs_test_paid1", object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_test_paid1", amount_total: 120000, currency: "usd", metadata: { pinplan_document: "inv1", pinplan_project: "job1" }, ...p }) as unknown as Stripe.Checkout.Session;

const event = (type: string, object: unknown, account: string | null = ACCT) => ({ id: "evt_1", type, account: account ?? undefined, created: 1_795_000_000, data: { object } }) as unknown as Stripe.Event;

describe("opening a Checkout page", () => {
  it("is a direct charge on the company's account for exactly the payable balance", async () => {
    const { db } = fakeDb();
    const { fake, stripe } = fakeStripe();
    const now = Date.UTC(2026, 10, 20, 12, 3);
    const out = await createCheckout(CFG, db, stripe, TOKEN, "https://northpin.app", now);
    expect(out).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_new1", reused: false });
    const [params, opts] = fake.checkout.sessions.create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams, Stripe.RequestOptions];
    expect(opts.stripeAccount).toBe(ACCT);
    expect(opts.idempotencyKey).toMatch(/^pinplan-pay-inv1-120000-usd-[0-9a-f]{12}-\d+$/);
    expect(params.mode).toBe("payment");
    expect(params.line_items![0].price_data).toMatchObject({ currency: "usd", unit_amount: 120000, product_data: { name: "Invoice INV-2026-0007" } });
    expect(params.allowed_payment_method_types).toEqual(["card"]);
    expect(params.payment_intent_data?.application_fee_amount).toBeUndefined();
    expect(params.metadata).toEqual({ pinplan_document: "inv1", pinplan_project: "job1" });
    expect(params.customer_email).toBe("client@example.com");
    expect(params.success_url).toBe(`https://northpin.app/d?t=${TOKEN}&paid=1&cs={CHECKOUT_SESSION_ID}`);
    expect(params.cancel_url).toBe(`https://northpin.app/d?t=${TOKEN}`);
    // Stripe wants 30 minutes to 24 hours.
    const left = params.expires_at! - now / 1000;
    expect(left).toBeGreaterThanOrEqual(30 * 60);
    expect(left).toBeLessThanOrEqual(24 * 3600);
    // Remembered before the URL is handed out (the webhook only trusts pages it knows).
    expect(db.openSession).toHaveBeenCalledWith(expect.objectContaining({ id: "cs_test_new1", account: ACCT, document: "inv1", project: "job1", link: TOKEN, amount: 1200, currency: "usd" }));
  });

  it("the same click twice in one slot asks Stripe with the same key and parameters (no second page)", async () => {
    const { db } = fakeDb();
    const { fake, stripe } = fakeStripe();
    const now = Date.UTC(2026, 10, 20, 12, 3);
    await createCheckout(CFG, db, stripe, TOKEN, "https://northpin.app", now);
    await createCheckout(CFG, db, stripe, TOKEN, "https://northpin.app", now + 60_000);
    const [a, b] = fake.checkout.sessions.create.mock.calls as unknown as [Stripe.Checkout.SessionCreateParams, Stripe.RequestOptions][];
    expect(b[1].idempotencyKey).toBe(a[1].idempotencyKey);
    expect(b[0]).toEqual(a[0]);
  });

  it("offers US bank account and takes the platform fee when set", async () => {
    const { db } = fakeDb({ target: target({ ach: true, payable: 300 }) });
    const { fake, stripe } = fakeStripe();
    await createCheckout({ ...CFG, feeBps: 100 }, db, stripe, TOKEN, "https://northpin.app");
    const [params] = fake.checkout.sessions.create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams];
    expect(params.allowed_payment_method_types).toEqual(["card", "us_bank_account"]);
    expect(params.line_items![0].price_data!.unit_amount).toBe(30000);
    expect(params.payment_intent_data?.application_fee_amount).toBe(300);
  });

  it("hands back an open page for the same amount, and closes other open pages before opening a new one", async () => {
    const reuse = fakeDb({ target: target({ reuse: { id: "cs_test_open", url: "https://checkout.stripe.com/c/pay/cs_test_open" } }) });
    const s1 = fakeStripe();
    expect(await createCheckout(CFG, reuse.db, s1.stripe, TOKEN, "https://northpin.app")).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_open", reused: true });
    expect(s1.fake.checkout.sessions.create).not.toHaveBeenCalled();

    const other = fakeDb({ target: target({ openSessions: [{ id: "cs_test_old", account: ACCT }] }) });
    const s2 = fakeStripe();
    s2.fake.checkout.sessions.expire.mockRejectedValueOnce(new Error("already complete"));
    expect(await createCheckout(CFG, other.db, s2.stripe, TOKEN, "https://northpin.app")).toMatchObject({ ok: true });
    expect(s2.fake.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_old", {}, { stripeAccount: ACCT });
  });

  it("refuses what the database refuses (paid, void, processing, not enabled, expired link) without calling Stripe", async () => {
    for (const reason of ["paid", "void", "processing", "not_enabled", "link", "not_invoice", "not_issued"] as const) {
      const { db } = fakeDb({ target: { ok: false, reason } });
      const { fake, stripe } = fakeStripe();
      expect(await createCheckout(CFG, db, stripe, TOKEN, "https://northpin.app")).toEqual({ ok: false, reason });
      expect(fake.checkout.sessions.create).not.toHaveBeenCalled();
    }
  });

  it("refuses unsupported currencies and balances below Stripe's minimum", async () => {
    const { stripe } = fakeStripe();
    expect(await createCheckout(CFG, fakeDb({ target: target({ currency: "kwd" }) }).db, stripe, TOKEN, "https://x.test")).toEqual({ ok: false, reason: "currency" });
    expect(await createCheckout(CFG, fakeDb({ target: target({ payable: 0.3 }) }).db, stripe, TOKEN, "https://x.test")).toEqual({ ok: false, reason: "too_small" });
  });

  it("never hands out a page the database didn't remember", async () => {
    const { db } = fakeDb();
    (db.openSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db down"));
    const { fake, stripe } = fakeStripe();
    await expect(createCheckout(CFG, db, stripe, TOKEN, "https://northpin.app")).rejects.toThrow("db down");
    expect(fake.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_new1", {}, { stripeAccount: ACCT });
  });
});

describe("Stripe's confirmation", () => {
  it("records a card payment once; repeats are duplicates and nothing is refunded", async () => {
    const w = fakeDb({ sessions: { cs_test_paid1: { account: ACCT, status: "open" } } });
    const { fake, stripe } = fakeStripe();
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession()))).toEqual({ result: "recorded" });
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession()))).toEqual({ result: "duplicate" });
    expect(w.payments).toEqual([{ id: "stripe_pi_test_paid1", amount: 1200, method: "card" }]);
    expect(w.db.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ session: "cs_test_paid1", account: ACCT, intent: "pi_test_paid1", amount: 1200, currency: "usd", method: "card", paidOn: "2026-11-18" }));
    expect(fake.refunds.create).not.toHaveBeenCalled();
    expect(fake.paymentIntents.retrieve).toHaveBeenCalledWith("pi_test_paid1", { expand: ["payment_method"] }, { stripeAccount: ACCT });
  });

  it("a partial payment (the rest of a deposit) is recorded as paid", async () => {
    const w = fakeDb({ balance: 700, sessions: { cs_test_paid1: { account: ACCT, status: "open" } } });
    const { fake, stripe } = fakeStripe();
    expect(await applyCheckoutSession(w.db, stripe, ACCT, paidSession({ amount_total: 70000 }))).toEqual({ result: "recorded" });
    expect(w.balance()).toBe(0);
    expect(fake.refunds.create).not.toHaveBeenCalled();
  });

  it("overpaid: only what was owed is applied, the excess is refunded once (with the platform fee)", async () => {
    const w = fakeDb({ balance: 1000, sessions: { cs_test_paid1: { account: ACCT, status: "open" } } });
    const { fake, stripe } = fakeStripe();
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession()))).toEqual({ result: "overpaid", refunded: 200 });
    expect(fake.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_test_paid1", amount: 20000, reason: "duplicate", refund_application_fee: true, metadata: { pinplan: "excess", pinplan_session: "cs_test_paid1" } },
      { stripeAccount: ACCT, idempotencyKey: "pinplan-excess-cs_test_paid1" },
    );
    // Stripe retries the event (say our answer was lost): same refund key, so Stripe refunds once.
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession()))).toEqual({ result: "duplicate", refunded: 200 });
    const keys = fake.refunds.create.mock.calls.map((c) => (c as unknown as [unknown, Stripe.RequestOptions])[1].idempotencyKey);
    expect(new Set(keys)).toEqual(new Set(["pinplan-excess-cs_test_paid1"]));
  });

  it("money for a void invoice is refunded in full and nothing is recorded", async () => {
    const w = fakeDb({ status: "void", sessions: { cs_test_paid1: { account: ACCT, status: "canceled" } } });
    const { fake, stripe } = fakeStripe();
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession()))).toEqual({ result: "refused", refunded: 1200 });
    expect(w.payments).toEqual([]);
    expect((fake.refunds.create.mock.calls[0] as unknown[])[0]).toMatchObject({ amount: 120000 });
  });

  it("an event from another account, or for a page the server never opened, changes nothing and refunds nothing", async () => {
    const w = fakeDb({ sessions: { cs_test_paid1: { account: ACCT, status: "open" } } });
    const { fake, stripe } = fakeStripe();
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession(), "acct_someoneelse"))).toEqual({ result: "wrong_account" });
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession({ id: "cs_test_unknown" })))).toEqual({ result: "unknown_session" });
    expect(w.payments).toEqual([]);
    expect(fake.refunds.create).not.toHaveBeenCalled();
  });

  it("ignores the platform's own events and Checkout pages that aren't invoice payments", async () => {
    const w = fakeDb();
    const { stripe } = fakeStripe();
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession(), null))).toEqual({ result: "ignored" });
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession({ metadata: {} })))).toEqual({ result: "ignored" });
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession({ mode: "subscription" })))).toEqual({ result: "ignored" });
    expect(w.db.recordPayment).not.toHaveBeenCalled();
  });

  it("bank payments: processing first, recorded as ACH when they succeed, failed ones free the balance", async () => {
    const w = fakeDb({ sessions: { cs_test_paid1: { account: ACCT, status: "open" }, cs_test_bank2: { account: ACCT, status: "open" } } });
    const { fake, stripe } = fakeStripe();
    fake.paymentIntents.retrieve.mockResolvedValue({ payment_method: { type: "us_bank_account" }, payment_method_types: ["card", "us_bank_account"] });
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.completed", paidSession({ payment_status: "unpaid" })))).toEqual({ result: "processing" });
    expect(w.sessions.cs_test_paid1.status).toBe("processing");
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.async_payment_succeeded", paidSession()))).toEqual({ result: "recorded" });
    expect(w.payments[0]).toMatchObject({ method: "ach", amount: 1200 });
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.async_payment_failed", paidSession({ id: "cs_test_bank2", payment_status: "unpaid" })))).toEqual({ result: "failed" });
    expect(await handleConnectEvent(w.db, stripe, event("checkout.session.expired", paidSession({ id: "cs_test_gone", status: "expired" })))).toEqual({ result: "unknown_session" });
  });

  it("records refunds made in the company's Stripe dashboard, but not the server's own excess refunds", async () => {
    const w = fakeDb();
    const { fake, stripe } = fakeStripe();
    fake.refunds.list.mockResolvedValue({
      data: [
        { id: "re_dash1", amount: 5000, currency: "usd", status: "succeeded", created: 1_795_000_000, metadata: {} },
        { id: "re_excess", amount: 20000, currency: "usd", status: "succeeded", created: 1_795_000_000, metadata: { pinplan: "excess" } },
        { id: "re_failed", amount: 100, currency: "usd", status: "failed", created: 1_795_000_000, metadata: {} },
      ],
    });
    const charge = { id: "ch_1", object: "charge", payment_intent: "pi_test_paid1" };
    expect(await handleConnectEvent(w.db, stripe, event("charge.refunded", charge))).toEqual({ result: "refund_recorded" });
    expect(w.db.recordRefund).toHaveBeenCalledTimes(1);
    expect(w.db.recordRefund).toHaveBeenCalledWith({ account: ACCT, intent: "pi_test_paid1", refund: "re_dash1", amount: 50, paidOn: "2026-11-18" });
    expect(fake.refunds.list).toHaveBeenCalledWith({ charge: "ch_1", limit: 100 }, { stripeAccount: ACCT });
    // The event again: nothing new.
    expect(await handleConnectEvent(w.db, stripe, event("charge.refunded", charge))).toEqual({ result: "no_change" });
  });

  it("keeps the company's account status current, and forgets it when the company removes Northpin", async () => {
    const w = fakeDb();
    const { stripe } = fakeStripe();
    expect(await handleConnectEvent(w.db, stripe, event("account.updated", { id: ACCT, charges_enabled: true, details_submitted: true, payouts_enabled: true, country: "US", default_currency: "usd" }))).toEqual({ result: "account_updated" });
    expect(w.db.patchAccountByStripeId).toHaveBeenCalledWith(ACCT, { charges_enabled: true, details_submitted: true, payouts_enabled: true, country: "US", default_currency: "usd" });
    expect(await handleConnectEvent(w.db, stripe, event("account.application.deauthorized", { id: "ca_x" }))).toEqual({ result: "account_disconnected" });
    expect(w.db.patchAccountByStripeId).toHaveBeenLastCalledWith(ACCT, { stripe_account_id: null, charges_enabled: false, details_submitted: false, payouts_enabled: false });
  });
});
