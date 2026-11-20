"use client";
// Settings → Billing: the company's plan (trial, active, past due, read-only, comped), seats and the Stripe buttons.
// Owners and admins manage it; technicians only see the status.
import { CreditCard, ExternalLink, Minus, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { changeSeats, openBillingPortal, startCheckout, useNow } from "@/lib/billing";
import { billingSummary, paidSeats, type Tone } from "@/lib/billingLogic";
import { monthlyPrice, PLANS, PRICE_CURRENCY, PRODUCT_NAME, RENEWAL_NOTE, TRIAL_DAYS } from "@/lib/plans";
import { t, useT } from "@/lib/i18n";
import { useSyncStatus } from "@/lib/sync";
import { reloadTeam, useTeam } from "@/lib/team";
import { toast } from "@/lib/toast";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const TONE: Record<Tone, string> = {
  green: "bg-emerald-100 text-emerald-800",
  slate: "bg-slate-100 text-slate-700",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-700",
};

/** Stripe sends people back to /settings?billing=success|cancel: say so, and wait for the webhook to land. */
function useCheckoutReturn() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("billing");
    if (!result) return;
    params.delete("billing");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    if (result === "cancel") {
      toast(t("Checkout canceled — nothing was charged."), "info");
      return;
    }
    if (result !== "success") return;
    toast(t("Thanks! Your {product} subscription is starting.", { product: PRODUCT_NAME }));
    let stop = false;
    void (async () => {
      // Stripe's webhook usually lands within seconds.
      for (let i = 0; i < 6 && !stop; i++) {
        const s = await reloadTeam().catch(() => null);
        if (s?.billing?.hasSubscription) return;
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => {
      stop = true;
    };
  }, []);
}

/** Owner/admin: do Stripe's prices match the ones shown here? (GET /api/billing/check). Mismatches, or null. */
function usePriceCheck(enabled: boolean) {
  const [mismatches, setMismatches] = useState<string[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    void (async () => {
      try {
        const r = await apiFetch("/api/billing/check");
        if (!r.ok) return; // billing not set up, offline…: nothing to say
        const j = (await r.json()) as { mismatches?: unknown };
        if (!stop && Array.isArray(j.mismatches) && j.mismatches.length) setMismatches(j.mismatches.filter((m): m is string => typeof m === "string"));
      } catch {
        /* offline */
      }
    })();
    return () => {
      stop = true;
    };
  }, [enabled]);
  return mismatches;
}

export default function BillingPanel() {
  useCheckoutReturn();
  const sync = useSyncStatus();
  const tm = useTeam();
  const t = useT();
  const b = tm.billing;
  const office = tm.role === "owner" || tm.role === "admin";
  const plan = PLANS[0];
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  const priceIssues = usePriceCheck(office && !!b && b.status !== "comped");

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  let body: React.ReactNode;
  if (!sync.configured || !sync.signedIn || !tm.team) {
    body = (
      <p className="text-sm text-slate-600">
        {t("{product} is billed per company team: {days} days free, then ${base}/month including {seats} users and ${seat}/month for each extra user ({currency}).", {
          product: PRODUCT_NAME,
          days: TRIAL_DAYS,
          base: plan.basePrice,
          seats: plan.includedSeats,
          seat: plan.seatPrice,
          currency: PRICE_CURRENCY,
        })}
        {sync.configured && sync.signedIn ? ` ${t("Start a team below to begin your trial.")}` : ""}
      </p>
    );
  } else if (!b) {
    body = <p className="text-sm text-slate-600">{t("Billing isn’t set up for this team.")}</p>;
  } else if (!now) {
    body = <p className="text-sm text-slate-500">{t("Loading…")}</p>;
  } else {
    const summary = billingSummary(b, now);
    const comped = b.status === "comped";
    const seats = paidSeats(b, plan);
    const subscribed = b.hasSubscription && b.status !== "canceled";
    const unused = b.seatLimit != null ? b.seatLimit - Math.max(b.members, plan.includedSeats) : 0;
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${TONE[summary.tone]}`}>{t(summary.label)}</span>
          <span className="text-sm text-slate-600">{t(summary.detail)}</span>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl p-3 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">{t("Plan")}</dt>
            <dd className="font-medium">{comped ? t("Founder account") : plan.name}</dd>
          </div>
          <div className="rounded-xl p-3 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">{t("Seats")}</dt>
            <dd className="font-medium">
              {b.seatLimit == null ? t.tn("{n} person · no limit", "{n} people · no limit", b.members) : t("{n} of {limit} used", { n: b.members, limit: b.seatLimit })}
            </dd>
          </div>
          <div className="rounded-xl p-3 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">{subscribed ? t("Monthly") : t("Monthly after the trial")}</dt>
            <dd className="font-medium">{comped ? t("Free") : t("${price}/month", { price: monthlyPrice(plan, seats) })}</dd>
            {!comped && <dd className="text-xs text-slate-500">{t("${base} incl. {seats} users + ${seat} per extra user · {currency}", { base: plan.basePrice, seats: plan.includedSeats, seat: plan.seatPrice, currency: PRICE_CURRENCY })}</dd>}
          </div>
        </dl>
        {office && !comped && (
          <div className="flex flex-wrap gap-2">
            {!subscribed && (
              <button className="btn btn-brand" disabled={!!busy} onClick={() => void act("checkout", startCheckout)}>
                <Sparkles /> {busy === "checkout" ? t("Opening checkout…") : t("Start subscription")}
              </button>
            )}
            {subscribed && b.seatLimit != null && (
              <button className="btn" disabled={!!busy} onClick={() => void act("add", () => changeSeats("add"), t("Seat added — invite someone to fill it"))}>
                <Plus /> {busy === "add" ? t("Adding…") : t("Add a seat (+${price}/month)", { price: plan.seatPrice })}
              </button>
            )}
            {subscribed && unused > 0 && (
              <button className="btn" disabled={!!busy} onClick={() => void act("fit", () => changeSeats("fit"), t("Unused seats removed"))}>
                <Minus /> {busy === "fit" ? t("Removing…") : t.tn("Remove {n} unused seat", "Remove {n} unused seats", unused)}
              </button>
            )}
            {b.hasSubscription && (
              <button className="btn" disabled={!!busy} onClick={() => void act("portal", openBillingPortal)}>
                <ExternalLink /> {busy === "portal" ? t("Opening…") : t("Manage billing & invoices")}
              </button>
            )}
          </div>
        )}
        {office && !comped && !subscribed && <p className="text-xs text-slate-500">{t(RENEWAL_NOTE)}</p>}
        {office && priceIssues && (
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            <p className="font-medium">{t("Stripe’s prices don’t match the prices shown here. Checkout charges Stripe’s prices.")}</p>
            <ul className="mt-1 list-disc pl-4">
              {priceIssues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {!office && !comped && <p className="text-xs text-slate-500">{t("The owner or an admin manages the subscription.")}</p>}
        {office && subscribed && b.seatLimit != null && (
          <p className="text-xs text-slate-500">{t("When every seat is taken, new people can’t join until you add a seat. Stripe prorates seat changes on the next invoice.")}</p>
        )}
      </div>
    );
  }

  return (
    <section id="billing" className="card scroll-mt-6 space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5 text-slate-400" /> {t("Billing")}
        </h2>
        <p className="text-sm text-slate-500">{t("Your company’s {product} subscription.", { product: PRODUCT_NAME })}</p>
      </div>
      {body}
    </section>
  );
}
