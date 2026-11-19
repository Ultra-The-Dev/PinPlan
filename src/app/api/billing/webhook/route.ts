// POST /api/billing/webhook: Stripe tells us about subscriptions and invoices. The signature is checked on the raw
// body; then the subscription is re-read from Stripe and copied onto the team (so late or repeated events are harmless).
// Also:
//   checkout.session.completed: a second live subscription for the team is canceled; when more people are on the team
//     than the new subscription has seats, the seats are raised to fit (with prorations).
//   invoice.payment_failed: the owner gets one "payment didn't go through" email per invoice. Email problems are
//     logged and never make Stripe retry the event.
import { seatTarget, subscriptionIdFromEvent, HANDLED_EVENTS, type SubscriptionLike } from "@/lib/billingLogic";
import {
  applySubscription,
  billingConfig,
  getStripe,
  jsonError,
  memberCount,
  notConfigured,
  notifyPaymentFailed,
  originOf,
  setSeats,
  teamForSubscription,
  verifyWebhook,
  type InvoiceLike,
} from "@/lib/server/billing";

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
  let result: Awaited<ReturnType<typeof applySubscription>>;
  let sub: SubscriptionLike;
  const stripe = getStripe(cfg);
  try {
    sub = (await stripe.subscriptions.retrieve(subId)) as unknown as SubscriptionLike;
    result = await applySubscription(cfg, sub, hint, stripe);
    // More people than seats (people joined during the trial): raise the seats to fit.
    if (event.type === "checkout.session.completed" && result === "updated") {
      const team = await teamForSubscription(cfg, sub, hint);
      if (team && team.seat_limit != null) {
        const members = await memberCount(cfg, team.id);
        if (members > team.seat_limit) await setSeats(cfg, stripe, sub, team.id, seatTarget("fit", { members, seatLimit: team.seat_limit }));
      }
    }
  } catch (e) {
    // 500 makes Stripe retry later (the database or Stripe may be briefly unreachable).
    const err = e as { type?: string; code?: string; message?: string };
    console.error("[billing] webhook", event.type, event.id, err?.type ?? "", err?.code ?? "", err?.message);
    return jsonError("Couldn't apply the event.", "apply_failed", 500);
  }

  let email: string | undefined;
  if (event.type === "invoice.payment_failed" && result === "updated") {
    try {
      const team = await teamForSubscription(cfg, sub, hint);
      if (team) email = await notifyPaymentFailed(cfg, team, obj as InvoiceLike, originOf(request));
    } catch (e) {
      console.warn("[billing] payment failed email skipped:", (e as Error)?.message);
      email = "failed";
    }
  }
  return Response.json({ received: true, result, ...(email ? { email } : {}) });
}
