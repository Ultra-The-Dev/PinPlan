// POST /api/payments/checkout { token } (no account: the client link's token is the key) → { url } of a Stripe Checkout
// page for what the invoice still owes, paid straight to the company's own Stripe account. Off (501) until online
// payments are set up on the server. Refused for void, paid, credited or not-yet-issued invoices, withdrawn or expired
// links, and companies that haven't connected Stripe. Limits: 20 per 10 minutes per address, 10 per link.
import { originOf } from "@/lib/server/billing";
import { createCheckout, paymentsConfig, paymentsFailure, paymentsOff, payError, payJson, REFUSALS, serviceDb, stripeFor, TOKEN_RE, tokenKey } from "@/lib/server/onlinePayments";
import { clientIpKey, durableRateLimit, tooManyRequests, waitText, type RateLimitRule } from "@/lib/server/rateLimit";
import { readJsonLimited } from "@/lib/server/readBody";

const MAX_BODY_BYTES = 4 * 1024;
const PER_IP: RateLimitRule = { limit: 20, windowMs: 10 * 60_000 };
const PER_LINK: RateLimitRule = { limit: 10, windowMs: 10 * 60_000 };

export async function POST(request: Request) {
  const c = paymentsConfig();
  if (!c.ok) return paymentsOff();
  const read = await readJsonLimited<{ token?: unknown } | null>(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const token = typeof read.value?.token === "string" ? read.value.token.trim() : "";
  if (!TOKEN_RE.test(token)) return payError(REFUSALS.link.error, "link", 404);
  const origin = originOf(request);
  if (!origin) return paymentsOff();
  const limits: [string, RateLimitRule][] = [
    [`pay-checkout-ip:${clientIpKey(request)}`, PER_IP],
    [`pay-checkout-link:${tokenKey(token)}`, PER_LINK],
  ];
  for (const [key, rule] of limits) {
    const r = await durableRateLimit(key, rule);
    if (!r.ok) return tooManyRequests(r, `Too many tries. Please wait ${waitText(r.retryAfter)} and try again.`);
  }
  try {
    const out = await createCheckout(c.config, serviceDb(), stripeFor(c.config), token, origin);
    if (!out.ok) return payError(REFUSALS[out.reason].error, out.reason, REFUSALS[out.reason].status);
    return payJson({ url: out.url });
  } catch (e) {
    return paymentsFailure("checkout", e, "Online payment isn't available right now. Please try again in a few minutes.");
  }
}
