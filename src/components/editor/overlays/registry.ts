// Plan overlays: features that draw on the plan (tasks, …) register here instead of editing PlanCanvas.
// Layer renders react-konva nodes in the image-pixel group of the markers (relative x * sheet.width), above markers and
// runs; `scale` is the stage scale, so constant-size shapes use radius / scale. Toolbar renders in one floating strip.
// onTap gets taps on the sheet first and returns true when it used the tap.
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
  Layer: ComponentType<PlanOverlayCtx & { scale: number }>;
  Toolbar?: ComponentType<PlanOverlayCtx>;
  onTap?: (ctx: PlanOverlayCtx & { x: number; y: number }) => boolean;
}

let overlays: PlanOverlay[] = [];

/** Register (or replace, by id) an overlay. Kept sorted by `order`. */
export function registerPlanOverlay(o: PlanOverlay): void {
  overlays = [...overlays.filter((x) => x.id !== o.id), o].sort((a, b) => a.order - b.order);
}

export function planOverlays(): readonly PlanOverlay[] {
  return overlays;
}

/** Non-null while an overlay owns one-finger drags and taps (PlanCanvas then stops dragging the stage). */
export const useOverlayCapture = create<{ capture: string | null; setCapture(id: string | null): void }>((set) => ({
  capture: null,
  setCapture: (capture) => set({ capture }),
}));
