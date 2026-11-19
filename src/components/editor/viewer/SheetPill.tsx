"use client";
// Current sheet, set like a drawing's title block: the sheet number in its own cell, the name and the scale beside it.
// Tapping it opens the sheet browser; the arrows step to the previous / next sheet ([ and ]).
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { Sheet } from "@/lib/types";

export default function SheetPill({ sheet, index, count, onOpen, onStep, compact }: { sheet: Sheet; index: number; count: number; onOpen: () => void; onStep: (d: -1 | 1) => void; compact?: boolean }) {
  const scale = sheet.pxPerFt ? (sheet.scaleLabel?.startsWith("line") ? "Calibrated" : (sheet.scaleLabel ?? "Scale set")) : null;
  return (
    <div className="flex h-11 min-w-[11rem] items-stretch rounded-xl bg-white/90 shadow-pop ring-1 ring-black/5 backdrop-blur-md" data-plan-ui>
      {count > 1 && !compact && (
        <button className="flex w-9 shrink-0 items-center justify-center rounded-l-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30" onClick={() => onStep(-1)} disabled={index <= 0} aria-label="Previous sheet" title="Previous sheet ([)">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <button
        className={`flex min-w-0 flex-1 items-center gap-2.5 py-1 pr-2.5 text-left hover:bg-slate-50 ${count > 1 && !compact ? "border-x border-slate-200/80 pl-1.5" : "rounded-xl pl-1.5"}`}
        onClick={onOpen}
        aria-label={`Sheet ${index + 1} of ${count}: ${sheet.name}. Open sheet browser`}
        data-testid="sheet-pill"
      >
        <span className="flex h-8 min-w-8 shrink-0 flex-col items-center justify-center rounded-md bg-ink px-1.5 leading-none text-white">
          <span className="text-[13px] font-semibold tabular-nums">{index + 1}</span>
          <span className="mt-0.5 text-[9px] text-white/60 tabular-nums">of {count}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight font-semibold text-slate-900">{sheet.name}</span>
          <span className={`block truncate text-[11px] leading-tight ${scale ? "text-slate-500" : "text-amber-700"}`}>{scale ?? "No scale set"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {count > 1 && !compact && (
        <button className="flex w-9 shrink-0 items-center justify-center rounded-r-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30" onClick={() => onStep(1)} disabled={index >= count - 1} aria-label="Next sheet" title="Next sheet (])">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
