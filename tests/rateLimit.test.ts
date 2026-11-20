process.env.AI_ENABLED = "1"; // these tests exercise the AI routes, which are off unless enabled
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiEnabledOnServer } from "@/lib/features";
import { AI_LIMITS, clientIp, clientIpKey, durableLimiterAvailable, durableRateLimit, ipKey, limitAi, rateLimit, resetRateLimits, tooManyRequests } from "@/lib/server/rateLimit";

/**
 * A stand-in for the shared store: answers rate_limit_hit like the SQL function (fixed window, counted per key) and
 * records every other call, so a test can tell the model was never asked.
 */
function fakeStore() {
  const counts = new Map<string, number>();
  const other: string[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/rest/v1/rpc/rate_limit_hit")) {
      const { p_key, p_max, p_window_seconds } = JSON.parse(String(init?.body)) as { p_key: string; p_max: number; p_window_seconds: number };
      const n = (counts.get(p_key) ?? 0) + 1;
      counts.set(p_key, n);
      return Response.json({ ok: n <= p_max, hits: n, limit: p_max, remaining: Math.max(0, p_max - n), retry_after: n <= p_max ? 0 : p_window_seconds });
    }
    other.push(url);
    return new Response("{}", { status: 404 });
  });
  return { fetch, counts, other };
}

const withStore = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://sb.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
  vi.stubEnv("PINPLAN_ACCESS_CODE", "");
  const store = fakeStore();
  vi.stubGlobal("fetch", store.fetch);
  return store;
};

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
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://x", { headers });
  beforeEach(() => {
    vi.stubEnv("PINPLAN_TRUST_XFF", "");
    vi.stubEnv("VERCEL_ENV", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keys a forged X-Forwarded-For together with cf-connecting-ip on cf-connecting-ip", () => {
    const forged = (xff: string) => req({ "cf-connecting-ip": "192.0.2.7", "x-forwarded-for": xff, "x-real-ip": xff });
    expect(clientIp(forged("203.0.113.9"))).toBe("192.0.2.7");
    // A caller rotating X-Forwarded-For still lands in one bucket.
    expect(new Set(["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((x) => clientIpKey(forged(x))))).toEqual(new Set(["192.0.2.7"]));
    // Behind the owner's own proxy (PINPLAN_TRUST_XFF=1) cf-connecting-ip is the caller's own header: never read there.
    vi.stubEnv("PINPLAN_TRUST_XFF", "1");
    expect(clientIp(req({ "cf-connecting-ip": "192.0.2.7", "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "cf-connecting-ip": "192.0.2.7" }))).toBe("unknown");
  });

  it("ignores X-Forwarded-For and X-Real-IP unless the host says they are trustworthy", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("unknown");
    expect(clientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("unknown");
    expect(clientIp(req({}))).toBe("unknown");
    vi.stubEnv("PINPLAN_TRUST_XFF", "1");
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
  });

  it("on Vercel reads Vercel's own headers before a cf-connecting-ip the caller could have sent", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(clientIp(req({ "cf-connecting-ip": "192.0.2.7", "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(req({ "cf-connecting-ip": "192.0.2.7" }))).toBe("unknown");
  });

  it("treats junk as no address, so it can't mint fresh keys", () => {
    expect(clientIp(req({ "cf-connecting-ip": "not an ip <script>" }))).toBe("unknown");
    vi.stubEnv("PINPLAN_TRUST_XFF", "1");
    expect(clientIp(req({ "x-forwarded-for": "evil-key-123" }))).toBe("unknown");
  });
});

describe("ipKey", () => {
  it("keeps IPv4 and maps IPv4-mapped IPv6 to it", () => {
    expect(ipKey("203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("0:0:0:0:0:ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  it("keys IPv6 on its /64, however it is written", () => {
    const a = ipKey("2001:db8:85a3:12::1");
    expect(a).toBe("2001:db8:85a3:12::/64");
    expect(ipKey("2001:0db8:85a3:0012:ffff:ffff:ffff:fffe")).toBe(a);
    expect(ipKey("2001:DB8:85A3:12:abcd::")).toBe(a);
    expect(ipKey("[2001:db8:85a3:12::99]")).toBe(a);
    expect(ipKey("2001:db8:85a3:13::1")).not.toBe(a);
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
  });

  it("is what clientIpKey uses", () => {
    const r = (ip: string) => new Request("http://x", { headers: { "cf-connecting-ip": ip } });
    expect(clientIpKey(r("2001:db8:1:2:aaaa::1"))).toBe(clientIpKey(r("2001:db8:1:2:bbbb::2")));
    expect(clientIp(r("2001:db8:1:2:aaaa::1"))).toBe("2001:db8:1:2:aaaa::1");
  });
});

describe("limitAi (shared store)", () => {
  beforeEach(() => resetRateLimits());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("counts in the shared store and returns a friendly 429 with Retry-After once a user is over the route limit", async () => {
    const store = withStore();
    const req = new Request("http://x/api/scan", { method: "POST" });
    for (let i = 0; i < AI_LIMITS.scan.limit; i++) expect(await limitAi(req, "user-1", "scan")).toBeNull();
    const res = (await limitAi(req, "user-1", "scan"))!;
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.code).toBe("rate_limited");
    expect(body.error).toMatch(/try again/);
    expect(store.counts.get("ai:scan:u:user-1")).toBe(AI_LIMITS.scan.limit + 1);
    expect(store.counts.get("ai-day:u:user-1")).toBe(AI_LIMITS.scan.limit + 1);
    // Another user, and another AI route for the same user, are unaffected.
    expect(await limitAi(req, "user-2", "scan")).toBeNull();
    expect(await limitAi(req, "user-1", "planRead")).toBeNull();
  });

  it("falls back to the caller IP (cf-connecting-ip, not a forged X-Forwarded-For) when there is no user id", async () => {
    withStore();
    const a = (xff: string) => new Request("http://x", { headers: { "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": xff } });
    const b = new Request("http://x", { headers: { "cf-connecting-ip": "203.0.113.2" } });
    for (let i = 0; i < AI_LIMITS.photoSummary.limit; i++) await limitAi(a(`10.0.0.${i}`), null, "photoSummary");
    expect((await limitAi(a("10.9.9.9"), null, "photoSummary"))?.status).toBe(429);
    expect(await limitAi(b, null, "photoSummary")).toBeNull();
  });
});

describe("AI routes need the shared rate limiter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("refuse to run without the service key, even with AI switched on", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(durableLimiterAvailable()).toBe(false);
    expect(aiEnabledOnServer()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    vi.resetModules();
    const { POST } = await import("@/app/api/plan/read/route");
    const res = await POST(new Request("http://x/api/plan/read", { method: "POST", body: "{}" }));
    expect(res.status).toBe(404);
    withStore();
    expect(durableLimiterAvailable()).toBe(true);
    expect(aiEnabledOnServer()).toBe(true);
  });

  it("/api/plan/read answers 429 before calling the model", async () => {
    const store = withStore();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { POST } = await import("@/app/api/plan/read/route");
    const req = () => new Request("http://x/api/plan/read", { method: "POST", headers: { "cf-connecting-ip": "192.0.2.77" }, body: "{}" });
    for (let i = 0; i < AI_LIMITS.planRead.limit; i++) expect((await POST(req())).status).toBe(501);
    expect((await POST(req())).status).toBe(429);
    expect(store.other).toEqual([]);
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
    const store = withStore();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    for (const path of ["scan", "plan/read", "photos/describe", "photos/summary"]) {
      vi.resetModules();
      resetRateLimits();
      const { POST } = await import(`@/app/api/${path}/route`);
      const res: Response = await POST(new Request(`http://x/api/${path}`, { method: "POST", headers: { "cf-connecting-ip": "192.0.2.9" }, body: "{}" }));
      expect(res.status, path).toBe(501);
      expect(await res.json(), path).toEqual({ error: "AI model not configured", code: "ai_model_not_configured" });
    }
    expect(store.other).toEqual([]);
  });
});
