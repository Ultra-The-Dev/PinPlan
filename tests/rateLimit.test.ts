process.env.AI_ENABLED = "1"; // these tests exercise the AI routes, which are off unless enabled
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_LIMITS, clientIp, limitAi, rateLimit, resetRateLimits } from "@/lib/server/rateLimit";

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
