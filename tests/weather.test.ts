// The daily-log weather fetch sends the signed-in person's session token to this app's own proxy (so the proxy gives
// them the per-person limit), and never to another host.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDailyWeather, isOwnPath, weatherHeaders } from "@/lib/weather";

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures/open-meteo-daily.json"), "utf8"));

function stubFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}
const auth = (init: RequestInit) => new Headers(init.headers).get("authorization");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("weather session token", () => {
  it("only treats paths on this site as our own", () => {
    expect(isOwnPath("/api/weather/v1/forecast?x=1")).toBe(true);
    expect(isOwnPath("//evil.example/v1/forecast")).toBe(false);
    expect(isOwnPath("https://api.open-meteo.com/v1/forecast")).toBe(false);
  });

  it("adds the bearer token for the own proxy only", async () => {
    const token = async () => "tok-123";
    expect(await weatherHeaders("/api/weather/v1/forecast", token)).toEqual({ Authorization: "Bearer tok-123" });
    expect(await weatherHeaders("https://api.open-meteo.com/v1/forecast", token)).toEqual({});
    expect(await weatherHeaders("/api/weather/v1/forecast", async () => null)).toEqual({});
    expect(await weatherHeaders("/api/weather/v1/forecast", async () => Promise.reject(new Error("no session")))).toEqual({});
  });

  it("adds the team access code for the own proxy only (access-code servers with a paid weather key)", async () => {
    const none = async () => null;
    expect(await weatherHeaders("/api/weather/v1/forecast", none, () => "code-1")).toEqual({ "x-pinplan-access": "code-1" });
    expect(await weatherHeaders("https://api.open-meteo.com/v1/forecast", none, () => "code-1")).toEqual({});
  });

  it("sends Authorization to /api/weather when signed in", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEATHER_URL", "/api/weather");
    const calls = stubFetch();
    const w = await fetchDailyWeather(40.71, -73.99, "2026-11-18", "2026-11-19", async () => "tok-abc");
    expect(w?.summary).toBe("Rain");
    expect(calls).toHaveLength(1);
    expect(calls[0].url.startsWith("/api/weather/v1/forecast?")).toBe(true);
    expect(auth(calls[0].init)).toBe("Bearer tok-abc");
    expect(calls[0].init.credentials).toBe("omit");
  });

  it("sends no Authorization when signed out", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEATHER_URL", "/api/weather");
    const calls = stubFetch();
    await fetchDailyWeather(41.71, -73.99, "2026-11-18", "2026-11-19", async () => null);
    expect(calls).toHaveLength(1);
    expect(auth(calls[0].init)).toBeNull();
  });

  it("never sends the token straight to Open-Meteo or another host", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEATHER_URL", "");
    const calls = stubFetch();
    await fetchDailyWeather(42.71, -73.99, "2026-11-18", "2026-11-19", async () => "tok-abc");
    expect(calls[0].url.startsWith("https://api.open-meteo.com/")).toBe(true);
    expect(auth(calls[0].init)).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_WEATHER_URL", "https://weather.example.com");
    await fetchDailyWeather(43.71, -73.99, "2026-11-18", "2026-11-19", async () => "tok-abc");
    expect(calls[1].url.startsWith("https://weather.example.com/")).toBe(true);
    expect(auth(calls[1].init)).toBeNull();
  });
});
