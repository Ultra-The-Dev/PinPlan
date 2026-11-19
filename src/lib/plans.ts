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

/** Subscription states, as stored on `teams.plan_status` (mirrors Stripe's subscription status). */
export type PlanStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "none";

/** Can the team use the app normally? Past-due keeps working (Stripe retries the card); the rest are read-only. */
export function planAllowsWork(status: PlanStatus | null | undefined, trialEndsAt: string | null | undefined, now = new Date()): boolean {
  if (status === "active" || status === "past_due") return true;
  if (status === "trialing" || status === "none" || !status) return !!trialEndsAt && new Date(trialEndsAt).getTime() > now.getTime();
  return false;
}
