// /api/payments/*: Stripe is mocked (its real webhook signature check is kept); Supabase REST and RPC are a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentEmail } from "@/lib/emailTemplates";

const fake = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn(), expire: vi.fn(), retrieve: vi.fn() } },
  paymentIntents: { retrieve: vi.fn() },
  refunds: { create: vi.fn(), list: vi.fn() },
  accounts: { create: vi.fn(), retrieve: vi.fn() },
  accountLinks: { create: vi.fn() },
}));
vi.mock("stripe", async () => {
  const actual = await vi.importActual<typeof import("stripe")>("stripe");
  class FakeStripe {
    static webhooks = actual.default.webhooks;
    constructor() {
      return fake;
    }
  }
  return { default: FakeStripe };
});

const SB = "https://sb.example.co";
const WHSEC = "whsec_connect_test";
const TOKEN = "tok_invoice_link_000001";
type Call = { method: string; url: string; body: Record<string, unknown> | null; auth: string | null };

interface World {
  user: string | null;
  role: string | null;
  target: Record<string, unknown>;
  rateOk: boolean;
  record: Record<string, unknown>;
  session: Record<string, unknown> | null;
  account: Record<string, unknown> | null;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://northpin.app${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer user-token", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("online payment routes", () => {
  let calls: Call[];
  let world: World;

  beforeEach(() => {
    vi.resetModules();
    for (const group of Object.values(fake)) for (const f of Object.values(group)) if (typeof f === "function") (f as ReturnType<typeof vi.fn>).mockReset();
    fake.checkout.sessions.create.mockImplementation(async (p: { expires_at: number }) => ({ id: "cs_test_route1", url: "https://checkout.stripe.com/c/pay/cs_test_route1", expires_at: p.expires_at }));
    fake.checkout.sessions.expire.mockResolvedValue({});
    fake.paymentIntents.retrieve.mockResolvedValue({ payment_method: { type: "card" } });
    fake.refunds.list.mockResolvedValue({ data: [] });
    calls = [];
    world = {
      user: "u-owner",
      role: "owner",
      rateOk: true,
      target: { ok: true, documentId: "inv1", projectId: "job1", ownerId: "u-owner", linkId: TOKEN, account: "acct_company01", ach: false, currency: "usd", number: "INV-7", title: "Invoice", businessName: "Example Electric", clientEmail: null, balance: 500, payable: 500, reuse: null, openSessions: [] },
      record: { result: "recorded", applied: 500, excess: 0, paymentId: "stripe_pi_1" },
      session: null,
      account: null,
    };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", WHSEC);
    vi.stubEnv("PINPLAN_APP_URL", "https://northpin.app");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ method, url, body, auth: headers.get("authorization") });
        if (url === `${SB}/auth/v1/user`) return world.user ? Response.json({ id: world.user }) : new Response("no", { status: 401 });
        if (url === `${SB}/rest/v1/rpc/rate_limit_hit`) return Response.json(world.rateOk ? { ok: true, remaining: 5 } : { ok: false, retry_after: 120 });
        if (url === `${SB}/rest/v1/rpc/online_payment_target`) return Response.json(world.target);
        if (url === `${SB}/rest/v1/rpc/online_payment_session_open`) return Response.json(null);
        if (url === `${SB}/rest/v1/rpc/record_online_payment`) return Response.json(world.record);
        if (url === `${SB}/rest/v1/rpc/online_payment_session_update`) return Response.json("processing");
        if (url.startsWith(`${SB}/rest/v1/online_payment_sessions?`)) return Response.json(world.session ? [world.session] : []);
        if (url.startsWith(`${SB}/rest/v1/team_members?`)) return Response.json(world.role ? [{ team_id: "team-1", role: world.role, email: "boss@example.com" }] : []);
        if (url.startsWith(`${SB}/rest/v1/teams?`)) return Response.json([{ owner_id: "u-owner" }]);
        if (url.startsWith(`${SB}/rest/v1/payment_accounts`)) {
          if (method === "PATCH") {
            if (!world.account) return Response.json([]);
            if (url.includes("stripe_account_id=is.null") && world.account.stripe_account_id) return Response.json([]);
            Object.assign(world.account, body);
            return Response.json([world.account]);
          }
          if (method === "POST") {
            world.account = { owner_id: "u-owner", enabled: true, ach: false, charges_enabled: false, details_submitted: false, payouts_enabled: false, ...body };
            return Response.json([world.account]);
          }
          return Response.json(world.account ? [world.account] : []);
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is off everywhere until the Connect webhook secret is set (Settings just hides the card)", async () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    const routes = {
      checkout: () => import("@/app/api/payments/checkout/route"),
      confirm: () => import("@/app/api/payments/confirm/route"),
      webhook: () => import("@/app/api/payments/webhook/route"),
    };
    for (const [route, load] of Object.entries(routes)) {
      const { POST } = await load();
      const r = await POST(post(`/api/payments/${route}`, { token: TOKEN }, { "stripe-signature": "t=1,v1=x" }));
      expect(r.status).toBe(501);
      expect((await r.json()).code).toBe("payments_not_configured");
    }
    const { GET, POST } = await import("@/app/api/payments/account/route");
    const r = await GET(new Request("https://northpin.app/api/payments/account", { headers: { Authorization: "Bearer user-token" } }));
    expect(r.status).toBe(200);
    expect((await r.json()).configured).toBe(false);
    expect((await POST(post("/api/payments/account", { action: "connect" }))).status).toBe(501);
    expect(calls.filter((c) => c.url.includes("/rpc/") || c.url.includes("payment_accounts"))).toEqual([]);
    expect(fake.checkout.sessions.create).not.toHaveBeenCalled();
  });

  describe("checkout", () => {
    it("opens a page for the balance, read and remembered with the service role", async () => {
      const { POST } = await import("@/app/api/payments/checkout/route");
      const r = await POST(post("/api/payments/checkout", { token: TOKEN }));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_route1" });
      const rpc = calls.filter((c) => c.url.includes("/rpc/online_payment"));
      expect(rpc.map((c) => c.url.split("/rpc/")[1])).toEqual(["online_payment_target", "online_payment_session_open"]);
      expect(rpc.every((c) => c.auth === "Bearer service-key")).toBe(true);
      expect(rpc[1].body).toMatchObject({ p_id: "cs_test_route1", p_account: "acct_company01", p_document: "inv1", p_link: TOKEN, p_amount: 500, p_currency: "usd" });
      expect(fake.checkout.sessions.create.mock.calls[0][1]).toMatchObject({ stripeAccount: "acct_company01" });
    });

    it("refuses bad tokens, paid / void invoices, and too many tries", async () => {
      const { POST } = await import("@/app/api/payments/checkout/route");
      expect((await POST(post("/api/payments/checkout", { token: "short" }))).status).toBe(404);
      world.target = { ok: false, reason: "paid" };
      let r = await POST(post("/api/payments/checkout", { token: TOKEN }));
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ code: "paid", error: "This invoice is already paid. Thank you!" });
      world.target = { ok: false, reason: "void" };
      r = await POST(post("/api/payments/checkout", { token: TOKEN }));
      expect(await r.json()).toMatchObject({ code: "void" });
      world.rateOk = false;
      r = await POST(post("/api/payments/checkout", { token: TOKEN }));
      expect(r.status).toBe(429);
      expect(fake.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("never shows Stripe's own error text", async () => {
      fake.checkout.sessions.create.mockRejectedValueOnce(Object.assign(new Error("No such account: acct_company01"), { type: "StripeInvalidRequestError" }));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { POST } = await import("@/app/api/payments/checkout/route");
      const r = await POST(post("/api/payments/checkout", { token: TOKEN }));
      expect(r.status).toBe(502);
      expect(JSON.stringify(await r.json())).not.toContain("acct_");
    });
  });

  describe("confirm", () => {
    it("only applies a page opened from the same link, re-read from Stripe on the company's account", async () => {
      const { POST } = await import("@/app/api/payments/confirm/route");
      world.session = { id: "cs_test_route1", account_id: "acct_company01", document_id: "inv1", project_id: "job1", link_id: "tok_other_link_00000001", status: "open" };
      expect((await POST(post("/api/payments/confirm", { token: TOKEN, session: "cs_test_route1" }))).status).toBe(404);
      expect(fake.checkout.sessions.retrieve).not.toHaveBeenCalled();
      world.session.link_id = TOKEN;
      fake.checkout.sessions.retrieve.mockResolvedValue({ id: "cs_test_route1", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1", amount_total: 50000, currency: "usd", metadata: { pinplan_document: "inv1" } });
      const r = await POST(post("/api/payments/confirm", { token: TOKEN, session: "cs_test_route1" }));
      expect(await r.json()).toEqual({ ok: true });
      expect(fake.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_route1", {}, { stripeAccount: "acct_company01" });
      expect(calls.find((c) => c.url.endsWith("/rpc/record_online_payment"))?.body).toMatchObject({ p_session: "cs_test_route1", p_account: "acct_company01", p_amount: 500, p_method: "card" });
      expect((await POST(post("/api/payments/confirm", { token: TOKEN, session: "not-a-session" }))).status).toBe(400);
    });
  });

  describe("webhook", () => {
    async function send(event: Record<string, unknown>, secret = WHSEC) {
      const Stripe = (await vi.importActual<typeof import("stripe")>("stripe")).default;
      const payload = JSON.stringify(event);
      const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
      const { POST } = await import("@/app/api/payments/webhook/route");
      return POST(new Request("https://northpin.app/api/payments/webhook", { method: "POST", headers: { "stripe-signature": header }, body: payload }));
    }
    const completed = { id: "cs_test_route1", object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1", amount_total: 50000, currency: "usd", metadata: { pinplan_document: "inv1" } };

    it("rejects a bad signature (including the billing endpoint's secret)", async () => {
      expect((await send({ id: "evt_1", type: "checkout.session.completed", account: "acct_company01", data: { object: completed } }, "whsec_billing")).status).toBe(400);
      expect(calls.filter((c) => c.url.includes("/rpc/"))).toEqual([]);
    });

    it("records the payment from a connected account's event", async () => {
      const r = await send({ id: "evt_2", type: "checkout.session.completed", account: "acct_company01", created: 1_795_000_000, data: { object: completed } });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ received: true, result: "recorded" });
      expect(fake.refunds.create).not.toHaveBeenCalled();
    });

    it("refunds the excess when the database says so, and asks Stripe to retry when the database is down", async () => {
      world.record = { result: "overpaid", applied: 300, excess: 200 };
      const r = await send({ id: "evt_3", type: "checkout.session.completed", account: "acct_company01", data: { object: completed } });
      expect(await r.json()).toEqual({ received: true, result: "overpaid", refunded: 200 });
      expect(fake.refunds.create.mock.calls[0][1]).toEqual({ stripeAccount: "acct_company01", idempotencyKey: "pinplan-excess-cs_test_route1" });

      vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
      const down = await send({ id: "evt_4", type: "checkout.session.completed", account: "acct_company01", data: { object: completed } });
      expect(down.status).toBe(500);
    });

    it("ignores the platform's own events and events it doesn't handle", async () => {
      expect(await (await send({ id: "evt_5", type: "checkout.session.completed", data: { object: completed } })).json()).toEqual({ received: true, result: "ignored" });
      expect(await (await send({ id: "evt_6", type: "customer.created", account: "acct_company01", data: { object: {} } })).json()).toEqual({ received: true, ignored: "customer.created" });
      expect(calls.filter((c) => c.url.includes("/rpc/record_online_payment"))).toEqual([]);
    });
  });

  describe("Settings (owner / admin)", () => {
    const get = () => new Request("https://northpin.app/api/payments/account", { headers: { Authorization: "Bearer user-token" } });

    it("technicians are refused", async () => {
      world.role = "tech";
      const { GET, POST } = await import("@/app/api/payments/account/route");
      expect((await GET(get())).status).toBe(403);
      expect((await POST(post("/api/payments/account", { action: "connect" }))).status).toBe(403);
      expect(fake.accounts.create).not.toHaveBeenCalled();
    });

    it("connects a Standard-type account once and sends the owner to Stripe's onboarding", async () => {
      fake.accounts.create.mockResolvedValue({ id: "acct_new0001", charges_enabled: false, details_submitted: false, payouts_enabled: false, country: "US", default_currency: "usd" });
      fake.accountLinks.create.mockResolvedValue({ url: "https://connect.stripe.com/setup/s/abc" });
      const { GET, POST } = await import("@/app/api/payments/account/route");
      expect(await (await GET(get())).json()).toMatchObject({ configured: true, connected: false });
      const r = await POST(post("/api/payments/account", { action: "connect" }));
      expect(await r.json()).toEqual({ url: "https://connect.stripe.com/setup/s/abc" });
      const [params, opts] = fake.accounts.create.mock.calls[0];
      expect(params.controller).toEqual({ stripe_dashboard: { type: "full" }, fees: { payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe" });
      expect(opts).toEqual({ idempotencyKey: "pinplan-connect-u-owner" });
      expect(fake.accountLinks.create).toHaveBeenCalledWith({
        account: "acct_new0001",
        type: "account_onboarding",
        refresh_url: "https://northpin.app/settings?payments=refresh#payments",
        return_url: "https://northpin.app/settings?payments=return#payments",
      });
      expect(world.account).toMatchObject({ stripe_account_id: "acct_new0001", connected_by: "u-owner" });
      // A second click continues onboarding for the same account.
      await POST(post("/api/payments/account", { action: "connect" }));
      expect(fake.accounts.create).toHaveBeenCalledTimes(1);
      expect(fake.accountLinks.create.mock.calls[1][0].account).toBe("acct_new0001");
    });

    it("reads the account back from Stripe until it can take payments, then changes the switches", async () => {
      world.account = { owner_id: "u-owner", stripe_account_id: "acct_new0001", charges_enabled: false, details_submitted: true, payouts_enabled: false, enabled: true, ach: false, country: "US", default_currency: "usd" };
      fake.accounts.retrieve.mockResolvedValue({ id: "acct_new0001", charges_enabled: true, details_submitted: true, payouts_enabled: true, country: "US", default_currency: "usd" });
      const { GET, POST } = await import("@/app/api/payments/account/route");
      expect(await (await GET(get())).json()).toMatchObject({ connected: true, chargesEnabled: true });
      const r = await POST(post("/api/payments/account", { action: "settings", ach: true, enabled: false }));
      expect(await r.json()).toMatchObject({ ach: true, enabled: false });
      const d = await POST(post("/api/payments/account", { action: "disconnect" }));
      expect(await d.json()).toMatchObject({ connected: false });
    });
  });
});

describe("invoice email", () => {
  it("has a Pay by card button to the client link when the company takes payments online", () => {
    const base = { kind: "document" as const, docKind: "invoice" as const, title: "Invoice", number: "INV-7", companyName: "Example Electric", total: 500, balanceDue: 500, currency: "USD", url: `https://northpin.app/d?t=${TOKEN}` };
    const on = documentEmail({ ...base, payOnline: true });
    expect(on.html).toContain("Pay $500.00 by card");
    expect(on.text).toContain("pay it by card");
    expect(on.html).toContain(`https://northpin.app/d?t=${TOKEN}`);
    const off = documentEmail(base);
    expect(off.html).not.toContain("by card");
    // Receipts and paid invoices: no button.
    expect(documentEmail({ ...base, payOnline: true, kind: "receipt" }).html).not.toContain("by card");
    expect(documentEmail({ ...base, payOnline: true, balanceDue: 0 }).html).not.toContain("Pay $");
  });
});
