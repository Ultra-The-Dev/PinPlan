// Daily weather for a job from Open-Meteo (free, no API key). Fails quietly: offline, slow (5 s), out of range or an
// error all give null and the foreman types it instead. Answers are cached in memory for the session.
// When it goes through this app's own proxy (/api/weather), a signed-in person's session token goes with it, so they
// get the per-person limit rather than the tighter per-IP one for pages without a session (api/weather/v1/gate.ts).
import { openMeteoUrl, weatherFromOpenMeteo, type DailyWeather } from "./dailyReport";
import { weatherUrl } from "./endpoints";
import { getSupabase } from "./supabase";

const cache = new Map<string, DailyWeather | null>();
const TIMEOUT_MS = 5000;

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** A path on this site (not `//host/...`): the only place the session token may be sent. */
export function isOwnPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/** The signed-in person's Supabase access token, or null (signed out, no cloud, or the lookup failed). */
async function sessionToken(): Promise<string | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Request headers for the weather URL: the session token only for this app's own proxy, never for another host. */
export async function weatherHeaders(url: string, token: () => Promise<string | null> = sessionToken): Promise<Record<string, string>> {
  if (!isOwnPath(url)) return {};
  const t = await token().catch(() => null);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** The weather on `date` (YYYY-MM-DD) at lat/lng, or null. `today` is the device's local day. `token` is for tests. */
export async function fetchDailyWeather(
  lat: number,
  lng: number,
  date: string,
  today: string,
  token: () => Promise<string | null> = sessionToken,
): Promise<DailyWeather | null> {
  const raw = openMeteoUrl(lat, lng, date, today);
  if (!raw || !isOnline()) return null;
  // NEXT_PUBLIC_WEATHER_URL can send it through this app's keyed proxy or another host (src/lib/endpoints.ts).
  const url = weatherUrl(raw);
  // Past days don't change; today and future days are a forecast that can, so they're keyed by today as well.
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${date},${date >= today ? today : ""}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers = await weatherHeaders(url, token);
    const r = await fetch(url, { signal: ctl.signal, credentials: "omit", cache: "no-store", headers });
    if (!r.ok) return null;
    const w = weatherFromOpenMeteo(await r.json(), date, today);
    cache.set(key, w);
    return w;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
