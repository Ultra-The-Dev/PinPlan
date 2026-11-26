// /api/payments/account: a lapsed company can't START connecting Stripe (team_can_write, like the other paid server
// work), but an account it already connected keeps working (settings, disconnect; checkout and the webhook never ask).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accountsCreate = vi.fn(async () => ({ id: "acct_new", charges_enabled: false, details_submitted: false, payouts_enabled: false }));
const linksCreate = vi.fn(async () => ({ url: "https://connect.stripe.test/onboard" }));
let row: Record<string, unknown> | null = null;

vi.mock("@/lib/server/auth", () => ({ requireUser: vi.fn(async () => ({ ok: true, userId: "u1" })) }));
vi.mock("@/lib/server/billing", () => ({ originOf: () => "https://app.test" }));
vi.mock("@/lib/server/rateLimit", () => ({ durableRateLimit: vi.fn(async () => ({ ok: true })), tooManyRequests: vi.fn(), waitText: vi.fn() }));
vi.mock("@/lib/server/onlinePayments", async (orig) => {
  const actual = await orig<typeof import("@/lib/server/onlinePayments")>();
  return {
    ...actual,
    paymentsConfig: () => ({ ok: true, config: { secretKey: "sk_test", connectWebhookSecret: "whsec", feeBps: 0 } }),
    paymentsOffice: async () => ({ ok: true, owner: "owner-1", email: null }),
    stripeFor: () => ({ accounts: { create: accountsCreate, retrieve: vi.fn() }, accountLinks: { create: linksCreate } }),
    serviceDb: () => ({
      accountByOwner: async () => row,
      saveAccount: async (_o: string, patch: Record<string, unknown>) => {
        row = { ...(row ?? {}), ...patch };
      },
    }),
  };
});

let canWrite = true;
const rpc: unknown[] = [];

beforeEach(() => {
  canWrite = true;
  row = null;
  rpc.length = 0;
  accountsCreate.mockClear();
  linksCreate.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://sb.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === "/rest/v1/rpc/team_can_write") {
        rpc.push(JSON.parse(String(init?.body)));
        return Response.json(canWrite);
      }
      return Response.json({ message: "not found" }, { status: 404 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import("@/app/api/payments/account/route");
  return POST(new Request("http://localhost/api/payments/account", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer tok" }, body: JSON.stringify(body) }));
};

describe("connecting online payments needs an active plan", () => {
  it("a lapsed company gets 402 and Stripe is never asked", async () => {
    canWrite = false;
    const r = await post({ action: "connect" });
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ code: "plan_required" });
    expect(rpc).toEqual([{ owner: "u1" }]);
    expect(accountsCreate).not.toHaveBeenCalled();
    expect(linksCreate).not.toHaveBeenCalled();
  });

  it("an active company connects", async () => {
    const r = await post({ action: "connect" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: "https://connect.stripe.test/onboard" });
    expect(accountsCreate).toHaveBeenCalledTimes(1);
  });

  it("a lapsed company with an account already connected can still change its settings and disconnect", async () => {
    canWrite = false;
    row = { owner_id: "owner-1", stripe_account_id: "acct_1", charges_enabled: true, details_submitted: true, payouts_enabled: true, enabled: true, ach: false };
    expect((await post({ action: "settings", enabled: false })).status).toBe(200);
    expect((await post({ action: "disconnect" })).status).toBe(200);
    expect(rpc).toEqual([]);
  });
});
