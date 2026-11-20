// The weather proxy with a paid Open-Meteo key: only signed-in people, within limits counted across server instances.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as archive } from "@/app/api/weather/v1/archive/route";
import { GET as forecast } from "@/app/api/weather/v1/forecast/route";
import { WEATHER_IP_LIMIT, WEATHER_PAGE_LIMIT, WEATHER_USER_LIMIT, sameOrigin } from "@/app/api/weather/v1/gate";
import { resetRateLimits } from "@/lib/server/rateLimit";

const Q = "latitude=40.7&longitude=-74&daily=temperature_2m_max&start_date=2026-11-19&end_date=2026-11-19";
const req = (headers: Record<string, string> = {}, path = "forecast") => new Request(`https://app.example.com/api/weather/v1/${path}?${Q}`, { headers: { host: "app.example.com", ...headers } });
const page = { "sec-fetch-site": "same-origin", "cf-connecting-ip": "203.0.113.7" };
/** "Bearer good" is user u1, "Bearer good-<n>" user n; anything else is refused. */
const user = (n = "", ip = "203.0.113.7") => ({ authorization: `Bearer good${n ? `-${n}` : ""}`, "cf-connecting-ip": ip });

let upstream: string[];
let rpc: string[];
beforeEach(() => {
  resetRateLimits();
  upstream = [];
  rpc = [];
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("PINPLAN_APP_URL", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const u = String(input);
      if (u.includes("/auth/v1/user")) {
        const token = new Headers(init?.headers).get("authorization") ?? "";
        const m = /^Bearer good(?:-(\w+))?$/.exec(token);
        return m ? Response.json({ id: m[1] ?? "u1" }) : new Response("{}", { status: 401 });
      }
      if (u.endsWith("/rest/v1/rpc/rate_limit_hit")) {
        rpc.push(JSON.parse(String(init?.body)).p_key);
        return Response.json({ ok: true, remaining: 1, retry_after: 0 });
      }
      upstream.push(u);
      return Response.json({ daily: {} });
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("weather proxy without a paid key", () => {
  it("stays open (the free API costs nothing)", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "");
    const r = await forecast(req());
    expect(r.status).toBe(200);
    expect(upstream[0]).toMatch(/^https:\/\/api\.open-meteo\.com\//);
  });

  it("counts per IP in the shared store when there is one", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    expect((await forecast(req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" }))).status).toBe(200);
    expect(rpc).toEqual(["weather:203.0.113.7"]);
  });
});

describe("weather proxy with a paid key", () => {
  beforeEach(() => {
    vi.stubEnv("OPEN_METEO_API_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  it("refuses everyone without a session, even this site's own pages (their headers can be forged)", async () => {
    const outsiders: Record<string, string>[] = [{}, page, { "sec-fetch-site": "cross-site" }, { origin: "https://app.example.com" }, { origin: "https://evil.example" }, { referer: "https://evil.example/x" }];
    for (const h of outsiders) {
      const r = await forecast(req(h));
      expect(r.status).toBe(401);
      expect((await r.json()).code).toBe("sign_in_required");
    }
    expect(upstream).toEqual([]);
  });

  it("refuses a bad session", async () => {
    const r = await archive(req({ authorization: "Bearer stale" }, "archive"));
    expect(r.status).toBe(401);
    expect(upstream).toEqual([]);
  });

  it("serves a signed-in person through the paid host", async () => {
    const r = await archive(req(user(), "archive"));
    expect(r.status).toBe(200);
    expect(upstream[0]).toMatch(/^https:\/\/customer-archive-api\.open-meteo\.com\/.*apikey=test-key/);
  });

  it("limits each person", async () => {
    for (let i = 0; i < WEATHER_USER_LIMIT.limit; i++) expect((await forecast(req(user("a", `198.51.100.${i % 200}`)))).status).toBe(200);
    const r = await forecast(req(user("a", "198.51.100.250")));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBeTruthy();
    expect((await forecast(req(user("b", "198.51.100.250")))).status).toBe(200);
  });

  it("counts per IP before the person, so many accounts from one address can't add up", async () => {
    for (let i = 0; i < WEATHER_IP_LIMIT.limit; i++) expect((await forecast(req(user(`n${i}`, "203.0.113.50")))).status).toBe(200);
    expect((await forecast(req(user("fresh", "203.0.113.50")))).status).toBe(429);
    // A forged X-Forwarded-For doesn't move the caller to a fresh bucket on Cloudflare.
    expect((await forecast(req({ ...user("fresh2", "203.0.113.50"), "x-forwarded-for": "10.1.2.3" }))).status).toBe(429);
    expect((await forecast(req(user("fresh3", "203.0.113.51")))).status).toBe(200);
  });

  it("lets the access code through only from this site's pages, on a tight per-IP limit", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "s3cret");
    const code = { "x-pinplan-access": "s3cret" };
    expect((await forecast(req(code))).status).toBe(401);
    for (let i = 0; i < WEATHER_PAGE_LIMIT.limit; i++) expect((await forecast(req({ ...code, ...page }))).status).toBe(200);
    expect((await forecast(req({ ...code, ...page }))).status).toBe(429);
    expect((await forecast(req({ ...code, ...page, "cf-connecting-ip": "198.51.100.2" }))).status).toBe(200);
  });
});

describe("sameOrigin", () => {
  it("trusts the browser's Sec-Fetch-Site, else Origin or Referer on this host", () => {
    expect(sameOrigin(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(sameOrigin(req({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(sameOrigin(req({ origin: "https://app.example.com" }))).toBe(true);
    expect(sameOrigin(req({ referer: "https://app.example.com/project?id=1" }))).toBe(true);
    expect(sameOrigin(req({ referer: "not a url" }))).toBe(false);
    expect(sameOrigin(req())).toBe(false);
  });

  it("never takes the host from X-Forwarded-Host, and uses PINPLAN_APP_URL when set", () => {
    expect(sameOrigin(req({ origin: "https://evil.example", "x-forwarded-host": "evil.example" }))).toBe(false);
    vi.stubEnv("PINPLAN_APP_URL", "https://pinplan.example.com");
    expect(sameOrigin(req({ origin: "https://pinplan.example.com" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://app.example.com" }))).toBe(false);
  });
});
