"use client";
// Full-screen "where is it?" picker for an RFI: pick a sheet, zoom, tap the spot. Tapping on (or next to) a device
// links that device. A plain image (no plan overlay), so it stays independent of the plan editor.
import { Check, Minus, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DeviceType, Marker, Sheet } from "@/lib/types";
import { useSheetImage } from "@/lib/useImage";

export interface PlanSpot {
  sheetId: string;
  x: number;
  y: number;
  markerId: string | null;
}

const ZOOMS = [1, 1.5, 2, 3, 4, 6];
/** How close (screen px) a tap must be to a device to link it. */
const SNAP_PX = 22;

export function markerName(m: Marker, catalog: DeviceType[]): string {
  return m.label || catalog.find((d) => d.id === m.deviceTypeId)?.name || "Device";
}

export default function PlanSpotPicker({
  sheets,
  markers,
  catalog,
  initial,
  onPick,
  onCancel,
}: {
  sheets: Sheet[];
  markers: Marker[];
  catalog: DeviceType[];
  initial: Partial<PlanSpot> | null;
  onPick: (spot: PlanSpot) => void;
  onCancel: () => void;
}) {
  const [sheetId, setSheetId] = useState(initial?.sheetId && sheets.some((s) => s.id === initial.sheetId) ? initial.sheetId : (sheets[0]?.id ?? ""));
  const [spot, setSpot] = useState<PlanSpot | null>(initial?.sheetId && initial.x != null && initial.y != null ? { sheetId: initial.sheetId, x: initial.x, y: initial.y, markerId: initial.markerId ?? null } : null);
  // Open zoomed in on an existing spot (centred on it once the plan image has loaded).
  const [zoom, setZoom] = useState(spot ? 2 : 1);
  const sheet = sheets.find((s) => s.id === sheetId);
  const img = useSheetImage(sheet?.imageId);
  const scroller = useRef<HTMLDivElement>(null);
  const pending = useRef<{ cx: number; cy: number } | null>(spot ? { cx: spot.x, cy: spot.y } : null);
  const onSheet = markers.filter((m) => m.sheetId === sheetId && !m.deleted);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);

  // Keep the middle of the view in place when zooming.
  function zoomTo(next: number) {
    const el = scroller.current;
    if (el) pending.current = { cx: (el.scrollLeft + el.clientWidth / 2) / Math.max(1, el.scrollWidth), cy: (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight) };
    setZoom(next);
  }
  useLayoutEffect(() => {
    const el = scroller.current;
    const p = pending.current;
    if (!el || !p) return;
    pending.current = null;
    el.scrollLeft = p.cx * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = p.cy * el.scrollHeight - el.clientHeight / 2;
  }, [zoom, img?.id]);

  function tap(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    let best: Marker | null = null;
    let bestD = SNAP_PX;
    for (const m of onSheet) {
      const d = Math.hypot((m.x - x) * r.width, (m.y - y) * r.height);
      if (d <= bestD) {
        best = m;
        bestD = d;
      }
    }
    setSpot(best ? { sheetId, x: best.x, y: best.y, markerId: best.id } : { sheetId, x, y, markerId: null });
  }

  // Keyboard: arrows move the spot (Shift for bigger steps), starting from the middle of the sheet.
  function key(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const from = spot && spot.sheetId === sheetId ? spot : { x: 0.5, y: 0.5 };
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setSpot({ sheetId, x: clamp(from.x + d[0]), y: clamp(from.y + d[1]), markerId: null });
  }

  const linked = spot?.markerId ? markers.find((m) => m.id === spot.markerId) : null;
  const zi = ZOOMS.indexOf(zoom);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900" role="dialog" aria-modal="true" aria-label="Pick the spot on the plan">
      <div className="flex items-center gap-2 bg-white px-3 py-2 shadow-sm">
        <button className="btn btn-icon btn-ghost" onClick={onCancel} aria-label="Close">
          <X />
        </button>
        <select className="input h-9 w-auto min-w-0 flex-1 sm:max-w-xs" value={sheetId} onChange={(e) => (setSheetId(e.target.value), setZoom(1))} aria-label="Sheet">
          {sheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="seg">
          <button className="tab" onClick={() => zoomTo(ZOOMS[Math.max(0, zi - 1)])} disabled={zi <= 0} aria-label="Zoom out">
            <Minus />
          </button>
          <span className="w-10 text-center text-xs font-semibold text-slate-600 tabular-nums">{zoom}×</span>
          <button className="tab" onClick={() => zoomTo(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])} disabled={zi >= ZOOMS.length - 1} aria-label="Zoom in">
            <Plus />
          </button>
        </div>
      </div>
      <p className="bg-slate-800 px-3 py-1.5 text-center text-xs text-white/85" aria-live="polite">
        {spot && spot.sheetId === sheetId ? (linked ? `Linked to ${markerName(linked, catalog)} — tap elsewhere to move` : "Spot marked — tap elsewhere to move it") : "Tap the plan where the question is (tap a device to link it)"}
      </p>
      <div ref={scroller} className="relative flex-1 overflow-auto overscroll-contain">
        {!sheet ? (
          <p className="p-10 text-center text-white/70">This job has no plan sheets yet.</p>
        ) : !img ? (
          <p className="p-10 text-center text-white/70">Loading the plan…</p>
        ) : (
          <div className="p-3" style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
            <div
              className="relative cursor-crosshair bg-white shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400"
              style={{ aspectRatio: `${img.img.naturalWidth} / ${img.img.naturalHeight}` }}
              onClick={tap}
              onKeyDown={key}
              tabIndex={0}
              role="application"
              aria-label={`${sheet.name}: tap the spot, or use the arrow keys to move it`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={sheet.name} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none" />
              {onSheet.map((m) => (
                <span
                  key={m.id}
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, background: catalog.find((d) => d.id === m.deviceTypeId)?.color ?? "#64748b" }}
                />
              ))}
              {spot && spot.sheetId === sheetId && (
                <span
                  className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-red-600 bg-red-500/20 shadow-[0_0_0_3px_rgba(255,255,255,0.9)]"
                  style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
                  data-testid="rfi-spot"
                />
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 bg-white px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{sheet?.name}</span>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-brand" disabled={!spot} onClick={() => spot && onPick(spot)}>
          <Check /> Use this spot
        </button>
      </div>
    </div>
  );
}
