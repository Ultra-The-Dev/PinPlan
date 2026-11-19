"use client";
// Plan markups as a plan overlay (src/lib/planOverlays.ts, docs/plan-viewer.md): the drawings (Konva, above devices,
// below task pins), the pencil / tool column in the plan rail (HTML) and the plan's input while the column is open
// (markupInput.ts). Imported for its side effect by editor/overlays/index.ts.
import { createElement } from "react";
import { registerPlanOverlay } from "@/lib/planOverlays";
import { RailSlot } from "../editor/overlays/PlanRail";
import MarkupLayer from "./MarkupLayer";
import MarkupToolbar from "./MarkupToolbar";
import { markupsCapturing, onMarkupDoubleTap, onMarkupDragEnd, onMarkupDragMove, onMarkupDragStart, onMarkupLongPress, onMarkupTap } from "./markupInput";

registerPlanOverlay({
  id: "markups",
  order: 210,
  konva: (ctx) => createElement(MarkupLayer, { sheet: ctx.sheet, viewport: ctx.viewport }),
  html: (ctx) => createElement(RailSlot, { order: 20, shrink: true }, createElement(MarkupToolbar, { sheet: ctx.sheet })),
  onTap: onMarkupTap,
  onDoubleTap: onMarkupDoubleTap,
  onDragStart: onMarkupDragStart,
  onDragMove: onMarkupDragMove,
  onDragEnd: onMarkupDragEnd,
  onLongPress: onMarkupLongPress,
  capturing: markupsCapturing,
});
