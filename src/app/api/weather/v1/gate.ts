// Who may use the daily-log weather proxy (server-only).
//
// Without OPEN_METEO_API_KEY the proxy forwards to Open-Meteo's free API: nothing is billed, and the per-IP limit in
// weatherProxy.ts is enough. With the key every request is paid for, so outsiders must not be able to run up the bill:
//   - a signed-in person (Authorization: Bearer <Supabase access token>) gets a per-person limit;
//   - otherwise only this site's own pages get through: the browser marks their requests same-origin (Sec-Fetch-Site,
//     or an Origin / Referer on this host). Those headers can be faked outside a browser, so these requests also get a
//     much tighter per-IP limit and a daily ceiling for all of them together, both counted across server instances;
//   - anyone else gets 401.
import { requireUser } from "@/lib/server/auth";
import { clientIp, durableRateLimit, tooManyRequests, type RateLimitRule } from "@/lib/server/rateLimit";

const HOUR = 60 * 60_000;
/** A signed-in person: plenty for daily logs across many jobs, tight for a loop. */
export const WEATHER_USER_LIMIT: RateLimitRule = { limit: 300, windowMs: HOUR };
/** This site's pages without a session, per IP. A foreman opens a handful of daily logs an hour. */
export const WEATHER_PAGE_LIMIT: RateLimitRule = { limit: 40, windowMs: HOUR };
/** Every request without a session together, per day: caps what a forged-header flood from many IPs can cost. */
export const WEATHER_PAGE_DAILY_CAP: RateLimitRule = { limit: 5000, windowMs: 24 * HOUR };

const keyed = () => !!process.env.OPEN_METEO_API_KEY?.trim();

/** The request came from one of this site's own pages (as the browser reports it). */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const from = request.headers.get("origin") ?? request.headers.get("referer");
  if (!from || !host) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}

/** null when the request may go on; otherwise the response to send instead. */
export async function weatherGate(request: Request): Promise<Response | null> {
  if (!keyed()) return null;
  if (request.headers.get("authorization")) {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;
    if (auth.userId) {
      const r = await durableRateLimit(`weather:user:${auth.userId}`, WEATHER_USER_LIMIT);
      return r.ok ? null : tooManyRequests(r, "Too many weather requests. Try again shortly.");
    }
  }
  if (!sameOrigin(request)) return Response.json({ error: "Sign in to fetch the weather.", code: "sign_in_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const ip = await durableRateLimit(`weather:page:${clientIp(request)}`, WEATHER_PAGE_LIMIT);
  if (!ip.ok) return tooManyRequests(ip, "Too many weather requests. Try again later.");
  const all = await durableRateLimit("weather:page:all", WEATHER_PAGE_DAILY_CAP);
  if (!all.ok) return tooManyRequests(all, "Weather lookups are paused for today. Type the weather in instead.");
  return null;
}
