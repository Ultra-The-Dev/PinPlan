"use client";
// Settings → Trades: what the company works on. Adding a trade offers its starting catalog, wire prices and
// checklists; nothing the company already has is replaced or deleted.
import { PackagePlus, Save } from "lucide-react";
import { useState } from "react";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { toast } from "@/lib/toast";
import { tradePack } from "@/lib/trades";
import type { TradeId } from "@/lib/types";
import { addTradePack, chooseTrades, useTrades } from "@/lib/useTrades";
import TradePicker from "./TradePicker";

export default function TradeSettings() {
  const trades = useTrades();
  const office = can(useRole(), "prices");
  const [draft, setDraft] = useState<TradeId[] | null>(null);
  const [addPacks, setAddPacks] = useState(true);
  const [busy, setBusy] = useState(false);
  const value = draft ?? trades;
  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(trades);
  const added = value.filter((t) => !trades.includes(t));

  async function save() {
    if (!draft || !draft.length) return;
    setBusy(true);
    try {
      const r = await chooseTrades(draft, { addPacks });
      setDraft(null);
      const bits = [r.added.types ? `${r.added.types} catalog items` : "", r.added.wirePrices ? `${r.added.wirePrices} wire prices` : ""].filter(Boolean);
      toast(bits.length ? `Trades saved · added ${bits.join(" and ")}` : "Trades saved", "success");
      if (r.error) toast(r.error, "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function addMissing(t: TradeId) {
    setBusy(true);
    try {
      const r = await addTradePack(t);
      toast(r.types || r.wirePrices ? `Added ${r.types} items and ${r.wirePrices} wire prices from ${tradePack(t).short}` : `Your catalog already has everything from ${tradePack(t).short}`, "success");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="trades" className="card scroll-mt-6 space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">Trades</h2>
        <p className="text-sm text-slate-500">
          What your company works on. The first one is your primary trade — the plan’s device menu, layers, takeoff and crew sheets follow these.
          {!office && " Your company’s owner or office sets them."}
        </p>
      </div>
      <TradePicker value={value} disabled={!office || busy} onChange={(next) => setDraft(next.length ? next : value)} />
      {office && (
        <div className="flex flex-wrap items-center gap-3">
          {added.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="accent-brand-600" checked={addPacks} onChange={(e) => setAddPacks(e.target.checked)} />
              Add {added.map((t) => tradePack(t).short).join(" + ")} starting catalog, wire prices and checklists (nothing you have is replaced)
            </label>
          )}
          <button className={`btn ml-auto ${dirty ? "btn-brand" : ""}`} disabled={!dirty || busy} onClick={() => void save()}>
            <Save /> Save trades
          </button>
        </div>
      )}
      {office && !dirty && trades.some((t) => t !== "lowvoltage") && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {trades.filter((t) => t !== "lowvoltage").map((t) => (
            <button key={t} className="btn btn-sm" disabled={busy} onClick={() => void addMissing(t)} title="Adds only items and wire prices your catalog doesn't have yet">
              <PackagePlus /> Add missing {tradePack(t).short} items
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
