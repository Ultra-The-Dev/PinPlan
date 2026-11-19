// What PinPlan sells: one place for plan names, trial length and the placeholder prices shown on the
// pricing page. Real charges come from Stripe (the Price IDs in the server's environment); keep these
// display prices in step with Stripe when you set them there.

export const PRODUCT_NAME = "PinPlan";
export const TRIAL_DAYS = 14;

export interface Plan {
  id: "team";
  name: string;
  /** Monthly base price in whole dollars (display only — Stripe is the source of truth). */
  basePrice: number;
  /** Users included in the base price. */
  includedSeats: number;
  /** Monthly price per extra user (display only). */
  seatPrice: number;
  features: string[];
}

// Placeholder pricing — decide the real numbers, set them in Stripe, then update these to match.
export const PLANS: Plan[] = [
  {
    id: "team",
    name: "PinPlan Team",
    basePrice: 49,
    includedSeats: 3,
    seatPrice: 15,
    features: [
      "Unlimited jobs, plans and devices",
      "Per-floor takeoff, priced estimates and Billdu",
      "Client proposals and plan reviews with e-signature",
      "Job photos, mark-up, checklists, daily logs and reports",
      "iPad, iPhone and web, offline-first with sync",
      "Technician logins without prices",
    ],
  },
];

/** Monthly total for a team of `users` on `plan` (display only). */
export function monthlyPrice(plan: Plan, users: number): number {
  return plan.basePrice + Math.max(0, users - plan.includedSeats) * plan.seatPrice;
}

/** Subscription states, as stored on `teams.plan_status` (mirrors Stripe's subscription status).
 *  "comped": free for good (teams from before billing, e.g. the founder's company). "none": no billing record. */
export type PlanStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "comped" | "none";

/** Can the team use the app normally? Past-due keeps working (Stripe retries the card); the rest are read-only.
 *  Mirrors `plan_allows_work()` in supabase/migrations/20261121000000_billing.sql. */
export function planAllowsWork(status: PlanStatus | null | undefined, trialEndsAt: string | null | undefined, now = new Date()): boolean {
  if (status === "active" || status === "past_due" || status === "comped") return true;
  const inTrial = !!trialEndsAt && new Date(trialEndsAt).getTime() > now.getTime();
  // A Stripe trial carries its own end date; a trialing team without one has no deadline.
  if (status === "trialing") return !trialEndsAt || inTrial;
  // The first payment is still pending: keep working while the team's own trial runs.
  if (status === "incomplete" || status === "none" || !status) return inTrial;
  return false;
}
