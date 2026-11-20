"use client";
// Shared places for overlay controls over the plan, so they stack instead of overlapping each other or the viewer's
// own chrome (docs/plan-viewer.md, "Controls: the plan rails"):
// - the right rail (under View / Edit): tasks, markups, revisions — <RailSlot order={n}>;
// - the left rail (under the sheet pill): Back to sheet, Measure, Progress, the Link tool — <RailSlot side="left">;
// - the status slot (bottom centre, above the bottom controls): one-line hint / drawing / measure / link bars and the
//   progress snackbar — <StatusSlot order={n}>. PlanEditor renders its host (it knows where the bottom controls are).
// Slots sort by `order` (CSS order, so mount order doesn't matter). The rails are a plan overlay themselves (html only)
// and carry data-plan-ui, so the plan's gestures ignore presses on their content. Content must set
// pointer-events: auto on what it wants to receive (hosts and slots are pointer-events: none).
// z: the right rail (21) opens its panels over the left rail (13); the status slot is 14.
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PLAN_CHROME, railStyle, registerPlanOverlay } from "@/lib/planOverlays";
import { useMedia } from "@/lib/useMedia";

type HostId = "right" | "left" | "status";
const hosts: Record<HostId, HTMLElement | null> = { right: null, left: null, status: null };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const hostRef = (id: HostId) => (el: HTMLElement | null) => {
  if (hosts[id] === el) return;
  hosts[id] = el;
  listeners.forEach((l) => l());
};
const attachRight = hostRef("right");
const attachLeft = hostRef("left");
const attachStatus = hostRef("status");
function useHost(id: HostId) {
  return useSyncExternalStore(subscribe, () => hosts[id], () => null);
}

/** The plan view is phone sized (rails and sheets switch layout there). */
export const PHONE_QUERY = `(max-width: ${PLAN_CHROME.phoneMax}px)`;

/** The plan toolbar sits in its own bottom row (narrow plans): the rails and the status slot stay above it. */
let toolbarRow = false;
const rowListeners = new Set<() => void>();
export function setPlanToolbarRow(on: boolean) {
  if (toolbarRow === on) return;
  toolbarRow = on;
  rowListeners.forEach((l) => l());
}
function useToolbarRow() {
  return useSyncExternalStore(
    (l) => {
      rowListeners.add(l);
      return () => rowListeners.delete(l);
    },
    () => toolbarRow,
    () => false,
  );
}

function PlanRails() {
  const phone = useMedia(PHONE_QUERY);
  const row = useToolbarRow() || phone;
  return (
    <>
      <div ref={attachRight} className="pointer-events-none absolute z-[21] flex flex-col items-end gap-2" style={railStyle("right", phone, row)} data-plan-ui data-testid="plan-rail" />
      <div ref={attachLeft} className="pointer-events-none absolute z-[13] flex flex-col items-start gap-2" style={railStyle("left", phone, row)} data-plan-ui data-testid="plan-rail-left" />
    </>
  );
}

/** Host of the status slot: PlanEditor renders it once, inside the plan view. */
export function StatusSlotHost() {
  const phone = useMedia(PHONE_QUERY);
  const row = useToolbarRow() || phone;
  return (
    <div
      ref={attachStatus}
      className="pointer-events-none absolute inset-x-0 z-[14] flex flex-col items-center gap-2 px-2 has-[[data-plan-sheet]]:bottom-0! has-[[data-plan-sheet]]:px-0"
      style={{ bottom: row ? PLAN_CHROME.bottomReserve.row : PLAN_CHROME.bottomReserve.wide }}
      data-plan-ui
      data-testid="plan-status"
    />
  );
}

/**
 * Put overlay controls in a plan rail. Right (default): one button per feature; panels open toward the plan
 * (`right-full`). Left: buttons and compact bars, at most calc(100% - 4rem) wide on phones. `shrink`: tall content (a
 * tool column) that may shrink to fit and scroll.
 */
export function RailSlot({ order, shrink, side = "right", children }: { order: number; shrink?: boolean; side?: "left" | "right"; children?: ReactNode }) {
  const el = useHost(side);
  if (!el) return null;
  return createPortal(
    <div className={`pointer-events-none flex max-w-full min-h-0 flex-col ${side === "right" ? "items-end" : "items-start"} ${shrink ? "" : "shrink-0"}`} style={{ order }}>
      {children}
    </div>,
    el,
  );
}

/**
 * One-line bars over the plan (what a tap does now, drawing controls, undo snackbars): bottom centre, above the bottom
 * controls, stacked by `order`. On phones a bottom sheet (an element with data-plan-sheet) can go here too, last: the
 * slot then docks to the bottom edge with the bars above the sheet. Bars: pointer-events-auto, max-w-full.
 */
export function StatusSlot({ order, children }: { order: number; children?: ReactNode }) {
  const el = useHost("status");
  if (!el) return null;
  return createPortal(
    <div className="pointer-events-none flex w-full max-w-full flex-col items-center" style={{ order }}>
      {children}
    </div>,
    el,
  );
}

registerPlanOverlay({ id: "plan-rail", order: 0, html: () => <PlanRails /> });
