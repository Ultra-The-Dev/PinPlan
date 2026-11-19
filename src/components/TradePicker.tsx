"use client";
// Trade cards: pick the company's trades (sign-up and Settings → Trades). The first one picked is the primary trade —
// it names the plan's sections, runs and closets; the others add their devices, wire types and checklists.
import { Cable, Check, Droplets, Flame, HardHat, Sun, Wind, Zap } from "lucide-react";
import { TRADE_PACKS } from "@/lib/trades";
import type { TradeId } from "@/lib/types";

export const TRADE_ICONS: Record<TradeId, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  lowvoltage: Cable,
  electrical: Zap,
  fire: Flame,
  hvac: Wind,
  plumbing: Droplets,
  solar: Sun,
  general: HardHat,
};

export default function TradePicker({ value, onChange, disabled, compact }: { value: TradeId[]; onChange: (next: TradeId[]) => void; disabled?: boolean; compact?: boolean }) {
  const toggle = (id: TradeId) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const makePrimary = (id: TradeId) => onChange([id, ...value.filter((x) => x !== id)]);
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2"}`} role="group" aria-label="Trades">
      {TRADE_PACKS.map((p) => {
        const on = value.includes(p.id);
        const primary = value[0] === p.id;
        const Icon = TRADE_ICONS[p.id];
        return (
          <div
            key={p.id}
            className={`relative rounded-xl text-left ring-1 transition ${on ? "bg-white shadow-sm ring-2" : "bg-white/60 ring-slate-200 hover:ring-slate-300"} ${disabled ? "opacity-60" : ""}`}
            style={on ? ({ "--tw-ring-color": p.color } as React.CSSProperties) : undefined}
          >
            <button
              type="button"
              disabled={disabled}
              aria-pressed={on}
              data-trade={p.id}
              onClick={() => toggle(p.id)}
              className={`flex w-full items-start gap-3 rounded-xl text-left ${compact ? "p-2.5" : "p-3.5"}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: p.color }}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  {compact ? p.short : p.name}
                </span>
                {!compact && <span className="mt-0.5 block text-xs leading-snug text-slate-500">{p.examples}</span>}
              </span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ${on ? "text-white ring-transparent" : "ring-slate-300"}`} style={on ? { background: p.color } : undefined}>
                {on && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
            {on && value.length > 1 && (
              <div className={`-mt-1 flex ${compact ? "px-2.5 pb-2" : "px-3.5 pb-3"}`}>
                {primary ? (
                  <span className="chip bg-slate-900 text-[11px] text-white">Primary</span>
                ) : (
                  <button type="button" disabled={disabled} className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline" onClick={() => makePrimary(p.id)}>
                    Make primary
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
