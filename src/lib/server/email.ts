// Transactional email through Resend's REST API (server-only; no SDK).
// Switched on by two environment variables on the server:
//   RESEND_API_KEY  the Resend API key ("re_…")
//   EMAIL_FROM      the sender on a domain verified in Resend, e.g. "Northpin <noreply@yourdomain.com>"
// Also needed in production: PINPLAN_APP_URL (the address used in links, e.g. https://app.example.com). Links are never
// built from the request's Host header, so a forged Host can't put someone else's site into an email.
// Optional: EMAIL_REPLY_TO (where replies to Northpin's own mail go; never used for mail to a company's clients).
// Without the first two, emailConfigured() is false and routes answer 501 with a friendly message.
// Sends on a company's behalf also go through sendGuard.ts (daily caps, confirmed email, active subscription).
// Never log the key, the message body or the recipient.

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

/** 501 for callers when email isn't switched on yet. */
export function emailUnavailable(hint = ""): Response {
  return Response.json({ error: `Email isn't set up yet on this Northpin server.${hint ? ` ${hint}` : ""}`, code: "email_unconfigured" }, { status: 501 });
}

const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;
/** A single plain address (no display name), as typed into a form. */
export function validEmail(s: string): boolean {
  return s.length <= 254 && EMAIL_RE.test(s);
}

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * The site address for links in emails: PINPLAN_APP_URL. In production it must be set (https), and null means "don't
 * send": answer with appOriginMissing(). Outside production (local dev, tests) it falls back to the request's own URL.
 */
export function appOrigin(request: Request): string | null {
  const configured = process.env.PINPLAN_APP_URL?.trim();
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === "https:" || (u.protocol === "http:" && !isProduction())) return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
      /* not a URL: treated as unset */
    }
  }
  if (isProduction()) return null;
  return new URL(request.url).origin;
}

/** 501 when PINPLAN_APP_URL isn't set in production. */
export function appOriginMissing(): Response {
  console.warn("[email] PINPLAN_APP_URL is not set (or not https): links in emails can't be built");
  return Response.json(
    { error: "Email links aren't set up on this Northpin server yet. The site address (PINPLAN_APP_URL) is missing.", code: "app_url_unconfigured" },
    { status: 501 },
  );
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** false: never fall back to EMAIL_REPLY_TO (mail to a company's client must reply to the company, not Northpin). */
  platformReplyTo?: boolean;
  /** Resend keeps a key for 24 hours: the same key + same message is sent only once. */
  idempotencyKey?: string;
  /** Short labels for Resend's dashboard (letters, digits, _ and - only). */
  tags?: Record<string, string>;
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; status: number; code: string; error: string; retryable: boolean };

const fail = (status: number, code: string, error: string, retryable = false): SendResult => ({ ok: false, status, code, error, retryable });

/** Maps a Resend error to a message that's safe to show the person (no keys, no addresses). */
export function mapResendError(status: number, name: string | undefined): SendResult {
  const n = (name ?? "").toLowerCase();
  if (status === 401 || status === 403 || n === "missing_api_key" || n === "invalid_api_key" || n === "restricted_api_key")
    return fail(502, "email_auth", "The email service didn't accept this server's key. Check RESEND_API_KEY and that the sending domain is verified in Resend.");
  if (n === "invalid_from_address") return fail(502, "email_from", "The email sender (EMAIL_FROM) isn't valid or its domain isn't verified in Resend.");
  if (n === "concurrent_idempotent_requests") return fail(409, "email_in_progress", "That email is already being sent.", true);
  if (n === "invalid_idempotent_request" || n === "invalid_idempotency_key") return fail(409, "email_duplicate", "That email was already sent.");
  if (status === 429 || n === "rate_limit_exceeded" || n === "daily_quota_exceeded" || n === "monthly_quota_exceeded")
    return fail(429, "email_rate_limited", "The email service is busy or over its sending limit. Try again in a few minutes.", true);
  if (status === 400 || status === 422 || n === "validation_error")
    return fail(400, "email_rejected", "The email service rejected this message. Check the email address.");
  if (status >= 500) return fail(502, "email_upstream", "The email service had a problem. Try again in a few minutes.", true);
  return fail(502, "email_failed", `Couldn't send the email (${status}).`);
}

/** Strip line breaks (header injection) and trim. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export async function sendEmail(msg: EmailMessage, opts: { timeoutMs?: number } = {}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) return fail(501, "email_unconfigured", "Email isn't set up yet on this Northpin server.");
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((t) => t.trim()).filter(Boolean);
  if (!to.length || to.length > 50 || !to.every(validEmail)) return fail(400, "bad_recipient", "Enter a valid email address.");

  const replyTo = msg.replyTo?.trim() || (msg.platformReplyTo === false ? undefined : process.env.EMAIL_REPLY_TO?.trim()) || undefined;
  const body: Record<string, unknown> = { from: oneLine(from), to, subject: oneLine(msg.subject).slice(0, 250), html: msg.html, text: msg.text };
  if (replyTo) body.reply_to = oneLine(replyTo);
  if (msg.tags) body.tags = Object.entries(msg.tags).map(([name, value]) => ({ name: clean(name), value: clean(value) }));

  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "pinplan-server" };
  if (msg.idempotencyKey) headers["Idempotency-Key"] = oneLine(msg.idempotencyKey).slice(0, 256);

  let r: Response;
  try {
    r = await fetch(RESEND_URL, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
    console.warn(`[email] send ${timedOut ? "timed out" : "failed to connect"}`);
    return timedOut
      ? fail(504, "email_timeout", "The email service took too long to answer. Try again.", true)
      : fail(502, "email_unreachable", "Couldn't reach the email service. Try again.", true);
  }
  const data = (await r.json().catch(() => ({}))) as { id?: string; name?: string; statusCode?: number };
  if (r.ok) return { ok: true, id: typeof data.id === "string" ? data.id : null };
  const mapped = mapResendError(r.status, data.name);
  // Status and Resend's error name only: never the key, recipient or content.
  console.warn(`[email] send rejected: ${r.status} ${clean(data.name ?? "")}`);
  return mapped;
}

/** Resend tag names/values allow ASCII letters, digits, _ and - (max 256). */
function clean(s: string) {
  return s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

/** JSON response for a failed send. */
export function sendFailure(r: Extract<SendResult, { ok: false }>): Response {
  return Response.json({ error: r.error, code: r.code }, { status: r.status });
}

// ---- tiny in-memory rate limiter (per server instance) ----
// Only a first line: on Cloudflare Workers each isolate counts on its own. Routes that matter add a shared limit too
// (durableRateLimit in rateLimit.ts, or durableLimited in sendGuard.ts).
export function rateLimiter(windowMs: number, max: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit; true when `key` is over the limit. */
    limited(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return true;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      return false;
    },
    reset() {
      hits.clear();
    },
  };
}

// The caller's address comes from rateLimit.ts, which trusts only headers the hosting platform sets (never a forged
// X-Forwarded-For on Cloudflare). clientIpKey is the per-IP rate-limit key (IPv6 on its /64).
export { clientIp, clientIpKey } from "./rateLimit";
