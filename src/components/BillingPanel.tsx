"use client";
// Settings → Billing: the company's plan (trial, active, past due, read-only, comped), seats and the Stripe buttons.
// Owners and admins manage it; technicians only see the status.
import { CreditCard, ExternalLink, Minus, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { changeSeats, openBillingPortal, startCheckout, useNow } from "@/lib/billing";
import { billingSummary, paidSeats, type Tone } from "@/lib/billingLogic";
import { monthlyPrice, PLANS, PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";
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
      toast("Checkout canceled — nothing was charged.", "info");
      return;
    }
    if (result !== "success") return;
    toast(`Thanks! Your ${PRODUCT_NAME} subscription is starting.`);
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

export default function BillingPanel() {
  useCheckoutReturn();
  const sync = useSyncStatus();
  const t = useTeam();
  const b = t.billing;
  const office = t.role === "owner" || t.role === "admin";
  const plan = PLANS[0];
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();

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
  if (!sync.configured || !sync.signedIn || !t.team) {
    body = (
      <p className="text-sm text-slate-600">
        {PRODUCT_NAME} is billed per company team: {TRIAL_DAYS} days free, then ${plan.basePrice}/month including {plan.includedSeats} users and ${plan.seatPrice}/month for each extra user.
        {sync.configured && sync.signedIn ? " Start a team below to begin your trial." : ""}
      </p>
    );
  } else if (!b) {
    body = <p className="text-sm text-slate-600">Billing isn’t set up for this team.</p>;
  } else if (!now) {
    body = <p className="text-sm text-slate-500">Loading…</p>;
  } else {
    const summary = billingSummary(b, now);
    const comped = b.status === "comped";
    const seats = paidSeats(b, plan);
    const subscribed = b.hasSubscription && b.status !== "canceled";
    const unused = b.seatLimit != null ? b.seatLimit - Math.max(b.members, plan.includedSeats) : 0;
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${TONE[summary.tone]}`}>{summary.label}</span>
          <span className="text-sm text-slate-600">{summary.detail}</span>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl p-3 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">Plan</dt>
            <dd className="font-medium">{comped ? "Founder account" : plan.name}</dd>
          </div>
          <div className="rounded-xl p-3 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">Seats</dt>
            <dd className="font-medium">
              {b.seatLimit == null ? `${b.members} ${b.members === 1 ? "person" : "people"} · no limit` : `${b.members} of ${b.seatLimit} used`}
            </dd>
          </div>
          <div className="rounded-xl p-3 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">{subscribed ? "Monthly" : "Monthly after the trial"}</dt>
            <dd className="font-medium">{comped ? "Free" : `$${monthlyPrice(plan, seats)}/month`}</dd>
            {!comped && <dd className="text-xs text-slate-500">{`$${plan.basePrice} incl. ${plan.includedSeats} users + $${plan.seatPrice} per extra user`}</dd>}
          </div>
        </dl>
        {office && !comped && (
          <div className="flex flex-wrap gap-2">
            {!subscribed && (
              <button className="btn btn-brand" disabled={!!busy} onClick={() => void act("checkout", startCheckout)}>
                <Sparkles /> {busy === "checkout" ? "Opening checkout…" : "Start subscription"}
              </button>
            )}
            {subscribed && b.seatLimit != null && (
              <button className="btn" disabled={!!busy} onClick={() => void act("add", () => changeSeats("add"), "Seat added — invite someone to fill it")}>
                <Plus /> {busy === "add" ? "Adding…" : `Add a seat (+$${plan.seatPrice}/month)`}
              </button>
            )}
            {subscribed && unused > 0 && (
              <button className="btn" disabled={!!busy} onClick={() => void act("fit", () => changeSeats("fit"), "Unused seats removed")}>
                <Minus /> {busy === "fit" ? "Removing…" : `Remove ${unused} unused seat${unused === 1 ? "" : "s"}`}
              </button>
            )}
            {b.hasSubscription && (
              <button className="btn" disabled={!!busy} onClick={() => void act("portal", openBillingPortal)}>
                <ExternalLink /> {busy === "portal" ? "Opening…" : "Manage billing & invoices"}
              </button>
            )}
          </div>
        )}
        {!office && !comped && <p className="text-xs text-slate-500">The owner or an admin manages the subscription.</p>}
        {office && subscribed && b.seatLimit != null && (
          <p className="text-xs text-slate-500">When every seat is taken, new people can’t join until you add a seat. Stripe prorates seat changes on the next invoice.</p>
        )}
      </div>
    );
  }

  return (
    <section id="billing" className="card scroll-mt-6 space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5 text-slate-400" /> Billing
        </h2>
        <p className="text-sm text-slate-500">Your company’s {PRODUCT_NAME} subscription.</p>
      </div>
      {body}
    </section>
  );
}
