"use client";
// Registers the tasks overlay on the plan (pins, toolbar, tap-to-drop). Imported for its side effect by editor/overlays.
import { getAuthor } from "@/lib/photos";
import { useSyncStatus } from "@/lib/sync";
import { registerPlanOverlay } from "../editor/overlays/registry";
import TaskPinsLayer from "./TaskPinsLayer";
import TaskToolbar, { handleTaskTap } from "./TaskToolbar";

registerPlanOverlay({
  id: "tasks",
  order: 50,
  Layer: TaskPinsLayer,
  Toolbar: TaskToolbar,
  onTap: (ctx) => handleTaskTap(ctx, getAuthor(useSyncStatus.getState().email)),
});
