// Count pins ("Add by count"): one placed device that stands for several of its type on that sheet, e.g. 12 windows,
// so a contractor doesn't have to pin every one. `Marker.count` is 2…9999; absent / null means one device.
// Every count of devices goes through `markerQty` (takeoff, estimate, exports, alarm sensors). Mirrored in
// ios/PinPlanCore (Marker.quantity, Marker.normalizeCount).
import type { Marker } from "./types";

export const MAX_MARKER_COUNT = 9999;

/** How many devices this pin stands for (1 for a normal pin). */
export function markerQty(m: Pick<Marker, "count"> | null | undefined): number {
  const n = m?.count;
  return typeof n === "number" && Number.isFinite(n) && n >= 2 ? Math.min(MAX_MARKER_COUNT, Math.floor(n)) : 1;
}

/** The value to store for a typed count: null for 1 (or anything unusable), else a whole number up to 9999. */
export function normalizeCount(n: unknown): number | null {
  const v = typeof n === "string" ? Number(n.trim()) : n;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const i = Math.floor(v);
  return i >= 2 ? Math.min(MAX_MARKER_COUNT, i) : null;
}

/** Devices behind a list of pins (each count pin counts as its count). */
export function sumQty(markers: Pick<Marker, "count">[]): number {
  let n = 0;
  for (const m of markers) n += markerQty(m);
  return n;
}

/** A pin's label for lists and schedules: "WIN-1-03 ×12" for a count pin, else the label. */
export function pinLabel(m: Pick<Marker, "label" | "count">): string {
  const n = markerQty(m);
  return n > 1 ? `${m.label} ×${n}` : m.label;
}

/** Where the new pin goes: the middle of the view, nudged so it doesn't sit on another pin there. */
export function countPinSpot(center: { x: number; y: number }, taken: { x: number; y: number }[]): { x: number; y: number } {
  const c = { x: Math.min(0.97, Math.max(0.03, center.x)), y: Math.min(0.97, Math.max(0.03, center.y)) };
  for (let i = 0; i < 12; i++) {
    const p = { x: Math.min(0.97, c.x + i * 0.02), y: Math.min(0.97, c.y + i * 0.02) };
    if (!taken.some((m) => Math.abs(m.x - p.x) < 0.008 && Math.abs(m.y - p.y) < 0.008)) return p;
  }
  return c;
}
