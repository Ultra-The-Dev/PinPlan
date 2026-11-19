// DELETE /api/account: identifies the caller by their token, asks for a fresh sign-in or the typed email, applies the
// team rules, settles billing, removes their storage files and deletes the login with the service key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

// Stripe stand-in (the SDK doesn't go through global fetch).
const stripe = {
  subscriptions: {
    cancel: vi.fn(async (id: string) => ({ id, status: "canceled" })),
    retrieve: vi.fn(async (id: string) => ({ id, status: "active", customer: "cus_1", items: { data: [{ id: "si_seat", quantity: 3, price: { id: "price_seat" } }] }, metadata: { team_id: "t1" } })),
    update: vi.fn(async (id: string, p: { items: { quantity?: number }[] }) => ({ id, status: "active", customer: "cus_1", items: { data: [{ id: "si_seat", quantity: p.items[0].quantity ?? 0, price: { id: "price_seat" } }] }, metadata: { team_id: "t1" } })),
  },
  customers: { update: vi.fn(async (id: string) => ({ id })) },
};
const applied = vi.fn(async () => "updated");
vi.mock("@/lib/server/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/billing")>()),
  getStripe: () => stripe,
  applySubscription: (...a: unknown[]) => (applied as (...x: unknown[]) => Promise<string>)(...a),
}));

const URL_ = "https://sb.example.co";
type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** A JWT-shaped token issued `ageSeconds` ago (only the payload is read; Supabase checks the signature). */
const jwt = (ageSeconds = 10) => `h.${Buffer.from(JSON.stringify({ sub: "u1", iat: Math.floor(Date.now() / 1000) - ageSeconds })).toString("base64url")}.sig`;
const FRESH = jwt(10);
const STALE = jwt(3600);
const req = (token: string | null = FRESH, body?: unknown) =>
  new Request("http://localhost/api/account", {
    method: "DELETE",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("DELETE /api/account", () => {
  let calls: Call[];
  let membership: { team_id: string; role: string }[];
  let members: { user_id: string }[];
  let projects: { id: string }[];
  let storage: Record<string, { name: string; id: string | null }[]>;
  let team: Record<string, unknown>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    calls = [];
    team = { owner_id: "boss", plan_status: "trialing", stripe_subscription_id: null, stripe_customer_id: null, seat_limit: null };
    membership = [];
    members = [];
    projects = [{ id: "p1" }];
    storage = {
      "plans:p1": [
        { name: "img1", id: "o1" },
        { name: "img2", id: "o2" },
      ],
      "proposals:u1": [{ name: "tok", id: null }],
      "proposals:u1/tok": [{ name: "s1.jpg", id: "o3" }],
    };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_BASE", "STRIPE_PRICE_SEAT"]) vi.stubEnv(k, "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ method, url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body });
        const path = url.slice(URL_.length);
        if (path === "/auth/v1/user") {
          const auth = new Headers(init?.headers).get("authorization");
          return auth === `Bearer ${FRESH}` || auth === `Bearer ${STALE}` ? Response.json({ id: "u1", email: "Me@Example.com" }) : new Response("bad jwt", { status: 401 });
        }
        if (path.startsWith("/rest/v1/team_members?user_id=")) return Response.json(membership);
        if (path.startsWith("/rest/v1/team_members?team_id=")) return Response.json(members);
        if (path.startsWith("/rest/v1/teams?id=") && method === "GET") return Response.json([team]);
        if (path.startsWith("/rest/v1/projects?owner_id=") && method === "GET") return Response.json(projects);
        if (path.startsWith("/rest/v1/")) return new Response(null, { status: 204 });
        if (path.startsWith("/storage/v1/object/list/")) {
          const bucket = path.split("/").pop();
          return Response.json(storage[`${bucket}:${body.prefix}`] ?? []);
        }
        if (path.startsWith("/storage/v1/object/")) return Response.json([]);
        if (path === "/auth/v1/admin/users/u1") return Response.json({});
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("answers 501 without the service key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(501);
    expect((await r.json()).error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(calls).toHaveLength(0);
  });

  const withBilling = () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("STRIPE_PRICE_BASE", "price_base");
    vi.stubEnv("STRIPE_PRICE_SEAT", "price_seat");
  };
  const destructive = () => calls.filter((c) => c.method === "DELETE" || c.method === "PATCH");

  it("needs a fresh sign-in, or the account's email typed again", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    const stale = await DELETE(req(STALE));
    expect(stale.status).toBe(403);
    expect((await stale.json()).code).toBe("reauth_required");
    const wrong = await DELETE(req(STALE, { confirmEmail: "someone@else.com" }));
    expect(wrong.status).toBe(403);
    expect(destructive()).toHaveLength(0);
    const typed = await DELETE(req(STALE, { confirmEmail: " me@example.COM " }));
    expect(typed.status).toBe(200);
  });

  it("needs a valid sign-in", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    expect((await DELETE(req(null))).status).toBe(401);
    expect((await DELETE(req("someone-else"))).status).toBe(401);
    expect(calls.some((c) => c.url.includes("/admin/"))).toBe(false);
  });

  it("deletes a solo user's files and login", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, deletedTeam: false, deletedJobs: 1 });
    expect(calls[0].headers.apikey).toBe("anon-key");
    const removes = calls.filter((c) => c.method === "DELETE" && c.url.includes("/storage/v1/object/"));
    expect(removes.map((c) => c.body)).toEqual([{ prefixes: ["p1/img1", "p1/img2"] }, { prefixes: ["u1/tok/s1.jpg"] }]);
    const last = calls[calls.length - 1];
    expect(last).toMatchObject({ method: "DELETE", url: `${URL_}/auth/v1/admin/users/u1` });
    expect(last.headers.authorization).toBe("Bearer service-key");
  });

  it("refuses a team owner with other members, and deletes nothing", async () => {
    membership = [{ team_id: "t1", role: "owner" }];
    members = [{ user_id: "u1" }, { user_id: "u2" }];
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("team_has_members");
    expect(calls.some((c) => c.method === "DELETE" || c.method === "PATCH")).toBe(false);
  });

  it("deletes the team of an owner who is on it alone", async () => {
    membership = [{ team_id: "t1", role: "owner" }];
    members = [{ user_id: "u1" }];
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect((await r.json()).deletedTeam).toBe(true);
    expect(calls.some((c) => c.method === "DELETE" && c.url === `${URL_}/rest/v1/teams?id=eq.t1`)).toBe(true);
  });

  it("won't delete a subscribed team while billing is misconfigured (it would keep charging)", async () => {
    membership = [{ team_id: "t1", role: "owner" }];
    members = [{ user_id: "u1" }];
    team = { ...team, owner_id: "u1", plan_status: "active", stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1" };
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(501);
    expect((await r.json()).code).toBe("billing_not_configured");
    expect(destructive()).toHaveLength(0);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("cancels a subscribed team's plan and anonymises the Stripe customer before deleting", async () => {
    withBilling();
    membership = [{ team_id: "t1", role: "owner" }];
    members = [{ user_id: "u1" }];
    team = { ...team, owner_id: "u1", plan_status: "active", stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1" };
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { prorate: false });
    const [cust, patch] = stripe.customers.update.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(cust).toBe("cus_1");
    expect(patch).toMatchObject({ name: "Deleted account", email: "", phone: "", address: "", metadata: "" });
    expect(calls.some((c) => c.method === "DELETE" && c.url === `${URL_}/rest/v1/teams?id=eq.t1`)).toBe(true);
  });

  it("gives back a leaving member's paid seat", async () => {
    withBilling();
    membership = [{ team_id: "t1", role: "tech" }];
    members = [{ user_id: "boss" }, { user_id: "u1" }, { user_id: "u2" }, { user_id: "u3" }, { user_id: "u4" }, { user_id: "u5" }];
    team = { ...team, plan_status: "active", stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1", seat_limit: 6 };
    projects = [];
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect((await r.json()).releasedSeat).toBe(true);
    const [, update] = stripe.subscriptions.update.mock.calls[0] as unknown as [string, { items: { id: string; quantity: number }[] }];
    // 6 seats → 5: the base includes 3, so the seat item goes from 3 extra to 2.
    expect(update.items[0]).toEqual({ id: "si_seat", quantity: 2 });
    expect(applied).toHaveBeenCalled();
    // The login was deleted before the seat was changed.
    expect(calls.some((c) => c.url === `${URL_}/auth/v1/admin/users/u1` && c.method === "DELETE")).toBe(true);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("a leaving member of a subscribed team also waits for billing to be configured", async () => {
    membership = [{ team_id: "t1", role: "tech" }];
    members = [{ user_id: "boss" }, { user_id: "u1" }];
    team = { ...team, plan_status: "active", stripe_subscription_id: "sub_1" };
    const { DELETE } = await import("@/app/api/account/route");
    expect((await DELETE(req())).status).toBe(501);
    expect(destructive()).toHaveLength(0);
  });

  it("moves a member's jobs to the team owner instead of deleting them", async () => {
    membership = [{ team_id: "t1", role: "tech" }];
    members = [{ user_id: "boss" }, { user_id: "u1" }];
    projects = []; // after the move they own none
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ keptJobsWithTeam: true, deletedJobs: 0 });
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.map((c) => c.url.split("?")[0].split("/").pop())).toEqual(["projects", "proposals", "photo_reports"]);
    expect(patches[0].body).toEqual({ owner_id: "boss" });
    // Their proposal renders belong to the moved proposals now: kept.
    expect(calls.some((c) => c.url.includes("/storage/v1/object/list/proposals"))).toBe(false);
  });

  it("doesn't delete the login when cleaning up fails", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes("/storage/v1/object/list/plans")) return new Response("boom", { status: 500 });
      return original(input, init);
    });
    const { DELETE } = await import("@/app/api/account/route");
    const r = await DELETE(req());
    expect(r.status).toBe(502);
    expect(calls.some((c) => c.url.includes("/auth/v1/admin/users"))).toBe(false);
  });
});
