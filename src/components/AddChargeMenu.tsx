"use client";
// "Add charge" on the estimate: extra labor, prewire per device (counted from the plan), closet build-out…
import { Plus } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import { chargeKey, countOf, DEFAULT_CHARGES, type QuickCharge } from "@/lib/charges";
import { formatMoney } from "@/lib/estimate";
import type { TakeoffBucket } from "@/lib/takeoff";
import type { EstimateLine } from "@/lib/types";

/** New lines sort after existing ones. */
const sortStamp = () => Date.now();

export default function AddChargeMenu(props: {
  total: TakeoffBucket;
  currency: string;
  onAdd: (key: string, patch: Partial<EstimateLine>) => void;
}) {
  const [open, setOpen] = useState(false);
  // Fixed on screen above the button, so tables that scroll sideways don't clip it.
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const add = (c: QuickCharge) => {
    // Per-device charges leave qty empty so it follows the plan; the rest start at 1.
    props.onAdd(chargeKey(c, nanoid(8)), { description: c.name, unit: c.unit, unitPrice: c.price, qty: c.countFrom?.length ? null : 1, sort: sortStamp() });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        className="btn btn-sm btn-ghost text-brand-600"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 428)), bottom: window.innerHeight - r.top + 4 });
          setOpen((o) => !o);
        }}
        aria-expanded={open}
      >
        <Plus /> Add charge — labor, prewire…
      </button>
      {open && (
        <div role="menu" className="card animate-in fixed z-50 max-h-[70vh] w-[min(92vw,420px)] overflow-y-auto p-1.5 shadow-pop" style={{ left: pos.left, bottom: pos.bottom }}>
          {DEFAULT_CHARGES.map((c) => {
            const n = c.countFrom ? countOf(props.total, c.countFrom) : null;
            return (
              <button key={c.id} role="menuitem" className="flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={() => add(c)}>
                <span className="min-w-0 flex-1">
                  {c.name}
                  {n != null && <span className="block text-xs text-slate-500">× {n} from the plan — updates as you place devices</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">{c.price ? `${formatMoney(c.price, props.currency)}/${c.unit === "each" ? "ea" : c.unit}` : "set price"}</span>
              </button>
            );
          })}
          <div className="my-1 h-px bg-slate-100" />
          <button role="menuitem" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={() => add({ id: "custom", name: "Custom item", unit: "each", price: 0 })}>
            Custom line
          </button>
        </div>
      )}
    </div>
  );
}
