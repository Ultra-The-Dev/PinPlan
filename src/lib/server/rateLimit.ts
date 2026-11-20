// Rate limiting for API routes (server-only).
//
// - rateLimit(): in-memory sliding window. The window lives in this server instance's memory. On Cloudflare Workers
//   every isolate (and every data centre) keeps its own counts and loses them whenever the isolate is recycled, and a
//   busy site runs many isolates at once, so a per-instance limit is NOT enough on its own there: a caller spreading
//   requests over isolates gets many times the limit. Use it only as a fallback, or as a cheap "stop a runaway loop"
//   check in front of a durable limit.
// - durableRateLimit(): one shared count for every instance, kept in Supabase (public.rate_limits, counted by the
//   rate_limit_hit() function, which only the service role may call). Used wherever abuse costs money or sends mail:
//   sign-up with an invite code, the Billdu routes, the weather proxy, the welcome email and the AI routes. Without
//   SUPABASE_SERVICE_ROLE_KEY (or if the database can't be reached) it falls back to the in-memory limiter, so a
//   database hiccup never blocks real users. The AI routes refuse to run at all without the shared store
//   (durableLimiterAvailable(), checked by aiEnabledOnServer()).
// - clientIp() / clientIpKey(): the caller's address. Only headers the hosting platform sets are trusted (see below).
import { serviceConfigured, serviceFetch } from "./supabaseAdmin";

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

/**
 * Count one request for `key` in the shared store (fixed window of rule.windowMs, rounded up to whole seconds).
 * Falls back to the in-memory limiter when there's no service key or the database call fails.
 */
export async function durableRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  if (!serviceConfigured()) return rateLimit(key, rule);
  try {
    const r = await serviceFetch("/rest/v1/rpc/rate_limit_hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key.slice(0, 200), p_window_seconds: Math.max(1, Math.ceil(rule.windowMs / 1000)), p_max: rule.limit }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!r.ok) throw new Error(`rate_limit_hit ${r.status}`);
    const j = (await r.json()) as { ok?: boolean; remaining?: number; retry_after?: number };
    if (typeof j?.ok !== "boolean") throw new Error("rate_limit_hit: unexpected answer");
    return { ok: j.ok, limit: rule.limit, remaining: Math.max(0, Number(j.remaining) || 0), retryAfter: j.ok ? 0 : Math.max(1, Number(j.retry_after) || 1) };
  } catch (e) {
    // Missing migration, network trouble or a timeout: keep counting here rather than refusing everyone.
    console.warn("[rate limit] shared store unavailable, counting in memory:", (e as Error).message);
    return rateLimit(key, rule);
  }
}

/** A 429 with Retry-After for a refused request. */
export function tooManyRequests(r: RateLimitResult, message: string): Response {
  return Response.json(
    { error: message, code: "rate_limited", retryAfter: r.retryAfter },
    { status: 429, headers: { "Retry-After": String(r.retryAfter), "X-RateLimit-Limit": String(r.limit), "X-RateLimit-Remaining": "0", "Cache-Control": "no-store" } },
  );
}

/** "45 seconds" / "3 minutes": for messages. */
export const waitText = (s: number) => (s < 90 ? `${s} seconds` : `${Math.ceil(s / 60)} minutes`);

/** Where X-Forwarded-For / X-Real-IP are set by the platform (Vercel's edge overwrites them) or by a proxy the owner runs. */
function trustForwardedFor(): boolean {
  return process.env.PINPLAN_TRUST_XFF === "1" || !!process.env.VERCEL_ENV;
}

function firstForwarded(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip")?.trim() || null;
}

/** A plausible IP literal (v4 or v6); anything else counts as missing, so junk can't mint fresh keys. */
const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9A-Fa-f:.]{2,45})$/;
const plausibleIp = (v: string | null | undefined) => (v && IP_RE.test(v) ? v : null);

/**
 * The client IP, for per-IP limits and for Turnstile's remoteip. "unknown" when the platform didn't say.
 * - Cloudflare Workers: cf-connecting-ip, set by Cloudflare; a caller can't choose it, and X-Forwarded-For (which the
 *   caller can) is ignored.
 * - Vercel (VERCEL_ENV set) or behind a proxy the owner runs (PINPLAN_TRUST_XFF=1): that edge overwrites
 *   x-real-ip / x-forwarded-for. On Vercel they are read first (a cf-connecting-ip header there is the caller's own).
 * - Anything else: X-Forwarded-For is whatever the caller sent, so it is never read. Every caller then shares the
 *   "unknown" key, which is strict but can't be dodged; per-user and per-link limits still apply.
 */
export function clientIp(request: Request): string {
  if (process.env.VERCEL_ENV) {
    const v = plausibleIp(firstForwarded(request));
    if (v) return v;
  }
  const cf = plausibleIp(request.headers.get("cf-connecting-ip")?.trim());
  if (cf) return cf;
  if (trustForwardedFor()) return plausibleIp(firstForwarded(request)) ?? "unknown";
  return "unknown";
}

/**
 * The rate-limit key for an address: IPv4 as is, IPv6 on its /64 prefix (one customer line usually gets a whole /64,
 * so keying on the full address would hand each caller 2^64 fresh buckets). IPv4-mapped IPv6 counts as the IPv4.
 */
export function ipKey(ip: string): string {
  const s = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!s.includes(":")) return s || "unknown";
  const mapped = /^(?:0{1,4}:){5}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s) ?? /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapped) return mapped[1];
  let groups: string[];
  const dbl = s.indexOf("::");
  if (dbl >= 0) {
    const head = s.slice(0, dbl).split(":").filter(Boolean);
    const tail = s.slice(dbl + 2).split(":").filter(Boolean);
    // An embedded IPv4 tail takes two groups.
    const tailLen = tail.reduce((n, g) => n + (g.includes(".") ? 2 : 1), 0);
    groups = [...head, ...Array<string>(Math.max(0, 8 - head.length - tailLen)).fill("0"), ...tail];
  } else groups = s.split(":");
  const prefix = groups.slice(0, 4).map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? g.replace(/^0+(?=.)/, "") : "0"));
  while (prefix.length < 4) prefix.push("0");
  return `${prefix.join(":")}::/64`;
}

/** clientIp() as a rate-limit key (IPv6 on its /64). Use this for per-IP limits, clientIp() for Turnstile. */
export const clientIpKey = (request: Request): string => ipKey(clientIp(request));

/** Limits for the AI routes. Each call costs real money and takes seconds, so these are generous for a person, tight for a loop. */
export const AI_LIMITS = {
  scan: { limit: 30, windowMs: 10 * 60_000 },
  planRead: { limit: 40, windowMs: 10 * 60_000 },
  photoDescribe: { limit: 150, windowMs: 10 * 60_000 },
  photoSummary: { limit: 20, windowMs: 10 * 60_000 },
} satisfies Record<string, RateLimitRule>;

/** Per-day ceiling shared by every AI route for one caller. */
const AI_DAILY: RateLimitRule = { limit: 1500, windowMs: 24 * 60 * 60_000 };

const minutes = waitText;

/** The shared store can count (service key set). The AI routes refuse to run without it. */
export const durableLimiterAvailable = (): boolean => serviceConfigured();

/**
 * Rate-limit an AI request per signed-in user (or per IP when the caller has no user id, e.g. access-code mode),
 * counted in the shared store across every server instance (in memory only when the store can't be reached).
 * Returns a friendly 429 response when the caller is over the limit, otherwise null.
 */
export async function limitAi(request: Request, userId: string | null, route: keyof typeof AI_LIMITS): Promise<Response | null> {
  const who = userId ? `u:${userId}` : `ip:${clientIpKey(request)}`;
  const daily = await durableRateLimit(`ai-day:${who}`, AI_DAILY);
  const r = daily.ok ? await durableRateLimit(`ai:${route}:${who}`, AI_LIMITS[route]) : daily;
  if (r.ok) return null;
  const message = daily.ok
    ? `You're sending AI requests faster than we can handle. Please wait ${minutes(r.retryAfter)} and try again.`
    : `You've reached today's AI limit. It resets within ${minutes(r.retryAfter)}. Contact support if you need more.`;
  return Response.json(
    { error: message, code: "rate_limited", retryAfter: r.retryAfter },
    { status: 429, headers: { "Retry-After": String(r.retryAfter), "X-RateLimit-Limit": String(r.limit), "X-RateLimit-Remaining": "0", "Cache-Control": "no-store" } },
  );
}
