// Hit testing for the plan viewer, in plain math instead of Konva's hit canvas: the canvas never has to draw a hit
// graph (half the drawing work on every frame), and taps, long-presses and drags are decided in one place. Pure.
import type { Point, SheetDims } from "./viewport";

export type PlanHit =
  | { kind: "marker"; id: string }
  | { kind: "closet"; id: string }
  | { kind: "run"; id: string }
  | { kind: "handle"; id: string; index: number };

export interface HitInput {
  markers: { id: string; x: number; y: number }[];
  closets: { id: string; x: number; y: number }[];
  runs: { id: string; points: number[] }[];
  /** The selected run, whose point handles can be dragged. */
  handlesFor?: { id: string; points: number[] } | null;
}

export interface HitOptions {
  /** Screen-px radius that counts as touching a marker / closet / handle, and distance to a run line. */
  marker: number;
  closet: number;
  run: number;
  handle: number;
}

export const MOUSE_HIT: HitOptions = { marker: 17, closet: 22, run: 9, handle: 11 };
/** Fingers are less precise: bigger targets. */
export const TOUCH_HIT: HitOptions = { marker: 24, closet: 28, run: 14, handle: 18 };

/** Distance (same units as the inputs) from p to the segment a–b. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
}

/**
 * What is under a point. `pt` is in sheet px; `scale` is screen px per sheet px; `size` multiplies the marker/closet
 * radii (markers are drawn smaller when zoomed out). Run handles win, then markers, closets, and run lines; the nearest
 * one of a kind wins (markers drawn later sit on top, so ties go to the later one).
 */
export function hitTestPlan(input: HitInput, sheet: SheetDims, pt: Point, scale: number, opts: HitOptions = MOUSE_HIT, size = 1): PlanHit | null {
  const W = sheet.width;
  const H = sheet.height;
  const d = (x: number, y: number) => Math.hypot(x * W - pt.x, y * H - pt.y) * scale; // screen px

  if (input.handlesFor) {
    const p = input.handlesFor.points;
    for (let i = 0; i + 1 < p.length; i += 2) if (d(p[i], p[i + 1]) <= opts.handle) return { kind: "handle", id: input.handlesFor.id, index: i / 2 };
  }

  let best: { id: string; dist: number } | null = null;
  for (const m of input.markers) {
    const dist = d(m.x, m.y);
    if (dist <= opts.marker * size && (!best || dist <= best.dist)) best = { id: m.id, dist };
  }
  if (best) return { kind: "marker", id: best.id };

  for (const c of input.closets) {
    const dist = d(c.x, c.y);
    if (dist <= opts.closet * size && (!best || dist <= best.dist)) best = { id: c.id, dist };
  }
  if (best) return { kind: "closet", id: best.id };

  for (const r of input.runs) {
    const p = r.points;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const dist = distToSegment(pt, { x: p[i] * W, y: p[i + 1] * H }, { x: p[i + 2] * W, y: p[i + 3] * H }) * scale;
      if (dist <= opts.run && (!best || dist < best.dist)) best = { id: r.id, dist };
    }
  }
  return best ? { kind: "run", id: best.id } : null;
}
