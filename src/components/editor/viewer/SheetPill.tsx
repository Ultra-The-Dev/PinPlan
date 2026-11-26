"use client";
// Current sheet, set like a drawing's title block: the sheet number in its own cell, the name and the scale beside it.
// Tapping it opens the sheet browser; the arrows step to the previous / next sheet ([ and ]). With `onMenu` (office),
// the ⋯ button, a long press or a right-click opens the sheet's menu (rename, move, delete, Manage sheets).
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useRef } from "react";
import { useT } from "@/lib/i18n";
import type { Sheet } from "@/lib/types";

const LONG_PRESS_MS = 500;

export default function SheetPill({ sheet, index, count, onOpen, onStep, compact, onMenu, menuOpen }: { sheet: Sheet; index: number; count: number; onOpen: () => void; onStep: (d: -1 | 1) => void; compact?: boolean; onMenu?: () => void; menuOpen?: boolean }) {
  const t = useT();
  const scale = sheet.pxPerFt ? (sheet.scaleLabel?.startsWith("line") ? t("Calibrated") : (sheet.scaleLabel ?? t("Scale set"))) : null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const arrows = count > 1 && !compact;
  return (
    <div className="flex h-11 min-w-[11rem] items-stretch rounded-xl pointer-coarse:h-[52px] bg-white/90 shadow-pop ring-1 ring-black/5 backdrop-blur-md" data-plan-ui>
      {arrows && (
        <button className="flex w-9 shrink-0 items-center justify-center pointer-coarse:w-11 rounded-l-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30" onClick={() => onStep(-1)} disabled={index <= 0} aria-label={t("Previous sheet")} title={t("Previous sheet ([)")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <button
        className={`flex min-w-0 flex-1 items-center gap-2.5 py-1 pr-2.5 text-left select-none hover:bg-slate-50 [-webkit-touch-callout:none] ${arrows ? "border-x border-slate-200/80 pl-1.5" : onMenu ? "rounded-l-xl border-r border-slate-200/80 pl-1.5" : "rounded-xl pl-1.5"}`}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onOpen();
        }}
        onPointerDown={(e) => {
          if (!onMenu || e.pointerType === "mouse") return;
          longPressed.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          cancel();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            onMenu();
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => {
          if (!onMenu) return;
          e.preventDefault();
          cancel();
          onMenu();
        }}
        data-testid="sheet-pill"
        data-sheet-menu-anchor
      >
        <span className="flex h-8 min-w-8 shrink-0 flex-col items-center justify-center rounded-md bg-ink px-1.5 leading-none text-white">
          <span className="text-[13px] font-semibold tabular-nums">{index + 1}</span>
          <span className="mt-0.5 text-[9px] text-white/60 tabular-nums">{t("of {count}", { count })}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight font-semibold text-slate-900">{sheet.name}</span>
          <span className={`block truncate text-[11px] leading-tight ${scale ? "text-slate-500" : "text-amber-700"}`}>{scale ?? t("No scale set")}</span>
        </span>
        {/* The accessible name is the visible text plus this (WCAG 2.5.3: voice users say what they see). */}
        <span className="sr-only">{t("Open sheet browser")}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {onMenu && (
        <button
          className={`flex w-9 shrink-0 items-center justify-center pointer-coarse:w-11 text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${arrows ? "border-r border-slate-200/80" : "rounded-r-xl"} ${menuOpen ? "bg-slate-100 text-slate-900" : ""}`}
          onClick={onMenu}
          aria-label={t("Sheet actions")}
          aria-haspopup="menu"
          aria-expanded={!!menuOpen}
          title={t("Rename, move or delete this sheet")}
          data-testid="sheet-menu-button"
          data-sheet-menu-anchor
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
      {arrows && (
        <button className="flex w-9 shrink-0 items-center justify-center pointer-coarse:w-11 rounded-r-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30" onClick={() => onStep(1)} disabled={index >= count - 1} aria-label={t("Next sheet")} title={t("Next sheet (])")}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
