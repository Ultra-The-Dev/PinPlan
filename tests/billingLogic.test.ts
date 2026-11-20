import { describe, expect, it } from "vitest";
import {
  bannerFor,
  billingAllowsWork,
  billingSummary,
  canAddSeat,
  canWork,
  grantsAccess,
  hasBasePrice,
  seatsToFit,
  checkoutTrialEnd,
  daysLeft,
  extraSeats,
  isDuplicateSubscription,
  isSubscriptionInactive,
  paidSeats,
  parseSoloBilling,
  parseTeamBilling,
  planStatusFromStripe,
  priceMismatches,
  seatTarget,
  shouldApplySubscription,
  soloAllowsWork,
  soloBannerFor,
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
    expect(planAllowsWork("unpaid", inDays(5), NOW)).toBe(false);
  });

  it("canceled or incomplete keep working while the team's own trial runs", () => {
    expect(planAllowsWork("canceled", inDays(5), NOW)).toBe(true);
    expect(planAllowsWork("canceled", inDays(-1), NOW)).toBe(false);
    expect(planAllowsWork("canceled", null, NOW)).toBe(false);
    expect(planAllowsWork("incomplete", inDays(-1), NOW)).toBe(false);
  });

  it("enforce=false: an unpaid trial never locks, a lapsed subscription still does", () => {
    for (const s of ["trialing", "incomplete", "none"] as const) expect(planAllowsWork(s, inDays(-3), NOW, false)).toBe(true);
    expect(planAllowsWork(null, null, NOW, false)).toBe(true);
    expect(planAllowsWork("canceled", inDays(-3), NOW, false)).toBe(false);
    expect(planAllowsWork("unpaid", null, NOW, false)).toBe(false);
    // Enforced is the default.
    expect(planAllowsWork("trialing", inDays(-3), NOW)).toBe(false);
  });
});

describe("solo (no company team)", () => {
  it("reads solo_billing()", () => {
    expect(parseSoloBilling(null)).toBeNull();
    expect(parseSoloBilling({ trial_ends_at: inDays(3), can_work: true, enforce: true })).toEqual({ trialEndsAt: inDays(3), enforce: true });
    expect(parseSoloBilling({ trial_ends_at: null })).toEqual({ trialEndsAt: null, enforce: true });
    expect(parseSoloBilling({ trial_ends_at: inDays(-3), enforce: false })).toEqual({ trialEndsAt: inDays(-3), enforce: false });
  });

  it("personal trial: works until it ends; no deadline (pre-launch) or not enforced never locks", () => {
    expect(soloAllowsWork({ trialEndsAt: inDays(2), enforce: true }, NOW)).toBe(true);
    expect(soloAllowsWork({ trialEndsAt: inDays(-1), enforce: true }, NOW)).toBe(false);
    expect(soloAllowsWork({ trialEndsAt: null, enforce: true }, NOW)).toBe(true);
    expect(soloAllowsWork({ trialEndsAt: inDays(-1), enforce: false }, NOW)).toBe(true);
    expect(soloAllowsWork(null, NOW)).toBe(true);
  });

  it("canWork: never locks before loading or signed out; the team decides when on one; else the personal trial", () => {
    const lapsed = { trialEndsAt: inDays(-1), enforce: true };
    expect(canWork({ ready: false, userId: "u", onTeam: false, billing: null, solo: lapsed }, NOW)).toBe(true);
    expect(canWork({ ready: true, userId: null, onTeam: false, billing: null, solo: lapsed }, NOW)).toBe(true);
    expect(canWork({ ready: true, userId: "u", onTeam: false, billing: null, solo: undefined }, NOW)).toBe(true); // not loaded yet
    expect(canWork({ ready: true, userId: "u", onTeam: false, billing: null, solo: lapsed }, NOW)).toBe(false);
    expect(canWork({ ready: true, userId: "u", onTeam: true, billing: billing(), solo: lapsed }, NOW)).toBe(true);
    expect(canWork({ ready: true, userId: "u", onTeam: true, billing: billing({ status: "unpaid" }), solo: null }, NOW)).toBe(false);
    expect(canWork({ ready: true, userId: "u", onTeam: true, billing: null, solo: null }, NOW)).toBe(true); // no billing in the database
  });

  it("banner for the personal trial", () => {
    expect(soloBannerFor({ trialEndsAt: inDays(10), enforce: true }, NOW)).toBeNull();
    expect(soloBannerFor({ trialEndsAt: null, enforce: true }, NOW)).toBeNull();
    expect(soloBannerFor({ trialEndsAt: inDays(-1), enforce: false }, NOW)).toBeNull();
    expect(soloBannerFor({ trialEndsAt: inDays(2.5), enforce: true }, NOW)).toEqual({ tone: "amber", text: "Your free trial ends in 3 days. Start a company team to keep working.", action: "team" });
    expect(soloBannerFor({ trialEndsAt: inDays(-1), enforce: true }, NOW)).toMatchObject({ tone: "red", action: "team", text: expect.stringMatching(/^Your free trial has ended, so jobs are read-only/) });
  });
});

describe("parseTeamBilling", () => {
  it("reads team_billing() and tolerates junk", () => {
    expect(parseTeamBilling(null)).toBeNull();
    const b = parseTeamBilling({ status: "active", trial_ends_at: null, current_period_end: "2026-12-19T00:00:00Z", seat_limit: 4, members: 3, can_work: true, has_subscription: true }, NOW)!;
    expect(b).toMatchObject({ status: "active", seatLimit: 4, members: 3, canWork: true, hasSubscription: true, currentPeriodEnd: "2026-12-19T00:00:00Z" });
    expect(parseTeamBilling({ status: "weird", seat_limit: null, members: "2" }, NOW)).toMatchObject({ status: "none", seatLimit: null, members: 2, canWork: false });
  });

  it("reads cancel_at and enforce (missing enforce: an older database, always enforced)", () => {
    expect(parseTeamBilling({ status: "active", cancel_at: "2026-12-01T00:00:00Z", enforce: false }, NOW)).toMatchObject({ cancelAt: "2026-12-01T00:00:00Z", enforce: false });
    expect(parseTeamBilling({ status: "active" }, NOW)).toMatchObject({ cancelAt: null, enforce: true });
    expect(parseTeamBilling({ status: "trialing", trial_ends_at: inDays(-1), enforce: false }, NOW)!.canWork).toBe(true);
  });

  it("billingAllowsWork follows enforce", () => {
    expect(billingAllowsWork(billing({ trialEndsAt: inDays(-1) }), NOW)).toBe(false);
    expect(billingAllowsWork(billing({ trialEndsAt: inDays(-1), enforce: false }), NOW)).toBe(true);
    expect(billingAllowsWork(billing({ status: "canceled", trialEndsAt: inDays(2) }), NOW)).toBe(true);
  });
});

describe("status wording", () => {
  it("summarises each status", () => {
    expect(billingSummary(billing(), NOW)).toMatchObject({ label: "Trial", detail: "10 days left." });
    expect(billingSummary(billing({ trialEndsAt: inDays(-1) }), NOW).label).toBe("Trial ended");
    expect(billingSummary(billing({ status: "active", currentPeriodEnd: "2026-12-19T00:00:00Z" }), NOW).detail).toBe("Renews Dec 19, 2026.");
    expect(billingSummary(billing({ status: "past_due" }), NOW).label).toBe("Past due");
    expect(billingSummary(billing({ status: "canceled", trialEndsAt: inDays(-1) }), NOW).tone).toBe("red");
    expect(billingSummary(billing({ status: "comped" }), NOW).detail).toMatch(/Founder account/);
  });

  it("says when a canceled or ending subscription turns read-only", () => {
    expect(billingSummary(billing({ status: "active", cancelAt: "2026-12-01T00:00:00Z", currentPeriodEnd: "2026-12-01T00:00:00Z" }), NOW)).toEqual({
      label: "Ending",
      detail: "Ends Dec 1, 2026: jobs turn read-only after that.",
      tone: "amber",
    });
    expect(billingSummary(billing({ status: "canceled", trialEndsAt: "2026-11-25T00:00:00Z" }), NOW)).toMatchObject({ label: "Canceled", detail: "Ends Nov 25, 2026: jobs turn read-only after that." });
    // A past cancel_at is ignored.
    expect(billingSummary(billing({ status: "active", cancelAt: inDays(-1) }), NOW).label).toBe("Active");
  });

  it("an expired trial while billing isn't enforced says nothing is locked", () => {
    expect(billingSummary(billing({ trialEndsAt: inDays(-1), enforce: false }), NOW)).toMatchObject({ label: "Trial ended", tone: "slate" });
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
    // Billing not enforced yet: the trial ending changes nothing.
    expect(bannerFor({ ...b, enforce: false }, "owner", NOW)).toBeNull();
    expect(bannerFor(billing({ trialEndsAt: inDays(-1), enforce: false }), "owner", NOW)).toBeNull();
  });

  it("canceled during the trial, or a cancellation within a week", () => {
    expect(bannerFor(billing({ status: "canceled", trialEndsAt: "2026-11-25T00:00:00Z", hasSubscription: true }), "owner", NOW)).toEqual({
      tone: "amber",
      text: "Your subscription was canceled. Ends Nov 25, 2026: jobs turn read-only after that. Start a subscription to keep working.",
      action: "subscribe",
    });
    expect(bannerFor(billing({ status: "active", hasSubscription: true, cancelAt: "2026-11-23T00:00:00Z" }), "admin", NOW)).toMatchObject({
      action: "portal",
      text: "Your subscription ends Nov 23, 2026: jobs turn read-only after that. Renew it in billing to keep working.",
    });
    expect(bannerFor(billing({ status: "active", hasSubscription: true, cancelAt: inDays(20) }), "admin", NOW)).toBeNull();
  });

  it("past due points the office at the portal", () => {
    expect(bannerFor(billing({ status: "past_due", hasSubscription: true }), "admin", NOW)).toMatchObject({ tone: "amber", action: "portal" });
  });

  it("read-only after the trial or a lapse", () => {
    expect(bannerFor(billing({ trialEndsAt: inDays(-1) }), "owner", NOW)).toMatchObject({ tone: "red", action: "subscribe", text: expect.stringMatching(/^Your free trial has ended, so jobs are read-only/) });
    expect(bannerFor(billing({ status: "canceled", hasSubscription: true, trialEndsAt: inDays(-1) }), "owner", NOW)).toMatchObject({ tone: "red", action: "subscribe" });
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
      cancel_at: null,
    });
    expect(teamPatchFromSubscription({ ...sub, cancel_at: 1_790_000_000 }, { seatPriceId: SEAT }).cancel_at).toBe(new Date(1_790_000_000_000).toISOString());
    // Older API versions: only "cancel at period end".
    expect(teamPatchFromSubscription({ ...sub, cancel_at_period_end: true }, { seatPriceId: SEAT }).cancel_at).toBe(new Date(1_800_000_000_000).toISOString());
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

  it("spots a second live subscription for a team", () => {
    const team = { stripe_subscription_id: "sub_old" };
    const fresh = { ...sub, id: "sub_new", status: "active" };
    expect(isDuplicateSubscription(team, fresh, { id: "sub_old", status: "active" })).toBe(true);
    expect(isDuplicateSubscription(team, fresh, { id: "sub_old", status: "trialing" })).toBe(true);
    expect(isDuplicateSubscription(team, fresh, { id: "sub_old", status: "canceled" })).toBe(false); // a resubscribe
    expect(isDuplicateSubscription(team, fresh, null)).toBe(false);
    expect(isDuplicateSubscription(team, { ...fresh, status: "canceled" }, { id: "sub_old", status: "active" })).toBe(false);
    expect(isDuplicateSubscription({ stripe_subscription_id: "sub_new" }, fresh, { id: "sub_new", status: "active" })).toBe(false);
    expect(isDuplicateSubscription({ stripe_subscription_id: null }, fresh, null)).toBe(false);
  });

  it("compares Stripe's prices with the app's", () => {
    const plan = PLANS[0];
    const ok = (cents: number) => ({ active: true, unit_amount: cents, currency: "usd", recurring: { interval: "month", interval_count: 1 } });
    expect(priceMismatches({ base: ok(plan.basePrice * 100), seat: ok(plan.seatPrice * 100) }, plan)).toEqual([]);
    const bad = priceMismatches({ base: { ...ok(plan.basePrice * 100 + 100), currency: "eur" }, seat: { ...ok(plan.seatPrice * 100), recurring: { interval: "year" }, active: false } }, plan);
    expect(bad).toHaveLength(4);
    expect(bad[0]).toMatch(/base price is .* in Stripe but/);
    expect(bad.join(" ")).toMatch(/EUR, not USD/);
    expect(bad.join(" ")).toMatch(/seat price is archived/);
    expect(bad.join(" ")).toMatch(/seat price doesn't renew monthly/);
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
    expect(isSubscriptionInactive("projects: Northpin subscription inactive")).toBe(true);
    expect(isSubscriptionInactive({ message: "Northpin subscription inactive" })).toBe(true);
    expect(isSubscriptionInactive("new row violates row-level security policy")).toBe(false);
  });
});

describe("seat and price guards", () => {
  const sub = (items: { price: string; quantity?: number }[]) => ({ id: "sub_1", status: "active", customer: "cus_1", items: { data: items.map((i, n) => ({ id: `si_${n}`, quantity: i.quantity ?? 1, price: { id: i.price } })) } });

  it("a subscription counts only with the base price", () => {
    expect(hasBasePrice(sub([{ price: "price_base" }, { price: "price_seat", quantity: 2 }]), "price_base")).toBe(true);
    expect(hasBasePrice(sub([{ price: "price_seat", quantity: 2 }]), "price_base")).toBe(false);
    expect(hasBasePrice(sub([{ price: "price_base", quantity: 0 }]), "price_base")).toBe(false);
    expect(hasBasePrice({ id: "s", status: "active", customer: null }, "price_base")).toBe(false);
    expect(["active", "trialing", "past_due"].every(grantsAccess)).toBe(true);
    expect(["canceled", "unpaid", "incomplete", "paused"].some(grantsAccess)).toBe(false);
  });

  it("refits seats only for a live subscription with more people than seats", () => {
    expect(seatsToFit("active", 7, 5)).toBe(7);
    expect(seatsToFit("trialing", 6, 5)).toBe(6);
    expect(seatsToFit("active", 5, 5)).toBeNull();
    expect(seatsToFit("past_due", 9, 5)).toBeNull();
    expect(seatsToFit("active", 9, null)).toBeNull();
  });

  it("adding a seat is refused while more than two are free", () => {
    expect(canAddSeat(5, 7)).toBe(true);
    expect(canAddSeat(5, 8)).toBe(false);
    expect(canAddSeat(5, null)).toBe(true);
  });
});
