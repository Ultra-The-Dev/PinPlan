// Subscription billing: plan status wording, seat maths and the Stripe → team mapping. Pure (no browser, network or
// Stripe SDK), shared by the web screens, the server routes and the tests.
import { PLANS, planAllowsWork, type Plan, type PlanStatus } from "./plans";
import type { TeamRole } from "./teamLogic";

/** The caller's team billing, as `team_billing()` returns it. */
export interface TeamBilling {
  status: PlanStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  /** Null: no seat limit (trial, comped, or not set yet). */
  seatLimit: number | null;
  members: number;
  canWork: boolean;
  hasSubscription: boolean;
  billingEmail: string | null;
}

const STATUSES: PlanStatus[] = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "comped", "none"];

/** Reads `team_billing()`'s JSON. Null when the caller isn't on a team (or the function returned nothing). */
export function parseTeamBilling(raw: unknown, now = new Date()): TeamBilling | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = STATUSES.includes(r.status as PlanStatus) ? (r.status as PlanStatus) : "none";
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const trialEndsAt = str(r.trial_ends_at);
  const seat = Number(r.seat_limit);
  return {
    status,
    trialEndsAt,
    currentPeriodEnd: str(r.current_period_end),
    seatLimit: r.seat_limit == null || !Number.isFinite(seat) ? null : seat,
    members: Math.max(0, Number(r.members) || 0),
    canWork: typeof r.can_work === "boolean" ? r.can_work : planAllowsWork(status, trialEndsAt, now),
    hasSubscription: r.has_subscription === true,
    billingEmail: str(r.billing_email),
  };
}

/** Can the team work right now? Re-checked against the clock, so a trial that ends while the app is open locks. */
export function billingAllowsWork(b: TeamBilling | null | undefined, now = new Date()): boolean {
  if (!b) return true; // solo, or not loaded: never lock
  return planAllowsWork(b.status, b.trialEndsAt, now);
}

/** Whole days left until `iso` (rounded up; 0 when past). */
export function daysLeft(iso: string | null | undefined, now = new Date()): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export type Tone = "green" | "slate" | "amber" | "red";

/** One-line plan status for the billing panel. */
export function billingSummary(b: TeamBilling, now = new Date()): { label: string; detail: string; tone: Tone } {
  const works = billingAllowsWork(b, now);
  switch (b.status) {
    case "comped":
      return { label: "Comped", detail: "Founder account — free, no seat limit.", tone: "green" };
    case "active":
      return { label: "Active", detail: b.currentPeriodEnd ? `Renews ${shortDate(b.currentPeriodEnd)}.` : "Your subscription is active.", tone: "green" };
    case "past_due":
      return { label: "Past due", detail: "The last payment failed. Stripe will retry the card — update it to avoid interruption.", tone: "amber" };
    case "trialing":
    case "incomplete":
    case "none": {
      if (!works) return { label: "Trial ended", detail: "Jobs are read-only until you start a subscription.", tone: "red" };
      if (b.hasSubscription && b.status === "trialing")
        return { label: "Trial", detail: b.trialEndsAt ? `${plural(daysLeft(b.trialEndsAt, now), "day")} left — then your subscription starts.` : "Subscription starts after the trial.", tone: "slate" };
      if (b.status === "incomplete") return { label: "Payment pending", detail: "Finish the first payment to keep working after the trial.", tone: "amber" };
      return { label: "Trial", detail: b.trialEndsAt ? `${plural(daysLeft(b.trialEndsAt, now), "day")} left.` : "Free trial.", tone: daysLeft(b.trialEndsAt, now) <= 3 ? "amber" : "slate" };
    }
    case "canceled":
      return { label: "Canceled", detail: "Jobs are read-only. Start a subscription to edit again.", tone: "red" };
    case "unpaid":
      return { label: "Unpaid", detail: "Payments failed, so jobs are read-only. Update the card to unlock.", tone: "red" };
  }
}

export interface Banner {
  tone: "amber" | "red";
  text: string;
  /** What the button does (owner/admin only); techs get no button. */
  action: "subscribe" | "portal" | null;
}

/** The app-wide banner: trial ending (≤ 3 days), payment past due, or read-only. Null when there's nothing to say. */
export function bannerFor(b: TeamBilling | null | undefined, role: TeamRole | null | undefined, now = new Date()): Banner | null {
  if (!b || b.status === "comped") return null;
  const office = role === "owner" || role === "admin";
  const ask = "Ask your office to sort out the subscription.";
  if (!billingAllowsWork(b, now)) {
    const why = b.status === "trialing" || b.status === "incomplete" || b.status === "none" ? "Your free trial has ended" : "Your PinPlan subscription is inactive";
    return {
      tone: "red",
      text: `${why}, so jobs are read-only — you can still view and export everything. ${office ? "Start a subscription to edit again." : ask}`,
      action: office ? (b.hasSubscription && b.status !== "canceled" ? "portal" : "subscribe") : null,
    };
  }
  if (b.status === "past_due")
    return { tone: "amber", text: `The last PinPlan payment failed. ${office ? "Update the card to avoid interruption." : ask}`, action: office ? "portal" : null };
  if ((b.status === "trialing" || b.status === "incomplete") && !b.hasSubscription && b.trialEndsAt) {
    const d = daysLeft(b.trialEndsAt, now);
    if (d <= 3) {
      const when = d <= 1 ? "today or tomorrow" : `in ${d} days`;
      return { tone: "amber", text: `Your free trial ends ${when}. ${office ? "Start your subscription to keep working." : ask}`, action: office ? "subscribe" : null };
    }
  }
  return null;
}

// ---------- seats ----------

/** Paid seats beyond those the base price includes. */
export function extraSeats(totalSeats: number, plan: Plan = PLANS[0]): number {
  return Math.max(0, Math.floor(totalSeats) - plan.includedSeats);
}

/** Seats the team pays for: the limit, or (no limit yet) at least the members, never below what the base includes. */
export function paidSeats(b: Pick<TeamBilling, "seatLimit" | "members">, plan: Plan = PLANS[0]): number {
  return Math.max(plan.includedSeats, b.seatLimit ?? b.members, b.members);
}

export const MAX_SEATS = 500;
export type SeatAction = "add" | "release" | "fit";

/**
 * How many seats the subscription should have after an action.
 * - add: one more than now (the owner is about to invite someone).
 * - release: one fewer, after someone was removed (never below the people still on the team).
 * - fit: exactly the people on the team.
 * Always at least the members and the seats the base price includes.
 */
export function seatTarget(action: SeatAction, s: { members: number; seatLimit: number | null }, plan: Plan = PLANS[0]): number {
  const current = s.seatLimit ?? Math.max(s.members, plan.includedSeats);
  const want = action === "add" ? current + 1 : action === "release" ? current - 1 : s.members;
  return Math.min(MAX_SEATS, Math.max(want, s.members, plan.includedSeats));
}

// ---------- Stripe → team row ----------

/** Stripe subscription status → teams.plan_status. */
export function planStatusFromStripe(status: string | null | undefined): Exclude<PlanStatus, "comped" | "none"> {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
      return status;
    case "incomplete_expired":
      return "canceled";
    case "paused": // trial ended without a card, with "pause" as the missing-payment behaviour
      return "unpaid";
    default:
      return "incomplete";
  }
}

/** The bits of a Stripe subscription we read (works across API versions: the period end moved onto the items). */
export interface SubscriptionLike {
  id: string;
  status: string;
  customer: string | { id: string } | null;
  trial_end?: number | null;
  current_period_end?: number | null;
  metadata?: Record<string, string> | null;
  items?: { data: { id: string; quantity?: number | null; current_period_end?: number | null; price?: { id: string } | null }[] } | null;
}

export interface TeamBillingPatch {
  plan_status: Exclude<PlanStatus, "comped" | "none">;
  stripe_subscription_id: string;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  seat_limit: number;
  trial_ends_at?: string;
}

const iso = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);
export const customerId = (c: SubscriptionLike["customer"]) => (typeof c === "string" ? c : c?.id ?? null);

/** The seat item on a subscription (by the seat Price ID), if any. */
export function seatItem(sub: SubscriptionLike, seatPriceId: string) {
  return sub.items?.data.find((i) => i.price?.id === seatPriceId) ?? null;
}

/** What to write on the team row for this subscription. */
export function teamPatchFromSubscription(sub: SubscriptionLike, opts: { seatPriceId: string; plan?: Plan }): TeamBillingPatch {
  const plan = opts.plan ?? PLANS[0];
  const items = sub.items?.data ?? [];
  const periodEnd = sub.current_period_end ?? items.reduce<number | null>((m, i) => (i.current_period_end && (!m || i.current_period_end > m) ? i.current_period_end : m), null);
  const patch: TeamBillingPatch = {
    plan_status: planStatusFromStripe(sub.status),
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId(sub.customer),
    current_period_end: iso(periodEnd),
    seat_limit: plan.includedSeats + Math.max(0, seatItem(sub, opts.seatPriceId)?.quantity ?? 0),
  };
  // A Stripe trial (carried over from ours at checkout) has its own end; otherwise leave the team's trial as it was.
  if (sub.status === "trialing" && sub.trial_end) patch.trial_ends_at = iso(sub.trial_end)!;
  return patch;
}

/**
 * Should an event about `sub` change this team? Not for comped teams, and not when an old subscription ends after
 * the team moved to another one (events can arrive late and out of order; we always re-read the subscription).
 */
export function shouldApplySubscription(team: { plan_status: string; stripe_subscription_id: string | null }, sub: SubscriptionLike): boolean {
  if (team.plan_status === "comped") return false;
  if (!team.stripe_subscription_id || team.stripe_subscription_id === sub.id) return true;
  // A different subscription: take it only if it's live (a resubscribe), never an old one ending.
  return !["canceled", "incomplete_expired", "unpaid", "paused"].includes(sub.status);
}

/** The subscription an event is about, from the event's object. */
export function subscriptionIdFromEvent(type: string, obj: Record<string, unknown>): string | null {
  const id = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);
  if (type.startsWith("customer.subscription.")) return id(obj.id);
  if (type === "checkout.session.completed") return obj.mode === "subscription" ? id(obj.subscription) : null;
  if (type.startsWith("invoice.")) {
    // Newer API versions moved it under parent.subscription_details.
    const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
    return id(obj.subscription) ?? id(parent?.subscription_details?.subscription);
  }
  return null;
}

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

/** Checkout carries the rest of the team's trial over (Stripe needs the end at least 48 h away). Unix seconds. */
export function checkoutTrialEnd(team: { plan_status: string; trial_ends_at: string | null }, now = new Date()): number | undefined {
  if (team.plan_status !== "trialing" || !team.trial_ends_at) return undefined;
  const end = new Date(team.trial_ends_at).getTime();
  if (end - now.getTime() <= 48 * 3600_000) return undefined;
  return Math.floor(end / 1000);
}

// ---------- the database's lock ----------

export const INACTIVE_MESSAGE = "PinPlan subscription inactive";
/** Did the database refuse a write because the team's subscription lapsed? */
export function isSubscriptionInactive(e: { message?: string | null } | string | null | undefined): boolean {
  const msg = typeof e === "string" ? e : e?.message;
  return !!msg && msg.includes(INACTIVE_MESSAGE);
}
