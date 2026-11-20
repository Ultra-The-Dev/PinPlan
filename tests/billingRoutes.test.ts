// /api/billing/*: Stripe is mocked (its real webhook signature check is kept); Supabase REST is a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn(), list: vi.fn(), expire: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn(), update: vi.fn(), cancel: vi.fn() },
  prices: { retrieve: vi.fn() },
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
const WHSEC = "whsec_test_secret";
type Call = { method: string; url: string; body: Record<string, unknown> | null; auth: string | null };

interface World {
  user: string | null;
  role: string | null;
  team: Record<string, unknown>;
  members: number;
}

function req(path: string, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request(`https://app.example.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer user-token", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("billing routes", () => {
  let calls: Call[];
  let world: World;
  let emails: { to: string[]; subject: string; key: string | null }[];

  beforeEach(() => {
    vi.resetModules();
    for (const f of [
      fake.customers.create,
      fake.checkout.sessions.create,
      fake.checkout.sessions.list,
      fake.checkout.sessions.expire,
      fake.billingPortal.sessions.create,
      fake.subscriptions.retrieve,
      fake.subscriptions.update,
      fake.subscriptions.cancel,
      fake.prices.retrieve,
    ])
      f.mockReset();
    fake.checkout.sessions.list.mockResolvedValue({ data: [] });
    fake.checkout.sessions.expire.mockResolvedValue({});
    emails = [];
    calls = [];
    world = {
      user: "u-owner",
      role: "owner",
      members: 5,
      team: {
        id: "team-1",
        name: "Acme LV",
        owner_id: "u-owner",
        plan_status: "trialing",
        trial_ends_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        current_period_end: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        seat_limit: null,
        billing_email: null,
      },
    };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WHSEC);
    vi.stubEnv("STRIPE_PRICE_BASE", "price_base");
    vi.stubEnv("STRIPE_PRICE_SEAT", "price_seat");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);
        if (url === "https://api.resend.com/emails") {
          const b = JSON.parse(String(init!.body));
          emails.push({ to: b.to, subject: b.subject, key: headers.get("idempotency-key") });
          return Response.json({ id: `em_${emails.length}` });
        }
        calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null, auth: headers.get("authorization") });
        if (url === `${SB}/auth/v1/user`) return world.user ? Response.json({ id: world.user, email: "boss@acme.test", email_confirmed_at: "2026-01-01T00:00:00Z" }) : new Response("no", { status: 401 });
        if (url.startsWith(`${SB}/rest/v1/team_members?user_id=`))
          return Response.json(world.role ? [{ team_id: "team-1", role: world.role, email: "boss@acme.test" }] : []);
        if (url.startsWith(`${SB}/rest/v1/team_members?team_id=`)) return Response.json(Array.from({ length: world.members }, (_, i) => ({ user_id: `u${i}` })));
        if (url.startsWith(`${SB}/rest/v1/teams?`)) {
          if (method === "PATCH") {
            if (url.includes("plan_status=neq.comped") && world.team.plan_status === "comped") return Response.json([]);
            // The "payment failed" email claim: only when this invoice isn't recorded yet.
            const inv = /payment_failed_invoice_id\.neq\.([^,)]+)/.exec(url)?.[1];
            if (inv && world.team.payment_failed_invoice_id === decodeURIComponent(inv)) return Response.json([]);
            Object.assign(world.team, JSON.parse(String(init!.body)));
            return Response.json([{ id: "team-1" }]);
          }
          if (url.includes("stripe_customer_id=eq.") && !url.includes(String(world.team.stripe_customer_id))) return Response.json([]);
          return Response.json([world.team]);
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("answers 501 on every route when Stripe isn't configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const routes = {
      checkout: () => import("@/app/api/billing/checkout/route"),
      portal: () => import("@/app/api/billing/portal/route"),
      webhook: () => import("@/app/api/billing/webhook/route"),
      "sync-seats": () => import("@/app/api/billing/sync-seats/route"),
    };
    for (const [name, load] of Object.entries(routes)) {
      const { POST } = await load();
      const r = await POST(req(`/api/billing/${name}`));
      expect(r.status).toBe(501);
      const j = await r.json();
      expect(j.code).toBe("billing_not_configured");
      expect(j.missing).toEqual(["STRIPE_SECRET_KEY"]);
    }
    expect(calls).toHaveLength(0);
  });

  describe("checkout", () => {
    it("creates the customer, stores it, and opens checkout with extra seats and the rest of the trial", async () => {
      fake.customers.create.mockResolvedValue({ id: "cus_new" });
      fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s1" });
      const { POST } = await import("@/app/api/billing/checkout/route");
      const r = await POST(req("/api/billing/checkout"));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ url: "https://checkout.stripe.test/s1" });
      expect(fake.customers.create).toHaveBeenCalledWith(
        { name: "Acme LV", email: "boss@acme.test", metadata: { team_id: "team-1" } },
        { idempotencyKey: "pinplan-team-customer-team-1" },
      );
      const patch = calls.find((c) => c.method === "PATCH")!;
      expect(patch.url).toContain("stripe_customer_id=is.null");
      expect(patch.auth).toBe("Bearer service-key");
      expect(world.team.stripe_customer_id).toBe("cus_new");
      const args = fake.checkout.sessions.create.mock.calls[0][0];
      expect(args.customer).toBe("cus_new");
      expect(args.mode).toBe("subscription");
      expect(args.line_items).toEqual([
        { price: "price_base", quantity: 1 },
        { price: "price_seat", quantity: 2 }, // 5 people, 3 included
      ]);
      expect(args.subscription_data.metadata).toEqual({ team_id: "team-1" });
      expect(args.subscription_data.trial_end).toBe(Math.floor(new Date(String(world.team.trial_ends_at)).getTime() / 1000));
      expect(args.success_url).toBe("https://app.example.com/settings?billing=success#billing");
      expect(args.cancel_url).toBe("https://app.example.com/settings?billing=cancel#billing");
    });

    it("reuses the stored customer and leaves out the seat line when the team fits the base price", async () => {
      Object.assign(world.team, { stripe_customer_id: "cus_old", plan_status: "canceled" });
      world.members = 2;
      fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s2" });
      const { POST } = await import("@/app/api/billing/checkout/route");
      expect((await POST(req("/api/billing/checkout"))).status).toBe(200);
      expect(fake.customers.create).not.toHaveBeenCalled();
      const args = fake.checkout.sessions.create.mock.calls[0][0];
      expect(args.line_items).toEqual([{ price: "price_base", quantity: 1 }]);
      expect(args.subscription_data.trial_end).toBeUndefined();
    });

    it("passes an idempotency key, the renewal note, and no tax or terms unless switched on", async () => {
      Object.assign(world.team, { stripe_customer_id: "cus_old" });
      fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s3" });
      const { POST } = await import("@/app/api/billing/checkout/route");
      expect((await POST(req("/api/billing/checkout"))).status).toBe(200);
      const [args, opts] = fake.checkout.sessions.create.mock.calls[0];
      expect(opts.idempotencyKey).toMatch(/^pinplan-checkout-team-1-[0-9a-f]{24}-[0-9a-f]{12}-\d+$/);
      expect(args.metadata).toEqual({ team_id: "team-1", terms_key: expect.stringMatching(/^[0-9a-f]{24}$/) });
      expect(args.custom_text.submit.message).toMatch(/renews automatically every month until you cancel/);
      expect(args.automatic_tax).toBeUndefined();
      expect(args.consent_collection).toBeUndefined();
      expect(fake.checkout.sessions.list).toHaveBeenCalledWith({ customer: "cus_old", status: "open", limit: 10 });
    });

    it("STRIPE_TAX=1 and STRIPE_TERMS_CONSENT=1 turn on tax collection and the terms checkbox", async () => {
      vi.stubEnv("STRIPE_TAX", "1");
      vi.stubEnv("STRIPE_TERMS_CONSENT", "1");
      fake.customers.create.mockResolvedValue({ id: "cus_new" });
      fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s4" });
      const { POST } = await import("@/app/api/billing/checkout/route");
      expect((await POST(req("/api/billing/checkout"))).status).toBe(200);
      const args = fake.checkout.sessions.create.mock.calls[0][0];
      expect(args).toMatchObject({
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        customer_update: { address: "auto", name: "auto" },
        tax_id_collection: { enabled: true },
        consent_collection: { terms_of_service: "required" },
      });
      expect(fake.checkout.sessions.list).not.toHaveBeenCalled(); // a brand-new customer has no open pages
    });

    it("reuses an open checkout page with the same terms, and closes older ones", async () => {
      Object.assign(world.team, { stripe_customer_id: "cus_old" });
      fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/first" });
      const { POST } = await import("@/app/api/billing/checkout/route");
      await POST(req("/api/billing/checkout"));
      const key = fake.checkout.sessions.create.mock.calls[0][0].metadata.terms_key;
      const later = Math.floor(Date.now() / 1000) + 3600;
      fake.checkout.sessions.list.mockResolvedValue({
        data: [
          { id: "cs_other_team", url: "https://checkout.stripe.test/x", expires_at: later, metadata: { team_id: "team-9", terms_key: key } },
          { id: "cs_same", url: "https://checkout.stripe.test/first", expires_at: later, metadata: { team_id: "team-1", terms_key: key } },
        ],
      });
      const r = await POST(req("/api/billing/checkout"));
      expect(await r.json()).toEqual({ url: "https://checkout.stripe.test/first" });
      expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(1);
      // Someone joined meanwhile: the old page (2 seats fewer) is closed and a new one made.
      world.members = 6;
      fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/second" });
      expect(await (await POST(req("/api/billing/checkout"))).json()).toEqual({ url: "https://checkout.stripe.test/second" });
      expect(fake.checkout.sessions.expire).toHaveBeenCalledWith("cs_same");
      expect(fake.checkout.sessions.expire).not.toHaveBeenCalledWith("cs_other_team");
    });

    it("never asks Stripe to replay a page an earlier call closed (the open pages are part of the key)", async () => {
      Object.assign(world.team, { stripe_customer_id: "cus_old" });
      fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/a" });
      const { POST } = await import("@/app/api/billing/checkout/route");
      await POST(req("/api/billing/checkout"));
      const key = fake.checkout.sessions.create.mock.calls[0][0].metadata.terms_key;
      // Same terms again, but now another page of this team is open (soon to expire, so it isn't reused): it's closed
      // and the new page must not come back as the first, already-closed one.
      const soon = Math.floor(Date.now() / 1000) + 60;
      fake.checkout.sessions.list.mockResolvedValue({ data: [{ id: "cs_b", url: "https://checkout.stripe.test/b", expires_at: soon, metadata: { team_id: "team-1", terms_key: key } }] });
      await POST(req("/api/billing/checkout"));
      const [k1, k2] = fake.checkout.sessions.create.mock.calls.map((c: unknown[]) => (c[1] as { idempotencyKey: string }).idempotencyKey);
      expect(k1).not.toBe(k2);
      expect(fake.checkout.sessions.expire).toHaveBeenCalledWith("cs_b");
    });

    it("sends people back to PINPLAN_APP_URL, never a forwarded host; production without it is refused", async () => {
      Object.assign(world.team, { stripe_customer_id: "cus_old" });
      fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s5" });
      const { POST } = await import("@/app/api/billing/checkout/route");
      await POST(req("/api/billing/checkout", {}, { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }));
      expect(fake.checkout.sessions.create.mock.calls[0][0].success_url).toBe("https://app.example.com/settings?billing=success#billing");
      vi.stubEnv("PINPLAN_APP_URL", "https://pinplan.example.org/");
      await POST(req("/api/billing/checkout"));
      expect(fake.checkout.sessions.create.mock.calls[1][0].cancel_url).toBe("https://pinplan.example.org/settings?billing=cancel#billing");
      vi.stubEnv("PINPLAN_APP_URL", "");
      vi.stubEnv("NODE_ENV", "production");
      const r = await POST(req("/api/billing/checkout"));
      expect(r.status).toBe(501);
      expect(await r.json()).toMatchObject({ code: "app_url_missing", missing: ["PINPLAN_APP_URL"] });
      expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(2);
    });

    it("never shows Stripe's own error message", async () => {
      Object.assign(world.team, { stripe_customer_id: "cus_old" });
      const err = Object.assign(new Error("No such price: 'price_base' (acct_secret123)"), { type: "StripeInvalidRequestError", code: "resource_missing" });
      fake.checkout.sessions.create.mockRejectedValue(err);
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { POST } = await import("@/app/api/billing/checkout/route");
      const r = await POST(req("/api/billing/checkout"));
      expect(r.status).toBe(502);
      const j = await r.json();
      expect(j).toEqual({ error: "Couldn't start checkout. Try again in a minute.", code: "stripe_error" });
      expect(JSON.stringify(j)).not.toContain("acct_secret123");
      expect(log).toHaveBeenCalled();
    });

    it("is for the owner or an admin only", async () => {
      world.role = "tech";
      const { POST } = await import("@/app/api/billing/checkout/route");
      expect((await POST(req("/api/billing/checkout"))).status).toBe(403);
      world.role = null;
      expect((await POST(req("/api/billing/checkout"))).status).toBe(400);
      world.user = null;
      expect((await POST(req("/api/billing/checkout"))).status).toBe(401);
      expect(fake.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("refuses a second subscription and comped teams", async () => {
      Object.assign(world.team, { stripe_subscription_id: "sub_1", plan_status: "active" });
      const { POST } = await import("@/app/api/billing/checkout/route");
      expect((await POST(req("/api/billing/checkout"))).status).toBe(409);
      Object.assign(world.team, { stripe_subscription_id: null, plan_status: "comped" });
      expect((await POST(req("/api/billing/checkout"))).status).toBe(400);
    });
  });

  describe("price check", () => {
    const price = (cents: number, p: Record<string, unknown> = {}) => ({ id: "p", active: true, unit_amount: cents, currency: "usd", recurring: { interval: "month", interval_count: 1 }, ...p });
    const get = () => new Request("https://app.example.com/api/billing/check", { headers: { Authorization: "Bearer user-token" } });

    it("reports a match, or what differs", async () => {
      vi.stubEnv("PLATFORM_ADMIN_EMAILS", "boss@acme.test");
      const { GET } = await import("@/app/api/billing/check/route");
      const plan = (await import("@/lib/plans")).PLANS[0];
      fake.prices.retrieve.mockImplementation(async (id: string) => (id === "price_base" ? price(plan.basePrice * 100) : price(plan.seatPrice * 100)));
      expect(await (await GET(get())).json()).toMatchObject({ ok: true, mismatches: [] });
      fake.prices.retrieve.mockImplementation(async (id: string) => (id === "price_base" ? price(9900) : price(plan.seatPrice * 100, { currency: "cad" })));
      const j = await (await GET(get())).json();
      expect(j.ok).toBe(false);
      expect(j.mismatches).toHaveLength(2);
      expect(j.prices.base).toEqual({ unitAmount: 9900, currency: "usd", interval: "month", active: true });
    });

    it("is for platform admins only (a team owner or admin is refused)", async () => {
      vi.stubEnv("PLATFORM_ADMIN_EMAILS", "someone-else@example.com");
      const { GET } = await import("@/app/api/billing/check/route");
      expect((await GET(get())).status).toBe(403);
      world.role = "tech";
      expect((await GET(get())).status).toBe(403);
      world.user = null;
      expect((await GET(get())).status).toBe(401);
      expect(fake.prices.retrieve).not.toHaveBeenCalled();
    });

    it("is limited to 5 an hour", async () => {
      vi.stubEnv("PLATFORM_ADMIN_EMAILS", "boss@acme.test");
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      fake.prices.retrieve.mockResolvedValue(price(100));
      const { GET } = await import("@/app/api/billing/check/route");
      for (let i = 0; i < 5; i++) expect((await GET(get())).status).toBe(200);
      const r = await GET(get());
      expect(r.status).toBe(429);
      expect(r.headers.get("retry-after")).toBeTruthy();
      expect(fake.prices.retrieve).toHaveBeenCalledTimes(10);
    });
  });

  it("checkout and portal are limited to 10 per 10 minutes per team", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    world.team.stripe_customer_id = "cus_1";
    fake.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.test/p" });
    fake.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/c" });
    for (const name of ["portal", "checkout"]) {
      const { POST } = await import(`@/app/api/billing/${name}/route`);
      for (let i = 0; i < 10; i++) expect((await POST(req(`/api/billing/${name}`))).status).toBe(200);
      const r = await POST(req(`/api/billing/${name}`));
      expect(r.status).toBe(429);
      expect((await r.json()).code).toBe("rate_limited");
    }
    expect(fake.billingPortal.sessions.create).toHaveBeenCalledTimes(10);
  });

  it("portal opens for the team's customer", async () => {
    world.team.stripe_customer_id = "cus_1";
    fake.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.test/p" });
    const { POST } = await import("@/app/api/billing/portal/route");
    const r = await POST(req("/api/billing/portal"));
    expect(await r.json()).toEqual({ url: "https://billing.stripe.test/p" });
    expect(fake.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "cus_1", return_url: "https://app.example.com/settings#billing" });
  });

  describe("webhook", () => {
    const sub = (p: Record<string, unknown> = {}) => ({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      trial_end: null,
      metadata: { team_id: "team-1" },
      items: { data: [{ id: "si_b", quantity: 1, price: { id: "price_base" }, current_period_end: 1_800_000_000 }, { id: "si_s", quantity: 2, price: { id: "price_seat" }, current_period_end: 1_800_000_000 }] },
      ...p,
    });
    async function send(event: Record<string, unknown>, secret = WHSEC) {
      const Stripe = (await vi.importActual<typeof import("stripe")>("stripe")).default;
      const payload = JSON.stringify(event);
      const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
      const { POST } = await import("@/app/api/billing/webhook/route");
      return POST(new Request("https://app.example.com/api/billing/webhook", { method: "POST", headers: { "stripe-signature": header }, body: payload }));
    }

    it("rejects a bad signature", async () => {
      const r = await send({ id: "evt_1", type: "customer.subscription.updated", data: { object: sub() } }, "whsec_wrong");
      expect(r.status).toBe(400);
      expect(fake.subscriptions.retrieve).not.toHaveBeenCalled();
    });

    it("copies the subscription onto the team (re-read from Stripe), and repeats harmlessly", async () => {
      fake.subscriptions.retrieve.mockResolvedValue(sub());
      for (let i = 0; i < 2; i++) {
        const r = await send({ id: "evt_2", type: "customer.subscription.updated", data: { object: sub({ status: "incomplete" }) } });
        expect(await r.json()).toEqual({ received: true, result: "updated" });
      }
      expect(fake.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
      expect(world.team).toMatchObject({ plan_status: "active", stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1", seat_limit: 5, current_period_end: new Date(1_800_000_000_000).toISOString() });
      expect(calls.filter((c) => c.method === "PATCH").every((c) => c.auth === "Bearer service-key")).toBe(true);
    });

    it("handles checkout and invoice events through their subscription", async () => {
      fake.subscriptions.retrieve.mockResolvedValue(sub({ metadata: {} }));
      let r = await send({ id: "evt_3", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: "team-1" } } });
      expect((await r.json()).result).toBe("updated");
      fake.subscriptions.retrieve.mockResolvedValue(sub({ status: "past_due" }));
      r = await send({ id: "evt_4", type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } } });
      expect((await r.json()).result).toBe("updated");
      expect(world.team.plan_status).toBe("past_due");
    });

    it("cancels a second live subscription instead of replacing the first", async () => {
      Object.assign(world.team, { plan_status: "active", stripe_subscription_id: "sub_old", stripe_customer_id: "cus_1", seat_limit: 5 });
      fake.subscriptions.retrieve.mockImplementation(async (id: string) => (id === "sub_old" ? sub({ id: "sub_old" }) : sub({ id: "sub_new" })));
      fake.subscriptions.cancel.mockResolvedValue({ id: "sub_new", status: "canceled" });
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const r = await send({ id: "evt_d1", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_new", client_reference_id: "team-1" } } });
      expect(await r.json()).toMatchObject({ result: "duplicate_canceled" });
      expect(fake.subscriptions.cancel).toHaveBeenCalledWith("sub_new", {}, { idempotencyKey: "pinplan-cancel-duplicate-sub_new" });
      expect(world.team.stripe_subscription_id).toBe("sub_old");
      expect(log.mock.calls.flat().join(" ")).toMatch(/duplicate sub_new/);
      // The old one really ended (a resubscribe): the new one is taken.
      fake.subscriptions.retrieve.mockImplementation(async (id: string) => (id === "sub_old" ? sub({ id: "sub_old", status: "canceled" }) : sub({ id: "sub_new" })));
      const r2 = await send({ id: "evt_d2", type: "customer.subscription.created", data: { object: sub({ id: "sub_new" }) } });
      expect((await r2.json()).result).toBe("updated");
      expect(world.team.stripe_subscription_id).toBe("sub_new");
      expect(fake.subscriptions.cancel).toHaveBeenCalledTimes(1);
    });

    it("raises the seats after checkout when more people joined during the trial", async () => {
      world.members = 7; // the subscription has 5 seats (3 + 2)
      fake.subscriptions.retrieve.mockResolvedValue(sub());
      fake.subscriptions.update.mockResolvedValue(sub({ items: { data: [{ id: "si_b", quantity: 1, price: { id: "price_base" } }, { id: "si_s", quantity: 4, price: { id: "price_seat" } }] } }));
      const r = await send({ id: "evt_s1", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: "team-1" } } });
      expect((await r.json()).result).toBe("updated");
      expect(fake.subscriptions.update).toHaveBeenCalledWith("sub_1", { items: [{ id: "si_s", quantity: 4 }], proration_behavior: "create_prorations" });
      expect(world.team.seat_limit).toBe(7);
      // Enough seats: nothing changes.
      fake.subscriptions.update.mockClear();
      world.members = 5;
      fake.subscriptions.retrieve.mockResolvedValue(sub());
      await send({ id: "evt_s2", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: "team-1" } } });
      expect(fake.subscriptions.update).not.toHaveBeenCalled();
    });

    it("emails the owner once per failed invoice, and an email problem never fails the webhook", async () => {
      vi.stubEnv("RESEND_API_KEY", "re_test");
      vi.stubEnv("EMAIL_FROM", "PinPlan <billing@example.com>");
      world.team.billing_email = "pay@acme.test";
      fake.subscriptions.retrieve.mockResolvedValue(sub({ status: "past_due" }));
      const invoice = { id: "in_1", amount_due: 6400, currency: "usd", next_payment_attempt: 1_800_000_000, subscription: "sub_1" };
      for (let i = 0; i < 2; i++) {
        const r = await send({ id: `evt_f${i}`, type: "invoice.payment_failed", data: { object: invoice } });
        expect(r.status).toBe(200);
        expect((await r.json()).email).toBe(i === 0 ? "sent" : "already_sent");
      }
      expect(emails).toHaveLength(1);
      expect(emails[0]).toMatchObject({ to: ["pay@acme.test"], key: "pinplan-payment-failed-in_1" });
      expect(emails[0].subject).toMatch(/payment didn't go through/);
      // A new invoice fails: one more email.
      await send({ id: "evt_f3", type: "invoice.payment_failed", data: { object: { ...invoice, id: "in_2" } } });
      expect(emails).toHaveLength(2);
      // Resend is down: still 200, and the claim is given back so a retry can send it.
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const realFetch = globalThis.fetch;
      vi.stubGlobal("fetch", (async (input: string | URL | Request, init?: RequestInit) =>
        String(input) === "https://api.resend.com/emails" ? new Response("{}", { status: 500 }) : realFetch(input, init)) as typeof fetch);
      const r = await send({ id: "evt_f4", type: "invoice.payment_failed", data: { object: { ...invoice, id: "in_3" } } });
      expect(r.status).toBe(200);
      expect((await r.json()).email).toBe("failed");
      expect(world.team.payment_failed_invoice_id).toBeNull();
    });

    it("never marks a team active for a subscription without the base price, and reports it", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
      fake.subscriptions.retrieve.mockResolvedValue(sub({ items: { data: [{ id: "si_x", quantity: 1, price: { id: "price_cheap" } }] } }));
      const r = await send({ id: "evt_b1", type: "customer.subscription.updated", data: { object: sub() } });
      expect(await r.json()).toMatchObject({ received: true, result: "missing_base_price" });
      expect(world.team.plan_status).toBe("trialing");
      expect(world.team.stripe_subscription_id).toBeNull();
      expect(calls.some((c) => c.method === "PATCH")).toBe(false);
      expect(err.mock.calls.flat().join(" ")).toMatch(/no item with the base price/);
      // A canceled one without it is still recorded (it takes access away, never gives it).
      fake.subscriptions.retrieve.mockResolvedValue(sub({ status: "canceled", items: { data: [] } }));
      const r2 = await send({ id: "evt_b2", type: "customer.subscription.deleted", data: { object: sub() } });
      expect((await r2.json()).result).toBe("updated");
      expect(world.team.plan_status).toBe("canceled");
    });

    it("refits the seats on any subscription update when more people are on the team than it pays for", async () => {
      world.members = 6; // the subscription pays for 5 (3 + 2)
      fake.subscriptions.retrieve.mockResolvedValue(sub());
      fake.subscriptions.update.mockResolvedValue(sub({ items: { data: [{ id: "si_b", quantity: 1, price: { id: "price_base" } }, { id: "si_s", quantity: 3, price: { id: "price_seat" } }] } }));
      const r = await send({ id: "evt_s3", type: "customer.subscription.updated", data: { object: sub() } });
      expect((await r.json()).result).toBe("updated");
      expect(fake.subscriptions.update).toHaveBeenCalledTimes(1);
      expect(fake.subscriptions.update).toHaveBeenCalledWith("sub_1", { items: [{ id: "si_s", quantity: 3 }], proration_behavior: "create_prorations" });
      expect(world.team.seat_limit).toBe(6);
      // Not for a lapsed subscription.
      fake.subscriptions.update.mockClear();
      world.members = 9;
      fake.subscriptions.retrieve.mockResolvedValue(sub({ status: "past_due" }));
      await send({ id: "evt_s4", type: "customer.subscription.updated", data: { object: sub() } });
      expect(fake.subscriptions.update).not.toHaveBeenCalled();
    });

    it("ignores other events and leaves comped teams alone", async () => {
      let r = await send({ id: "evt_5", type: "customer.created", data: { object: {} } });
      expect((await r.json()).ignored).toBe("customer.created");
      world.team.plan_status = "comped";
      fake.subscriptions.retrieve.mockResolvedValue(sub({ status: "canceled" }));
      r = await send({ id: "evt_6", type: "customer.subscription.deleted", data: { object: sub({ status: "canceled" }) } });
      expect((await r.json()).result).toBe("skipped");
      expect(world.team.plan_status).toBe("comped");
    });

    it("asks Stripe to retry when the update fails", async () => {
      fake.subscriptions.retrieve.mockRejectedValue(new Error("network"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const r = await send({ id: "evt_7", type: "customer.subscription.updated", data: { object: sub() } });
      expect(r.status).toBe(500);
    });
  });

  describe("sync-seats", () => {
    beforeEach(() => {
      Object.assign(world.team, { plan_status: "active", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", seat_limit: 5 });
    });
    const subWith = (seatQty: number | null) => ({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      metadata: { team_id: "team-1" },
      items: { data: [{ id: "si_b", quantity: 1, price: { id: "price_base" } }, ...(seatQty == null ? [] : [{ id: "si_s", quantity: seatQty, price: { id: "price_seat" } }])] },
    });

    it("adds a seat (Stripe prorates) and writes the new limit right away", async () => {
      fake.subscriptions.retrieve.mockResolvedValue(subWith(2));
      fake.subscriptions.update.mockResolvedValue(subWith(3));
      const { POST } = await import("@/app/api/billing/sync-seats/route");
      const r = await POST(req("/api/billing/sync-seats", { action: "add" }));
      expect(await r.json()).toEqual({ seats: 6 });
      expect(fake.subscriptions.update).toHaveBeenCalledWith("sub_1", { items: [{ id: "si_s", quantity: 3 }], proration_behavior: "create_prorations" });
      expect(world.team.seat_limit).toBe(6);
    });

    it("adds the seat item when there wasn't one, and removes it when no extra seats are left", async () => {
      Object.assign(world.team, { seat_limit: 3 });
      world.members = 3;
      fake.subscriptions.retrieve.mockResolvedValue(subWith(null));
      fake.subscriptions.update.mockResolvedValue(subWith(1));
      const { POST } = await import("@/app/api/billing/sync-seats/route");
      await POST(req("/api/billing/sync-seats", { action: "add" }));
      expect(fake.subscriptions.update).toHaveBeenLastCalledWith("sub_1", { items: [{ price: "price_seat", quantity: 1 }], proration_behavior: "create_prorations" });
      Object.assign(world.team, { seat_limit: 4 });
      world.members = 2;
      fake.subscriptions.retrieve.mockResolvedValue(subWith(1));
      fake.subscriptions.update.mockResolvedValue(subWith(null));
      expect(await (await POST(req("/api/billing/sync-seats", { action: "release" }))).json()).toEqual({ seats: 3 });
      expect(fake.subscriptions.update).toHaveBeenLastCalledWith("sub_1", { items: [{ id: "si_s", deleted: true }], proration_behavior: "create_prorations" });
    });

    it("refuses to add a seat while more than two are free", async () => {
      Object.assign(world.team, { seat_limit: 8 });
      world.members = 5;
      const { POST } = await import("@/app/api/billing/sync-seats/route");
      const r = await POST(req("/api/billing/sync-seats", { action: "add" }));
      expect(r.status).toBe(409);
      expect((await r.json()).code).toBe("enough_seats");
      expect(fake.subscriptions.update).not.toHaveBeenCalled();
      // Two free seats is fine (8 seats, 6 people).
      world.members = 6;
      fake.subscriptions.retrieve.mockResolvedValue(subWith(5));
      fake.subscriptions.update.mockResolvedValue(subWith(6));
      expect(await (await POST(req("/api/billing/sync-seats", { action: "add" }))).json()).toEqual({ seats: 9 });
    });

    it("is limited to 20 an hour per team", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      fake.subscriptions.retrieve.mockResolvedValue(subWith(2));
      const { POST } = await import("@/app/api/billing/sync-seats/route");
      for (let i = 0; i < 20; i++) expect((await POST(req("/api/billing/sync-seats", { action: "fit" }))).status).toBe(200);
      expect((await POST(req("/api/billing/sync-seats", { action: "fit" }))).status).toBe(429);
    });

    it("does nothing during the trial, when comped, or when already right", async () => {
      const { POST } = await import("@/app/api/billing/sync-seats/route");
      Object.assign(world.team, { plan_status: "trialing", stripe_subscription_id: null });
      expect(await (await POST(req("/api/billing/sync-seats", { action: "add" }))).json()).toEqual({ seats: null, skipped: "no_subscription" });
      Object.assign(world.team, { plan_status: "comped" });
      expect(await (await POST(req("/api/billing/sync-seats", { action: "add" }))).json()).toEqual({ seats: null, skipped: "comped" });
      Object.assign(world.team, { plan_status: "active", stripe_subscription_id: "sub_1", seat_limit: 5 });
      fake.subscriptions.retrieve.mockResolvedValue(subWith(2));
      expect(await (await POST(req("/api/billing/sync-seats", { action: "fit" }))).json()).toEqual({ seats: 5 });
      expect(fake.subscriptions.update).not.toHaveBeenCalled();
      expect((await POST(req("/api/billing/sync-seats", { action: "lots" }))).status).toBe(400);
    });
  });
});
