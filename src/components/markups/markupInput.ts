"use client";
// Plan input for markups (the markups overlay's onTap / onDragStart / onLongPress…). While the markup column is open:
// a draw tool owns one-finger drags (the overlay is `capturing`; a second finger cancels the stroke and pinches), a
// tap with the pen leaves a dot and with Text places a text box; Select picks the topmost markup (tap), moves it or a
// handle (drag), and long-press / right-click opens its details. With the column closed markups only draw.
// Hit testing is in screen px (the Konva layer doesn't listen).
import { canEditMarkup, handlesOf, hitTest, resize, simplifyStroke, toPx, translate, visibleMarkups } from "@/lib/markups";
import type { PlanOverlayContext, PlanTapEvent } from "@/lib/planOverlays";
import { useSyncStatus } from "@/lib/sync";
import { useTeam } from "@/lib/team";
import type { PlanMarkup } from "@/lib/types";
import { create } from "zustand";
import { useMarkups } from "./useMarkups";

/** Finger-sized reach around a markup / handle, in screen px. */
const TAP_PX = { touch: 14, mouse: 6 };
const HANDLE_PX = 18;

/** What's being drawn or moved right now (drawn by MarkupLayer until it's saved). */
export const useMarkupLive = create<{ drawing: number[] | null; preview: PlanMarkup | null }>(() => ({ drawing: null, preview: null }));

type Gesture =
  | { kind: "draw"; start: [number, number]; pts: number[] }
  | { kind: "move"; start: [number, number]; orig: PlanMarkup }
  | { kind: "resize"; handle: number; orig: PlanMarkup }
  | null;
let gesture: Gesture = null;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const me = () => ({ role: useTeam.getState().role, userId: useSyncStatus.getState().userId });
const tapPx = (pointerType: string) => (pointerType === "mouse" ? TAP_PX.mouse : TAP_PX.touch);

/** This sheet's markups that the user can see, bottom to top. */
function shownOn(ctx: PlanOverlayContext): PlanMarkup[] {
  const s = useMarkups.getState();
  if (s.allHidden || s.projectId !== ctx.sheet.projectId) return [];
  return visibleMarkups(
    s.items.filter((m) => m.sheetId === ctx.sheet.id),
    { userId: me().userId, hiddenLayers: s.hiddenLayers },
  );
}

/** Topmost markup under a plan point. */
function pick(e: PlanTapEvent, ctx: PlanOverlayContext): PlanMarkup | undefined {
  const shown = shownOn(ctx);
  const tol = tapPx(e.pointerType) / ctx.viewport.transform.scale;
  for (let i = shown.length - 1; i >= 0; i--) if (hitTest(shown[i], e.rel.x, e.rel.y, tol, ctx.sheet.width, ctx.sheet.height)) return shown[i];
  return undefined;
}

/** The selected (editable) markup's handle under a plan point, as an index. */
function handleAt(e: PlanTapEvent, ctx: PlanOverlayContext): { m: PlanMarkup; i: number } | null {
  const s = useMarkups.getState();
  const sel = shownOn(ctx).find((m) => m.id === s.selectedId);
  const { role, userId } = me();
  if (!sel || !canEditMarkup(role, sel, userId)) return null;
  const i = handlesOf(sel).findIndex(([hx, hy]) => {
    const p = ctx.viewport.relToScreen({ x: hx, y: hy });
    return Math.hypot(p.x - e.screen.x, p.y - e.screen.y) <= HANDLE_PX;
  });
  return i >= 0 ? { m: sel, i } : null;
}

/** Drawing with a tool: the layer and markups must be visible, or the new markup would vanish. */
function revealForDrawing() {
  const s = useMarkups.getState();
  if (s.allHidden) s.setAllHidden(false);
  if (s.hiddenLayers.includes(s.layer)) s.toggleLayer(s.layer);
}

/** The plan's client position of a plan screen point (for the fixed details card). */
function clientPoint(e: PlanTapEvent) {
  const r = document.querySelector("[data-plan-canvas]")?.getBoundingClientRect();
  return { x: (r?.left ?? 0) + e.screen.x, y: (r?.top ?? 0) + e.screen.y };
}

export const markupsCapturing = () => {
  const s = useMarkups.getState();
  return s.open && s.tool !== "select";
};

export function onMarkupTap(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  const s = useMarkups.getState();
  if (!s.open) return false;
  const inside = e.rel.x >= 0 && e.rel.y >= 0 && e.rel.x <= 1 && e.rel.y <= 1;
  if (s.tool === "text") {
    if (inside) {
      revealForDrawing();
      s.set({ textDraft: { sheetId: ctx.sheet.id, x: e.rel.x, y: e.rel.y, value: "" } });
    }
    return true;
  }
  if (s.tool === "pen" || s.tool === "highlight") {
    // A tap leaves a dot.
    if (!inside) return true;
    revealForDrawing();
    const d = 0.5 / ctx.viewport.transform.scale;
    const m = s.draft(s.tool, ctx.sheet.id, [e.rel.x, e.rel.y, clamp01(e.rel.x + d / ctx.sheet.width), clamp01(e.rel.y + d / ctx.sheet.height)]);
    if (m) void s.save(m);
    return true;
  }
  if (s.tool !== "select") return true; // shapes need a drag
  // Select: a markup, else let the plan have the tap (select / deselect a device) and drop the markup selection.
  const hit = pick(e, ctx);
  if (!hit) {
    if (s.selectedId) s.select(null);
    return false;
  }
  const { role, userId } = me();
  // A tap on a text box that was already selected: edit its words.
  if (hit.kind === "text" && s.selectedId === hit.id && canEditMarkup(role, hit, userId)) {
    s.set({ textDraft: { sheetId: hit.sheetId, x: hit.points[0], y: hit.points[1], editId: hit.id, value: hit.text ?? "" } });
    return true;
  }
  s.select(hit.id);
  return true;
}

/** Double-taps while drawing are two dots / two text boxes, not a zoom. */
export const onMarkupDoubleTap = () => markupsCapturing();

export function onMarkupDragStart(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  const s = useMarkups.getState();
  if (!s.open) return false;
  if (s.tool !== "select") {
    revealForDrawing();
    const p: [number, number] = [clamp01(e.rel.x), clamp01(e.rel.y)];
    gesture = { kind: "draw", start: p, pts: [...p] };
    useMarkupLive.setState({ drawing: gesture.pts });
    return true;
  }
  const h = handleAt(e, ctx);
  if (h) {
    gesture = { kind: "resize", handle: h.i, orig: h.m };
    return true;
  }
  const hit = pick(e, ctx);
  if (!hit) return false; // the plan pans
  s.select(hit.id);
  const { role, userId } = me();
  if (!canEditMarkup(role, hit, userId)) return true; // selected, but it stays put (and the plan doesn't pan under it)
  gesture = { kind: "move", start: [e.rel.x, e.rel.y], orig: hit };
  return true;
}

export function onMarkupDragMove(e: PlanTapEvent, ctx: PlanOverlayContext) {
  const g = gesture;
  if (!g) return;
  const { width: W, height: H } = ctx.sheet;
  if (g.kind === "draw") {
    const tool = useMarkups.getState().tool;
    const p = [clamp01(e.rel.x), clamp01(e.rel.y)];
    if (tool === "pen" || tool === "highlight") {
      const n = g.pts.length;
      // Skip points closer than ~1.5 screen px to the last one.
      if (Math.hypot((p[0] - g.pts[n - 2]) * W, (p[1] - g.pts[n - 1]) * H) * ctx.viewport.transform.scale < 1.5) return;
      g.pts = [...g.pts, p[0], p[1]];
    } else g.pts = [g.start[0], g.start[1], p[0], p[1]];
    useMarkupLive.setState({ drawing: g.pts });
    return;
  }
  if (g.kind === "move") useMarkupLive.setState({ preview: translate(g.orig, e.rel.x - g.start[0], e.rel.y - g.start[1]) });
  else useMarkupLive.setState({ preview: resize(g.orig, g.handle, e.rel.x, e.rel.y) });
}

export function onMarkupDragEnd(e: PlanTapEvent, ctx: PlanOverlayContext, cancelled: boolean) {
  const g = gesture;
  gesture = null;
  if (g && !cancelled) onMarkupDragMove(e, ctx);
  const { preview } = useMarkupLive.getState();
  // Keep showing the moved markup until the save lands in the store (no flash back to the old spot).
  useMarkupLive.setState({ drawing: null });
  const clearPreview = () => useMarkupLive.setState({ preview: null });
  if (!g || cancelled) return clearPreview();
  const s = useMarkups.getState();
  if (g.kind !== "draw") {
    if (!preview) return clearPreview();
    void s.save(preview).finally(clearPreview);
    return;
  }
  const kind = s.tool === "select" ? null : s.tool;
  if (!kind) return;
  if (kind === "text") {
    s.set({ textDraft: { sheetId: ctx.sheet.id, x: g.start[0], y: g.start[1], value: "" } });
    return;
  }
  const { width: W, height: H } = ctx.sheet;
  const inv = 1 / ctx.viewport.transform.scale;
  const px = toPx(g.pts, W, H);
  let pts: number[];
  if (kind === "pen" || kind === "highlight") {
    const simple = simplifyStroke(px, 0.8 * inv);
    pts = simple.length >= 4 ? simple : [px[0], px[1], px[0] + 0.5 * inv, px[1] + 0.5 * inv];
  } else {
    // Ignore slips smaller than 6 px on screen.
    if (px.length < 4 || Math.hypot(px[2] - px[0], px[3] - px[1]) < 6 * inv) return;
    pts = px.slice(0, 4);
  }
  const m = s.draft(kind, ctx.sheet.id, pts.map((v, i) => clamp01(i % 2 ? v / H : v / W)));
  if (m) void s.save(m);
}

/** Long-press (touch) or right-click (mouse) on a markup while the column is open: its details card. */
export function onMarkupLongPress(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  const s = useMarkups.getState();
  if (!s.open || s.tool !== "select") return false;
  const hit = pick(e, ctx);
  if (!hit) return false;
  navigator.vibrate?.(15);
  s.select(hit.id);
  s.set({ details: { id: hit.id, ...clientPoint(e) } });
  return true;
}
