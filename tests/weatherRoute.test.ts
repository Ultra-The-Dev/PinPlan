// The weather proxy with a paid Open-Meteo key: only signed-in people and this site's own pages, within limits.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as archive } from "@/app/api/weather/v1/archive/route";
import { GET as forecast } from "@/app/api/weather/v1/forecast/route";
import { WEATHER_PAGE_LIMIT, sameOrigin } from "@/app/api/weather/v1/gate";
import { resetRateLimits } from "@/lib/server/rateLimit";

const Q = "latitude=40.7&longitude=-74&daily=temperature_2m_max&start_date=2026-11-19&end_date=2026-11-19";
const req = (headers: Record<string, string> = {}, path = "forecast") => new Request(`https://app.example.com/api/weather/v1/${path}?${Q}`, { headers: { host: "app.example.com", ...headers } });
const page = { "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.7" };

let upstream: string[];
beforeEach(() => {
  resetRateLimits();
  upstream = [];
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const u = String(input);
      if (u.includes("/auth/v1/user")) {
        const token = new Headers(init?.headers).get("authorization");
        return token === "Bearer good" ? Response.json({ id: "u1" }) : new Response("{}", { status: 401 });
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
});

describe("weather proxy with a paid key", () => {
  beforeEach(() => {
    vi.stubEnv("OPEN_METEO_API_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  it("refuses outsiders: no session and not from this site", async () => {
    const outsiders: Record<string, string>[] = [{}, { "sec-fetch-site": "cross-site" }, { origin: "https://evil.example" }, { referer: "https://evil.example/x" }];
    for (const h of outsiders) {
      const r = await forecast(req(h));
      expect(r.status).toBe(401);
    }
    expect(upstream).toEqual([]);
  });

  it("refuses a bad session", async () => {
    const r = await archive(req({ authorization: "Bearer stale" }, "archive"));
    expect(r.status).toBe(401);
    expect(upstream).toEqual([]);
  });

  it("serves a signed-in person through the paid host", async () => {
    const r = await archive(req({ authorization: "Bearer good" }, "archive"));
    expect(r.status).toBe(200);
    expect(upstream[0]).toMatch(/^https:\/\/customer-archive-api\.open-meteo\.com\/.*apikey=test-key/);
  });

  it("serves this site's pages on a tight per-IP limit", async () => {
    for (let i = 0; i < WEATHER_PAGE_LIMIT.limit; i++) expect((await forecast(req(page))).status).toBe(200);
    const r = await forecast(req(page));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBeTruthy();
    // Another address still gets through.
    expect((await forecast(req({ ...page, "x-forwarded-for": "198.51.100.2" }))).status).toBe(200);
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
});
