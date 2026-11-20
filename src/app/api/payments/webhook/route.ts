// POST /api/payments/webhook: Stripe's Connect webhook ("Events on connected accounts", signed with
// STRIPE_CONNECT_WEBHOOK_SECRET). Records invoice payments made on Checkout pages this server opened, marks bank
// payments processing / failed, records refunds made in the company's Stripe dashboard, and keeps each company's
// account status current. Events are applied once (see onlinePayments.ts); a database or Stripe failure answers 500 so
// Stripe retries. Events about the platform's own account are ignored here (they go to /api/billing/webhook).
import { verifyWebhook } from "@/lib/server/billing";
import { CONNECT_EVENTS, handleConnectEvent, paymentsConfig, payError, payJson, serviceDb, stripeFor } from "@/lib/server/onlinePayments";
import { readTextLimited } from "@/lib/server/readBody";
import { reportServerError } from "@/lib/server/serverErrors";

const HANDLED = new Set<string>(CONNECT_EVENTS);
const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const c = paymentsConfig();
  if (!c.ok) return payJson({ error: "Online payments aren't set up on this server. See docs/payments.md.", code: "payments_not_configured", missing: c.missing }, 501);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return payError("Missing Stripe-Signature.", "bad_signature", 400);
  // Stripe's events are a few KB; anything far bigger is refused before it is read (and before the signature check).
  const body = await readTextLimited(request, MAX_WEBHOOK_BYTES);
  if (!body.ok) return payError(body.status === 413 ? "Request too large." : "Couldn't read the request.", body.code, body.status);
  let event;
  try {
    // HMAC-SHA256 over the raw body with the Connect endpoint's own secret, 5-minute tolerance.
    event = verifyWebhook(body.text, signature, c.config.connectWebhookSecret);
  } catch {
    return payError("Signature doesn't match.", "bad_signature", 400);
  }
  if (!HANDLED.has(event.type)) return payJson({ received: true, ignored: event.type });
  try {
    const out = await handleConnectEvent(serviceDb(), stripeFor(c.config), event);
    return payJson({ received: true, ...out });
  } catch (e) {
    const err = e as { type?: string; code?: string; message?: string };
    console.error("[payments] webhook", event.type, event.id, err?.type ?? "", err?.code ?? "", err?.message);
    await reportServerError(e, { where: "payments webhook", path: "/api/payments/webhook", method: "POST", extra: { eventType: event.type } });
    return payError("Couldn't apply the event.", "apply_failed", 500);
  }
}
