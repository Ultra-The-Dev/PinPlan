// /api/payments/account — Settings → Quotes & invoices → Online payments (owner or admin; someone working alone).
//   GET                                   → PaymentAccountStatus ({ configured: false } when the server isn't set up)
//   POST { action: "connect" }            → { url }: Stripe's onboarding for the company's own Stripe account (made on
//                                           the first click; the same account afterwards). Stripe sends people back to
//                                           /settings?payments=return#payments.
//   POST { action: "settings", enabled?, ach? }  → PaymentAccountStatus
//   POST { action: "disconnect" }         → PaymentAccountStatus: Northpin forgets the account (the company keeps it
//                                           and its money; it can also remove Northpin in its Stripe dashboard).
// The account is a Standard-type connected account (its own full Stripe dashboard, its own fees, refunds and disputes;
// Stripe collects its details): see docs/payments.md. Limits: 20 per 10 minutes per company.
import type Stripe from "stripe";
import { originOf } from "@/lib/server/billing";
import { requireUser } from "@/lib/server/auth";
import { accountPatch, paymentsConfig, paymentsFailure, paymentsOffice, payError, payJson, serviceDb, statusOf, stripeFor, type AccountPatch, type PaymentsConfig } from "@/lib/server/onlinePayments";
import { requirePaidOrTrial } from "@/lib/server/planGate";
import { durableRateLimit, tooManyRequests, waitText } from "@/lib/server/rateLimit";
import { readJsonLimited } from "@/lib/server/readBody";

const LIMIT = { limit: 20, windowMs: 10 * 60_000 };

async function who(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth;
  if (!auth.userId) return { ok: false as const, response: payError("Sign in to set up online payments.", "sign_in_required", 401) };
  const office = await paymentsOffice(auth.userId);
  if (!office.ok) return office;
  return { ok: true as const, userId: auth.userId, owner: office.owner, email: office.email };
}

/** The row, refreshed from Stripe while onboarding isn't finished (or when asked). */
async function current(cfg: PaymentsConfig, owner: string, refresh: boolean) {
  const db = serviceDb();
  let row = await db.accountByOwner(owner);
  if (row?.stripe_account_id && (refresh || !row.charges_enabled || !row.details_submitted)) {
    try {
      const a = await stripeFor(cfg).accounts.retrieve(row.stripe_account_id);
      const patch = accountPatch(a);
      await db.saveAccount(owner, patch);
      row = { ...row, ...patch } as typeof row;
    } catch (e) {
      // Stripe unreachable: show what we last knew. A revoked or deleted account is forgotten.
      const code = (e as { code?: string; statusCode?: number })?.statusCode;
      if (code === 403 || code === 404) {
        await db.saveAccount(owner, { stripe_account_id: null, charges_enabled: false, details_submitted: false, payouts_enabled: false });
        row = await db.accountByOwner(owner);
      } else console.warn("[payments] account refresh failed:", (e as Error)?.message);
    }
  }
  return row;
}

export async function GET(request: Request) {
  const c = paymentsConfig();
  if (!c.ok) return payJson(statusOf(null, null) as unknown as Record<string, unknown>);
  try {
    const w = await who(request);
    if (!w.ok) return w.response;
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return payJson(statusOf(c.config, await current(c.config, w.owner, refresh)) as unknown as Record<string, unknown>);
  } catch (e) {
    return paymentsFailure("account status", e, "Couldn't check online payments. Try again in a minute.");
  }
}

export async function POST(request: Request) {
  const c = paymentsConfig();
  if (!c.ok) return payError("Online payments aren't set up on this server. See docs/payments.md.", "payments_not_configured", 501);
  const read = await readJsonLimited<{ action?: unknown; enabled?: unknown; ach?: unknown } | null>(request, 4 * 1024);
  if (!read.ok) return read.response;
  const body = read.value ?? {};
  try {
    const w = await who(request);
    if (!w.ok) return w.response;
    const limited = await durableRateLimit(`payments-account:${w.owner}`, LIMIT);
    if (!limited.ok) return tooManyRequests(limited, `Too many requests. Try again in ${waitText(limited.retryAfter)}.`);
    const db = serviceDb();
    const stripe = stripeFor(c.config);

    if (body.action === "connect") {
      // Connecting is new work for the company: a lapsed company (trial over, subscription ended) can't start it. Only
      // connecting: an account already connected keeps taking its clients' payments (checkout, confirm, webhook).
      const gate = await requirePaidOrTrial(request, w.userId);
      if (gate) return gate;
      const origin = originOf(request);
      if (!origin) return payError("Online payments need the app's address on this server: set PINPLAN_APP_URL.", "app_url_missing", 501);
      let row = await db.accountByOwner(w.owner);
      let account = row?.stripe_account_id ?? null;
      if (!account) {
        // A Standard-type account: the company's own Stripe dashboard, it pays Stripe's fees and handles refunds and
        // disputes; Stripe collects and checks its details (and asks for the email). One per company (idempotency key,
        // with parameters that never change), even on a double click or when another admin clicks.
        const params: Stripe.AccountCreateParams = {
          controller: { stripe_dashboard: { type: "full" }, fees: { payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe" },
          metadata: { pinplan_company: w.owner },
        };
        const created = await stripe.accounts.create(params, { idempotencyKey: `pinplan-connect-${w.owner}` });
        const patch: AccountPatch = { stripe_account_id: created.id, connected_by: w.userId, connected_at: new Date().toISOString(), ...accountPatch(created) };
        await db.saveAccount(w.owner, patch, true);
        row = await db.accountByOwner(w.owner);
        account = row?.stripe_account_id ?? created.id;
      }
      const link = await stripe.accountLinks.create({
        account,
        type: "account_onboarding",
        refresh_url: `${origin}/settings?payments=refresh#payments`,
        return_url: `${origin}/settings?payments=return#payments`,
      });
      return payJson({ url: link.url });
    }

    if (body.action === "settings") {
      const patch: AccountPatch = {};
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      if (typeof body.ach === "boolean") patch.ach = body.ach;
      if (!Object.keys(patch).length) return payError("Nothing to change.", "bad_request", 400);
      const row = await db.accountByOwner(w.owner);
      if (!row?.stripe_account_id) return payError("Connect Stripe first.", "not_connected", 409);
      await db.saveAccount(w.owner, patch);
      return payJson(statusOf(c.config, await db.accountByOwner(w.owner)) as unknown as Record<string, unknown>);
    }

    if (body.action === "disconnect") {
      await db.saveAccount(w.owner, { stripe_account_id: null, charges_enabled: false, details_submitted: false, payouts_enabled: false });
      return payJson(statusOf(c.config, await db.accountByOwner(w.owner)) as unknown as Record<string, unknown>);
    }

    return payError("Unknown action.", "bad_request", 400);
  } catch (e) {
    return paymentsFailure("account", e, "Couldn't reach Stripe. Try again in a minute.");
  }
}
