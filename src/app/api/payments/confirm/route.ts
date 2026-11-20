// POST /api/payments/confirm { token, session } — the client page calls this when Stripe sends the client back
// (?paid=1&cs=…), so the payment shows straight away even if Stripe's webhook is a little late. The page is re-read from
// Stripe on the company's account and applied exactly as the webhook would (once; repeats are harmless). It only works
// for a page opened from that same link. Answers { ok } and nothing else. Limit: 30 per 10 minutes per address.
import { applyCheckoutSession, paymentsConfig, paymentsFailure, paymentsOff, payJson, serviceDb, SESSION_RE, stripeFor, TOKEN_RE } from "@/lib/server/onlinePayments";
import { clientIpKey, durableRateLimit, tooManyRequests, waitText } from "@/lib/server/rateLimit";
import { readJsonLimited } from "@/lib/server/readBody";

const MAX_BODY_BYTES = 4 * 1024;
const PER_IP = { limit: 30, windowMs: 10 * 60_000 };

export async function POST(request: Request) {
  const c = paymentsConfig();
  if (!c.ok) return paymentsOff();
  const read = await readJsonLimited<{ token?: unknown; session?: unknown } | null>(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const token = typeof read.value?.token === "string" ? read.value.token.trim() : "";
  const id = typeof read.value?.session === "string" ? read.value.session.trim() : "";
  if (!TOKEN_RE.test(token) || !SESSION_RE.test(id)) return payJson({ ok: false }, 400);
  const r = await durableRateLimit(`pay-confirm-ip:${clientIpKey(request)}`, PER_IP);
  if (!r.ok) return tooManyRequests(r, `Too many tries. Please wait ${waitText(r.retryAfter)} and try again.`);
  try {
    const db = serviceDb();
    const row = await db.getSession(id);
    if (!row || row.link_id !== token) return payJson({ ok: false }, 404);
    if (row.status === "paid") return payJson({ ok: true });
    const stripe = stripeFor(c.config);
    const session = await stripe.checkout.sessions.retrieve(id, {}, { stripeAccount: row.account_id });
    await applyCheckoutSession(db, stripe, row.account_id, session);
    return payJson({ ok: true });
  } catch (e) {
    return paymentsFailure("confirm", e, "Couldn't confirm the payment yet. It will show shortly.");
  }
}
