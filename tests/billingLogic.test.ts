import { describe, expect, it } from "vitest";
import {
  bannerFor,
  billingSummary,
  checkoutTrialEnd,
  daysLeft,
  extraSeats,
  isSubscriptionInactive,
  paidSeats,
  parseTeamBilling,
  planStatusFromStripe,
  seatTarget,
  shouldApplySubscription,
  subscriptionIdFromEvent,
  teamPatchFromSubscription,
  type TeamBilling,
} from "@/lib/billingLogic";
import { monthlyPrice, PLANS, planAllowsWork } from "@/lib/plans";

const NOW = new Date("2026-11-19T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const billing = (p: Partial<TeamBilling> = {}): TeamBilling => ({
  status: "trialing",
  trialEndsAt: inDays(10),
  currentPeriodEnd: null,
  seatLimit: null,
  members: 2,
  canWork: true,
  hasSubscription: false,
  billingEmail: null,
  ...p,
});

describe("planAllowsWork", () => {
  it("matches the database rule", () => {
    expect(planAllowsWork("active", null, NOW)).toBe(true);
    expect(planAllowsWork("past_due", null, NOW)).toBe(true);
    expect(planAllowsWork("comped", null, NOW)).toBe(true);
    expect(planAllowsWork("trialing", inDays(1), NOW)).toBe(true);
    expect(planAllowsWork("trialing", inDays(-1), NOW)).toBe(false);
    expect(planAllowsWork("trialing", null, NOW)).toBe(true);
    expect(planAllowsWork("incomplete", inDays(1), NOW)).toBe(true);
    expect(planAllowsWork("incomplete", null, NOW)).toBe(false);
    for (const s of ["canceled", "unpaid"] as const) expect(planAllowsWork(s, inDays(5), NOW)).toBe(false);
  });
});

describe("parseTeamBilling", () => {
  it("reads team_billing() and tolerates junk", () => {
    expect(parseTeamBilling(null)).toBeNull();
    const b = parseTeamBilling({ status: "active", trial_ends_at: null, current_period_end: "2026-12-19T00:00:00Z", seat_limit: 4, members: 3, can_work: true, has_subscription: true }, NOW)!;
    expect(b).toMatchObject({ status: "active", seatLimit: 4, members: 3, canWork: true, hasSubscription: true, currentPeriodEnd: "2026-12-19T00:00:00Z" });
    expect(parseTeamBilling({ status: "weird", seat_limit: null, members: "2" }, NOW)).toMatchObject({ status: "none", seatLimit: null, members: 2, canWork: false });
  });
});

describe("status wording", () => {
  it("summarises each status", () => {
    expect(billingSummary(billing(), NOW)).toMatchObject({ label: "Trial", detail: "10 days left." });
    expect(billingSummary(billing({ trialEndsAt: inDays(-1) }), NOW).label).toBe("Trial ended");
    expect(billingSummary(billing({ status: "active", currentPeriodEnd: "2026-12-19T00:00:00Z" }), NOW).detail).toBe("Renews Dec 19, 2026.");
    expect(billingSummary(billing({ status: "past_due" }), NOW).label).toBe("Past due");
    expect(billingSummary(billing({ status: "canceled" }), NOW).tone).toBe("red");
    expect(billingSummary(billing({ status: "comped" }), NOW).detail).toMatch(/Founder account/);
  });

  it("counts trial days up", () => {
    expect(daysLeft(inDays(0.2), NOW)).toBe(1);
    expect(daysLeft(inDays(-0.2), NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBe(0);
  });
});

describe("bannerFor", () => {
  it("stays quiet early in the trial, when active, comped or solo", () => {
    expect(bannerFor(billing(), "owner", NOW)).toBeNull();
    expect(bannerFor(billing({ status: "active" }), "owner", NOW)).toBeNull();
    expect(bannerFor(billing({ status: "comped", trialEndsAt: null }), "owner", NOW)).toBeNull();
    expect(bannerFor(null, null, NOW)).toBeNull();
  });

  it("warns when the trial ends within 3 days: actionable for the office, 'ask' for techs", () => {
    const b = billing({ trialEndsAt: inDays(2.5) });
    expect(bannerFor(b, "owner", NOW)).toEqual({ tone: "amber", text: "Your free trial ends in 3 days. Start your subscription to keep working.", action: "subscribe" });
    expect(bannerFor(b, "tech", NOW)).toMatchObject({ action: null, text: expect.stringMatching(/Ask your office/) });
    // Already subscribed during the trial: nothing to do.
    expect(bannerFor({ ...b, hasSubscription: true }, "owner", NOW)).toBeNull();
  });

  it("past due points the office at the portal", () => {
    expect(bannerFor(billing({ status: "past_due", hasSubscription: true }), "admin", NOW)).toMatchObject({ tone: "amber", action: "portal" });
  });

  it("read-only after the trial or a lapse", () => {
    expect(bannerFor(billing({ trialEndsAt: inDays(-1) }), "owner", NOW)).toMatchObject({ tone: "red", action: "subscribe", text: expect.stringMatching(/^Your free trial has ended, so jobs are read-only/) });
    expect(bannerFor(billing({ status: "canceled", hasSubscription: true }), "owner", NOW)).toMatchObject({ action: "subscribe" });
    expect(bannerFor(billing({ status: "unpaid", hasSubscription: true }), "admin", NOW)).toMatchObject({ action: "portal" });
    expect(bannerFor(billing({ status: "unpaid", hasSubscription: true }), "tech", NOW)).toMatchObject({ tone: "red", action: null });
  });
});

describe("seats", () => {
  const plan = PLANS[0]; // 3 included
  it("extra seats and price", () => {
    expect(extraSeats(2, plan)).toBe(0);
    expect(extraSeats(5, plan)).toBe(2);
    expect(monthlyPrice(plan, paidSeats({ seatLimit: 5, members: 4 }, plan))).toBe(plan.basePrice + 2 * plan.seatPrice);
    expect(paidSeats({ seatLimit: null, members: 1 }, plan)).toBe(3);
  });

  it("add / release / fit", () => {
    expect(seatTarget("add", { members: 3, seatLimit: 3 }, plan)).toBe(4);
    expect(seatTarget("add", { members: 2, seatLimit: null }, plan)).toBe(4);
    expect(seatTarget("release", { members: 4, seatLimit: 5 }, plan)).toBe(4);
    expect(seatTarget("release", { members: 3, seatLimit: 3 }, plan)).toBe(3); // never below what's included
    expect(seatTarget("release", { members: 5, seatLimit: 5 }, plan)).toBe(5); // never below the people on the team
    expect(seatTarget("fit", { members: 4, seatLimit: 7 }, plan)).toBe(4);
    expect(seatTarget("fit", { members: 1, seatLimit: 7 }, plan)).toBe(3);
  });
});

describe("Stripe → team", () => {
  const SEAT = "price_seat";
  const sub = {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    trial_end: null,
    metadata: { team_id: "t1" },
    items: {
      data: [
        { id: "si_base", quantity: 1, price: { id: "price_base" }, current_period_end: 1_800_000_000 },
        { id: "si_seat", quantity: 2, price: { id: SEAT }, current_period_end: 1_800_000_000 },
      ],
    },
  };

  it("maps statuses", () => {
    expect(planStatusFromStripe("active")).toBe("active");
    expect(planStatusFromStripe("incomplete_expired")).toBe("canceled");
    expect(planStatusFromStripe("paused")).toBe("unpaid");
    expect(planStatusFromStripe(undefined)).toBe("incomplete");
  });

  it("builds the team update (period end from the items, seats = included + seat quantity)", () => {
    expect(teamPatchFromSubscription(sub, { seatPriceId: SEAT })).toEqual({
      plan_status: "active",
      stripe_subscription_id: "sub_1",
      stripe_customer_id: "cus_1",
      current_period_end: new Date(1_800_000_000_000).toISOString(),
      seat_limit: PLANS[0].includedSeats + 2,
    });
    const noSeats = { ...sub, items: { data: [sub.items.data[0]] }, current_period_end: 1_700_000_000 };
    expect(teamPatchFromSubscription(noSeats, { seatPriceId: SEAT })).toMatchObject({ seat_limit: PLANS[0].includedSeats, current_period_end: new Date(1_700_000_000_000).toISOString() });
    const trial = { ...sub, status: "trialing", trial_end: 1_790_000_000, customer: { id: "cus_2" } };
    expect(teamPatchFromSubscription(trial, { seatPriceId: SEAT })).toMatchObject({ plan_status: "trialing", trial_ends_at: new Date(1_790_000_000_000).toISOString(), stripe_customer_id: "cus_2" });
  });

  it("never touches comped teams or lets an old subscription's end override a new one", () => {
    expect(shouldApplySubscription({ plan_status: "comped", stripe_subscription_id: null }, sub)).toBe(false);
    expect(shouldApplySubscription({ plan_status: "trialing", stripe_subscription_id: null }, sub)).toBe(true);
    expect(shouldApplySubscription({ plan_status: "active", stripe_subscription_id: "sub_1" }, { ...sub, status: "canceled" })).toBe(true);
    expect(shouldApplySubscription({ plan_status: "active", stripe_subscription_id: "sub_2" }, { ...sub, status: "canceled" })).toBe(false);
    expect(shouldApplySubscription({ plan_status: "canceled", stripe_subscription_id: "sub_0" }, sub)).toBe(true);
  });

  it("finds the subscription in each event", () => {
    expect(subscriptionIdFromEvent("customer.subscription.updated", { id: "sub_1" })).toBe("sub_1");
    expect(subscriptionIdFromEvent("checkout.session.completed", { mode: "subscription", subscription: "sub_1" })).toBe("sub_1");
    expect(subscriptionIdFromEvent("checkout.session.completed", { mode: "payment", subscription: null })).toBeNull();
    expect(subscriptionIdFromEvent("invoice.paid", { subscription: { id: "sub_1" } })).toBe("sub_1");
    expect(subscriptionIdFromEvent("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_9" } } })).toBe("sub_9");
    expect(subscriptionIdFromEvent("invoice.paid", {})).toBeNull();
  });

  it("carries the trial over to checkout only when it's more than 48 h away", () => {
    expect(checkoutTrialEnd({ plan_status: "trialing", trial_ends_at: inDays(10) }, NOW)).toBe(Math.floor(new Date(inDays(10)).getTime() / 1000));
    expect(checkoutTrialEnd({ plan_status: "trialing", trial_ends_at: inDays(1.5) }, NOW)).toBeUndefined();
    expect(checkoutTrialEnd({ plan_status: "canceled", trial_ends_at: inDays(10) }, NOW)).toBeUndefined();
  });

  it("spots the database's read-only refusal", () => {
    expect(isSubscriptionInactive("projects: PinPlan subscription inactive")).toBe(true);
    expect(isSubscriptionInactive({ message: "PinPlan subscription inactive" })).toBe(true);
    expect(isSubscriptionInactive("new row violates row-level security policy")).toBe(false);
  });
});
