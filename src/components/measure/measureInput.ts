"use client";
// Plan input for saved measurements: taps add vertices, double-tap / Done finishes, a tap near the first vertex closes
// an area, Esc cancels. With the toolbar closed, a tap on a measurement selects it.
import { t, tn } from "@/lib/i18n";
import { getAuthor } from "@/lib/photos";
import { hitMeasurement, KIND_NAMES, MIN_POINTS, snapAngle } from "@/lib/measure";
import { useMeasurements } from "@/lib/measurements";
import type { PlanOverlayContext, PlanTapEvent } from "@/lib/planOverlays";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import { useMeasureUi } from "./measureUi";

/** Close an area when the tap lands this close (screen px) to its first vertex. */
const CLOSE_PX = { touch: 24, other: 14 };
/** Hit tolerance (screen px) for selecting a saved measurement. */
const HIT_PX = { touch: 16, other: 8 };

const isTouch = (t: string) => t === "touch" || t === "pen";

export async function finishDraft(): Promise<boolean> {
  const ui = useMeasureUi.getState();
  const { draft, draftSheetId, kind } = ui;
  const ed = useEditor.getState();
  const sheet = ed.sheets.find((s) => s.id === draftSheetId);
  ui.setDraft([], null);
  if (!sheet || !draft.length) return false;
  if (draft.length / 2 < MIN_POINTS[kind]) {
    toast(tn("{kind} needs at least {n} point — discarded", "{kind} needs at least {n} points — discarded", MIN_POINTS[kind], { kind: t(KIND_NAMES[kind]) }), "info");
    return false;
  }
  const m = await useMeasurements.getState().add({
    projectId: sheet.projectId,
    sheetId: sheet.id,
    kind,
    points: draft,
    label: ui.label,
    color: ui.color,
    author: getAuthor(useSyncStatus.getState().email),
  });
  if (!m) {
    toast(tn("{kind} needs at least {n} distinct point — discarded", "{kind} needs at least {n} distinct points — discarded", MIN_POINTS[kind], { kind: t(KIND_NAMES[kind]) }), "info");
    return false;
  }
  useMeasureUi.getState().select(m.id);
  return true;
}

export function undoPoint() {
  const ui = useMeasureUi.getState();
  ui.setDraft(ui.draft.slice(0, -2), ui.draftSheetId);
}

export function cancelDraft() {
  useMeasureUi.getState().setDraft([], null);
}

/** Snap a tap onto the device or closet it hit (so "how far is the home run" starts and ends on the real thing). */
function snapTo(e: PlanTapEvent): { x: number; y: number } | null {
  if (!e.hit) return null;
  const st = useEditor.getState();
  if (e.hit.kind === "marker") {
    const m = st.markers.find((x) => x.id === e.hit!.id);
    return m ? { x: m.x, y: m.y } : null;
  }
  if (e.hit.kind === "closet") {
    const c = st.closets.find((x) => x.id === e.hit!.id);
    return c ? { x: c.x, y: c.y } : null;
  }
  return null;
}

export function onMeasureTap(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  const ui = useMeasureUi.getState();
  const sheet = ctx.sheet;
  if (!ui.active) {
    // Selecting a saved measurement: only where the editor has nothing of its own, and only when they're shown.
    if (!ui.visible || e.hit || useEditor.getState().tool.kind !== "select") {
      if (ui.selectedId) ui.select(null);
      return false;
    }
    const rows = useMeasurements.getState().rows.filter((m) => m.sheetId === sheet.id && !m.deleted);
    const tol = (isTouch(e.pointerType) ? HIT_PX.touch : HIT_PX.other) / ctx.viewport.transform.scale;
    const id = hitMeasurement(rows, sheet, e.sheetPx, tol);
    if (id) {
      useEditor.getState().select(null);
      ui.select(id);
      return true;
    }
    if (ui.selectedId) ui.select(null);
    return false;
  }

  // Drawing.
  if (!sheet.pxPerFt) {
    toast(t("Calibrate this sheet first"), "info");
    return true;
  }
  if (e.rel.x < 0 || e.rel.y < 0 || e.rel.x > 1 || e.rel.y > 1) return true;
  if (ui.selectedId) ui.select(null);
  const draft = ui.draftSheetId === sheet.id ? ui.draft : [];
  let p = snapTo(e) ?? { x: e.rel.x, y: e.rel.y };
  const n = draft.length / 2;
  if (n && e.shiftKey) {
    const from = { x: draft[draft.length - 2] * sheet.width, y: draft[draft.length - 1] * sheet.height };
    const s = snapAngle(from, { x: p.x * sheet.width, y: p.y * sheet.height });
    p = { x: Math.max(0, Math.min(1, s.x / sheet.width)), y: Math.max(0, Math.min(1, s.y / sheet.height)) };
  }
  // A tap near the first vertex closes an area.
  if (ui.kind === "area" && n >= 3) {
    const first = ctx.viewport.relToScreen({ x: draft[0], y: draft[1] });
    if (Math.hypot(first.x - e.screen.x, first.y - e.screen.y) <= (isTouch(e.pointerType) ? CLOSE_PX.touch : CLOSE_PX.other)) {
      void finishDraft();
      return true;
    }
  }
  const next = [...draft, p.x, p.y];
  ui.setDraft(next, sheet.id);
  // A straight length is done at its second point.
  if (ui.kind === "length" && next.length >= 4) void finishDraft();
  return true;
}

export function onMeasureDoubleTap(_e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  const ui = useMeasureUi.getState();
  if (!ui.active) return false;
  if (ui.draftSheetId !== ctx.sheet.id || !ui.draft.length) return true;
  // The second tap of the double-tap added a vertex on top of the first: drop it, then finish if there's enough.
  const pts = ui.draft.slice(0, -2);
  ui.setDraft(pts, ctx.sheet.id);
  if (pts.length / 2 >= MIN_POINTS[ui.kind]) void finishDraft();
  return true;
}
