"use client";
// Settings → Quotes & invoices → Online payments (owner / admin): connect the company's own Stripe account once, then
// every finalized invoice's client link offers "Pay by card" (docs/payments.md). Renders nothing until the server has
// online payments set up (GET /api/payments/account says configured: false), without cloud sync, or offline.
import { CreditCard, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { msg, t, useT } from "@/lib/i18n";
import { accountStage, type AccountStage, type PaymentAccountStatus } from "@/lib/onlinePay";
import { PRODUCT_NAME } from "@/lib/plans";
import { supabaseConfigured } from "@/lib/supabase";
import { toast } from "@/lib/toast";

async function call(method: "GET" | "POST", body?: Record<string, unknown>, query = ""): Promise<PaymentAccountStatus & { url?: string }> {
  let r: Response;
  try {
    r = await apiFetch(`/api/payments/account${query}`, method === "POST" ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) } : {});
  } catch {
    throw new Error(t("You're offline. Online payments need a connection."));
  }
  const j = (await r.json().catch(() => ({}))) as PaymentAccountStatus & { url?: string; error?: string };
  if (!r.ok) throw new Error(j.error ? t(j.error) : t("Online payments request failed ({status}).", { status: r.status }));
  return j;
}

const STAGE_TEXT: Record<Exclude<AccountStage, "off">, { label: string; tone: string }> = {
  not_connected: { label: msg("Not connected"), tone: "bg-slate-100 text-slate-700" },
  onboarding: { label: msg("Setup not finished"), tone: "bg-amber-100 text-amber-900" },
  pending: { label: msg("Waiting for Stripe"), tone: "bg-amber-100 text-amber-900" },
  ready: { label: msg("Taking card payments"), tone: "bg-emerald-100 text-emerald-800" },
  paused: { label: msg("Paused"), tone: "bg-slate-100 text-slate-700" },
};

export default function OnlinePaymentsPanel() {
  const t = useT();
  const [status, setStatus] = useState<PaymentAccountStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!supabaseConfigured) return;
    try {
      setStatus(await call("GET", undefined, refresh ? "?refresh=1" : ""));
    } catch {
      /* offline or not allowed: the card stays hidden */
    }
  }, []);

  useEffect(() => {
    // Back from Stripe's onboarding (?payments=return|refresh): read the account again, and tidy the address.
    const params = new URLSearchParams(window.location.search);
    const back = params.get("payments");
    if (back) {
      params.delete("payments");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }
    const first = window.setTimeout(() => void load(!!back), 0);
    return () => window.clearTimeout(first);
  }, [load]);

  const stage = accountStage(status);
  if (!status || stage === "off") return null;

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const connect = () =>
    act("connect", async () => {
      const r = await call("POST", { action: "connect" });
      if (r.url) window.location.assign(r.url);
    });
  const change = (patch: { enabled?: boolean; ach?: boolean }) =>
    act("settings", async () => {
      setStatus(await call("POST", { action: "settings", ...patch }));
      toast(t("Online payments updated"));
    });
  const disconnect = () => {
    if (!confirm(t("Disconnect Stripe? Clients won't be able to pay invoices online until you connect it again. Payments already made stay recorded, and your Stripe account keeps its money."))) return;
    void act("disconnect", async () => {
      setStatus(await call("POST", { action: "disconnect" }));
      toast(t("Stripe disconnected"));
    });
  };
  const s = STAGE_TEXT[stage];
  const fee = status.feeBps > 0 ? (status.feeBps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }) : null;

  return (
    <section id="payments" className="card scroll-mt-6 space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("Online payments")}</h2>
          <p className="text-sm text-slate-500">
            {t("Clients pay invoices by card from their invoice link. The money goes straight to your own Stripe account; Stripe's fees apply.")}
            {fee ? ` ${t("{product} adds {pct}% to each online payment.", { product: PRODUCT_NAME, pct: fee })}` : ""}
          </p>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${s.tone}`}>{t(s.label)}</span>
      </div>

      {stage === "not_connected" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t("Connect Stripe once. If you already use Stripe, sign in with it; otherwise Stripe sets up an account for your company in a few minutes.")}</p>
          <button className="btn btn-brand" disabled={!!busy} onClick={() => void connect()}>
            <CreditCard /> {busy === "connect" ? t("Opening Stripe…") : t("Connect Stripe")}
          </button>
        </div>
      )}

      {(stage === "onboarding" || stage === "pending") && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {stage === "onboarding"
              ? t("Finish setting up your Stripe account to start taking payments.")
              : t("Stripe is checking your details. Card payments turn on as soon as Stripe allows it.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-brand" disabled={!!busy} onClick={() => void connect()}>
              <CreditCard /> {busy === "connect" ? t("Opening Stripe…") : t("Continue Stripe setup")}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => void act("refresh", () => load(true))}>
              <RefreshCw /> {t("Check again")}
            </button>
          </div>
        </div>
      )}

      {(stage === "ready" || stage === "paused") && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={status.enabled} disabled={!!busy} onChange={(e) => void change({ enabled: e.target.checked })} />
            <span>
              {t("Clients can pay invoices online")}
              <span className="block text-xs text-slate-500">{t("Every finalized invoice's client link shows a “Pay by card” button for the balance due.")}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={status.ach} disabled={!!busy || !status.enabled} onChange={(e) => void change({ ach: e.target.checked })} />
            <span>
              {t("Also accept US bank account (ACH) on USD invoices")}
              <span className="block text-xs text-slate-500">{t("Lower fees for large invoices. Bank payments take a few business days to clear; the invoice shows them once they do.")}</span>
            </span>
          </label>
          <p className="text-xs text-slate-500">{t("Payments are recorded on the invoice automatically, and refunds you make in Stripe show up as refunds.")}</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn" href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer noopener">
              <ExternalLink /> {t("Open Stripe dashboard")}
            </a>
            <button className="btn btn-ghost text-slate-500" disabled={!!busy} onClick={disconnect}>
              <Unplug /> {t("Disconnect")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
