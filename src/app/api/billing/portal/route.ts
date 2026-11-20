// POST /api/billing/portal (owner/admin): Stripe's billing portal for the team (card, invoices, cancel) → { url }.
import { billingConfig, billingFailure, getStripe, jsonError, notConfigured, originMissing, originOf, requireTeamOffice } from "@/lib/server/billing";

export async function POST(request: Request) {
  const c = billingConfig();
  if (!c.ok) return notConfigured(c.missing);
  const origin = originOf(request);
  if (!origin) return originMissing();
  try {
    const who = await requireTeamOffice(request, c.config);
    if (!who.ok) return who.response;
    const customer = who.caller.team.stripe_customer_id;
    if (!customer) return jsonError("There's no billing account yet. Start a subscription first.", "no_customer", 400);
    const session = await getStripe(c.config).billingPortal.sessions.create({ customer, return_url: `${origin}/settings#billing` });
    return Response.json({ url: session.url });
  } catch (e) {
    return billingFailure("portal", e, "Couldn't open billing. Try again in a minute.");
  }
}
