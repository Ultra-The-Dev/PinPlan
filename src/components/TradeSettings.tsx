"use client";
// Settings → Trades: what the company works on. Adding a trade offers its starting catalog, wire prices and
// checklists; nothing the company already has is replaced or deleted.
import { PackagePlus, Save } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
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
  const t = useT();
  const value = draft ?? trades;
  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(trades);
  const added = value.filter((id) => !trades.includes(id));

  async function save() {
    if (!draft || !draft.length) return;
    setBusy(true);
    try {
      const r = await chooseTrades(draft, { addPacks });
      setDraft(null);
      const { types, wirePrices } = r.added;
      toast(
        types && wirePrices
          ? t("Trades saved · added {types} catalog items and {wire} wire prices", { types, wire: wirePrices })
          : types
            ? t("Trades saved · added {types} catalog items", { types })
            : wirePrices
              ? t("Trades saved · added {wire} wire prices", { wire: wirePrices })
              : t("Trades saved"),
        "success",
      );
      if (r.error) toast(r.error, "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function addMissing(id: TradeId) {
    setBusy(true);
    try {
      const r = await addTradePack(id);
      const trade = t(tradePack(id).short);
      toast(r.types || r.wirePrices ? t("Added {types} items and {wire} wire prices from {trade}", { types: r.types, wire: r.wirePrices, trade }) : t("Your catalog already has everything from {trade}", { trade }), "success");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="trades" className="card scroll-mt-6 space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">{t("Trades")}</h2>
        <p className="text-sm text-slate-500">
          {t("What your company works on. The first one is your primary trade — the plan’s device menu, layers, takeoff and crew sheets follow these.")}
          {!office && ` ${t("Your company’s owner or office sets them.")}`}
        </p>
      </div>
      <TradePicker value={value} disabled={!office || busy} onChange={(next) => setDraft(next.length ? next : value)} />
      {office && (
        <div className="flex flex-wrap items-center gap-3">
          {added.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="accent-brand-600" checked={addPacks} onChange={(e) => setAddPacks(e.target.checked)} />
              {t("Add {trades} starting catalog, wire prices and checklists (nothing you have is replaced)", { trades: added.map((id) => t(tradePack(id).short)).join(" + ") })}
            </label>
          )}
          <button className={`btn ml-auto ${dirty ? "btn-brand" : ""}`} disabled={!dirty || busy} onClick={() => void save()}>
            <Save /> {t("Save trades")}
          </button>
        </div>
      )}
      {office && !dirty && trades.some((id) => id !== "lowvoltage") && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {trades.filter((id) => id !== "lowvoltage").map((id) => (
            <button key={id} className="btn btn-sm" disabled={busy} onClick={() => void addMissing(id)} title={t("Adds only items and wire prices your catalog doesn't have yet")}>
              <PackagePlus /> {t("Add missing {trade} items", { trade: t(tradePack(id).short) })}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
