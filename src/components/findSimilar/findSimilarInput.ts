"use client";
// Plan input for Find similar (the overlay's onTap / onDragStart…): while picking, a tap searches for the symbol
// under it and a drag draws a box around one; a tap on a ghost pin rejects it (or takes it back). Edit mode only.
import type { PlanOverlayContext, PlanTapEvent } from "@/lib/planOverlays";
import { boxFromCorners, clampBox, tapBox } from "@/lib/findSimilar/match";
import { useEditor } from "@/lib/store";
import { GHOST_R } from "./FindSimilarLayer";
import { runMatch, shownFinds, toggleFind, useFindSimilar, type Found } from "./findSimilarStore";

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

export function onFindTap(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  if (!active(ctx)) return false;
  const st = useFindSimilar.getState();
  const g = ghostAt(e, ctx);
  if (g) {
    toggleFind(g.id);
    return true;
  }
  if (st.mode !== "match" || !st.picking || st.busy) return false;
  if (e.rel.x < 0 || e.rel.y < 0 || e.rel.x > 1 || e.rel.y > 1) return true;
  if (!st.typeId) {
    st.set({ note: "Choose what to count first." });
    return true;
  }
  void runMatch(ctx.sheet, tapBox(e.sheetPx, ctx.sheet), true);
  return true;
}

export function onFindDragStart(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  if (!active(ctx)) return false;
  const st = useFindSimilar.getState();
  if (st.mode !== "match" || !st.picking || st.busy) return false;
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
  if (!st.typeId) return st.set({ note: "Choose what to count first." });
  if (Math.min(box.w, box.h) < 6) return st.set({ note: "That box is too small. Zoom in and drag a box around one symbol." });
  void runMatch(ctx.sheet, box, false);
}

/** Own plan input while waiting for a pick (a still press stays ready to draw a box; devices don't move). */
export const findCapturing = (ctx: PlanOverlayContext) => active(ctx) && useFindSimilar.getState().picking && useFindSimilar.getState().mode === "match";
