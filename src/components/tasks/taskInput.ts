"use client";
// Plan input for task pins (the tasks overlay's onTap / onDragStart…): tap a pin to open its task, tap the plan while
// a drop is armed to create / copy / place a task there, drag the selected pin to move it (recorded in its history).
// Pins are hit-tested here in screen px (the Konva layer doesn't listen), with the geometry TaskPinsLayer draws.
import { localDay } from "@/lib/fieldDocs";
import { getAuthor } from "@/lib/photos";
import type { PlanOverlayContext, PlanTapEvent } from "@/lib/planOverlays";
import { useSyncStatus } from "@/lib/sync";
import type { PlanTask } from "@/lib/types";
import type { Point } from "@/lib/viewport";
import { PIN_L, PIN_SELECTED_SCALE, shownPins } from "./TaskPinsLayer";
import { handleTaskTap } from "./TaskToolbar";
import { useTaskDrag, useTasks } from "./taskStore";

/** Reach around a pin's head (and tip), in screen px: a fingertip. */
const PIN_TOUCH_PX = 22;
const PIN_MOUSE_PX = 16;

const author = () => getAuthor(useSyncStatus.getState().email);

/** The topmost shown pin under a screen point, if any. */
export function pinAt(screen: Point, pointerType: string, ctx: PlanOverlayContext): PlanTask | null {
  const st = useTasks.getState();
  if (!st.showPins || st.projectId !== ctx.sheet.projectId) return null;
  const pins = shownPins(st.tasks, ctx.sheet.id, st, localDay(new Date().toISOString()));
  const tol = pointerType === "mouse" ? PIN_MOUSE_PX : PIN_TOUCH_PX;
  const sf = ctx.viewport.sizeFactor;
  let best: { t: PlanTask; d: number } | null = null;
  // Topmost first; on a tie in distance, the one drawn on top wins.
  for (let i = pins.length - 1; i >= 0; i--) {
    const t = pins[i].t;
    const tip = ctx.viewport.relToScreen({ x: t.x ?? 0, y: t.y ?? 0 });
    const k = sf * (t.id === st.selectedId ? PIN_SELECTED_SCALE : 1);
    const head = { x: tip.x, y: tip.y - PIN_L * k };
    // The head, or anywhere along the teardrop down to the tip.
    const dy = Math.max(head.y, Math.min(tip.y, screen.y));
    const d = Math.hypot(screen.x - head.x, screen.y - dy);
    if (d <= tol && (!best || d < best.d - 0.5)) best = { t, d };
  }
  return best?.t ?? null;
}

export function onTaskTap(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  const st = useTasks.getState();
  // An armed drop is an explicit request ("+ Task", Duplicate, Place on plan), so it works in view mode too.
  if (st.drop) {
    if (e.rel.x < 0 || e.rel.y < 0 || e.rel.x > 1 || e.rel.y > 1) return true;
    return handleTaskTap({ sheet: ctx.sheet, x: e.rel.x, y: e.rel.y }, author());
  }
  const pin = pinAt(e.screen, e.pointerType, ctx);
  if (pin) {
    // Opening a task changes nothing, so it's fine in view mode.
    st.set({ selectedId: pin.id, detailId: pin.id });
    return true;
  }
  // A tap elsewhere drops the pin selection (so a later drag pans) and goes on to the editor.
  if (st.selectedId) st.set({ selectedId: null });
  return false;
}

let dragging: { id: string; offset: Point; moved: boolean } | null = null;

/** A drag that starts on the selected pin moves it (edit mode only: a stray drag in view mode must not). */
export function onTaskDragStart(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  const st = useTasks.getState();
  if (!ctx.editing || st.drop || !st.selectedId) return false;
  const pin = pinAt(e.screen, e.pointerType, ctx);
  if (!pin || pin.id !== st.selectedId) return false;
  dragging = { id: pin.id, offset: { x: (pin.x ?? 0) - e.rel.x, y: (pin.y ?? 0) - e.rel.y }, moved: false };
  return true;
}

export function onTaskDragMove(e: PlanTapEvent) {
  const d = dragging;
  if (!d) return;
  d.moved = true;
  useTaskDrag.setState({ drag: { id: d.id, x: clamp01(e.rel.x + d.offset.x), y: clamp01(e.rel.y + d.offset.y) } });
}

export function onTaskDragEnd(e: PlanTapEvent, _ctx: PlanOverlayContext, cancelled: boolean) {
  const d = dragging;
  dragging = null;
  if (!d) return;
  const pos = useTaskDrag.getState().drag;
  if (cancelled || !d.moved || !pos) {
    useTaskDrag.setState({ drag: null });
    return;
  }
  const x = clamp01(e.rel.x + d.offset.x);
  const y = clamp01(e.rel.y + d.offset.y);
  // Keep drawing the pin at the drop spot until the saved task (with its new position) is in the store.
  void useTasks
    .getState()
    .change(d.id, { x, y }, author())
    .finally(() => useTaskDrag.setState({ drag: null }));
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
