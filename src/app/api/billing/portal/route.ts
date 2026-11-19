// POST /api/billing/portal (owner/admin): Stripe's billing portal for the team (card, invoices, cancel) → { url }.
import { billingConfig, getStripe, jsonError, notConfigured, originOf, requireTeamOffice } from "@/lib/server/billing";

export async function POST(request: Request) {
  const c = billingConfig();
  if (!c.ok) return notConfigured(c.missing);
  try {
    const who = await requireTeamOffice(request, c.config);
    if (!who.ok) return who.response;
    const customer = who.caller.team.stripe_customer_id;
    if (!customer) return jsonError("There's no billing account yet. Start a subscription first.", "no_customer", 400);
    const session = await getStripe(c.config).billingPortal.sessions.create({ customer, return_url: `${originOf(request)}/settings#billing` });
    return Response.json({ url: session.url });
  } catch (e) {
    return jsonError((e as Error).message || "Couldn't open billing.", "stripe_error", 502);
  }
}
