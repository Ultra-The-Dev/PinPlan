// POST /api/billing/webhook: Stripe tells us about subscriptions and invoices. The signature is checked on the raw
// body; then the subscription is re-read from Stripe and copied onto the team (so late or repeated events are harmless).
import { HANDLED_EVENTS, subscriptionIdFromEvent, type SubscriptionLike } from "@/lib/billingLogic";
import { applySubscription, billingConfig, getStripe, jsonError, notConfigured, verifyWebhook } from "@/lib/server/billing";
import { reportServerError } from "@/lib/server/serverErrors";

const HANDLED = new Set<string>(HANDLED_EVENTS);

export async function POST(request: Request) {
  const c = billingConfig();
  if (!c.ok) return notConfigured(c.missing);
  const cfg = c.config;
  const signature = request.headers.get("stripe-signature");
  if (!signature) return jsonError("Missing Stripe-Signature.", "bad_signature", 400);
  const raw = await request.text();
  let event;
  try {
    event = verifyWebhook(raw, signature, cfg.webhookSecret);
  } catch {
    return jsonError("Signature doesn't match.", "bad_signature", 400);
  }
  if (!HANDLED.has(event.type)) return Response.json({ received: true, ignored: event.type });

  const obj = event.data.object as unknown as Record<string, unknown>;
  const subId = subscriptionIdFromEvent(event.type, obj);
  if (!subId) return Response.json({ received: true, ignored: "no subscription" });
  // Checkout knows the team even before the subscription's metadata is read.
  const meta = obj.metadata as Record<string, string> | null | undefined;
  const hint = event.type === "checkout.session.completed" ? ((obj.client_reference_id as string | null | undefined) ?? meta?.team_id ?? null) : null;
  try {
    const sub = await getStripe(cfg).subscriptions.retrieve(subId);
    const result = await applySubscription(cfg, sub as unknown as SubscriptionLike, hint);
    return Response.json({ received: true, result });
  } catch (e) {
    // 500 makes Stripe retry later (the database or Stripe may be briefly unreachable).
    console.error("billing webhook", event.type, event.id, (e as Error).message);
    await reportServerError(e, { where: "billing webhook", path: "/api/billing/webhook", method: "POST", extra: { eventType: event.type } });
    return jsonError("Couldn't apply the event.", "apply_failed", 500);
  }
}
