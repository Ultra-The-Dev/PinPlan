"use client";
// One pointer-event state machine for the plan (mouse, pen and touch alike): tap, double-tap, long-press, pan with
// momentum, two-finger pinch/pan, two-finger tap, dragging a device/closet/run point, edge swipes, wheel and trackpad
// zoom. Deciding everything here (with tap-vs-drag thresholds) is what stops a pan from nudging a device: on touch a
// device only moves after a long-press; a quick drag across it pans the plan.
import type { PlanHit } from "./planHit";
import type { PlanViewport } from "./planViewport";
import { pinchTransform, releaseVelocity, type Point } from "./viewport";

export interface TapInfo {
  screen: Point;
  hit: PlanHit | null;
  pointerType: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface GestureHandlers {
  hitAt(screen: Point, pointerType: string): PlanHit | null;
  /** May this hit be dragged now (edit mode, select tool)? */
  canDrag(hit: PlanHit): boolean;
  onTap(e: TapInfo): void;
  onDoubleTap(e: TapInfo): void;
  /** Long-press on something that can't be dragged (or empty plan). */
  onLongPress(e: TapInfo): void;
  onDragStart(hit: PlanHit, screen: Point): void;
  onDragMove(hit: PlanHit, screen: Point): void;
  onDragEnd(hit: PlanHit, screen: Point): void;
  /** Swipe in from the left (-1, previous sheet) or right (+1, next sheet) edge on touch. */
  onEdgeSwipe(dir: -1 | 1): void;
  onTwoFingerTap(center: Point): void;
  onHover?(hit: PlanHit | null, screen: Point): void;
  /** Space bar held: every drag pans. */
  forcePan(): boolean;
  /**
   * A one-pointer press just moved past the tap slop: return true to hand this drag to someone else (a plan overlay
   * drawing or moving its own things) instead of panning / dragging a device. `start` is where the press began.
   */
  claimDrag?(start: TapInfo): boolean;
  claimedDragMove?(screen: Point): void;
  /** The claimed drag ended: released (cancelled false), or cancelled (pointer cancel, or a second finger → pinch). */
  claimedDragEnd?(screen: Point, cancelled: boolean): void;
  /** True while a still press must not turn into a long-press (an overlay is waiting to draw with it). */
  holdLongPress?(): boolean;
  /** Right-click with a mouse (the desktop long-press). Return true to suppress the browser menu. */
  onContextMenu?(e: TapInfo): boolean;
}

const SLOP: Record<string, number> = { mouse: 4, pen: 6, touch: 10 };
const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 32;
const EDGE_PX = 20;

interface Ptr {
  x: number;
  y: number;
  sx: number;
  sy: number;
  type: string;
}

type State =
  | { kind: "idle" }
  | { kind: "press"; id: number; hit: PlanHit | null; edge: -1 | 0 | 1; longPressed: boolean; mods: Pick<TapInfo, "shiftKey" | "metaKey" | "ctrlKey"> }
  | { kind: "held"; id: number }
  | { kind: "pan"; id: number; last: Point; samples: { x: number; y: number; t: number }[] }
  | { kind: "pinch"; prev: { center: Point; dist: number }; t0: number; travel: number; ids: [number, number] }
  | { kind: "afterPinch" }
  | { kind: "drag"; id: number; hit: PlanHit }
  | { kind: "claimed"; id: number; last: Point }
  | { kind: "edge"; id: number; edge: -1 | 1 };

export class PlanGestures {
  private ptrs = new Map<number, Ptr>();
  private state: State = { kind: "idle" };
  private rect: DOMRect;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastTap: { x: number; y: number; t: number; type: string } | null = null;
  private hoverQueued = false;
  private hoverPt: Point | null = null;
  private wheelEndTimer: ReturnType<typeof setTimeout> | null = null;
  last = "";

  constructor(
    private el: HTMLElement,
    private vp: PlanViewport,
    private h: GestureHandlers,
  ) {
    this.rect = el.getBoundingClientRect();
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.move);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.cancel);
    el.addEventListener("lostpointercapture", this.lost);
    el.addEventListener("wheel", this.wheel, { passive: false });
    el.addEventListener("contextmenu", this.contextMenu);
    // Safari's own pinch-zoom gesture events would zoom the page.
    el.addEventListener("gesturestart", this.prevent as EventListener);
  }

  destroy() {
    const el = this.el;
    el.removeEventListener("pointerdown", this.down);
    el.removeEventListener("pointermove", this.move);
    el.removeEventListener("pointerup", this.up);
    el.removeEventListener("pointercancel", this.cancel);
    el.removeEventListener("lostpointercapture", this.lost);
    el.removeEventListener("wheel", this.wheel);
    el.removeEventListener("contextmenu", this.contextMenu);
    el.removeEventListener("gesturestart", this.prevent as EventListener);
    this.clearTimer();
  }

  /** A drag of a device is in progress (the canvas hides its stored position meanwhile). */
  get dragging(): boolean {
    return this.state.kind === "drag";
  }

  private prevent = (e: Event) => e.preventDefault();
  private contextMenu = (e: MouseEvent) => {
    // Long-press on touch opens the browser menu otherwise.
    if (this.state.kind !== "idle" || (e as PointerEvent).pointerType === "touch") return e.preventDefault();
    if (this.ignored(e) || !this.h.onContextMenu) return;
    this.rect = this.el.getBoundingClientRect();
    const p = this.local(e);
    const info = this.tapInfo(p, this.h.hitAt(p, "mouse"), "mouse", { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey });
    if (this.h.onContextMenu(info)) e.preventDefault();
  };

  private local(e: { clientX: number; clientY: number }): Point {
    return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
  }

  private ignored(e: Event) {
    const t = e.target as Element | null;
    return !!t?.closest?.("[data-plan-ui]");
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tapInfo(p: Point, hit: PlanHit | null, type: string, mods: Pick<TapInfo, "shiftKey" | "metaKey" | "ctrlKey">): TapInfo {
    return { screen: p, hit, pointerType: type, ...mods };
  }

  private down = (e: PointerEvent) => {
    if (this.ignored(e)) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    if (this.ptrs.size === 0) this.rect = this.el.getBoundingClientRect();
    const p = this.local(e);
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, type: e.pointerType });
    if (this.ptrs.size === 1) {
      this.vp.beginInteraction();
      const forcePan = e.button === 1 || this.h.forcePan();
      const hit = forcePan ? null : this.h.hitAt(p, e.pointerType);
      if (forcePan) {
        this.state = { kind: "pan", id: e.pointerId, last: p, samples: [{ ...p, t: e.timeStamp }] };
        return;
      }
      const edge = e.pointerType === "touch" ? (p.x < EDGE_PX ? -1 : p.x > this.rect.width - EDGE_PX ? 1 : 0) : 0;
      this.state = { kind: "press", id: e.pointerId, hit, edge, longPressed: false, mods: { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey } };
      if (e.pointerType !== "mouse") {
        this.clearTimer();
        this.timer = setTimeout(() => this.longPress(e.pointerId), LONG_PRESS_MS);
      }
    } else if (this.ptrs.size === 2 && this.state.kind !== "drag") {
      this.clearTimer();
      // A second finger during an overlay's drag (drawing) cancels it and pinches instead.
      if (this.state.kind === "claimed") this.h.claimedDragEnd?.(this.state.last, true);
      const ids = [...this.ptrs.keys()] as [number, number];
      this.state = { kind: "pinch", prev: this.pair(ids), t0: e.timeStamp, travel: 0, ids };
    }
  };

  private pair(ids: [number, number]) {
    const a = this.ptrs.get(ids[0])!;
    const b = this.ptrs.get(ids[1])!;
    return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  private longPress(id: number) {
    this.timer = null;
    const s = this.state;
    if (s.kind !== "press" || s.id !== id) return;
    const p = this.ptrs.get(id);
    if (!p) return;
    // Pausing before drawing must not become a long-press: stay a press, so the move can still start the drag.
    if (this.h.holdLongPress?.()) return;
    navigator.vibrate?.(12);
    if (s.hit && this.h.canDrag(s.hit)) {
      this.state = { kind: "drag", id, hit: s.hit };
      this.h.onDragStart(s.hit, { x: p.x, y: p.y });
      return;
    }
    this.state = { kind: "held", id };
    this.h.onLongPress(this.tapInfo({ x: p.x, y: p.y }, s.hit, p.type, s.mods));
  }

  private move = (e: PointerEvent) => {
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) {
      if (this.ptrs.size === 0 && e.pointerType === "mouse" && this.h.onHover && !this.ignored(e)) this.hover(this.local(e));
      return;
    }
    const p = this.local(e);
    ptr.x = p.x;
    ptr.y = p.y;
    const s = this.state;
    switch (s.kind) {
      case "press": {
        if (s.id !== e.pointerId) return;
        const dx = p.x - ptr.sx;
        const dy = p.y - ptr.sy;
        if (Math.hypot(dx, dy) <= (SLOP[e.pointerType] ?? 6)) return;
        this.clearTimer();
        // Overlays first (drawing a markup, moving a task pin…): they start where the press began.
        if (this.h.claimDrag?.(this.tapInfo({ x: ptr.sx, y: ptr.sy }, s.hit, e.pointerType, s.mods))) {
          this.state = { kind: "claimed", id: s.id, last: p };
          this.h.claimedDragMove?.(p);
          return;
        }
        if (s.edge && Math.abs(dx) > Math.abs(dy)) {
          this.state = { kind: "edge", id: s.id, edge: s.edge };
          return;
        }
        if (s.hit && e.pointerType !== "touch" && this.h.canDrag(s.hit)) {
          this.state = { kind: "drag", id: s.id, hit: s.hit };
          this.h.onDragStart(s.hit, { x: ptr.sx, y: ptr.sy });
          this.h.onDragMove(s.hit, p);
          return;
        }
        // Grab the plan where the finger first touched (the slop isn't lost).
        this.vp.panBy(dx, dy);
        this.state = { kind: "pan", id: s.id, last: p, samples: [{ x: ptr.sx, y: ptr.sy, t: e.timeStamp - 16 }, { ...p, t: e.timeStamp }] };
        return;
      }
      case "pan": {
        if (s.id !== e.pointerId) return;
        this.vp.panBy(p.x - s.last.x, p.y - s.last.y);
        s.last = p;
        s.samples.push({ ...p, t: e.timeStamp });
        if (s.samples.length > 12) s.samples.shift();
        return;
      }
      case "pinch": {
        if (!this.ptrs.has(s.ids[0]) || !this.ptrs.has(s.ids[1])) return;
        const next = this.pair(s.ids);
        s.travel += Math.hypot(next.center.x - s.prev.center.x, next.center.y - s.prev.center.y) + Math.abs(next.dist - s.prev.dist);
        this.vp.set(pinchTransform(this.vp.transform, s.prev, next, this.vp.limits));
        s.prev = next;
        return;
      }
      case "drag":
        if (s.id === e.pointerId) this.h.onDragMove(s.hit, p);
        return;
      case "claimed":
        if (s.id === e.pointerId) {
          s.last = p;
          this.h.claimedDragMove?.(p);
        }
        return;
      default:
        return;
    }
  };

  private hover(p: Point) {
    this.hoverPt = p;
    if (this.hoverQueued) return;
    this.hoverQueued = true;
    requestAnimationFrame(() => {
      this.hoverQueued = false;
      if (this.hoverPt && this.ptrs.size === 0) this.h.onHover?.(this.h.hitAt(this.hoverPt, "mouse"), this.hoverPt);
    });
  }

  private finish(e: PointerEvent, cancelled: boolean) {
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) return;
    this.ptrs.delete(e.pointerId);
    const p = this.local(e);
    const s = this.state;
    /** What the last gesture was (tests and support). */
    this.last = s.kind;
    switch (s.kind) {
      case "press":
        if (s.id === e.pointerId) {
          this.clearTimer();
          this.state = { kind: "idle" };
          if (!cancelled) this.tap(p, s.hit, e.pointerType, s.mods, e.timeStamp);
        }
        break;
      case "pan":
        if (s.id === e.pointerId) {
          this.state = { kind: "idle" };
          if (!cancelled) this.vp.fling(releaseVelocity(s.samples));
        }
        break;
      case "drag":
        if (s.id === e.pointerId) {
          this.state = { kind: "idle" };
          this.h.onDragEnd(s.hit, cancelled ? { x: ptr.sx, y: ptr.sy } : p);
        }
        break;
      case "claimed":
        if (s.id === e.pointerId) {
          this.state = { kind: "idle" };
          this.h.claimedDragEnd?.(cancelled ? s.last : p, cancelled);
        }
        break;
      case "edge":
        if (s.id === e.pointerId) {
          this.state = { kind: "idle" };
          const dx = p.x - ptr.sx;
          const dy = p.y - ptr.sy;
          if (!cancelled && Math.abs(dx) > 60 && Math.abs(dy) < Math.abs(dx) * 0.7 && Math.sign(dx) === -s.edge) this.h.onEdgeSwipe(s.edge === -1 ? -1 : 1);
        }
        break;
      case "pinch": {
        const quick = e.timeStamp - s.t0 < 260 && s.travel < 14;
        if (quick && !cancelled) this.h.onTwoFingerTap(s.prev.center);
        // Keep panning with the finger that's still down, without a jump.
        const rest = [...this.ptrs.entries()][0];
        this.state = rest && !quick ? { kind: "pan", id: rest[0], last: { x: rest[1].x, y: rest[1].y }, samples: [] } : { kind: "afterPinch" };
        break;
      }
      case "held":
        if (s.id === e.pointerId) this.state = { kind: "idle" };
        break;
      default:
        break;
    }
    if (this.ptrs.size === 0) {
      this.state = { kind: "idle" };
      this.vp.endInteraction();
    }
  }

  private tap(p: Point, hit: PlanHit | null, type: string, mods: Pick<TapInfo, "shiftKey" | "metaKey" | "ctrlKey">, t: number) {
    const info = this.tapInfo(p, hit, type, mods);
    this.h.onTap(info);
    const last = this.lastTap;
    if (last && t - last.t < DOUBLE_TAP_MS && Math.hypot(p.x - last.x, p.y - last.y) < DOUBLE_TAP_PX && last.type === type) {
      this.lastTap = null;
      this.h.onDoubleTap(info);
    } else this.lastTap = { x: p.x, y: p.y, t, type };
  }

  private up = (e: PointerEvent) => this.finish(e, false);
  private cancel = (e: PointerEvent) => this.finish(e, true);
  private lost = (e: PointerEvent) => {
    if (this.ptrs.has(e.pointerId)) this.finish(e, false);
  };

  private wheel = (e: WheelEvent) => {
    if (this.ignored(e)) return;
    e.preventDefault();
    this.rect = this.el.getBoundingClientRect();
    const p = this.local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.rect.height : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch (browsers report it as ctrl+wheel) or ctrl+wheel: continuous zoom.
      this.vp.zoomAt(p, Math.exp(-dy * 0.01));
    } else if (isMouseWheel(e)) {
      // A wheel notch: a smooth 25% step toward the cursor.
      this.vp.zoomBy(Math.pow(1.25, -Math.sign(dy) * Math.min(3, Math.max(1, Math.abs(dy) / 100))), p, 160);
    } else {
      // Two-finger trackpad scroll pans (shift turns a vertical wheel sideways).
      if (this.wheelEndTimer) clearTimeout(this.wheelEndTimer);
      else this.vp.beginInteraction();
      this.vp.panBy(e.shiftKey && !dx ? -dy : -dx, e.shiftKey && !dx ? 0 : -dy);
      this.wheelEndTimer = setTimeout(() => {
        this.wheelEndTimer = null;
        this.vp.endInteraction();
      }, 120);
    }
  };
}

/** A notched mouse wheel (vs. a trackpad's fine-grained two-finger scroll). */
export function isMouseWheel(e: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">): boolean {
  if (e.deltaMode !== 0) return true;
  return e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY);
}
