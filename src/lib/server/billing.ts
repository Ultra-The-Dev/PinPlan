// Stripe billing on the server: configuration, the Stripe client, team lookups and the team-row writes (service role).
// Never import from client components: it reads STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY.
import Stripe from "stripe";
import { customerId, shouldApplySubscription, teamPatchFromSubscription, type SubscriptionLike, type TeamBillingPatch } from "@/lib/billingLogic";
import { requireUser } from "./auth";

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

/** 501: billing isn't set up on this server (names the missing settings, never their values). */
export function notConfigured(missing: string[]) {
  return Response.json(
    { error: "Billing isn't set up on this server. See “Billing (Stripe)” in SETUP.md.", code: "billing_not_configured", missing },
    { status: 501 },
  );
}

let client: { key: string; stripe: Stripe } | null = null;
export function getStripe(cfg: BillingConfig): Stripe {
  if (client?.key !== cfg.secretKey) client = { key: cfg.secretKey, stripe: new Stripe(cfg.secretKey, { maxNetworkRetries: 2, appInfo: { name: "PinPlan" } }) };
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

/** Writes billing columns on a team. `onlyIf` adds PostgREST filters (e.g. `stripe_customer_id=is.null`). Returns the rows changed. */
export async function patchTeam(cfg: BillingConfig, id: string, patch: Partial<TeamBillingPatch> & { billing_email?: string | null }, onlyIf = ""): Promise<number> {
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

/** The origin to send people back to (the request's own). */
export function originOf(request: Request): string {
  const u = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? u.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? u.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

// ---------- subscription → team ----------

/**
 * Copies a subscription onto its team (found by the subscription's team_id metadata, else by customer).
 * Returns what happened, for logging and tests. Safe to repeat: it writes the subscription's current state.
 */
export async function applySubscription(cfg: BillingConfig, sub: SubscriptionLike, teamHint?: string | null): Promise<"updated" | "skipped" | "no_team"> {
  const teamId = sub.metadata?.team_id || teamHint || null;
  let team = teamId ? await teamById(cfg, teamId) : null;
  const cust = customerId(sub.customer);
  if (!team && cust) team = await teamByCustomer(cfg, cust);
  if (!team) return "no_team";
  if (!shouldApplySubscription(team, sub)) return "skipped";
  const patch = teamPatchFromSubscription(sub, { seatPriceId: cfg.priceSeat });
  if (!patch.stripe_customer_id) delete (patch as Partial<TeamBillingPatch>).stripe_customer_id;
  // Another team already owns this customer (shouldn't happen): don't steal it, but still record the subscription.
  if (team.stripe_customer_id && patch.stripe_customer_id && team.stripe_customer_id !== patch.stripe_customer_id) patch.stripe_customer_id = team.stripe_customer_id;
  // The team may have turned comped meanwhile: the filter keeps it that way.
  await patchTeam(cfg, team.id, patch, "plan_status=neq.comped");
  return "updated";
}
