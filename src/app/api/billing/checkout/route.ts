// POST /api/billing/checkout (owner/admin): a Stripe Checkout page for the team's subscription → { url }. 10 per 10 minutes per team.
// Base price ×1 plus a seat for each person beyond those included; the rest of the free trial carries over.
// An open checkout page with the same terms is reused (clicking twice never makes two), and the create call carries an
// idempotency key. Optional (server settings):
//   STRIPE_TAX=1             Stripe Tax: automatic tax, billing address required, tax IDs collected.
//   STRIPE_TERMS_CONSENT=1   the customer must tick "I agree to the Terms of Service" (needs the Terms URL set in
//                            the Stripe dashboard → Settings → Public details).
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { checkoutTrialEnd, extraSeats } from "@/lib/billingLogic";
import { PLANS, RENEWAL_NOTE } from "@/lib/plans";
import { BILLING_LIMITS, billingConfig, billingFailure, getStripe, jsonError, limitBilling, notConfigured, originMissing, originOf, patchTeam, requireTeamOffice, teamById } from "@/lib/server/billing";

/** Subscriptions that still exist in Stripe: change them in the portal instead of starting another one. */
const LIVE = new Set(["active", "past_due", "trialing", "unpaid", "incomplete"]);

export async function POST(request: Request) {
  const c = billingConfig();
  if (!c.ok) return notConfigured(c.missing);
  const cfg = c.config;
  const origin = originOf(request);
  if (!origin) return originMissing();
  try {
    const who = await requireTeamOffice(request, cfg);
    if (!who.ok) return who.response;
    const { team, members, email } = who.caller;
    const limited = await limitBilling("checkout", team.id, BILLING_LIMITS.checkout);
    if (limited) return limited;
    if (team.plan_status === "comped") return jsonError("This account is comped — there's nothing to pay.", "comped", 400);
    if (team.stripe_subscription_id && LIVE.has(team.plan_status))
      return jsonError("Your company already has a subscription. Use “Manage billing” to change it.", "already_subscribed", 409);

    const stripe = getStripe(cfg);
    let customer = team.stripe_customer_id;
    const newCustomer = !customer;
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
    const tax = process.env.STRIPE_TAX === "1";
    const terms = process.env.STRIPE_TERMS_CONSENT === "1";
    // Everything that shapes the page: a page with other terms is never reused.
    const terms_key = createHash("sha256")
      .update(JSON.stringify([customer, cfg.priceBase, cfg.priceSeat, extra, trialEnd ?? 0, origin, tax, terms]))
      .digest("hex")
      .slice(0, 24);

    // The open pages as they were before this call: part of the idempotency key, so a page this call closes (or one
    // closed by an earlier call) is never handed back by Stripe's idempotent replay.
    let openIds = "";
    if (!newCustomer) {
      const open = await stripe.checkout.sessions.list({ customer, status: "open", limit: 10 });
      openIds = open.data.map((s) => s.id).sort().join(",");
      const soon = Date.now() / 1000 + 10 * 60;
      const reuse = open.data.find((s) => s.metadata?.team_id === team.id && s.metadata?.terms_key === terms_key && s.url && (s.expires_at ?? 0) > soon);
      if (reuse?.url) return Response.json({ url: reuse.url });
      // Older pages for this team (other seats or trial): close them so only one can be paid.
      await Promise.all(
        open.data
          .filter((s) => s.metadata?.team_id === team.id)
          .map((s) => stripe.checkout.sessions.expire(s.id).catch((e: Error) => console.warn(`[billing] couldn't expire checkout ${s.id}:`, e?.message))),
      );
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer,
      client_reference_id: team.id,
      metadata: { team_id: team.id, terms_key },
      line_items: [{ price: cfg.priceBase, quantity: 1 }, ...(extra > 0 ? [{ price: cfg.priceSeat, quantity: extra }] : [])],
      subscription_data: { metadata: { team_id: team.id }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      allow_promotion_codes: true,
      custom_text: { submit: { message: RENEWAL_NOTE } },
      success_url: `${origin}/settings?billing=success#billing`,
      cancel_url: `${origin}/settings?billing=cancel#billing`,
    };
    if (tax) {
      params.automatic_tax = { enabled: true };
      params.billing_address_collection = "required";
      params.customer_update = { address: "auto", name: "auto" };
      params.tax_id_collection = { enabled: true };
    }
    if (terms) params.consent_collection = { terms_of_service: "required" };
    // A double click (same terms, same open pages, within 10 minutes): Stripe hands back the same page instead of making another.
    const slot = Math.floor(Date.now() / 600_000);
    const state = createHash("sha256").update(openIds).digest("hex").slice(0, 12);
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `pinplan-checkout-${team.id}-${terms_key}-${state}-${slot}` });
    if (!session.url) return billingFailure("checkout", new Error("Stripe returned a checkout session without a URL"), "Couldn't open the checkout page. Try again in a minute.");
    return Response.json({ url: session.url });
  } catch (e) {
    return billingFailure("checkout", e, "Couldn't start checkout. Try again in a minute.");
  }
}
