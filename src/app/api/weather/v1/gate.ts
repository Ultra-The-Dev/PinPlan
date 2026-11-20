// Who may use the daily-log weather proxy (server-only).
//
// Without OPEN_METEO_API_KEY the proxy forwards to Open-Meteo's free API: nothing is billed, and the per-IP limit in
// weatherProxy.ts (counted across server instances) is enough. With the key every request is paid for, so outsiders
// must not be able to run up the bill:
//   - the caller must be accepted by requireUser: a signed-in person (Authorization: Bearer <Supabase access token>),
//     or the access code where this server takes it. Anyone else gets 401. Same-origin headers alone are not enough:
//     outside a browser they can be forged.
//   - a caller without a user id (the access code; an open development server) must also come from this site's own
//     pages (sameOrigin) and gets a tight per-IP limit;
//   - every request is counted per IP first, then per person, then against a daily ceiling for everyone together, all
//     in the shared store (durableRateLimit), because each Workers isolate keeps its own in-memory counts.
import { requireUser } from "@/lib/server/auth";
import { clientIpKey, durableRateLimit, tooManyRequests, type RateLimitRule } from "@/lib/server/rateLimit";

const HOUR = 60 * 60_000;
/** Every keyed request, per IP (an office of several people shares one address; under weatherProxy.ts's own limit). */
export const WEATHER_IP_LIMIT: RateLimitRule = { limit: 100, windowMs: 10 * 60_000 };
/** A signed-in person: plenty for daily logs across many jobs, tight for a loop. */
export const WEATHER_USER_LIMIT: RateLimitRule = { limit: 300, windowMs: HOUR };
/** A caller without a user id (access code), per IP. A foreman opens a handful of daily logs an hour. */
export const WEATHER_PAGE_LIMIT: RateLimitRule = { limit: 40, windowMs: HOUR };
/** Every keyed request together, per day: caps what a flood can cost. */
export const WEATHER_DAILY_CAP: RateLimitRule = { limit: 5000, windowMs: 24 * HOUR };

const keyed = () => !!process.env.OPEN_METEO_API_KEY?.trim();

/** This site's host: PINPLAN_APP_URL when set, else the request's own URL (never a forwarded-host header). */
function siteHost(request: Request): string | null {
  const configured = process.env.PINPLAN_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).host;
    } catch {
      return null;
    }
  }
  try {
    return new URL(request.url).host;
  } catch {
    return null;
  }
}

/** The request came from one of this site's own pages (as the browser reports it). */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const host = siteHost(request);
  const from = request.headers.get("origin") ?? request.headers.get("referer");
  if (!from || !host) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}

const signInRequired = () => Response.json({ error: "Sign in to fetch the weather.", code: "sign_in_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });

/** null when the request may go on; otherwise the response to send instead. */
export async function weatherGate(request: Request): Promise<Response | null> {
  if (!keyed()) return null;
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response.status === 401 ? signInRequired() : auth.response;
  if (!auth.userId && !sameOrigin(request)) return signInRequired();

  const ip = clientIpKey(request);
  const perIp = await durableRateLimit(`weather:ip:${ip}`, WEATHER_IP_LIMIT);
  if (!perIp.ok) return tooManyRequests(perIp, "Too many weather requests. Try again later.");
  const own = auth.userId
    ? await durableRateLimit(`weather:user:${auth.userId}`, WEATHER_USER_LIMIT)
    : await durableRateLimit(`weather:page:${ip}`, WEATHER_PAGE_LIMIT);
  if (!own.ok) return tooManyRequests(own, "Too many weather requests. Try again shortly.");
  const all = await durableRateLimit("weather:all", WEATHER_DAILY_CAP);
  if (!all.ok) return tooManyRequests(all, "Weather lookups are paused for today. Type the weather in instead.");
  return null;
}
