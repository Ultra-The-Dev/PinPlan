// POST /api/billing/sync-seats (owner/admin) { action: "add" | "release" | "fit" } → { seats }.
// Seats are what a subscribed team pays for; joining is refused once they're all taken (accept_team_invite).
//   add:     one more seat, before inviting someone (Stripe prorates the charge).
//   release: one fewer, after removing someone.
//   fit:     exactly the people on the team.
// The seat item's quantity is changed in Stripe and the new limit written to the team straight away (the webhook
// confirms it). Teams on the free trial or comped have no seat limit, so there's nothing to change.
import { seatTarget, type SeatAction, type SubscriptionLike } from "@/lib/billingLogic";
import { billingConfig, billingFailure, getStripe, jsonError, notConfigured, requireTeamOffice, setSeats } from "@/lib/server/billing";

const ACTIONS: SeatAction[] = ["add", "release", "fit"];
const LIVE = new Set(["active", "past_due", "trialing"]);

export async function POST(request: Request) {
  const c = billingConfig();
  if (!c.ok) return notConfigured(c.missing);
  const cfg = c.config;
  let action: SeatAction = "fit";
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== undefined) {
      if (!ACTIONS.includes(body.action as SeatAction)) return jsonError("Unknown seat action.", "bad_request", 400);
      action = body.action as SeatAction;
    }
    const who = await requireTeamOffice(request, cfg);
    if (!who.ok) return who.response;
    const { team, members } = who.caller;
    if (team.plan_status === "comped") return Response.json({ seats: null, skipped: "comped" });
    if (!team.stripe_subscription_id || !LIVE.has(team.plan_status)) return Response.json({ seats: null, skipped: "no_subscription" });

    const stripe = getStripe(cfg);
    const sub = (await stripe.subscriptions.retrieve(team.stripe_subscription_id)) as unknown as SubscriptionLike;
    const target = seatTarget(action, { members, seatLimit: team.seat_limit });
    await setSeats(cfg, stripe, sub, team.id, target);
    return Response.json({ seats: target });
  } catch (e) {
    return billingFailure("sync-seats", e, "Couldn't change seats. Try again in a minute.");
  }
}
