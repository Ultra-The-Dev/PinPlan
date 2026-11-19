"use client";
import { Check, Map as MapIcon, Maximize, Minus, MoveHorizontal, Plus, Scan } from "lucide-react";
import { useState } from "react";
import { useViewTransform } from "@/lib/planOverlays";
import type { PlanViewport } from "@/lib/planViewport";

/** Zoom out / zoom % (menu: fit sheet, fit width, 100%, minimap) / zoom in — bottom right of the plan. */
export default function ZoomControls({ viewport, minimap, onMinimap, compact }: { viewport: PlanViewport; minimap: boolean; onMinimap: (on: boolean) => void; compact?: boolean }) {
  const snap = useViewTransform(viewport);
  const [open, setOpen] = useState(false);
  const pct = Math.round(snap.t.scale * 100);
  const atMin = snap.t.scale <= snap.limits.min * 1.001;
  const atMax = snap.t.scale >= snap.limits.max * 0.999;
  const item = (label: string, icon: React.ReactNode, run: () => void, hint?: string, on?: boolean) => (
    <button
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
      onClick={() => {
        run();
        setOpen(false);
      }}
    >
      <span className="text-slate-500 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <kbd className="text-[11px] text-slate-400">{hint}</kbd>}
      {on && <Check className="h-4 w-4 text-brand-600" />}
    </button>
  );
  return (
    <div className="relative" data-plan-ui>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="animate-in absolute right-0 bottom-12 z-30 w-56 rounded-xl bg-white/95 p-1.5 shadow-pop ring-1 ring-black/5 backdrop-blur-md" role="menu">
            {item("Fit sheet", <Maximize />, () => viewport.fit("sheet"), "0")}
            {item("Fit width", <MoveHorizontal />, () => viewport.fit("width"), "W")}
            {item("Actual pixels (100%)", <Scan />, () => viewport.actualSize(), "1")}
            <div className="my-1 h-px bg-slate-100" />
            {item("Minimap", <MapIcon />, () => onMinimap(!minimap), undefined, minimap)}
          </div>
        </>
      )}
      <div className="flex h-11 items-center rounded-xl bg-white/90 p-1 shadow-pop ring-1 ring-black/5 backdrop-blur-md">
        <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40" onClick={() => viewport.zoomBy(1 / 1.5)} disabled={atMin} aria-label="Zoom out" title="Zoom out (−)">
          <Minus className="h-4 w-4" />
        </button>
        <button
          className={`h-9 rounded-lg px-1.5 text-[13px] font-semibold text-slate-800 tabular-nums hover:bg-slate-100 ${compact ? "min-w-[3.25rem]" : "min-w-[3.75rem]"}`}
          onClick={() => setOpen((o) => !o)}
          aria-label={`Zoom ${pct}%. Zoom options`}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="zoom-pct"
        >
          {pct}%
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40" onClick={() => viewport.zoomBy(1.5)} disabled={atMax} aria-label="Zoom in" title="Zoom in (+)">
          <Plus className="h-4 w-4" />
        </button>
        {!compact && (
          <>
            <span className="mx-0.5 h-5 w-px bg-slate-200" />
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" onClick={() => viewport.fit("sheet")} aria-label="Fit sheet" title="Fit sheet (0 or F)">
              <Maximize className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
