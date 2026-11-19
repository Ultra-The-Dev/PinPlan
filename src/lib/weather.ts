// Daily weather for a job from Open-Meteo (free, no API key). Fails quietly: offline, slow (5 s), out of range or an
// error all give null and the foreman types it instead. Answers are cached in memory for the session.
import { openMeteoUrl, weatherFromOpenMeteo, type DailyWeather } from "./dailyReport";
import { weatherUrl } from "./endpoints";

const cache = new Map<string, DailyWeather | null>();
const TIMEOUT_MS = 5000;

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** The weather on `date` (YYYY-MM-DD) at lat/lng, or null. `today` is the device's local day. */
export async function fetchDailyWeather(lat: number, lng: number, date: string, today: string): Promise<DailyWeather | null> {
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
    const r = await fetch(url, { signal: ctl.signal, credentials: "omit", cache: "no-store" });
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
