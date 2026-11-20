process.env.AI_ENABLED = "1"; // these tests exercise the AI routes, which are off unless enabled
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_LIMITS, clientIp, durableRateLimit, limitAi, rateLimit, resetRateLimits, tooManyRequests } from "@/lib/server/rateLimit";

describe("rateLimit (sliding window)", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit, then refuses until the oldest hit leaves the window", () => {
    const rule = { limit: 3, windowMs: 1000 };
    expect(rateLimit("k", rule, 0).remaining).toBe(2);
    expect(rateLimit("k", rule, 100).ok).toBe(true);
    expect(rateLimit("k", rule, 200).ok).toBe(true);
    const no = rateLimit("k", rule, 300);
    expect(no.ok).toBe(false);
    expect(no.retryAfter).toBe(1);
    // Rejected requests don't extend the window: at t=1001 the first hit has expired.
    expect(rateLimit("k", rule, 1001).ok).toBe(true);
    expect(rateLimit("k", rule, 1002).ok).toBe(false);
  });

  it("keeps keys separate", () => {
    const rule = { limit: 1, windowMs: 1000 };
    expect(rateLimit("a", rule, 0).ok).toBe(true);
    expect(rateLimit("b", rule, 0).ok).toBe(true);
    expect(rateLimit("a", rule, 1).ok).toBe(false);
  });

  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }))).toBe("203.0.113.9");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
    // Cloudflare's header wins over anything the caller put in x-forwarded-for.
    expect(clientIp(new Request("http://x", { headers: { "cf-connecting-ip": "192.0.2.7", "x-forwarded-for": "203.0.113.9" } }))).toBe("192.0.2.7");
  });
});

describe("limitAi", () => {
  beforeEach(() => resetRateLimits());

  it("returns a friendly 429 with Retry-After once a user is over the route limit", async () => {
    const req = new Request("http://x/api/scan", { method: "POST" });
    for (let i = 0; i < AI_LIMITS.scan.limit; i++) expect(limitAi(req, "user-1", "scan")).toBeNull();
    const res = limitAi(req, "user-1", "scan")!;
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.code).toBe("rate_limited");
    expect(body.error).toMatch(/try again/);
    // Another user, and another AI route for the same user, are unaffected.
    expect(limitAi(req, "user-2", "scan")).toBeNull();
    expect(limitAi(req, "user-1", "planRead")).toBeNull();
  });

  it("falls back to the caller IP when there is no user id", () => {
    const a = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.1" } });
    const b = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.2" } });
    for (let i = 0; i < AI_LIMITS.photoSummary.limit; i++) limitAi(a, null, "photoSummary");
    expect(limitAi(a, null, "photoSummary")?.status).toBe(429);
    expect(limitAi(b, null, "photoSummary")).toBeNull();
  });
});

describe("AI routes are rate limited", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("/api/plan/read answers 429 before calling the model", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { POST } = await import("@/app/api/plan/read/route");
    const req = () => new Request("http://x/api/plan/read", { method: "POST", headers: { "x-forwarded-for": "192.0.2.77" }, body: "{}" });
    for (let i = 0; i < AI_LIMITS.planRead.limit; i++) expect((await POST(req())).status).toBe(501);
    expect((await POST(req())).status).toBe(429);
  });
});

describe("durableRateLimit (shared store)", () => {
  beforeEach(() => resetRateLimits());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks rate_limit_hit with the service key, in whole seconds", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://sb.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    const f = vi.fn(async () => Response.json({ ok: false, hits: 4, limit: 3, remaining: 0, retry_after: 42 }));
    vi.stubGlobal("fetch", f);
    const r = await durableRateLimit("k:1", { limit: 3, windowMs: 90_500 });
    expect(r).toEqual({ ok: false, limit: 3, remaining: 0, retryAfter: 42 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sb.test/rest/v1/rpc/rate_limit_hit");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer svc");
    expect(JSON.parse(String(init.body))).toEqual({ p_key: "k:1", p_window_seconds: 91, p_max: 3 });
    const res = tooManyRequests(r, "Slow down.");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("counts in memory without a service key, or when the store fails", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const rule = { limit: 2, windowMs: 60_000 };
    expect((await durableRateLimit("m", rule)).ok).toBe(true);
    expect((await durableRateLimit("m", rule)).ok).toBe(true);
    expect((await durableRateLimit("m", rule)).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://sb.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await durableRateLimit("n", rule)).ok).toBe(true);
    expect((await durableRateLimit("n", rule)).ok).toBe(true);
    expect((await durableRateLimit("n", rule)).ok).toBe(false);
  });
});

describe("AI routes need a configured model", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("answer 501 'AI model not configured' when ANTHROPIC_MODEL is unset, without calling the AI service", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const path of ["scan", "plan/read", "photos/describe", "photos/summary"]) {
      vi.resetModules();
      resetRateLimits();
      const { POST } = await import(`@/app/api/${path}/route`);
      const res: Response = await POST(new Request(`http://x/api/${path}`, { method: "POST", headers: { "x-forwarded-for": "192.0.2.9" }, body: "{}" }));
      expect(res.status, path).toBe(501);
      expect(await res.json(), path).toEqual({ error: "AI model not configured", code: "ai_model_not_configured" });
    }
    expect(f).not.toHaveBeenCalled();
  });
});
