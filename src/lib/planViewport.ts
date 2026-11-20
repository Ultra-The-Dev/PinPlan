"use client";
// The plan viewer's live pan/zoom state. Pan, pinch, wheel, inertia and animations change the transform many times a
// second, so it lives here — outside React — and is pushed straight to the Konva stage; React components that show it
// (zoom %, minimap, overlays) subscribe and re-render at most once per frame. Geometry is in viewport.ts (pure).
import type Konva from "konva";
import { PLAN_CHROME } from "./planOverlays";
import {
  centerOn,
  clampTransform,
  decayVelocity,
  easeOutCubic,
  fitTransform,
  fromMemory,
  lerpTransform,
  markerSizeFactor,
  relToScreen,
  screenToRel,
  screenToSheetPx,
  sheetPxToScreen,
  toMemory,
  zoomAbout,
  zoomLimits,
  type FitInsets,
  type FitMode,
  type Point,
  type SheetDims,
  type ViewMemory,
  type ViewSize,
  type ViewTransform,
  type ZoomLimits,
} from "./viewport";

/** Konva nodes named "cs" keep a constant on-screen size: their scale is set to sizeFactor / zoom on every zoom. */
export const CONSTANT_SIZE = "cs";

export interface ViewportSnapshot {
  t: ViewTransform;
  size: ViewSize;
  sheet: SheetDims;
  /** Screen size multiplier for markers/labels at this zoom (see markerSizeFactor). */
  sizeFactor: number;
  limits: ZoomLimits;
  /** True while a gesture, fling or animation is moving the view. */
  moving: boolean;
}

/** Widest left-rail item the default fit keeps clear (Measure, Progress, Back to sheet, Link). */
export const LEFT_RAIL_FIT_WIDTH = 120;

/**
 * Default room for the plan's chrome when fitting a sheet (PLAN_CHROME numbers; the plan-view width decides phone or
 * wide): the top bar (sheet pill, tools, View / Edit) and, on wider plans, the left rail under the sheet pill, so a
 * fitted drawing starts clear of them. Phones only keep the top bar clear: a left inset costs too much of a narrow view.
 */
export function planFitInsets(size: ViewSize): FitInsets {
  if (size.w <= PLAN_CHROME.phoneMax) return { top: PLAN_CHROME.railTop.phone - PLAN_CHROME.gutter.phone };
  return {
    top: PLAN_CHROME.railTop.wide - PLAN_CHROME.railGap,
    left: PLAN_CHROME.gutter.wide + LEFT_RAIL_FIT_WIDTH + PLAN_CHROME.railGap,
  };
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export class PlanViewport {
  private t: ViewTransform = { scale: 1, x: 0, y: 0 };
  private size: ViewSize = { w: 0, h: 0 };
  private sheet: SheetDims = { width: 1, height: 1 };
  private stage: Konva.Stage | null = null;
  private listeners = new Set<() => void>();
  private snap: ViewportSnapshot | null = null;
  private notifyQueued = false;
  private anim: { raf: number; target?: ViewTransform } | null = null;
  private interacting = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScale = 0;
  private fitInsets: FitInsets | ((size: ViewSize) => FitInsets) = planFitInsets;
  /** Set once a real size and sheet are known and a first view is placed. */
  ready = false;

  // ---------------- state ----------------

  get transform(): ViewTransform {
    return this.t;
  }
  get viewSize(): ViewSize {
    return this.size;
  }
  get sheetDims(): SheetDims {
    return this.sheet;
  }
  get limits(): ZoomLimits {
    return zoomLimits(this.size, this.sheet);
  }
  get sizeFactor(): number {
    return markerSizeFactor(this.t.scale, this.limits.fit);
  }
  get moving(): boolean {
    return !!this.anim || this.interacting > 0 || !!this.settleTimer;
  }

  /** Stable snapshot for useSyncExternalStore (new object only after a change). */
  getSnapshot = (): ViewportSnapshot => {
    if (!this.snap) this.snap = { t: this.t, size: this.size, sheet: this.sheet, sizeFactor: this.sizeFactor, limits: this.limits, moving: this.moving };
    return this.snap;
  };

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private queueNotify() {
    this.snap = null;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    requestAnimationFrame(() => {
      this.notifyQueued = false;
      this.listeners.forEach((l) => l());
    });
  }

  // ---------------- conversions (current transform) ----------------

  relToScreen = (p: Point): Point => relToScreen(this.t, this.sheet, p);
  screenToRel = (p: Point): Point => screenToRel(this.t, this.sheet, p);
  sheetPxToScreen = (p: Point): Point => sheetPxToScreen(this.t, p);
  screenToSheetPx = (p: Point): Point => screenToSheetPx(this.t, p);

  // ---------------- wiring ----------------

  attach(stage: Konva.Stage | null) {
    this.stage = stage;
    if (stage) this.apply(true);
  }

  /** New container size: keep the same sheet point in the middle at the same zoom. */
  setSize(size: ViewSize) {
    if (size.w === this.size.w && size.h === this.size.h) return;
    const old = this.size;
    this.size = size;
    if (!this.ready || !old.w || !old.h) return this.queueNotify();
    const c = screenToSheetPx(this.t, { x: old.w / 2, y: old.h / 2 });
    this.set(centerOn(size, c, this.t.scale));
  }

  /** Show a sheet: at its remembered view, or fitted. */
  setSheet(sheet: SheetDims, memory?: ViewMemory | null) {
    this.stopMotion();
    this.sheet = { width: sheet.width, height: sheet.height };
    if (!this.size.w || !this.size.h) {
      this.ready = false;
      return;
    }
    this.ready = true;
    this.set(memory ? fromMemory(memory, this.size, this.sheet) : this.fitted(), { clamp: false });
  }

  /**
   * Room the chrome takes on each side when fitting (a fixed value, or computed from the view size); null restores the
   * default (planFitInsets). Applies to fits made after the call.
   */
  setFitInsets(insets: FitInsets | ((size: ViewSize) => FitInsets) | null) {
    this.fitInsets = insets ?? planFitInsets;
  }

  /** The fitted view for the current size and sheet, clear of the chrome. */
  fitted(mode: FitMode = "sheet"): ViewTransform {
    const insets = typeof this.fitInsets === "function" ? this.fitInsets(this.size) : this.fitInsets;
    return fitTransform(this.size, this.sheet, mode, undefined, insets);
  }

  memory(): ViewMemory | null {
    return this.ready ? toMemory(this.t, this.size, this.sheet) : null;
  }

  /** Apply a transform now (clamped to the zoom limits and pan bounds unless told otherwise). */
  set(t: ViewTransform, opts: { clamp?: boolean } = {}) {
    let next = t;
    if (opts.clamp !== false) {
      const lim = this.limits;
      if (next.scale < lim.min || next.scale > lim.max) next = zoomAbout(next, { x: this.size.w / 2, y: this.size.h / 2 }, Math.max(lim.min, Math.min(lim.max, next.scale)) / next.scale);
      next = clampTransform(next, this.size, this.sheet);
    }
    if (!Number.isFinite(next.scale) || !Number.isFinite(next.x) || !Number.isFinite(next.y) || next.scale <= 0) return;
    this.t = next;
    this.apply(false);
    this.queueNotify();
  }

  /** Push the transform to Konva: stage scale/position, constant-size nodes, one batched redraw. */
  private apply(force: boolean) {
    const st = this.stage;
    if (!st) return;
    st.scale({ x: this.t.scale, y: this.t.scale });
    st.position({ x: this.t.x, y: this.t.y });
    if (force || this.t.scale !== this.lastScale) {
      this.lastScale = this.t.scale;
      this.updateConstantSize();
    }
    st.batchDraw();
  }

  /** Rescale every constant-size node (closets, run labels, handles). Markers read sizeFactor while drawing. */
  updateConstantSize() {
    const st = this.stage;
    if (!st) return;
    const k = this.sizeFactor / this.t.scale;
    for (const layer of st.getLayers()) for (const n of layer.find(`.${CONSTANT_SIZE}`)) n.scale({ x: k, y: k });
  }

  redraw() {
    this.stage?.batchDraw();
  }

  // ---------------- interaction bookkeeping ----------------

  /** A gesture started (pointer down): stop flings/animations. */
  beginInteraction() {
    this.stopMotion();
    this.interacting++;
    this.queueNotify();
  }
  endInteraction() {
    this.interacting = Math.max(0, this.interacting - 1);
    this.settleSoon();
  }
  /** Moving stops a moment after the last change (wheel has no "end" event). */
  private settleSoon() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.queueNotify();
    }, 140);
    this.queueNotify();
  }

  stopMotion() {
    if (this.anim) cancelAnimationFrame(this.anim.raf);
    this.anim = null;
  }

  // ---------------- navigation ----------------

  panBy(dx: number, dy: number) {
    this.set({ ...this.t, x: this.t.x + dx, y: this.t.y + dy });
  }

  zoomAt(p: Point, factor: number) {
    this.set(zoomAbout(this.t, p, factor, this.limits));
    this.settleSoon();
  }

  center(): Point {
    return { x: this.size.w / 2, y: this.size.h / 2 };
  }

  /** Animate to a transform (instant with reduced motion). */
  animateTo(target: ViewTransform, ms = 260) {
    this.stopMotion();
    const lim = this.limits;
    let to = target;
    if (to.scale < lim.min || to.scale > lim.max) to = zoomAbout(to, this.center(), Math.max(lim.min, Math.min(lim.max, to.scale)) / to.scale);
    to = clampTransform(to, this.size, this.sheet);
    if (reducedMotion() || ms <= 0) return this.set(to);
    const from = this.t;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      this.set(lerpTransform(from, to, easeOutCubic(k), this.size), { clamp: false });
      if (k < 1) this.anim = { raf: requestAnimationFrame(step), target: to };
      else {
        this.anim = null;
        this.settleSoon();
      }
    };
    this.anim = { raf: requestAnimationFrame(step), target: to };
  }

  /** Smooth zoom by a factor about a point (buttons, keys, double-tap, mouse-wheel notches). Chains with a running zoom. */
  zoomBy(factor: number, p: Point = this.center(), ms = 200) {
    // Mid-animation, step from where the view is heading, so quick wheel notches add up instead of being lost.
    const base = this.anim?.target ?? this.t;
    this.animateTo(zoomAbout(base, p, factor, this.limits), ms);
  }

  fit(mode: FitMode = "sheet", animate = true) {
    const t = this.fitted(mode);
    if (animate) this.animateTo(t);
    else this.set(t, { clamp: false });
  }

  /** 100% = one image pixel per screen pixel. */
  actualSize() {
    this.animateTo(zoomAbout(this.t, this.center(), 1 / this.t.scale));
  }

  /** Centre a sheet point (0–1), zooming in to at least `minZoom` × fit. */
  focus(rel: Point, minZoom = 2.5) {
    const scale = Math.max(this.t.scale, this.limits.fit * minZoom);
    this.animateTo(centerOn(this.size, { x: rel.x * this.sheet.width, y: rel.y * this.sheet.height }, scale), 320);
  }

  /** Centre a sheet point (0–1) at the current zoom (minimap drag). */
  centerRel(rel: Point, animate = false) {
    const t = centerOn(this.size, { x: rel.x * this.sheet.width, y: rel.y * this.sheet.height }, this.t.scale);
    if (animate) return this.animateTo(t, 200);
    this.stopMotion();
    this.set(t);
  }

  /** Momentum after a pan: velocity in px/ms. */
  fling(v: Point) {
    this.stopMotion();
    if (reducedMotion() || Math.hypot(v.x, v.y) < 0.15) return this.settleSoon();
    let vel = { x: Math.max(-6, Math.min(6, v.x)), y: Math.max(-6, Math.min(6, v.y)) };
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const before = this.t;
      this.set({ ...this.t, x: this.t.x + vel.x * dt, y: this.t.y + vel.y * dt });
      vel = decayVelocity(vel, dt);
      // Stop at the pan bounds or when slow.
      const stuck = this.t.x === before.x && this.t.y === before.y;
      if (Math.hypot(vel.x, vel.y) > 0.02 && !stuck) this.anim = { raf: requestAnimationFrame(step) };
      else {
        this.anim = null;
        this.settleSoon();
      }
    };
    this.anim = { raf: requestAnimationFrame(step) };
  }

  destroy() {
    this.stopMotion();
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.listeners.clear();
    this.stage = null;
  }
}
