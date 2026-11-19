"use client";
// HTML side of the measurements overlay (screen px over the plan): toolbar, drawing bar, calibrate banner, the
// selected measurement's card and the totals panel. Also the keys (Esc / Enter / Backspace) and the mouse's live
// segment while drawing.
import { Check, Crosshair, Undo2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { areaSqFt, formatFeetInches, formatSqFt, KIND_NAMES, lengthFt, MIN_POINTS, recentLabels, snapAngle } from "@/lib/measure";
import { useMeasurements } from "@/lib/measurements";
import type { PlanViewport } from "@/lib/planViewport";
import { useEditor } from "@/lib/store";
import type { Sheet } from "@/lib/types";
import { useViewer } from "@/lib/viewerStore";
import MeasureEditCard from "./MeasureEditCard";
import MeasurementsPanel from "./MeasurementsPanel";
import MeasureToolbar from "./MeasureToolbar";
import { cancelDraft, finishDraft, undoPoint } from "./measureInput";
import { useMeasureUi } from "./measureUi";

const bar = "pointer-events-auto absolute top-[162px] left-2 z-[13] flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-xl bg-ink/90 py-1 pr-1 pl-3 text-[13px] text-white shadow-pop backdrop-blur sm:top-[120px] sm:left-3";

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function DrawBar({ sheet }: { sheet: Sheet }) {
  const { kind, draft, draftSheetId, label } = useMeasureUi();
  const pts = draftSheetId === sheet.id ? draft : [];
  const n = pts.length / 2;
  const value = kind === "area" ? (n >= 3 ? formatSqFt(areaSqFt(pts, sheet)) : null) : n >= 2 ? formatFeetInches(lengthFt(pts, sheet)) : null;
  const hint = !n
    ? kind === "length"
      ? "Tap the start point"
      : kind === "area"
        ? "Tap the first corner"
        : "Tap the start of the run"
    : kind === "area"
      ? n < 3
        ? "Tap the next corner"
        : "Tap the first corner to close"
      : kind === "length"
        ? "Tap the end point"
        : "Tap each bend · double-tap to finish";
  return (
    <div className={bar} data-plan-ui data-testid="measure-bar">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
      <span className="min-w-0 truncate py-1">
        <b className="font-semibold">{KIND_NAMES[kind]}</b>
        {label.trim() ? ` · ${label.trim()}` : ""}
        {value ? <span className="tabular-nums"> · {value}</span> : null}
        <span className="text-white/70"> · {hint}</span>
      </span>
      {n > 0 && (
        <>
          <button className="ml-1 flex h-9 shrink-0 items-center gap-1 rounded-lg bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25" onClick={undoPoint} aria-label="Undo last point" title="Undo last point (Backspace)">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          {kind !== "length" && (
            <button className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-brand-500 px-3 text-xs font-semibold hover:bg-brand-600 disabled:opacity-50" onClick={() => void finishDraft()} disabled={n < MIN_POINTS[kind]} data-testid="measure-done">
              <Check className="h-3.5 w-3.5" /> Done
            </button>
          )}
          <button className="flex h-9 shrink-0 items-center rounded-lg bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25" onClick={cancelDraft} aria-label="Cancel this measurement" title="Cancel (Esc)">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

export default function MeasureOverlay({ sheet, viewport, editing }: { sheet: Sheet; viewport: PlanViewport; editing: boolean }) {
  const ui = useMeasureUi();
  const rows = useMeasurements((s) => s.rows);
  const load = useMeasurements((s) => s.load);
  const toolKind = useEditor((s) => s.tool.kind);
  const editorSelection = useEditor((s) => s.selection);
  const anchor = useRef<HTMLSpanElement>(null);

  const hydrate = useMeasureUi((s) => s.hydrate);
  useEffect(() => {
    hydrate();
    void load(sheet.projectId);
  }, [hydrate, load, sheet.projectId]);

  // Another tool picked (a device, wire…): stop measuring. The editor selected something: drop ours.
  useEffect(() => {
    if (toolKind !== "select" && useMeasureUi.getState().active) useMeasureUi.getState().setActive(false);
  }, [toolKind]);
  useEffect(() => {
    if (editorSelection && useMeasureUi.getState().selectedId) useMeasureUi.getState().select(null);
  }, [editorSelection]);

  const mine = useMemo(() => rows.filter((m) => m.sheetId === sheet.id), [rows, sheet.id]);
  const recent = useMemo(() => recentLabels(rows), [rows]);
  const selected = ui.selectedId ? mine.find((m) => m.id === ui.selectedId) : undefined;

  // "Go to" from the panel: centre it once its sheet is on screen.
  const pf = ui.pendingFocus;
  useLayoutEffect(() => {
    if (!pf || pf.sheetId !== sheet.id || !viewport.ready) return;
    const t = setTimeout(() => {
      viewport.focus({ x: pf.x, y: pf.y }, 1);
      useMeasureUi.getState().select(pf.id);
      useMeasureUi.getState().focus(null);
    }, 60);
    return () => clearTimeout(t);
  }, [pf, sheet.id, viewport]);

  // Keys: capture phase, so the editor's own Esc / Enter / Backspace don't also act.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useMeasureUi.getState();
      const drawing = s.active && s.draft.length > 0;
      let handled = true;
      if (e.key === "Escape") {
        if (drawing) cancelDraft();
        else if (s.selectedId) s.select(null);
        else if (s.panelOpen) s.setPanelOpen(false);
        else if (s.active) s.setActive(false);
        else handled = false;
      } else if (e.key === "Enter" && drawing) void finishDraft();
      else if ((e.key === "Backspace" || e.key === "Delete") && drawing) undoPoint();
      else if ((e.key === "Backspace" || e.key === "Delete") && s.selectedId) {
        const m = useMeasurements.getState().rows.find((r) => r.id === s.selectedId);
        if (m) {
          s.setLastDeleted(m);
          s.select(null);
          void useMeasurements.getState().remove(m.id);
        }
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Mouse / pen: the live segment from the last vertex to the pointer.
  const active = ui.active;
  useEffect(() => {
    const el = anchor.current?.closest<HTMLElement>("[data-plan-canvas]");
    if (!el || !active) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const s = useMeasureUi.getState();
      if (!s.draft.length || s.draftSheetId !== sheet.id) return s.setHover(null);
      const r = el.getBoundingClientRect();
      let p = viewport.screenToRel({ x: e.clientX - r.left, y: e.clientY - r.top });
      if (e.shiftKey) {
        const from = { x: s.draft[s.draft.length - 2] * sheet.width, y: s.draft[s.draft.length - 1] * sheet.height };
        const q = snapAngle(from, { x: p.x * sheet.width, y: p.y * sheet.height });
        p = { x: q.x / sheet.width, y: q.y / sheet.height };
      }
      s.setHover({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) });
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => useMeasureUi.getState().setHover(null);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      useMeasureUi.getState().setHover(null);
    };
  }, [active, sheet.id, sheet.width, sheet.height, viewport]);

  const calibrate = () => {
    if (!editing) useViewer.getState().setMode("edit");
    ui.setActive(false);
    useEditor.getState().setTool({ kind: "calibrate" });
  };

  const colorFor = (label: string) => {
    const l = label.trim().toLowerCase();
    if (!l) return null;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].label?.trim().toLowerCase() === l && rows[i].color) return rows[i].color!;
    return null;
  };

  const last = ui.lastDeleted;
  return (
    <>
      <span ref={anchor} className="hidden" />
      <MeasureToolbar count={mine.length} recent={recent} hidden={toolKind !== "select"} colorFor={colorFor} />
      {ui.active && !sheet.pxPerFt && (
        <div className={bar} data-plan-ui data-testid="measure-calibrate">
          <span className="min-w-0 truncate py-1">Calibrate this sheet first</span>
          <button className="ml-1 flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold hover:bg-brand-600" onClick={calibrate}>
            <Crosshair className="h-3.5 w-3.5" /> Calibrate
          </button>
        </div>
      )}
      {ui.active && !!sheet.pxPerFt && <DrawBar sheet={sheet} />}
      {last && !ui.active && <UndoDelete name={last.label || KIND_NAMES[last.kind]} />}
      {selected && !ui.panelOpen && !(ui.active && ui.draft.length) && <MeasureEditCard key={selected.id} m={selected} sheet={sheet} recent={recent} />}
      {ui.panelOpen && <MeasurementsPanel sheet={sheet} rows={rows} />}
    </>
  );
}

function UndoDelete({ name }: { name: string }) {
  const last = useMeasureUi((s) => s.lastDeleted);
  useEffect(() => {
    const t = setTimeout(() => useMeasureUi.getState().setLastDeleted(null), 6000);
    return () => clearTimeout(t);
  }, [last]);
  return (
    <div className={bar} data-plan-ui>
      <span className="min-w-0 truncate py-1">Deleted {name}</span>
      <button
        className="ml-1 flex h-9 shrink-0 items-center gap-1 rounded-lg bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25"
        onClick={async () => {
          if (!last) return;
          useMeasureUi.getState().setLastDeleted(null);
          await useMeasurements.getState().restore(last);
          useMeasureUi.getState().select(last.id);
        }}
      >
        <Undo2 className="h-3.5 w-3.5" /> Undo
      </button>
    </div>
  );
}
