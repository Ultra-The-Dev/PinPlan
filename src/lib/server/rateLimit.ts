// In-memory sliding-window rate limiter for API routes (server-only).
//
// Caveat: the window lives in this server instance's memory. On Vercel each function instance (and each region)
// keeps its own counts and loses them on a cold start, so the effective limit is "per instance", not global.
// That is enough to stop a runaway client loop or a casual abuser from burning AI credit; for a hard global cap,
// back this with a shared store (Upstash Redis / Vercel KV / a Supabase table) behind the same `rateLimit()` API.

export interface RateLimitRule {
  /** Requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the next request would be allowed (0 when ok). */
  retryAfter: number;
}

type Hits = number[];
const buckets = new Map<string, Hits>();
const MAX_KEYS = 10_000;
let lastSweep = 0;

/** Drop keys whose newest hit is older than the longest window seen, so memory stays bounded. */
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000 && buckets.size < MAX_KEYS) return;
  lastSweep = now;
  for (const [k, hits] of buckets) if (!hits.length || now - hits[hits.length - 1] > windowMs) buckets.delete(k);
  // Still too many (e.g. a flood of distinct IPs): forget the oldest keys first (Map keeps insertion order).
  while (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value as string);
}

/** Count one request for `key`; returns whether it is allowed. Rejected requests are not counted. */
export function rateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  sweep(now, rule.windowMs);
  const from = now - rule.windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > from);
  if (hits.length >= rule.limit) {
    buckets.set(key, hits);
    return { ok: false, limit: rule.limit, remaining: 0, retryAfter: Math.max(1, Math.ceil((hits[0] + rule.windowMs - now) / 1000)) };
  }
  hits.push(now);
  buckets.delete(key); // re-insert so the Map stays ordered by last use
  buckets.set(key, hits);
  return { ok: true, limit: rule.limit, remaining: rule.limit - hits.length, retryAfter: 0 };
}

/** Test helper: forget every count. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}

/** Best-effort client IP: Vercel sets x-forwarded-for (client first) and x-real-ip. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Limits for the AI routes. Each call costs real money and takes seconds, so these are generous for a person, tight for a loop. */
export const AI_LIMITS = {
  scan: { limit: 30, windowMs: 10 * 60_000 },
  planRead: { limit: 40, windowMs: 10 * 60_000 },
  photoDescribe: { limit: 150, windowMs: 10 * 60_000 },
  photoSummary: { limit: 20, windowMs: 10 * 60_000 },
} satisfies Record<string, RateLimitRule>;

/** Per-day ceiling shared by every AI route for one caller. */
const AI_DAILY: RateLimitRule = { limit: 1500, windowMs: 24 * 60 * 60_000 };

const minutes = (s: number) => (s < 90 ? `${s} seconds` : `${Math.ceil(s / 60)} minutes`);

/**
 * Rate-limit an AI request per signed-in user (or per IP when the caller has no user id, e.g. access-code mode).
 * Returns a friendly 429 response when the caller is over the limit, otherwise null.
 */
export function limitAi(request: Request, userId: string | null, route: keyof typeof AI_LIMITS): Response | null {
  const who = userId ? `u:${userId}` : `ip:${clientIp(request)}`;
  const daily = rateLimit(`ai-day:${who}`, AI_DAILY);
  const r = daily.ok ? rateLimit(`ai:${route}:${who}`, AI_LIMITS[route]) : daily;
  if (r.ok) return null;
  const message = daily.ok
    ? `You're sending AI requests faster than we can handle. Please wait ${minutes(r.retryAfter)} and try again.`
    : `You've reached today's AI limit. It resets within ${minutes(r.retryAfter)}. Contact support if you need more.`;
  return Response.json(
    { error: message, code: "rate_limited", retryAfter: r.retryAfter },
    { status: 429, headers: { "Retry-After": String(r.retryAfter), "X-RateLimit-Limit": String(r.limit), "X-RateLimit-Remaining": "0", "Cache-Control": "no-store" } },
  );
}
