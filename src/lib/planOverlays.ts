"use client";
// Extension point for features that draw ON the plan (task pins, markups, measurements, sheet links, revision
// compare…). An overlay is a plain object registered once (module side effect or effect) or passed to PlanCanvas's
// `overlays` prop. The canvas renders each overlay in its own Konva Layer (sheet-pixel coordinates, the stage
// transform already applied) and/or an absolutely positioned HTML layer (screen pixels), and offers it taps before the
// editor's own tools. See docs/plan-viewer.md.
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { PlanViewport, ViewportSnapshot } from "./planViewport";
import type { Tool } from "./store";
import type { Sheet } from "./types";
import type { Point } from "./viewport";

export interface PlanOverlayContext {
  sheet: Sheet;
  /** Live transform + conversions: relToScreen, screenToRel, sheetPxToScreen, screenToSheetPx, subscribe, zoomBy… */
  viewport: PlanViewport;
  /** Edit mode (false = view only: don't let a stray tap change anything). */
  editing: boolean;
  tool: Tool;
}

export interface PlanTapEvent {
  /** Sheet-relative 0–1. */
  rel: Point;
  /** Sheet image px. */
  sheetPx: Point;
  /** Screen px inside the plan view. */
  screen: Point;
  pointerType: string;
  shiftKey: boolean;
  /** What the editor would hit there (a device, closet, run…), if anything. */
  hit: { kind: string; id: string } | null;
}

export interface PlanOverlay {
  /** Unique id (also the React key). */
  id: string;
  /** Stacking: lower first. Plan content (devices, runs) is 100; overlays default to 200. */
  order?: number;
  /** Show this overlay right now (e.g. only on some sheets or when its feature is switched on). Default: always. */
  enabled?: (ctx: PlanOverlayContext) => boolean;
  /**
   * Konva children, drawn in sheet image px inside an overlay <Layer listening={false}>. For constant on-screen sizes,
   * give a node name="cs" (scale is kept at sizeFactor/zoom) or divide by ctx.viewport.transform.scale.
   */
  konva?: (ctx: PlanOverlayContext) => ReactNode;
  /** HTML children in a full-size absolutely positioned box over the plan, in screen px (pointer-events: none on the box). */
  html?: (ctx: PlanOverlayContext) => ReactNode;
  /** A tap/click on the plan. Return true when handled, so the editor doesn't also place/select. */
  onTap?: (e: PlanTapEvent, ctx: PlanOverlayContext) => boolean | void;
}

const registry = new Map<string, PlanOverlay>();
let version = 0;
let snapshot: PlanOverlay[] = [];
const listeners = new Set<() => void>();

function changed() {
  version++;
  snapshot = [...registry.values()].sort((a, b) => (a.order ?? 200) - (b.order ?? 200));
  listeners.forEach((l) => l());
}

/** Add (or replace, by id) an overlay on every plan view. Returns an unregister function. */
export function registerPlanOverlay(o: PlanOverlay): () => void {
  registry.set(o.id, o);
  changed();
  return () => {
    if (registry.get(o.id) === o) {
      registry.delete(o.id);
      changed();
    }
  };
}

export function planOverlaysVersion() {
  return version;
}

/** Registered overlays merged with ones passed as a prop (prop wins on the same id), sorted by order. */
export function usePlanOverlays(extra?: PlanOverlay[]): PlanOverlay[] {
  const reg = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
  return useMemo(() => {
    if (!extra?.length) return reg;
    const ids = new Set(extra.map((o) => o.id));
    return [...reg.filter((o) => !ids.has(o.id)), ...extra].sort((a, b) => (a.order ?? 200) - (b.order ?? 200));
  }, [reg, extra]);
}

/**
 * The live transform for a component drawn over the plan. Re-renders once per animation frame while the view moves —
 * fine for a handful of HTML pins; for heavy content prefer a Konva overlay (moves with the stage for free).
 */
export function useViewTransform(viewport: PlanViewport): ViewportSnapshot {
  return useSyncExternalStore(viewport.subscribe, viewport.getSnapshot, viewport.getSnapshot);
}
