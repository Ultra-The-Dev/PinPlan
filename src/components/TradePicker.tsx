"use client";
// Trade cards: pick the company's trades (sign-up and Settings → Trades). The first one picked is the primary trade —
// it names the plan's sections, runs and closets; the others add their devices, wire types and checklists.
import { Cable, Check, Droplets, Flame, HardHat, Sun, Wind, Zap } from "lucide-react";
import { TRADE_PACKS } from "@/lib/trades";
import type { TradeId } from "@/lib/types";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const toggle = (id: TradeId) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const makePrimary = (id: TradeId) => onChange([id, ...value.filter((x) => x !== id)]);
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2"}`} role="group" aria-label={t("Trades")}>
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
              title={compact ? `${t(p.name)}: ${t(p.examples)}` : undefined}
              className={`flex w-full rounded-xl text-left ${compact ? "items-center gap-2 p-2" : "items-start gap-3 p-3.5"}`}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-lg text-white ${compact ? "h-7 w-7" : "h-9 w-9"}`} style={{ background: p.color }}>
                <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block font-semibold leading-tight text-slate-900 ${compact ? "text-[13px]" : "text-sm"}`}>{compact ? t(p.short) : t(p.name)}</span>
                {!compact && <span className="mt-0.5 block text-xs leading-snug text-slate-500">{t(p.examples)}</span>}
              </span>
              {compact ? (
                on && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full text-white shadow-sm" style={{ background: p.color }}>
                    <Check className="h-3 w-3" />
                  </span>
                )
              ) : (
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ${on ? "text-white ring-transparent" : "ring-slate-300"}`} style={on ? { background: p.color } : undefined}>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
              )}
            </button>
            {on && value.length > 1 && (
              <div className={`-mt-1 flex ${compact ? "px-2.5 pb-2" : "px-3.5 pb-3"}`}>
                {primary ? (
                  <span className="chip bg-slate-900 text-[11px] text-white">{t("Primary")}</span>
                ) : (
                  <button type="button" disabled={disabled} className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline" onClick={() => makePrimary(p.id)}>
                    {t("Make primary")}
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
