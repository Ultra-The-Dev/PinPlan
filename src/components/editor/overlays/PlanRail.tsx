"use client";
// One shared column at the plan's top right (under the View / Edit toggle) for overlay controls — tasks, markups,
// revisions — so they stack instead of overlapping each other or the viewer's own chrome. An overlay's `html` renders
// <RailSlot order={n}>…</RailSlot>; slots are sorted by `order` (CSS order, so mount order doesn't matter). The rail is
// a plan overlay itself (html only) and carries data-plan-ui, so the plan's gestures ignore presses on its content.
// Content must set pointer-events: auto on what it wants to receive (the rail and slots are pointer-events: none).
// z-21: its panels open over the left-hand plan controls (measure, links), under the viewer's sheets.
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { registerPlanOverlay } from "@/lib/planOverlays";

let host: HTMLElement | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function setHost(el: HTMLDivElement | null) {
  if (host === el) return;
  host = el;
  listeners.forEach((l) => l());
}

function PlanRail() {
  return (
    <div
      ref={setHost}
      className="pointer-events-none absolute top-[64px] right-2 bottom-[128px] z-[21] flex flex-col items-end gap-2 sm:top-[72px] sm:right-3 sm:bottom-[76px]"
      data-plan-ui
      data-testid="plan-rail"
    />
  );
}

/** Put overlay controls in the shared plan rail. `shrink`: tall content (a tool column) that may shrink to fit and scroll. */
export function RailSlot({ order, shrink, children }: { order: number; shrink?: boolean; children?: ReactNode }) {
  const el = useSyncExternalStore(subscribe, () => host, () => null);
  if (!el) return null;
  return createPortal(
    <div className={`pointer-events-none flex min-h-0 flex-col items-end ${shrink ? "" : "shrink-0"}`} style={{ order }}>
      {children}
    </div>,
    el,
  );
}

registerPlanOverlay({ id: "plan-rail", order: 0, html: () => <PlanRail /> });
