// POST /api/team/join: creates a confirmed account only for a live invite code, and only with the service key set.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const URL_ = "https://sb.example.co";
type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function req(body: unknown, ip = "1.2.3.4") {
  return new Request("http://localhost/api/team/join", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
}
const good = { code: "k7qm-xr4t-pa", email: "Sam@Acme.com ", password: "longenough", name: "Sam" };

describe("POST /api/team/join", () => {
  let calls: Call[];
  let liveCode: boolean;
  let adminStatus: number;
  let adminBody: Record<string, unknown>;

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    liveCode = true;
    adminStatus = 200;
    adminBody = { id: "u1" };
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: init?.body ? JSON.parse(String(init.body)) : {} });
        if (url.endsWith("/rest/v1/rpc/team_invite_info")) return Response.json(liveCode ? { team: "Acme", role: "tech", name: "", expires_at: "2099-01-01" } : null);
        if (url.endsWith("/auth/v1/admin/users")) return Response.json(adminBody, { status: adminStatus });
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("answers 501 without the service key, so the page falls back to a normal sign-up", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { POST, GET } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(501);
    expect(calls).toHaveLength(0);
    expect(await (await GET()).json()).toEqual({ available: false });
  });

  it("checks the code with the anon key, then creates a confirmed user with the service key", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(200);
    expect(calls[0].url).toBe(`${URL_}/rest/v1/rpc/team_invite_info`);
    expect(calls[0].headers.apikey).toBe("anon-key");
    expect(calls[0].body).toEqual({ p_code: "K7QMXR4TPA" });
    expect(calls[1].url).toBe(`${URL_}/auth/v1/admin/users`);
    expect(calls[1].headers.authorization).toBe("Bearer service-key");
    expect(calls[1].body).toMatchObject({ email: "sam@acme.com", password: "longenough", email_confirm: true, user_metadata: { name: "Sam" } });
    // The key never comes back to the browser.
    expect(JSON.stringify(await r.json())).not.toContain("service-key");
  });

  it("refuses a dead code without creating anyone", async () => {
    liveCode = false;
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("invalid_code");
    expect(calls.some((c) => c.url.includes("/admin/users"))).toBe(false);
  });

  it("validates input before calling Supabase", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    for (const bad of [{ ...good, password: "short" }, { ...good, email: "nope" }, { ...good, code: "x" }, { ...good, email: 42 }]) {
      const r = await POST(req(bad));
      expect(r.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("says when the email already has an account", async () => {
    adminStatus = 422;
    adminBody = { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" };
    const { POST } = await import("@/app/api/team/join/route");
    const r = await POST(req(good));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("exists");
  });

  it("slows down repeated tries on one code", async () => {
    const { POST } = await import("@/app/api/team/join/route");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await POST(req({ ...good, email: `w${i}@acme.com` }, `10.0.0.${i}`))).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[6]).toBe(429);
  });
});
