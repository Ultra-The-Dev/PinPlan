// /api/billing/*: Stripe is mocked (its real webhook signature check is kept); Supabase REST is a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn(), update: vi.fn() },
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

  beforeEach(() => {
    vi.resetModules();
    for (const f of [fake.customers.create, fake.checkout.sessions.create, fake.billingPortal.sessions.create, fake.subscriptions.retrieve, fake.subscriptions.update]) f.mockReset();
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
        calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null, auth: headers.get("authorization") });
        if (url === `${SB}/auth/v1/user`) return world.user ? Response.json({ id: world.user }) : new Response("no", { status: 401 });
        if (url.startsWith(`${SB}/rest/v1/team_members?user_id=`))
          return Response.json(world.role ? [{ team_id: "team-1", role: world.role, email: "boss@acme.test" }] : []);
        if (url.startsWith(`${SB}/rest/v1/team_members?team_id=`)) return Response.json(Array.from({ length: world.members }, (_, i) => ({ user_id: `u${i}` })));
        if (url.startsWith(`${SB}/rest/v1/teams?`)) {
          if (method === "PATCH") {
            if (url.includes("plan_status=neq.comped") && world.team.plan_status === "comped") return Response.json([]);
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
