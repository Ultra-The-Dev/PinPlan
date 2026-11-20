// Daily-log weather through this server (server-only): set NEXT_PUBLIC_WEATHER_URL=/api/weather and OPEN_METEO_API_KEY
// so the key for Open-Meteo's commercial API stays on the server. Only the daily fields the app asks for are
// forwarded; anything else in the query is dropped. See docs/offline.md.
import { clientIp, rateLimit } from "./rateLimit";

export type WeatherKind = "forecast" | "archive";

const FREE: Record<WeatherKind, string> = { forecast: "https://api.open-meteo.com/v1/forecast", archive: "https://archive-api.open-meteo.com/v1/archive" };
const PAID: Record<WeatherKind, string> = { forecast: "https://customer-api.open-meteo.com/v1/forecast", archive: "https://customer-archive-api.open-meteo.com/v1/archive" };
const PARAMS = ["latitude", "longitude", "daily", "temperature_unit", "wind_speed_unit", "precipitation_unit", "timezone", "start_date", "end_date"];
const LIMIT = { limit: 120, windowMs: 10 * 60_000 };

/** The upstream Open-Meteo URL for a proxied request, or null when the query isn't a daily-weather lookup. */
export function upstreamWeatherUrl(kind: WeatherKind, search: URLSearchParams, apiKey: string | undefined): string | null {
  const lat = Number(search.get("latitude"));
  const lng = Number(search.get("longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(search.get("start_date") ?? "") || !date.test(search.get("end_date") ?? "")) return null;
  const q = new URLSearchParams();
  for (const k of PARAMS) {
    const v = search.get(k);
    if (v != null) q.set(k, v.slice(0, 200));
  }
  const key = apiKey?.trim();
  if (key) q.set("apikey", key);
  return `${(key ? PAID : FREE)[kind]}?${q}`;
}

export async function proxyWeather(request: Request, kind: WeatherKind): Promise<Response> {
  const r = rateLimit(`weather:${clientIp(request)}`, LIMIT);
  if (!r.ok) return Response.json({ error: "Too many weather requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } });
  const url = upstreamWeatherUrl(kind, new URL(request.url).searchParams, process.env.OPEN_METEO_API_KEY);
  if (!url) return Response.json({ error: "Bad weather request." }, { status: 400 });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    const body = await res.text();
    // Past days never change; forecasts do. Either way the browser keeps its own copy for the session.
    const cache = kind === "archive" ? "public, max-age=86400" : "public, max-age=1800";
    return new Response(body, { status: res.status, headers: { "content-type": "application/json", "cache-control": res.ok ? cache : "no-store" } });
  } catch {
    return Response.json({ error: "Weather service unavailable." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
