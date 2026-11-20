// GET /api/billing/check (platform admins only: PLATFORM_ADMIN_EMAILS): are Stripe's prices the ones the app shows?
// Compares the base and seat Prices (STRIPE_PRICE_BASE / STRIPE_PRICE_SEAT) with PLANS[0]: amount, currency (USD) and
// monthly interval. → { ok, mismatches: string[], prices }. Read-only; run it after setting the prices in Stripe.
// Each call reads Stripe, so it is limited (5 an hour, counted for every server instance).
import { priceMismatches, type PriceLike } from "@/lib/billingLogic";
import { PLANS } from "@/lib/plans";
import { requirePlatformAdmin } from "@/lib/server/admin";
import { BILLING_LIMITS, billingConfig, billingFailure, getStripe, limitBilling, notConfigured } from "@/lib/server/billing";

export async function GET(request: Request) {
  const c = billingConfig();
  if (!c.ok) return notConfigured(c.missing);
  const cfg = c.config;
  try {
    const admin = await requirePlatformAdmin(request);
    if (!admin.ok) return admin.response;
    const limited = await limitBilling("check", `admin:${admin.email}`, BILLING_LIMITS.check);
    if (limited) return limited;
    const stripe = getStripe(cfg);
    const [base, seat] = (await Promise.all([stripe.prices.retrieve(cfg.priceBase), stripe.prices.retrieve(cfg.priceSeat)])) as unknown as PriceLike[];
    const mismatches = priceMismatches({ base, seat }, PLANS[0]);
    const view = (p: PriceLike) => ({ unitAmount: p.unit_amount ?? null, currency: p.currency ?? null, interval: p.recurring?.interval ?? null, active: p.active !== false });
    return Response.json({ ok: mismatches.length === 0, mismatches, prices: { base: view(base), seat: view(seat) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return billingFailure("price check", e, "Couldn't read the prices from Stripe. Check STRIPE_PRICE_BASE and STRIPE_PRICE_SEAT.");
  }
}
