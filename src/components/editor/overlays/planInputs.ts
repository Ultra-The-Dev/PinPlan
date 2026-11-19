"use client";
// Who owns taps on the plan (src/lib/planOverlays.ts, claimPlanInput): how each feature lets go when another one
// starts, and the reset when the plan closes or the job changes. Imported for its side effect by ./index.ts.
// Measure, Markups, Walk, the Link tool, a task drop and the editor's own tools (place, wire, calibrate…) close each
// other; walk mode also puts the editor back on Select.
import { registerPlanInput, releaseAllPlanInput } from "@/lib/planOverlays";
import { useSheetLinks } from "@/lib/sheetLinks";
import { useEditor } from "@/lib/store";
import { useMarkups } from "@/components/markups/useMarkups";
import { useMeasureUi } from "@/components/measure/measureUi";
import { useProgressUi } from "@/components/progress/progressStore";
import { useTasks } from "@/components/tasks/taskStore";

registerPlanInput("measure", () => {
  if (useMeasureUi.getState().active) useMeasureUi.getState().setActive(false);
});
registerPlanInput("markups", () => {
  if (useMarkups.getState().open) useMarkups.getState().setOpen(false);
});
registerPlanInput("walk", () => {
  if (useProgressUi.getState().walk) useProgressUi.getState().set({ walk: false });
});
registerPlanInput("links", () => {
  if (useSheetLinks.getState().drawing) useSheetLinks.getState().setDrawing(false);
});
registerPlanInput("task-drop", () => {
  if (useTasks.getState().drop) useTasks.getState().arm(null);
});
registerPlanInput("editor-tool", () => {
  if (useEditor.getState().tool.kind !== "select") useEditor.getState().setTool({ kind: "select" });
});

/**
 * Leaving the plan or switching jobs: no tool stays armed and no half-finished state (a measurement being drawn, a
 * selected markup, a device sheet, a pending photo) follows to the next job. Display preferences stay.
 */
export function resetPlanUi() {
  releaseAllPlanInput();
  const m = useMeasureUi.getState();
  m.setDraft([], null);
  m.select(null);
  m.setPanelOpen(false);
  m.setLastDeleted(null);
  m.focus(null);
  useProgressUi.getState().set({ walk: false, sheet: null, snack: null, pendingPhoto: null, lastButton: 0 });
  useMarkups.getState().set({ selectedId: null, details: null, textDraft: null, listOpen: false });
}
