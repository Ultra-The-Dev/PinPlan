// What Northpin sells: one place for plan names, trial length and the placeholder prices shown on the
// pricing page. Real charges come from Stripe (the Price IDs in the server's environment); keep these
// display prices in step with Stripe when you set them there.

export const PRODUCT_NAME = "Northpin";
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
    name: `${PRODUCT_NAME} Team`,
    basePrice: 49,
    includedSeats: 3,
    seatPrice: 15,
    features: [
      "Unlimited jobs, plans and devices, for every trade",
      "Device and wire counts per floor, priced from your price list",
      "Quotes your client approves and signs on their phone",
      "Deposit, progress and final invoices, with payments",
      "Photos with mark-up, checklists, tasks, daily logs and files",
      "iPad, iPhone and web, works offline and syncs",
      "Technician logins for field work, without the Money tab, quotes or invoices",
    ],
  },
];

/** Prices are in US dollars; sales tax is added where it applies (Stripe Tax, when switched on). */
export const PRICE_CURRENCY = "USD, plus applicable tax";

/** The auto-renewal terms: shown next to "Start subscription" and above Stripe's pay button. */
export const RENEWAL_NOTE = "Your subscription renews automatically every month until you cancel. You can cancel any time in Settings → Billing.";

/** Monthly total for a team of `users` on `plan` (display only). */
export function monthlyPrice(plan: Plan, users: number): number {
  return plan.basePrice + Math.max(0, users - plan.includedSeats) * plan.seatPrice;
}

/** Subscription states, as stored on `teams.plan_status` (mirrors Stripe's subscription status).
 *  "comped": free for good (teams from before billing, e.g. the founder's company). "none": no billing record. */
export type PlanStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "comped" | "none";

/** Can the team use the app normally? Past-due keeps working (Stripe retries the card); the rest are read-only.
 *  A team that canceled, or whose first payment is pending, keeps working until its own trial ends.
 *  `enforce` is billing_settings.enforce: while false (no live Stripe yet) an unpaid trial never locks.
 *  Mirrors `plan_allows_work()` in supabase/migrations/20261124100200_billing_policy.sql. */
export function planAllowsWork(status: PlanStatus | null | undefined, trialEndsAt: string | null | undefined, now = new Date(), enforce = true): boolean {
  if (status === "active" || status === "past_due" || status === "comped") return true;
  const inTrial = !!trialEndsAt && new Date(trialEndsAt).getTime() > now.getTime();
  // A Stripe trial carries its own end date; a trialing team without one has no deadline.
  if (status === "trialing" && (!trialEndsAt || inTrial)) return true;
  // The first payment is still pending, or the subscription was canceled: keep working while the team's own trial runs.
  if ((status === "incomplete" || status === "canceled") && inTrial) return true;
  // Billing isn't switched on yet: an unpaid trial never locks.
  if (!enforce && (status === "trialing" || status === "incomplete" || status === "none" || !status)) return true;
  if (status === "none" || !status) return inTrial;
  return false;
}
