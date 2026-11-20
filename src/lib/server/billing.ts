// Stripe billing on the server: configuration, the Stripe client, team lookups and the team-row writes (service role).
// Never import from client components: it reads STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY.
import { createHash, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import {
  customerId,
  daysLeft,
  extraSeats,
  grantsAccess,
  hasBasePrice,
  isDuplicateSubscription,
  seatItem,
  seatsToFit,
  shouldApplySubscription,
  teamPatchFromSubscription,
  type SubscriptionLike,
  type TeamBillingPatch,
} from "@/lib/billingLogic";
import { paymentFailedEmail, trialEndingEmail } from "@/lib/emailTemplates";
import { PLANS } from "@/lib/plans";
import { requireUser } from "./auth";
import { emailConfigured, sendEmail } from "./email";
import { durableRateLimit, tooManyRequests, waitText, type RateLimitRule } from "./rateLimit";
import { reportServerError } from "./serverErrors";

export interface BillingConfig {
  secretKey: string;
  webhookSecret: string;
  priceBase: string;
  priceSeat: string;
  supabaseUrl: string;
  serviceKey: string;
}

/** The billing settings, or the names of the ones missing (billing then answers 501 and the app works without it). */
export function billingConfig(): { ok: true; config: BillingConfig } | { ok: false; missing: string[] } {
  const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_BASE: process.env.STRIPE_PRICE_BASE,
    STRIPE_PRICE_SEAT: process.env.STRIPE_PRICE_SEAT,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      secretKey: env.STRIPE_SECRET_KEY!,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET!,
      priceBase: env.STRIPE_PRICE_BASE!,
      priceSeat: env.STRIPE_PRICE_SEAT!,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, ""),
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    },
  };
}

export const jsonError = (error: string, code: string, status: number) => Response.json({ error, code }, { status });

/** Per-team limits on the billing routes (each call reaches Stripe). Counted in the shared store (rateLimit.ts). */
export const BILLING_LIMITS = {
  check: { limit: 5, windowMs: 60 * 60_000 },
  checkout: { limit: 10, windowMs: 10 * 60_000 },
  portal: { limit: 10, windowMs: 10 * 60_000 },
  syncSeats: { limit: 20, windowMs: 60 * 60_000 },
} satisfies Record<string, RateLimitRule>;

/** A 429 when `who` (a team id, or an admin for the price check) is over the route's limit, else null. */
export async function limitBilling(route: string, who: string, rule: RateLimitRule): Promise<Response | null> {
  const r = await durableRateLimit(`billing-${route}:${who}`, rule);
  return r.ok ? null : tooManyRequests(r, `Too many billing requests. Try again in ${waitText(r.retryAfter)}.`);
}

/** 501: billing isn't set up on this server (names the missing settings, never their values). */
export function notConfigured(missing: string[]) {
  return Response.json(
    { error: "Billing isn't set up on this server. See “Billing (Stripe)” in SETUP.md.", code: "billing_not_configured", missing },
    { status: 501 },
  );
}

/**
 * A Stripe (or database) call failed: log the details on the server, answer with a fixed message and a code.
 * Stripe's own messages never reach the browser (they can name internal IDs or settings).
 */
export function billingFailure(where: string, e: unknown, message = "Billing is unavailable right now. Try again in a minute."): Response {
  const err = e as { type?: string; code?: string; statusCode?: number; requestId?: string; message?: string } | null;
  const stripe = typeof err?.type === "string" && err.type.startsWith("Stripe");
  console.error(`[billing] ${where} failed:`, stripe ? `${err!.type} ${err!.code ?? ""} ${err!.statusCode ?? ""} ${err!.requestId ?? ""}`.trim() : "", err?.message ?? String(e));
  return jsonError(message, stripe ? "stripe_error" : "billing_error", 502);
}

let client: { key: string; stripe: Stripe } | null = null;
export function getStripe(cfg: BillingConfig): Stripe {
  if (client?.key !== cfg.secretKey) client = { key: cfg.secretKey, stripe: new Stripe(cfg.secretKey, { maxNetworkRetries: 2, appInfo: { name: "Northpin" } }) };
  return client.stripe;
}

/** Checks the Stripe-Signature header against the raw body (HMAC-SHA256, 5-minute tolerance). Throws when it doesn't match. */
export function verifyWebhook(rawBody: string, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// ---------- Supabase with the service role ----------

async function rest(cfg: BillingConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", cfg.serviceKey);
  headers.set("Authorization", `Bearer ${cfg.serviceKey}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
}

export interface TeamRow {
  id: string;
  name: string;
  owner_id: string;
  plan_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  seat_limit: number | null;
  billing_email: string | null;
}
const TEAM_COLS = "id,name,owner_id,plan_status,trial_ends_at,current_period_end,stripe_customer_id,stripe_subscription_id,seat_limit,billing_email";

async function rows<T>(r: Response, what: string): Promise<T[]> {
  if (r.status === 404) throw new Error(`The cloud database needs the billing update (${what}): run supabase/migrations/20261121000000_billing.sql.`);
  if (!r.ok) throw new Error(`Couldn't read ${what} (${r.status}).`);
  return (await r.json()) as T[];
}

export async function teamById(cfg: BillingConfig, id: string): Promise<TeamRow | null> {
  return (await rows<TeamRow>(await rest(cfg, `teams?id=eq.${encodeURIComponent(id)}&select=${TEAM_COLS}`), "the team"))[0] ?? null;
}
export async function teamByCustomer(cfg: BillingConfig, customer: string): Promise<TeamRow | null> {
  return (await rows<TeamRow>(await rest(cfg, `teams?stripe_customer_id=eq.${encodeURIComponent(customer)}&select=${TEAM_COLS}`), "the team"))[0] ?? null;
}
export async function memberCount(cfg: BillingConfig, teamId: string): Promise<number> {
  return (await rows<{ user_id: string }>(await rest(cfg, `team_members?team_id=eq.${encodeURIComponent(teamId)}&select=user_id`), "the team members")).length;
}

/** The columns the server writes so each billing email goes out once (20261124100200_billing_policy.sql). */
export interface TeamEmailMarks {
  trial_reminder_3d_at?: string | null;
  trial_reminder_1d_at?: string | null;
  payment_failed_invoice_id?: string | null;
}

/** Writes billing columns on a team. `onlyIf` adds PostgREST filters (e.g. `stripe_customer_id=is.null`). Returns the rows changed. */
export async function patchTeam(cfg: BillingConfig, id: string, patch: Partial<TeamBillingPatch> & TeamEmailMarks & { billing_email?: string | null }, onlyIf = ""): Promise<number> {
  const r = await rest(cfg, `teams?id=eq.${encodeURIComponent(id)}${onlyIf ? `&${onlyIf}` : ""}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return (await rows<{ id: string }>(r, "the team")).length;
}

// ---------- who's asking ----------

export interface OfficeCaller {
  userId: string;
  email: string | null;
  role: "owner" | "admin";
  team: TeamRow;
  members: number;
}

/** The signed-in owner or admin of a team (checked with their Supabase token, then read with the service role). */
export async function requireTeamOffice(request: Request, cfg: BillingConfig): Promise<{ ok: true; caller: OfficeCaller } | { ok: false; response: Response }> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth;
  if (!auth.userId) return { ok: false, response: jsonError("Sign in to manage billing.", "sign_in_required", 401) };
  const me = await rows<{ team_id: string; role: string; email: string | null }>(
    await rest(cfg, `team_members?user_id=eq.${encodeURIComponent(auth.userId)}&select=team_id,role,email`),
    "your team",
  );
  if (!me[0]) return { ok: false, response: jsonError("Start a team for your company first (Settings → Team).", "no_team", 400) };
  if (me[0].role !== "owner" && me[0].role !== "admin")
    return { ok: false, response: jsonError("Billing is handled by the owner or an admin. Ask your office.", "office_only", 403) };
  const team = await teamById(cfg, me[0].team_id);
  if (!team) return { ok: false, response: jsonError("Your team wasn't found.", "no_team", 400) };
  return { ok: true, caller: { userId: auth.userId, email: me[0].email, role: me[0].role, team, members: await memberCount(cfg, team.id) } };
}

/**
 * The app's address for Stripe's return links and for links in emails: PINPLAN_APP_URL when set. Forwarded host
 * headers are never trusted (anyone can send them). In production without PINPLAN_APP_URL there is no safe answer:
 * null (callers answer with `originMissing()`); in development, the request's own origin.
 */
export function originOf(request: Request): string | null {
  const configured = process.env.PINPLAN_APP_URL?.trim();
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* not a URL: treated as unset */
    }
  }
  if (process.env.NODE_ENV === "production") return null;
  return new URL(request.url).origin;
}

/** 501: PINPLAN_APP_URL is needed (production). */
export function originMissing(): Response {
  return Response.json(
    { error: "Billing needs the app's address on this server: set PINPLAN_APP_URL (e.g. https://app.example.com). See SETUP.md.", code: "app_url_missing", missing: ["PINPLAN_APP_URL"] },
    { status: 501 },
  );
}

// ---------- subscription → team ----------

/** The team a subscription belongs to: its team_id metadata (or the hint), else its customer. */
export async function teamForSubscription(cfg: BillingConfig, sub: SubscriptionLike, teamHint?: string | null): Promise<TeamRow | null> {
  const teamId = sub.metadata?.team_id || teamHint || null;
  let team = teamId ? await teamById(cfg, teamId) : null;
  const cust = customerId(sub.customer);
  if (!team && cust) team = await teamByCustomer(cfg, cust);
  return team;
}

/**
 * Copies a subscription onto its team (found by the subscription's team_id metadata, else by customer).
 * Returns what happened, for logging and tests. Safe to repeat: it writes the subscription's current state.
 * With `stripe`: a second live subscription for a team that already has one (two checkouts finished) is canceled
 * instead of replacing the first ("duplicate_canceled").
 */
export async function applySubscription(
  cfg: BillingConfig,
  sub: SubscriptionLike,
  teamHint?: string | null,
  stripe?: Stripe,
): Promise<"updated" | "skipped" | "no_team" | "duplicate_canceled" | "missing_base_price"> {
  const team = await teamForSubscription(cfg, sub, teamHint);
  if (!team) return "no_team";
  if (!shouldApplySubscription(team, sub)) return "skipped";
  if (stripe && team.stripe_subscription_id && team.stripe_subscription_id !== sub.id) {
    const current = await stripe.subscriptions.retrieve(team.stripe_subscription_id).catch((e: { statusCode?: number }) => {
      if (e?.statusCode === 404) return null; // gone: the new one replaces it
      throw e;
    });
    if (isDuplicateSubscription(team, sub, current ? { id: current.id, status: current.status } : null)) {
      console.error(`[billing] team ${team.id} already has subscription ${team.stripe_subscription_id}; canceling the duplicate ${sub.id}. Refund it in Stripe if it was charged.`);
      await stripe.subscriptions.cancel(sub.id, {}, { idempotencyKey: `pinplan-cancel-duplicate-${sub.id}` });
      return "duplicate_canceled";
    }
  }
  const patch = teamPatchFromSubscription(sub, { seatPriceId: cfg.priceSeat });
  // A subscription that doesn't pay for the base plan (made by hand in Stripe, another product, a cheaper price) never
  // unlocks the app: the team isn't marked active and the owner of the server is told.
  if (grantsAccess(patch.plan_status) && !hasBasePrice(sub, cfg.priceBase)) {
    await reportServerError(new Error(`Subscription ${sub.id} has no item with the base price (STRIPE_PRICE_BASE); team ${team.id} was not marked ${patch.plan_status}.`), {
      where: "billing applySubscription",
      extra: { subscription: sub.id, team: team.id, status: sub.status },
    });
    return "missing_base_price";
  }
  if (!patch.stripe_customer_id) delete (patch as Partial<TeamBillingPatch>).stripe_customer_id;
  // Another team already owns this customer (shouldn't happen): don't steal it, but still record the subscription.
  if (team.stripe_customer_id && patch.stripe_customer_id && team.stripe_customer_id !== patch.stripe_customer_id) patch.stripe_customer_id = team.stripe_customer_id;
  // The team may have turned comped meanwhile: the filter keeps it that way.
  await patchTeam(cfg, team.id, patch, "plan_status=neq.comped");
  // More people than paid seats (joined during the trial, or seats lowered in Stripe): raise the seats to fit, with
  // prorations. setSeats applies the result again without `stripe`, so this never loops.
  if (stripe) {
    const target = seatsToFit(patch.plan_status, await memberCount(cfg, team.id), patch.seat_limit);
    if (target != null) await setSeats(cfg, stripe, sub, team.id, target);
  }
  return "updated";
}

// ---------- seats ----------

/**
 * Sets the subscription's seat item to `target` seats in all (the base price includes some), with prorations, and
 * writes the new limit on the team straight away (the webhook confirms it). Returns the subscription as it is now.
 */
export async function setSeats(cfg: BillingConfig, stripe: Stripe, sub: SubscriptionLike, teamId: string, target: number): Promise<SubscriptionLike> {
  const extra = extraSeats(target);
  const item = seatItem(sub, cfg.priceSeat);
  let latest = sub;
  if ((item?.quantity ?? 0) !== extra) {
    const items = item ? [extra > 0 ? { id: item.id, quantity: extra } : { id: item.id, deleted: true }] : [{ price: cfg.priceSeat, quantity: extra }];
    latest = (await stripe.subscriptions.update(sub.id, { items, proration_behavior: "create_prorations" })) as unknown as SubscriptionLike;
  }
  await applySubscription(cfg, latest, teamId);
  return latest;
}

// ---------- billing emails (each sent once) ----------

/** Who gets billing emails: the billing email, else the owner's. */
export async function billingContact(cfg: BillingConfig, team: TeamRow): Promise<{ email: string; name: string | null } | null> {
  const owner = (
    await rows<{ email: string | null; name: string | null }>(
      await rest(cfg, `team_members?team_id=eq.${encodeURIComponent(team.id)}&user_id=eq.${encodeURIComponent(team.owner_id)}&select=email,name`),
      "the team owner",
    )
  )[0];
  const email = team.billing_email || owner?.email || null;
  return email ? { email, name: owner?.name || null } : null;
}

export interface InvoiceLike {
  id?: string | null;
  amount_due?: number | null;
  currency?: string | null;
  next_payment_attempt?: number | null;
}

/**
 * "Your payment didn't go through", once per invoice: the invoice id is claimed on the team row first, so repeated
 * or concurrent webhooks send one email. Never throws (an email problem must not make Stripe retry the event).
 */
export async function notifyPaymentFailed(cfg: BillingConfig, team: TeamRow, invoice: InvoiceLike, appUrl: string | null): Promise<"sent" | "already_sent" | "skipped" | "failed"> {
  try {
    if (!invoice.id || !appUrl || !emailConfigured()) return "skipped";
    const inv = encodeURIComponent(invoice.id);
    const claimed = await patchTeam(cfg, team.id, { payment_failed_invoice_id: invoice.id }, `or=(payment_failed_invoice_id.is.null,payment_failed_invoice_id.neq.${inv})`);
    if (!claimed) return "already_sent";
    const to = await billingContact(cfg, team);
    if (!to) return "skipped";
    const content = paymentFailedEmail({
      name: to.name,
      companyName: team.name,
      amount: typeof invoice.amount_due === "number" ? invoice.amount_due / 100 : null,
      currency: (invoice.currency || "usd").toUpperCase(),
      nextAttemptAt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString() : null,
      billingUrl: `${appUrl}/settings#billing`,
    });
    const sent = await sendEmail({ to: to.email, ...content, idempotencyKey: `pinplan-payment-failed-${invoice.id}`, tags: { kind: "payment_failed" } });
    if (sent.ok) return "sent";
    console.warn(`[billing] payment failed email for team ${team.id} not sent: ${sent.code}`);
    // Let a later retry of the event try again.
    await patchTeam(cfg, team.id, { payment_failed_invoice_id: null }, `payment_failed_invoice_id=eq.${inv}`).catch(() => 0);
    return "failed";
  } catch (e) {
    console.warn(`[billing] payment failed email for team ${team.id} not sent:`, (e as Error)?.message);
    return "failed";
  }
}

/** A trialing team without a subscription, with the columns the reminders use. */
export interface TrialTeam extends TeamRow {
  trial_reminder_3d_at: string | null;
  trial_reminder_1d_at: string | null;
}

/** Is billing enforced (billing_settings.enforce)? Reminders say jobs turn read-only, so they only go out when it is. */
export async function billingEnforced(cfg: BillingConfig): Promise<boolean> {
  const r = await rows<{ enforce: boolean }>(await rest(cfg, "billing_settings?select=enforce"), "the billing settings");
  return r[0]?.enforce === true;
}

/** Teams whose trial ends within 3 days, with no subscription and a reminder still to send. */
export async function teamsNeedingTrialReminder(cfg: BillingConfig, now = new Date()): Promise<TrialTeam[]> {
  const in3 = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const q = [
    "plan_status=eq.trialing",
    "stripe_subscription_id=is.null",
    `trial_ends_at=gt.${encodeURIComponent(now.toISOString())}`,
    `trial_ends_at=lte.${encodeURIComponent(in3)}`,
    "or=(trial_reminder_3d_at.is.null,trial_reminder_1d_at.is.null)",
    `select=${TEAM_COLS},trial_reminder_3d_at,trial_reminder_1d_at`,
    "order=trial_ends_at.asc",
    "limit=500",
  ].join("&");
  return rows<TrialTeam>(await rest(cfg, `teams?${q}`), "the teams on trial");
}

/**
 * Sends the trial reminder a team is due (3 days left, or 1 day left), once: the column is claimed first. The 1-day
 * reminder also marks the 3-day one, so a team that starts late never gets both on one day.
 */
export async function sendTrialReminder(cfg: BillingConfig, team: TrialTeam, appUrl: string, now = new Date()): Promise<"sent" | "not_due" | "already_sent" | "skipped" | "failed"> {
  if (!team.trial_ends_at) return "not_due";
  const ms = new Date(team.trial_ends_at).getTime() - now.getTime();
  if (ms <= 0 || ms > 3 * 86_400_000) return "not_due";
  const oneDay = ms <= 86_400_000;
  const col = oneDay ? "trial_reminder_1d_at" : "trial_reminder_3d_at";
  if (team[col]) return "already_sent";
  const stamp = now.toISOString();
  const marks: TeamEmailMarks = oneDay ? { trial_reminder_1d_at: stamp, ...(team.trial_reminder_3d_at ? {} : { trial_reminder_3d_at: stamp }) } : { trial_reminder_3d_at: stamp };
  try {
    const claimed = await patchTeam(cfg, team.id, marks, `${col}=is.null&stripe_subscription_id=is.null`);
    if (!claimed) return "already_sent";
    const to = await billingContact(cfg, team);
    if (!to) return "skipped";
    const content = trialEndingEmail({
      name: to.name,
      companyName: team.name,
      daysLeft: daysLeft(team.trial_ends_at, now),
      endsAt: team.trial_ends_at,
      planName: PLANS[0].name,
      billingUrl: `${appUrl}/settings#billing`,
    });
    const sent = await sendEmail({ to: to.email, ...content, idempotencyKey: `pinplan-trial-${oneDay ? "1d" : "3d"}-${team.id}`, tags: { kind: oneDay ? "trial_1d" : "trial_3d" } });
    if (sent.ok) return "sent";
    console.warn(`[billing] trial reminder for team ${team.id} not sent: ${sent.code}`);
    const undo: TeamEmailMarks = Object.fromEntries(Object.keys(marks).map((k) => [k, null]));
    await patchTeam(cfg, team.id, undo, `${col}=eq.${encodeURIComponent(stamp)}`).catch(() => 0);
    return "failed";
  } catch (e) {
    console.warn(`[billing] trial reminder for team ${team.id} not sent:`, (e as Error)?.message);
    return "failed";
  }
}

// ---------- scheduled jobs ----------

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Null when allowed, else the response to send. */
export function requireCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonError("Scheduled jobs aren't set up on this server (CRON_SECRET).", "cron_not_configured", 501);
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const h = (v: string) => createHash("sha256").update(v).digest();
  if (!given || !timingSafeEqual(h(given), h(secret))) return jsonError("Not allowed.", "unauthorized", 401);
  return null;
}
