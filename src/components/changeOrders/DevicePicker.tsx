"use client";
// Pick a catalog device for a change order line: search by name, symbol or category; shows the price it will get.
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { categoryOf } from "@/lib/catalog";
import { priceDeviceLine, type CoPricing } from "@/lib/changeOrders";
import { formatMoney } from "@/lib/estimate";
import type { DeviceType, Product } from "@/lib/types";

export default function DevicePicker(props: {
  catalog: DeviceType[];
  productFor: (d: DeviceType) => Product | null;
  pricing: CoPricing;
  onPick: (d: DeviceType) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return props.catalog
      .filter((d) => !d.archived && d.kind === "device")
      .filter((d) => {
        const hay = `${d.name} ${d.abbrev} ${d.symbol} ${categoryOf(d.category).name}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => a.sort - b.sort);
  }, [props.catalog, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={props.onClose}>
      <div role="dialog" aria-label="Add a device" className="card animate-in flex max-h-[85vh] w-full max-w-md flex-col rounded-b-none shadow-pop sm:rounded-b-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input autoFocus className="input pl-8" placeholder="Search devices…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search devices" />
          </div>
          <button type="button" className="btn btn-icon btn-ghost" onClick={props.onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto">
          {list.map((d) => {
            const p = props.productFor(d);
            return (
              <li key={d.id}>
                <button className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50" onClick={() => props.onPick(d)}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: d.color }}>
                    {d.symbol}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.name}</span>
                    <span className="block truncate text-xs text-slate-500">{p ? `${p.brand} ${p.model}` : categoryOf(d.category).name}</span>
                  </span>
                  <span className="text-sm tabular-nums text-slate-600">{formatMoney(priceDeviceLine(d, p, props.pricing), props.pricing.currency)}</span>
                </button>
              </li>
            );
          })}
          {!list.length && <li className="p-6 text-center text-sm text-slate-500">No device matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
