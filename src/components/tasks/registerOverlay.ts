"use client";
// Plan tasks as a plan overlay (src/lib/planOverlays.ts, docs/plan-viewer.md): pins (Konva, above devices and
// markups), the Tasks button and panel in the plan rail (HTML), tap a pin to open it, tap to drop an armed task, drag
// the selected pin to move it. Imported for its side effect by editor/overlays/index.ts.
import { createElement } from "react";
import { registerPlanOverlay } from "@/lib/planOverlays";
import { RailSlot } from "../editor/overlays/PlanRail";
import TaskPinsLayer from "./TaskPinsLayer";
import TaskToolbar from "./TaskToolbar";
import { onTaskDragEnd, onTaskDragMove, onTaskDragStart, onTaskTap } from "./taskInput";

registerPlanOverlay({
  id: "tasks",
  order: 220,
  konva: (ctx) => createElement(TaskPinsLayer, { sheet: ctx.sheet, viewport: ctx.viewport }),
  html: (ctx) => createElement(RailSlot, { order: 10 }, createElement(TaskToolbar, { sheet: ctx.sheet })),
  onTap: onTaskTap,
  onDragStart: onTaskDragStart,
  onDragMove: onTaskDragMove,
  onDragEnd: onTaskDragEnd,
});
