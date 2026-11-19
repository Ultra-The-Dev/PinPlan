"use client";
import { Building, Cable, Calculator, CloudOff, CreditCard, HardHat, ListChecks, Receipt, ReceiptText, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { getSettings, saveSettings } from "@/lib/db";
import { tradeWireTypes, tradeVocab } from "@/lib/trades";
import { TRADES_EVENT, useTrades } from "@/lib/useTrades";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import type { AppSettings } from "@/lib/types";
import AccessCodePanel from "./AccessCodePanel";
import AccountPanel from "./AccountPanel";
import BillduSettings from "./BillduSettings";
import BillingPanel from "./BillingPanel";
import ChecklistTemplatesSettings from "./ChecklistTemplatesSettings";
import DocSettingsPanel from "./documents/DocSettingsPanel";
import TeamPanel from "./TeamPanel";
import TemplatesSettings from "./templates/TemplatesSettings";
import { LayoutTemplate } from "lucide-react";
import TradeSettings from "./TradeSettings";

export default function SettingsForm() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [orig, setOrig] = useState<string>("");
  useEffect(() => {
    const load = () =>
      void getSettings().then((x) => {
        // Adding a trade adds wire prices: pick them up without losing unsaved edits elsewhere.
        setS((cur) => (cur ? { ...cur, trades: x.trades, pricing: { ...cur.pricing, wirePrices: { ...x.pricing.wirePrices, ...cur.pricing.wirePrices } } } : x));
        setOrig((o) => (o ? JSON.stringify({ ...JSON.parse(o), trades: x.trades, pricing: { ...JSON.parse(o).pricing, wirePrices: { ...x.pricing.wirePrices, ...JSON.parse(o).pricing.wirePrices } } }) : JSON.stringify(x)));
      });
    load();
    window.addEventListener(TRADES_EVENT, load);
    return () => window.removeEventListener(TRADES_EVENT, load);
  }, []);
  const trades = useTrades();
  // Technicians don't see prices, the business branding or Billdu (office work).
  const office = can(useRole(), "prices");
  if (!s) return <p className="p-6 text-slate-500">Loading…</p>;
  const b = s.business;
  const p = s.pricing;
  const setB = (k: keyof typeof b, v: string) => setS({ ...s, business: { ...b, [k]: v } });
  const setP = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setS({ ...s, pricing: { ...p, [k]: v } });

  const dirty = JSON.stringify(s) !== orig;
  const NAV = [
    { id: "trades", label: "Trades", icon: HardHat },
    { id: "business", label: "Business", icon: Building, office: true },
    { id: "pricing", label: "Pricing", icon: Calculator, office: true },
    { id: "wire", label: "Wire", icon: Cable },
    { id: "invoicing", label: "Invoicing", icon: ReceiptText, office: true },
    { id: "checklists", label: "Checklists", icon: ListChecks },
    { id: "templates", label: "Job templates", icon: LayoutTemplate, office: true },
    { id: "billdu", label: "Billdu", icon: Receipt, office: true },
    { id: "team", label: "Team", icon: Users },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "account", label: "Account & sync", icon: CloudOff },
  ].filter((n) => office || !n.office);

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 sm:px-6 sm:py-8 md:grid-cols-[180px_1fr]">
      <aside className="hidden md:block">
        <div className="sticky top-6">
          <h1 className="page-title mb-4">Settings</h1>
          <nav className="space-y-0.5">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
              >
                <n.icon className="h-4 w-4 text-slate-400" />
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>
      <div className="min-w-0 space-y-6">
        <h1 className="page-title md:hidden">Settings</h1>
        <TradeSettings />
        <form
          className="space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveSettings(s);
            setOrig(JSON.stringify(s));
            toast("Settings saved");
          }}
        >
          {office && (
          <>
          <section id="business" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="text-lg font-semibold">Your business</h2>
              <p className="text-sm text-slate-500">Your branding on the client estimate PDF and proposal links.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <div className="flex h-20 w-48 items-center justify-center rounded-xl bg-white p-2 ring-1 ring-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.logo ? <img src={b.logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">No logo</span>}
              </div>
              <div className="space-y-2">
                <label className="btn btn-sm cursor-pointer">
                  Upload logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      // Keep it small: proposals and PDFs carry the logo with them.
                      const img = await createImageBitmap(f);
                      const k = Math.min(1, 800 / Math.max(img.width, img.height));
                      const c = document.createElement("canvas");
                      c.width = Math.round(img.width * k);
                      c.height = Math.round(img.height * k);
                      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
                      setB("logo", c.toDataURL("image/png"));
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="flex gap-3">
                  {(
                    [
                      ["brandColor", "Brand colour", "#0a1b54"],
                      ["accentColor", "Accent", "#13e57c"],
                    ] as const
                  ).map(([k, label, def]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="color" className="h-8 w-10 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5" value={b[k] || def} onChange={(e) => setB(k, e.target.value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {(
              [
                ["name", "Business name"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["website", "Website"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className="label" htmlFor={`set-${k}`}>{label}</label>
                <input id={`set-${k}`} className="input" value={b[k]} onChange={(e) => setB(k, e.target.value)} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="label" htmlFor="set-address">Address</label>
              <input id="set-address" className="input" value={b.address} onChange={(e) => setB("address", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="set-tagline">Tagline</label>
              <input id="set-tagline" className="input" placeholder="Smart Home · Lighting · AV & Home Theater · Security" value={b.tagline ?? ""} onChange={(e) => setB("tagline", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="set-service-area">Service area</label>
              <input id="set-service-area" className="input" placeholder="Serving New York City & the Tri-State Area" value={b.serviceArea ?? ""} onChange={(e) => setB("serviceArea", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="set-estimate-terms">Estimate terms</label>
              <textarea id="set-estimate-terms" className="input min-h-20" value={b.estimateTerms} onChange={(e) => setB("estimateTerms", e.target.value)} />
            </div>
          </section>

          <section id="pricing" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <h2 className="text-lg font-semibold">Pricing defaults</h2>
              <p className="text-sm text-slate-500">New estimates start from these; each project can override markup, tax and labor.</p>
            </div>
            <div>
              <label className="label" htmlFor="set-markup-on-materials">Markup on materials %</label>
              <input id="set-markup-on-materials" className="input" type="number" step="0.1" value={p.markupPct} onChange={(e) => setP("markupPct", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label" htmlFor="set-sales-tax">Sales tax %</label>
              <input id="set-sales-tax" className="input" type="number" step="0.01" value={p.taxPct} onChange={(e) => setP("taxPct", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label" htmlFor="set-currency">Currency</label>
              <input id="set-currency" className="input" value={p.currency} maxLength={3} onChange={(e) => setP("currency", e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="label" htmlFor="set-labor-on-estimate">Labor on estimate</label>
              <select id="set-labor-on-estimate" className="input" value={p.laborMode} onChange={(e) => setP("laborMode", e.target.value as "combined" | "separate")}>
                <option value="combined">Combined (“— installed” price)</option>
                <option value="separate">Separate labor lines</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={p.includeTentative} onChange={(e) => setP("includeTentative", e.target.checked)} />
              Include tentative (?) items in estimate totals by default
            </label>
          </section>
          </>
          )}

          <section id="wire" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <h2 className="text-lg font-semibold">{tradeVocab(trades).wire === "Cable" ? "Wire" : tradeVocab(trades).wire}</h2>
              <p className="text-sm text-slate-500">{office ? `How home-run lengths are estimated from the plan, and the price per foot of each ${tradeVocab(trades).wire === "Cable" ? "cable" : "type"}.` : "How home-run lengths are estimated from the plan."}</p>
            </div>
            <div>
              <label className="label" htmlFor="set-slack-service-loop">Slack / service loop %</label>
              <input id="set-slack-service-loop" className="input" type="number" value={p.wireSlackPct} onChange={(e) => setP("wireSlackPct", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label" htmlFor="set-extra-ft-per-home-run">Extra ft per home run</label>
              <input id="set-extra-ft-per-home-run" className="input" type="number" value={p.wireDropFt} onChange={(e) => setP("wireDropFt", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label" htmlFor="set-floor-to-floor-height-ft">Floor-to-floor height ft</label>
              <input id="set-floor-to-floor-height-ft" className="input" type="number" value={p.floorHeightFt} onChange={(e) => setP("floorHeightFt", Number(e.target.value) || 0)} />
            </div>
            {office && tradeWireTypes(trades).map((w) => (
              <div key={w}>
                <label className="label" htmlFor={`set-wire-${w.replace(/[^a-zA-Z0-9]+/g, "-")}`}>{w} $/ft</label>
                <input
                  id={`set-wire-${w.replace(/[^a-zA-Z0-9]+/g, "-")}`}
                  className="input"
                  type="number"
                  step="0.01"
                  value={p.wirePrices[w] ?? 0}
                  onChange={(e) => setP("wirePrices", { ...p.wirePrices, [w]: Number(e.target.value) || 0 })}
                />
              </div>
            ))}
          </section>

          <div
            className={`sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl px-4 py-3 transition ${dirty ? "bg-ink/95 shadow-pop backdrop-blur" : ""}`}
          >
            {dirty && <span className="mr-auto text-sm text-white/80">You have unsaved changes</span>}
            <button className={`btn ${dirty ? "btn-brand" : ""}`} disabled={!dirty}>
              <Save /> Save settings
            </button>
          </div>
        </form>

        {office && (
          <section id="invoicing" className="card scroll-mt-6 space-y-4 p-6">
            <div>
              <h2 className="text-lg font-semibold">Invoicing</h2>
              <p className="text-sm text-slate-500">Quotes, invoices and credit notes made in PinPlan: titles, numbering, terms, taxes and how clients pay. Shared by everyone in the office.</p>
            </div>
            <DocSettingsPanel />
          </section>
        )}

        <section id="checklists" className="card scroll-mt-6 space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Checklist templates</h2>
            <p className="text-sm text-slate-500">Your own checklists, saved from a job with “Save as template”. They show first under “Start a checklist”.</p>
          </div>
          <ChecklistTemplatesSettings />
        </section>
        <TemplatesSettings />

        <AccessCodePanel />
      {office && (
      <section id="billdu" className="card scroll-mt-6 space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Billdu</h2>
            <p className="text-sm text-slate-500">Send estimates, orders and invoices straight from a project.</p>
          </div>
          <BillduSettings />
        </section>
      )}
        <TeamPanel businessName={s.business.name} />
        <BillingPanel />
        <div className="card scroll-mt-6 p-6">
          <AccountPanel />
        </div>
      </div>
    </div>
  );
}
