"use client";
// Plan overlays: features that draw on the plan (markups, task pins, …) plug in here instead of editing PlanCanvas.
// Each overlay draws react-konva nodes in the sheet's image-pixel space (above the devices); `scale` is the stage zoom
// (divide on-screen sizes by it). See src/components/editor/overlays/index.ts for the list.
import type { ComponentType } from "react";
import { create } from "zustand";
import type { Sheet } from "@/lib/types";

export interface PlanOverlayCtx {
  sheet: Sheet;
  projectId: string;
}

export interface PlanOverlay {
  id: string;
  /** Lower draws first (underneath). */
  order: number;
  Layer: ComponentType<PlanOverlayCtx & { scale: number }>;
  /** Shown in the plan's floating overlay strip. */
  Toolbar?: ComponentType<PlanOverlayCtx>;
  /** A tap on the sheet (relative x, y). Return true when the overlay handled it (devices aren't placed then). */
  onTap?: (ctx: PlanOverlayCtx & { x: number; y: number }) => boolean;
}

let overlays: PlanOverlay[] = [];

/** Add (or replace, by id) an overlay. */
export function registerPlanOverlay(o: PlanOverlay): void {
  overlays = [...overlays.filter((x) => x.id !== o.id), o].sort((a, b) => a.order - b.order);
}

/** Registered overlays, lowest order first. */
export function planOverlays(): PlanOverlay[] {
  return overlays;
}

/** Non-null while an overlay owns one-finger drags (e.g. drawing): the plan then stops panning on drag. */
export const useOverlayCapture = create<{ capture: string | null; setCapture: (capture: string | null) => void }>((set) => ({
  capture: null,
  setCapture: (capture) => set({ capture }),
}));
