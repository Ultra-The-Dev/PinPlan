"use client";
import { useEffect, useState } from "react";
import { WIRE_TYPES } from "@/lib/catalog";
import { getSettings, saveSettings } from "@/lib/db";
import type { AppSettings } from "@/lib/types";
import AccountPanel from "./AccountPanel";
import BillduSettings from "./BillduSettings";

export default function SettingsForm() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    getSettings().then(setS);
  }, []);
  if (!s) return <p className="p-6 text-slate-500">Loading…</p>;
  const b = s.business;
  const p = s.pricing;
  const setB = (k: keyof typeof b, v: string) => setS({ ...s, business: { ...b, [k]: v } });
  const setP = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setS({ ...s, pricing: { ...p, [k]: v } });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveSettings(s);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        <section className="card grid gap-3 p-5 sm:grid-cols-2">
          <h2 className="text-lg font-semibold sm:col-span-2">Your business (shown on estimates)</h2>
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

        <section className="card grid gap-3 p-5 sm:grid-cols-3">
          <h2 className="text-lg font-semibold sm:col-span-3">Pricing defaults</h2>
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

          <h3 className="mt-2 font-semibold sm:col-span-3">Wire</h3>
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

        <div className="flex items-center justify-end gap-2">
          {saved && <span className="text-sm text-emerald-700">Saved</span>}
          <button className="btn btn-primary">Save settings</button>
        </div>
      </form>

      <BillduSettings />
      <AccountPanel />
    </div>
  );
}
