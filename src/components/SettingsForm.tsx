"use client";
import { Building, Cable, Calculator, CloudOff, Receipt, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { WIRE_TYPES } from "@/lib/catalog";
import { getSettings, saveSettings } from "@/lib/db";
import type { AppSettings } from "@/lib/types";
import AccessCodePanel from "./AccessCodePanel";
import AccountPanel from "./AccountPanel";
import BillduSettings from "./BillduSettings";

export default function SettingsForm() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [orig, setOrig] = useState<string>("");
  useEffect(() => {
    getSettings().then((x) => {
      setS(x);
      setOrig(JSON.stringify(x));
    });
  }, []);
  if (!s) return <p className="p-6 text-slate-500">Loading…</p>;
  const b = s.business;
  const p = s.pricing;
  const setB = (k: keyof typeof b, v: string) => setS({ ...s, business: { ...b, [k]: v } });
  const setP = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setS({ ...s, pricing: { ...p, [k]: v } });

  const dirty = JSON.stringify(s) !== orig;
  const NAV = [
    { id: "business", label: "Business", icon: Building },
    { id: "pricing", label: "Pricing", icon: Calculator },
    { id: "wire", label: "Wire", icon: Cable },
    { id: "billdu", label: "Billdu", icon: Receipt },
    { id: "account", label: "Account & sync", icon: CloudOff },
  ];

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
        <form
          className="space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveSettings(s);
            setOrig(JSON.stringify(s));
            toast("Settings saved");
          }}
        >
          <section id="business" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="text-lg font-semibold">Your business</h2>
              <p className="text-sm text-slate-500">Shown on the client estimate PDF.</p>
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
                <label className="label">{label}</label>
                <input className="input" value={b[k]} onChange={(e) => setB(k, e.target.value)} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input className="input" value={b.address} onChange={(e) => setB("address", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Estimate terms</label>
              <textarea className="input min-h-20" value={b.estimateTerms} onChange={(e) => setB("estimateTerms", e.target.value)} />
            </div>
          </section>

          <section id="pricing" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <h2 className="text-lg font-semibold">Pricing defaults</h2>
              <p className="text-sm text-slate-500">New estimates start from these; each project can override markup, tax and labor.</p>
            </div>
            <div>
              <label className="label">Markup on materials %</label>
              <input className="input" type="number" step="0.1" value={p.markupPct} onChange={(e) => setP("markupPct", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">Sales tax %</label>
              <input className="input" type="number" step="0.01" value={p.taxPct} onChange={(e) => setP("taxPct", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">Currency</label>
              <input className="input" value={p.currency} maxLength={3} onChange={(e) => setP("currency", e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="label">Labor on estimate</label>
              <select className="input" value={p.laborMode} onChange={(e) => setP("laborMode", e.target.value as "combined" | "separate")}>
                <option value="combined">Combined (“— installed” price)</option>
                <option value="separate">Separate labor lines</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={p.includeTentative} onChange={(e) => setP("includeTentative", e.target.checked)} />
              Include tentative (?) items in estimate totals by default
            </label>
          </section>

          <section id="wire" className="card grid scroll-mt-6 gap-4 p-6 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <h2 className="text-lg font-semibold">Wire</h2>
              <p className="text-sm text-slate-500">How home-run lengths are estimated from the plan, and the price per foot of each cable.</p>
            </div>
            <div>
              <label className="label">Slack / service loop %</label>
              <input className="input" type="number" value={p.wireSlackPct} onChange={(e) => setP("wireSlackPct", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">Extra ft per home run</label>
              <input className="input" type="number" value={p.wireDropFt} onChange={(e) => setP("wireDropFt", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">Floor-to-floor height ft</label>
              <input className="input" type="number" value={p.floorHeightFt} onChange={(e) => setP("floorHeightFt", Number(e.target.value) || 0)} />
            </div>
            {WIRE_TYPES.filter((w) => w !== "None").map((w) => (
              <div key={w}>
                <label className="label">{w} $/ft</label>
                <input
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
            className={`sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl px-4 py-3 transition ${dirty ? "bg-ink/95 shadow-pop backdrop-blur" : ""}`}
          >
            {dirty && <span className="mr-auto text-sm text-white/80">You have unsaved changes</span>}
            <button className={`btn ${dirty ? "btn-brand" : ""}`} disabled={!dirty}>
              <Save /> Save settings
            </button>
          </div>
        </form>

        <AccessCodePanel />
      <section id="billdu" className="card scroll-mt-6 space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Billdu</h2>
            <p className="text-sm text-slate-500">Send estimates, orders and invoices straight from a project.</p>
          </div>
          <BillduSettings />
        </section>
        <div className="card scroll-mt-6 p-6">
          <AccountPanel />
        </div>
      </div>
    </div>
  );
}
