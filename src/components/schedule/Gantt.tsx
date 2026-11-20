"use client";
// Gantt chart for a job's schedule: plain HTML bars over an SVG grid (no chart library). Drag a bar to move it, drag
// its right edge to change its length (snaps to days); dependents are pushed live while dragging and saved on drop.
// Arrow keys do the same from the keyboard (Shift + arrow changes the length).
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, dayNum, dayStr, isWeekend, mergeRows, moveItem, resizeItem, weekday } from "@/lib/schedule";
import type { ScheduleItem } from "@/lib/types";
import { CrewAvatars, DEFAULT_BAR, fmtDay, fmtRange } from "./shared";

export type Zoom = "day" | "week";
const DAY_W: Record<Zoom, number> = { day: 36, week: 14 };
const ROW_H = 44;
const HEAD_H = 44;
const BAR_H = 26;

interface Drag {
  id: string;
  kind: "move" | "resize";
  x0: number;
  delta: number;
  moved: boolean;
}

export default function Gantt(props: {
  /** Rows to show, in order. */
  items: ScheduleItem[];
  /** Every live item of the job (dependents outside the view still get pushed). */
  all: ScheduleItem[];
  from: string;
  to: string;
  today: string;
  zoom: Zoom;
  critical: Set<string>;
  /** Bumped to scroll the chart to today. */
  todaySignal: number;
  canDrag: (item: ScheduleItem) => boolean;
  onOpen: (item: ScheduleItem) => void;
  /** Changed rows (the dragged item first) and their previous versions. */
  onCommit: (rows: ScheduleItem[], prev: ScheduleItem[]) => void;
}) {
  const { items, all, from, to, today, zoom, critical } = props;
  const w = DAY_W[zoom];
  const start = dayNum(from);
  const nDays = Math.max(1, dayNum(to) - start + 1);
  const width = nDays * w;
  const height = Math.max(1, items.length) * ROW_H;
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // While dragging: the moved item and everything it pushes.
  const preview = useMemo(() => {
    if (!drag || !drag.delta) return null;
    const item = all.find((i) => i.id === drag.id);
    if (!item) return null;
    if (drag.kind === "move") return moveItem(all, drag.id, drag.delta);
    return resizeItem(all, drag.id, addDays(item.end, drag.delta));
  }, [drag, all]);
  const shown = useMemo(() => (preview ? mergeRows(items, preview).filter((i) => items.some((x) => x.id === i.id)) : items), [items, preview]);
  const moving = useMemo(() => new Set((preview ?? []).map((r) => r.id)), [preview]);
  const row = useMemo(() => new Map(shown.map((i, n) => [i.id, n])), [shown]);
  const byId = useMemo(() => new Map(shown.map((i) => [i.id, i])), [shown]);

  const x = (day: string) => (dayNum(day) - start) * w;
  const todayX = today ? x(today) : -1;

  // Scroll so today sits a little in from the left (on open, on "Today" and on zoom change).
  useEffect(() => {
    const el = scroller.current;
    if (!el || todayX < 0) return;
    el.scrollLeft = Math.max(0, todayX - w * 3);
  }, [props.todaySignal, zoom, todayX, w]);

  const days = useMemo(() => Array.from({ length: nDays }, (_, i) => dayStr(start + i)), [nDays, start]);

  function onDown(e: React.PointerEvent, item: ScheduleItem, kind: Drag["kind"]) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!props.canDrag(item)) {
      setDrag({ id: item.id, kind: "move", x0: e.clientX, delta: 0, moved: false });
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: item.id, kind, x0: e.clientX, delta: 0, moved: false });
  }
  function onMove(e: React.PointerEvent) {
    if (!drag || !props.canDrag(byId.get(drag.id)!)) return;
    const dx = e.clientX - drag.x0;
    const moved = drag.moved || Math.abs(dx) > 4;
    const delta = Math.round(dx / w);
    if (moved !== drag.moved || delta !== drag.delta) setDrag({ ...drag, moved, delta });
  }
  function onUp(item: ScheduleItem) {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!d.moved) return props.onOpen(item);
    if (preview?.length) commit(preview);
  }
  function commit(rows: ScheduleItem[]) {
    const prevById = new Map(all.map((i) => [i.id, i]));
    props.onCommit(rows, rows.map((r) => prevById.get(r.id)!).filter(Boolean));
  }
  function onKey(e: React.KeyboardEvent, item: ScheduleItem) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return props.onOpen(item);
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!props.canDrag(item)) return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    const rows = e.shiftKey ? resizeItem(all, item.id, addDays(item.end, step)) : moveItem(all, item.id, step);
    if (rows?.length) commit(rows);
  }

  // Dependency arrows between visible rows.
  const arrows = useMemo(() => {
    const out: { key: string; d: string; hot: boolean }[] = [];
    for (const s of shown) {
      for (const dep of s.dependsOn ?? []) {
        const p = byId.get(dep.id);
        if (!p) continue;
        const x1 = (dayNum(p.end) - start + 1) * w;
        const y1 = row.get(p.id)! * ROW_H + ROW_H / 2;
        const x2 = (dayNum(s.start) - start) * w;
        const y2 = row.get(s.id)! * ROW_H + ROW_H / 2;
        const down = y2 >= y1 ? 1 : -1;
        const d =
          x2 - x1 >= 12
            ? `M${x1} ${y1} H${x1 + 6} V${y2} H${x2 - 1}`
            : `M${x1} ${y1} h6 V${y2 - (down * ROW_H) / 2} H${x2 - 8} V${y2} H${x2 - 1}`;
        out.push({ key: `${p.id}>${s.id}`, d, hot: critical.has(p.id) && critical.has(s.id) });
      }
    }
    return out;
  }, [shown, byId, row, start, w, critical]);

  const weekLabels = useMemo(() => days.map((d, i) => ({ d, i })).filter(({ d, i }) => weekday(d) === 1 || i === 0), [days]);

  return (
    <div className="card flex overflow-hidden select-none" data-testid="gantt">
      {/* Names */}
      <div className="w-40 shrink-0 border-r border-slate-200 sm:w-56">
        <div className="flex items-end border-b border-slate-200 px-3 pb-1.5 text-xs font-medium text-slate-500" style={{ height: HEAD_H }}>
          Phase
        </div>
        {shown.map((i) => (
          <button
            key={i.id}
            className="flex w-full items-center gap-2 border-b border-slate-100 px-3 text-left hover:bg-slate-50"
            style={{ height: ROW_H }}
            onClick={() => props.onOpen(i)}
            title={`${i.name} · ${fmtRange(i.start, i.end)}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color || DEFAULT_BAR }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{i.name || "Untitled"}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {fmtRange(i.start, i.end)}
                {critical.has(i.id) && <span className="ml-1 font-medium text-red-600">· critical</span>}
              </span>
            </span>
            <span className="hidden sm:flex">
              <CrewAvatars crew={i.crew} max={2} />
            </span>
            <span className="w-8 shrink-0 text-right text-xs text-slate-500 tabular-nums">{Math.round(i.progress ?? 0)}%</span>
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div ref={scroller} className="scroll-thin min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
        <div className="relative" style={{ width, minWidth: "100%" }}>
          {/* Header: week starts, then days */}
          <div className="sticky top-0 border-b border-slate-200 bg-white" style={{ height: HEAD_H }}>
            {weekLabels.map(({ d, i }) => (
              <div key={d} className="absolute top-1 truncate pl-1 text-[11px] font-medium text-slate-600" style={{ left: i * w, width: Math.max(w * 7, 40) }}>
                {fmtDay(d, { month: "short", day: "numeric" })}
              </div>
            ))}
            {zoom === "day" &&
              days.map((d, i) => (
                <div
                  key={d}
                  className={`absolute bottom-1 text-center text-[10px] tabular-nums ${d === today ? "font-semibold text-brand-700" : isWeekend(d) ? "text-slate-400" : "text-slate-500"}`}
                  style={{ left: i * w, width: w }}
                >
                  {fmtDay(d, { weekday: "narrow" })}
                  {Number(d.slice(8))}
                </div>
              ))}
          </div>

          {/* Body */}
          <div className="relative" style={{ height }}>
            <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
              <defs>
                <marker id="pp-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="#5F718B" />
                </marker>
                <marker id="pp-arrow-hot" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="#C73A2C" />
                </marker>
              </defs>
              {days.map((d, i) => (isWeekend(d) ? <rect key={d} x={i * w} y={0} width={w} height={height} fill="#E6EDF5" opacity={0.7} /> : null))}
              {days.map((d, i) => (weekday(d) === 1 ? <line key={`l${d}`} x1={i * w} x2={i * w} y1={0} y2={height} stroke="#D5DFEB" /> : null))}
              {shown.map((i, n) => (
                <line key={`r${i.id}`} x1={0} x2={width} y1={(n + 1) * ROW_H - 0.5} y2={(n + 1) * ROW_H - 0.5} stroke="#F2F6FA" />
              ))}
              {arrows.map((a) => (
                <path
                  key={a.key}
                  d={a.d}
                  fill="none"
                  stroke={a.hot ? "#C73A2C" : "#5F718B"}
                  strokeWidth={a.hot ? 1.6 : 1.2}
                  markerEnd={`url(#${a.hot ? "pp-arrow-hot" : "pp-arrow"})`}
                  data-testid="dep-arrow"
                />
              ))}
              {todayX >= 0 && todayX <= width && <line x1={todayX + w / 2} x2={todayX + w / 2} y1={0} y2={height} stroke="#0F2340" strokeWidth={1.5} strokeDasharray="3 3" />}
            </svg>

            {shown.map((i, n) => {
              const left = x(i.start);
              const bw = Math.max(w, (dayNum(i.end) - dayNum(i.start) + 1) * w);
              const color = i.color || DEFAULT_BAR;
              const p = Math.min(100, Math.max(0, i.progress ?? 0));
              const draggable = props.canDrag(i);
              const isCrit = critical.has(i.id);
              const active = drag?.id === i.id && drag.moved;
              const labelInside = bw >= 90;
              return (
                <div
                  key={i.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${i.name}, ${fmtRange(i.start, i.end)}, ${Math.round(p)}% done${draggable ? ". Drag or use arrow keys to move; Shift+arrow changes length" : ""}`}
                  data-testid={`bar-${i.name}`}
                  data-start={i.start}
                  data-end={i.end}
                  className={`group absolute flex items-center rounded-md shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${active || moving.has(i.id) ? "opacity-90 shadow-pop" : ""} ${isCrit ? "ring-2 ring-red-500/70" : ""}`}
                  style={{ left, top: n * ROW_H + (ROW_H - BAR_H) / 2, width: bw, height: BAR_H, background: `${color}33`, touchAction: draggable ? "pan-y" : "auto" }}
                  onPointerDown={(e) => onDown(e, i, "move")}
                  onPointerMove={onMove}
                  onPointerUp={() => onUp(i)}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <span className="absolute inset-y-0 left-0 rounded-l-md" style={{ width: `${p}%`, background: color, borderTopRightRadius: p >= 100 ? 6 : 0, borderBottomRightRadius: p >= 100 ? 6 : 0 }} />
                  <span className="absolute inset-0 rounded-md" style={{ boxShadow: `inset 0 0 0 1px ${color}` }} />
                  {labelInside && (
                    <span className="relative truncate px-2 text-xs font-medium" style={{ color: p > 45 ? "#fff" : "#0F2340", textShadow: p > 45 ? "0 1px 1px rgb(0 0 0 / .25)" : undefined }}>
                      {i.name}
                    </span>
                  )}
                  {!labelInside && (
                    <span className="pointer-events-none absolute left-full ml-1.5 truncate text-xs font-medium whitespace-nowrap text-slate-700">{i.name}</span>
                  )}
                  {draggable && (
                    <span
                      className="absolute inset-y-0 -right-1 flex w-4 cursor-ew-resize items-center justify-center"
                      onPointerDown={(e) => onDown(e, i, "resize")}
                      onPointerMove={onMove}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        onUp(i);
                      }}
                      aria-hidden
                      data-testid={`resize-${i.name}`}
                    >
                      <span className="h-3.5 w-1 rounded-full bg-white/90 opacity-0 shadow ring-1 ring-slate-300 transition group-hover:opacity-100" />
                    </span>
                  )}
                </div>
              );
            })}
            {active(drag) && preview && <DragHint drag={drag!} item={byId.get(drag!.id)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

const active = (d: Drag | null) => !!d?.moved && d.delta !== 0;

function DragHint({ drag, item }: { drag: Drag; item?: ScheduleItem }) {
  if (!item) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink/90 px-3 py-1.5 text-xs font-medium text-white shadow-pop">
      {drag.kind === "move" ? "Move" : "Ends"} {fmtRange(item.start, item.end)} ({drag.delta > 0 ? "+" : ""}
      {drag.delta} d)
    </div>
  );
}
