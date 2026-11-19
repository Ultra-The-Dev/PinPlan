"use client";
// Plan overlays: features that add a layer, a toolbar or tap handling to the plan without editing PlanCanvas.
// Register from a module imported by ./index.ts.
import type { ComponentType } from "react";
import { create } from "zustand";
import type { Sheet } from "@/lib/types";

export interface PlanOverlayCtx {
  sheet: Sheet;
  projectId: string;
}

export interface PlanOverlay {
  id: string;
  order: number;
  /** Drawn inside the plan's markup layer, in image pixels; `scale` is the current zoom. May render nothing. */
  Layer: ComponentType<PlanOverlayCtx & { scale: number }>;
  /** Shown in the floating overlay strip on the plan. */
  Toolbar?: ComponentType<PlanOverlayCtx>;
  /** A tap on the plan (relative x, y) while a tool is active; return true to consume it. */
  onTap?: (ctx: PlanOverlayCtx & { x: number; y: number }) => boolean;
}

let overlays: PlanOverlay[] = [];

/** Add (or replace, by id) an overlay. Overlays are kept sorted by `order`. */
export function registerPlanOverlay(o: PlanOverlay): void {
  overlays = [...overlays.filter((x) => x.id !== o.id), o].sort((a, b) => a.order - b.order);
}

export function planOverlays(): PlanOverlay[] {
  return overlays;
}

/** An overlay that is using drags (e.g. drawing) sets capture to its id, so the plan doesn't pan meanwhile. */
export const useOverlayCapture = create<{ capture: string | null; setCapture: (id: string | null) => void }>((set) => ({
  capture: null,
  setCapture: (capture) => set({ capture }),
}));
