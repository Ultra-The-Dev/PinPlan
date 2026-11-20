"use client";
import { Check, Map as MapIcon, Maximize, Minus, MoveHorizontal, Plus, Scan } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useViewTransform } from "@/lib/planOverlays";
import type { PlanViewport } from "@/lib/planViewport";

/**
 * Zoom out / zoom % / zoom in — bottom right of the plan. The % button is a plain disclosure (like documents/ui.tsx
 * Menu), not an ARIA menu: it shows a list of buttons (fit sheet, fit width, 100%, minimap) that Tab moves through.
 * Escape or a click outside closes it.
 */
export default function ZoomControls({ viewport, minimap, onMinimap, compact }: { viewport: PlanViewport; minimap: boolean; onMinimap: (on: boolean) => void; compact?: boolean }) {
  const t = useT();
  const snap = useViewTransform(viewport);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const pct = Math.round(snap.t.scale * 100);
  const atMin = snap.t.scale <= snap.limits.min * 1.001;
  const atMax = snap.t.scale >= snap.limits.max * 0.999;
  const item = (label: string, icon: React.ReactNode, run: () => void, hint?: string, on?: boolean) => (
    <button
      type="button"
      aria-pressed={on === undefined ? undefined : on}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 pointer-coarse:min-h-11"
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
    <div
      className="relative"
      data-plan-ui
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        // Closes the list only (not fullscreen or the current tool), and focus goes back to the % button.
        e.stopPropagation();
        setOpen(false);
        toggle.current?.focus();
      }}
      onBlur={(e) => {
        // Tabbing out of the list closes it.
        if (open && e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div id={listId} className="animate-in absolute right-0 bottom-12 z-30 w-56 pointer-coarse:bottom-14 rounded-xl bg-white/95 p-1.5 shadow-pop ring-1 ring-black/5 backdrop-blur-md">
            {item(t("Fit sheet"), <Maximize />, () => viewport.fit("sheet"), "0")}
            {item(t("Fit width"), <MoveHorizontal />, () => viewport.fit("width"), "W")}
            {item(t("Actual pixels (100%)"), <Scan />, () => viewport.actualSize(), "1")}
            <div className="my-1 h-px bg-slate-100" />
            {item(t("Minimap"), <MapIcon />, () => onMinimap(!minimap), undefined, minimap)}
          </div>
        </>
      )}
      <div className="flex h-11 items-center rounded-xl bg-white/90 p-1 shadow-pop pointer-coarse:h-[52px] ring-1 ring-black/5 backdrop-blur-md">
        <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 pointer-coarse:h-11 pointer-coarse:w-11 disabled:opacity-40" onClick={() => viewport.zoomBy(1 / 1.5)} disabled={atMin} aria-label={t("Zoom out")} title={t("Zoom out (−)")}>
          <Minus className="h-4 w-4" />
        </button>
        <button
          ref={toggle}
          type="button"
          className={`h-9 rounded-lg px-1.5 text-[13px] font-semibold text-slate-800 tabular-nums hover:bg-slate-100 pointer-coarse:h-11 ${compact ? "min-w-[3.25rem]" : "min-w-[3.75rem]"}`}
          onClick={() => setOpen((o) => !o)}
          aria-label={t("Zoom {pct}%. Zoom options", { pct })}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          data-testid="zoom-pct"
        >
          {pct}%
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 pointer-coarse:h-11 pointer-coarse:w-11 disabled:opacity-40" onClick={() => viewport.zoomBy(1.5)} disabled={atMax} aria-label={t("Zoom in")} title={t("Zoom in (+)")}>
          <Plus className="h-4 w-4" />
        </button>
        {!compact && (
          <>
            <span className="mx-0.5 h-5 w-px bg-slate-200" />
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 pointer-coarse:h-11 pointer-coarse:w-11" onClick={() => viewport.fit("sheet")} aria-label={t("Fit sheet")} title={t("Fit sheet (0 or F)")}>
              <Maximize className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
