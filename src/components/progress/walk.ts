"use client";
// Walk mode: one tap on a device sets the chosen status (or the next step). Taps go through the plan overlay's onTap,
// before the editor's own tools; the nearest device within 24 screen px wins (a run when no device is near).
import { nextStatus, nearestWithin, statusOf, workflowOf, STATUS_LABELS } from "@/lib/installProgress";
import type { PlanOverlayContext, PlanTapEvent } from "@/lib/planOverlays";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useTradeStore } from "@/lib/useTrades";
import type { InstallStatus } from "@/lib/types";
import { blockedReason, findItem, itemLabel, photoNeeded, setInstall } from "./actions";
import { photoInput, showSnack, useProgressUi, type InstallRef } from "./progressStore";
import { shownItemsNow } from "./useShownItems";

const HIT_PX = 24;
let lastTap: { id: string; t: number } | null = null;

/** The device (or run) under a tap in walk mode, if any. */
export function walkHit(e: Pick<PlanTapEvent, "screen" | "hit">, ctx: Pick<PlanOverlayContext, "sheet" | "viewport">): InstallRef | null {
  const { markers, runs } = shownItemsNow(ctx.sheet.id);
  const vp = ctx.viewport;
  const pts = markers.map((m) => vp.relToScreen({ x: m.x, y: m.y }));
  const i = nearestWithin(pts, e.screen, HIT_PX * Math.max(1, vp.sizeFactor));
  if (i >= 0) return { table: "markers", id: markers[i].id };
  const h = e.hit;
  if (h?.kind === "run" && runs.some((r) => r.id === h.id)) return { table: "runs", id: h.id };
  return null;
}

/** The status a walk-mode tap sets on this item (null: nothing to do). */
export function walkTargetFor(ref: InstallRef): InstallStatus | null {
  const item = findItem(ref);
  if (!item) return null;
  const target = useProgressUi.getState().target;
  if (target !== "next") return statusOf(item) === target ? null : target;
  return nextStatus(statusOf(item), workflowOf(item, useEditor.getState().catalog, useTradeStore.getState().trades));
}

export function walkTap(e: PlanTapEvent, ctx: PlanOverlayContext): boolean {
  const ui = useProgressUi.getState();
  if (!ui.on || !ui.walk) return false;
  const ref = walkHit(e, ctx);
  if (!ref) {
    // Anything else under the finger (an optional device, a closet) isn't selected in walk mode: only empty plan is.
    if (!e.hit) return false;
    const m = e.hit.kind === "marker" ? useEditor.getState().markers.find((x) => x.id === e.hit!.id) : undefined;
    if (m?.tentative) toast("Optional (?) devices aren't tracked: confirm it first", "info");
    return true;
  }
  // Right-click: details instead of a change.
  if (ui.lastButton === 2) {
    ui.set({ sheet: ref, lastButton: 0 });
    return true;
  }
  // The second tap of a double-tap on the same device doesn't change it again.
  const now = performance.now();
  if (lastTap && lastTap.id === ref.id && now - lastTap.t < 600) return true;
  lastTap = { id: ref.id, t: now };
  void walkSet(ref);
  return true;
}

export async function walkSet(ref: InstallRef) {
  const item = findItem(ref);
  const label = itemLabel(item);
  const to = walkTargetFor(ref);
  if (!to) {
    toast(`${label} is already ${STATUS_LABELS[statusOf(item)].toLowerCase()}`, "info");
    return;
  }
  const why = blockedReason(item, to);
  if (why) {
    toast(why, "info");
    return;
  }
  if (photoNeeded(to)) {
    useProgressUi.getState().set({ pendingPhoto: { ...ref, to, label } });
    // Straight to the camera (we're still inside the tap); the prompt stays up in case the browser blocks it.
    photoInput.current?.click();
    return;
  }
  if (await setInstall(ref, to)) showSnack(ref, label, STATUS_LABELS[to]);
}
