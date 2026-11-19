"use client";
// Saved measurements as a plan overlay (src/lib/planOverlays.ts, docs/plan-viewer.md): a Konva layer for the shapes,
// an HTML layer for the toolbar / panel, and the plan's taps while the toolbar is open. Imported once for its side
// effect by the plan editor.
import { createElement } from "react";
import { registerPlanOverlay } from "@/lib/planOverlays";
import MeasureLayer from "./MeasureLayer";
import MeasureOverlay from "./MeasureOverlay";
import { onMeasureDoubleTap, onMeasureTap } from "./measureInput";
import { useMeasureUi } from "./measureUi";

registerPlanOverlay({
  id: "measurements",
  order: 40,
  konva: (ctx) => createElement(MeasureLayer, { sheet: ctx.sheet, viewport: ctx.viewport }),
  html: (ctx) => createElement(MeasureOverlay, { sheet: ctx.sheet, viewport: ctx.viewport, editing: ctx.editing }),
  onTap: onMeasureTap,
  onDoubleTap: onMeasureDoubleTap,
  capturing: () => useMeasureUi.getState().active,
});
