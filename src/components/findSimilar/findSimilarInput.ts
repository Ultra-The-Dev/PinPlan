"use client";
// Plan input for Find similar (the overlay's onTap / onDragStart…): while picking, a tap searches for the symbol
// under it and a drag draws a box around one; a tap on a ghost pin rejects it (or takes it back). Edit mode only.
import { msg } from "@/lib/i18n/msg";
import type { PlanOverlayContext, PlanTapEvent } from "@/lib/planOverlays";
import { boxFromCorners, clampBox, tapBox } from "@/lib/findSimilar/match";
import { useEditor } from "@/lib/store";
import { GHOST_R } from "./FindSimilarLayer";
import { sheetOpenings, type Opening } from "@/lib/alarmSensors";
import { runMatch, shownFinds, toggleExcluded, toggleFind, useFindSimilar, type Found } from "./findSimilarStore";

const TOUCH_PX = 22;
const MOUSE_PX = 14;

const active = (ctx: PlanOverlayContext) => useFindSimilar.getState().open && ctx.editing;

/** The ghost pin under a screen point, if any (nearest). */
export function ghostAt(e: Pick<PlanTapEvent, "screen" | "pointerType">, ctx: PlanOverlayContext): Found | null {
  const shown = shownFinds(useFindSimilar.getState(), useEditor.getState().markers, ctx.sheet);
  const tol = Math.max(GHOST_R * ctx.viewport.sizeFactor, e.pointerType === "mouse" ? MOUSE_PX : TOUCH_PX);
  let best: { f: Found; d: number } | null = null;
  for (const f of shown) {
    const p = ctx.viewport.relToScreen({ x: f.x, y: f.y });
    const d = Math.hypot(p.x - e.screen.x, p.y - e.screen.y);
    if (d <= tol && (!best || d < best.d)) best = { f, d };
  }
  return best?.f ?? null;
}

/** Add sensors: the door or window under a screen point, if any (nearest). */
export function openingAt(e: Pick<PlanTapEvent, "screen" | "pointerType">, ctx: PlanOverlayContext): Opening | null {
  const ed = useEditor.getState();
  const tol = Math.max((GHOST_R + 5) * ctx.viewport.sizeFactor, e.pointerType === "mouse" ? MOUSE_PX : TOUCH_PX);
  let best: { o: Opening; d: number } | null = null;
  for (const o of sheetOpenings(ed.markers, ed.catalog, ctx.sheet.id)) {
    const p = ctx.viewport.relToScreen({ x: o.x, y: o.y });
    const d = Math.hypot(p.x - e.screen.x, p.y - e.screen.y);
    if (d <= tol && (!best || d < best.d)) best = { o, d };
  }
  return best?.o ?? null;
}

export function onFindTap(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  if (!active(ctx)) return false;
  const st = useFindSimilar.getState();
  // Add sensors: a tap on a door or window leaves it out (or takes it back); other taps do nothing.
  if (st.sensors) {
    const o = openingAt(e, ctx);
    if (o) toggleExcluded(o.id);
    return true;
  }
  const g = ghostAt(e, ctx);
  if (g) {
    toggleFind(g.id);
    return true;
  }
  if (st.mode !== "match" || !st.picking || st.busy) return false;
  if (e.rel.x < 0 || e.rel.y < 0 || e.rel.x > 1 || e.rel.y > 1) return true;
  if (!st.typeId) {
    st.set({ note: { text: msg("Choose what to count first.") } });
    return true;
  }
  void runMatch(ctx.sheet, tapBox(e.sheetPx, ctx.sheet), true);
  return true;
}

export function onFindDragStart(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  if (!active(ctx)) return false;
  const st = useFindSimilar.getState();
  if (st.sensors || st.mode !== "match" || !st.picking || st.busy) return false;
  st.set({ drag: { a: e.rel, b: e.rel } });
  return true;
}

export function onFindDragMove(e: PlanTapEvent) {
  const st = useFindSimilar.getState();
  if (st.drag) st.set({ drag: { a: st.drag.a, b: e.rel } });
}

export function onFindDragEnd(_e: PlanTapEvent, ctx: PlanOverlayContext, cancelled: boolean) {
  const st = useFindSimilar.getState();
  const drag = st.drag;
  st.set({ drag: null });
  if (cancelled || !drag) return;
  const r = boxFromCorners(drag.a, drag.b);
  const box = clampBox({ x: r.x * ctx.sheet.width, y: r.y * ctx.sheet.height, w: r.w * ctx.sheet.width, h: r.h * ctx.sheet.height }, ctx.sheet);
  if (!st.typeId) return st.set({ note: { text: msg("Choose what to count first.") } });
  if (Math.min(box.w, box.h) < 6) return st.set({ note: { text: msg("That box is too small. Zoom in and drag a box around one symbol.") } });
  void runMatch(ctx.sheet, box, false);
}

/** Own plan input while waiting for a pick (a still press stays ready to draw a box; devices don't move). */
export const findCapturing = (ctx: PlanOverlayContext) => active(ctx) && !useFindSimilar.getState().sensors && useFindSimilar.getState().picking && useFindSimilar.getState().mode === "match";
