// POST /api/billing/checkout (owner/admin): a Stripe Checkout page for the team's subscription → { url }.
// Base price ×1 plus a seat for each person beyond those included; the rest of the free trial carries over.
import { checkoutTrialEnd, extraSeats } from "@/lib/billingLogic";
import { PLANS } from "@/lib/plans";
import { billingConfig, getStripe, jsonError, notConfigured, originOf, patchTeam, requireTeamOffice, teamById } from "@/lib/server/billing";

/** Subscriptions that still exist in Stripe: change them in the portal instead of starting another one. */
const LIVE = new Set(["active", "past_due", "trialing", "unpaid", "incomplete"]);

export async function POST(request: Request) {
  const c = billingConfig();
  if (!c.ok) return notConfigured(c.missing);
  const cfg = c.config;
  try {
    const who = await requireTeamOffice(request, cfg);
    if (!who.ok) return who.response;
    const { team, members, email } = who.caller;
    if (team.plan_status === "comped") return jsonError("This account is comped — there's nothing to pay.", "comped", 400);
    if (team.stripe_subscription_id && LIVE.has(team.plan_status))
      return jsonError("Your company already has a subscription. Use “Manage billing” to change it.", "already_subscribed", 409);

    const stripe = getStripe(cfg);
    let customer = team.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create(
        { name: team.name || undefined, email: team.billing_email ?? email ?? undefined, metadata: { team_id: team.id } },
        { idempotencyKey: `pinplan-team-customer-${team.id}` },
      );
      // Two checkouts at once: the first stored customer wins.
      const stored = await patchTeam(cfg, team.id, { stripe_customer_id: created.id, billing_email: team.billing_email ?? email ?? null }, "stripe_customer_id=is.null");
      customer = stored ? created.id : ((await teamById(cfg, team.id))?.stripe_customer_id ?? created.id);
    }

    const plan = PLANS[0];
    const extra = extraSeats(Math.max(members, plan.includedSeats), plan);
    const trialEnd = checkoutTrialEnd(team);
    const origin = originOf(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: team.id,
      metadata: { team_id: team.id },
      line_items: [{ price: cfg.priceBase, quantity: 1 }, ...(extra > 0 ? [{ price: cfg.priceSeat, quantity: extra }] : [])],
      subscription_data: { metadata: { team_id: team.id }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      allow_promotion_codes: true,
      success_url: `${origin}/settings?billing=success#billing`,
      cancel_url: `${origin}/settings?billing=cancel#billing`,
    });
    if (!session.url) return jsonError("Stripe didn't return a checkout page.", "stripe_error", 502);
    return Response.json({ url: session.url });
  } catch (e) {
    return jsonError((e as Error).message || "Couldn't start checkout.", "stripe_error", 502);
  }
}
