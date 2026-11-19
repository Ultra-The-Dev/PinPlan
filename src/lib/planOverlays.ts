"use client";
// Extension point for features that draw ON the plan (task pins, markups, measurements, sheet links, revision
// compare…). An overlay is a plain object registered once (module side effect or effect) or passed to PlanCanvas's
// `overlays` prop. The canvas renders each overlay in its own Konva Layer (sheet-pixel coordinates, the stage
// transform already applied) and/or an absolutely positioned HTML layer (screen pixels), and offers it taps before the
// editor's own tools. See docs/plan-viewer.md.
import { useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { PlanViewport, ViewportSnapshot } from "./planViewport";
import type { Tool } from "./store";
import type { Sheet } from "./types";
import type { Point } from "./viewport";

export interface PlanOverlayContext {
  sheet: Sheet;
  /** Live transform + conversions: relToScreen, screenToRel, sheetPxToScreen, screenToSheetPx, subscribe, zoomBy… */
  viewport: PlanViewport;
  /** Edit mode (false = view only: don't let a stray tap change anything). */
  editing: boolean;
  tool: Tool;
}

export interface PlanTapEvent {
  /** Sheet-relative 0–1. */
  rel: Point;
  /** Sheet image px. */
  sheetPx: Point;
  /** Screen px inside the plan view. */
  screen: Point;
  pointerType: string;
  shiftKey: boolean;
  /** What the editor would hit there (a device, closet, run…), if anything. */
  hit: { kind: string; id: string } | null;
}

export interface PlanOverlay {
  /** Unique id (also the React key). */
  id: string;
  /** Stacking: lower first. Plan content (devices, runs) is 100; overlays default to 200. */
  order?: number;
  /** Show this overlay right now (e.g. only on some sheets or when its feature is switched on). Default: always. */
  enabled?: (ctx: PlanOverlayContext) => boolean;
  /**
   * Konva children, drawn in sheet image px inside an overlay <Layer listening={false}>. For constant on-screen sizes,
   * give a node name="cs" (scale is kept at sizeFactor/zoom) or divide by ctx.viewport.transform.scale.
   */
  konva?: (ctx: PlanOverlayContext) => ReactNode;
  /** HTML children in a full-size absolutely positioned box over the plan, in screen px (pointer-events: none on the box). */
  html?: (ctx: PlanOverlayContext) => ReactNode;
  /** A tap/click on the plan. Return true when handled, so the editor doesn't also place/select. */
  onTap?: (e: PlanTapEvent, ctx: PlanOverlayContext) => boolean | void;
  /** A double-tap/double-click on the plan, before the editor's (zoom in). Return true when handled. */
  onDoubleTap?: (e: PlanTapEvent, ctx: PlanOverlayContext) => boolean | void;
  /**
   * True while the overlay owns plan input (e.g. drawing): devices, closets and run points can't be dragged then, and
   * (with onDragStart) a still press doesn't turn into a long-press, so a pause before drawing still draws.
   */
  capturing?: (ctx: PlanOverlayContext) => boolean;
  /**
   * One finger / the mouse moved past the tap slop: return true to own this drag (draw, move a pin…) instead of the
   * plan panning or a device moving. `e` is where the press began. Overlays are asked top-down, before the editor.
   * A second finger cancels the drag (onDragEnd with cancelled = true) and pinch-zooms.
   */
  onDragStart?: (e: PlanTapEvent, ctx: PlanOverlayContext) => boolean | void;
  /** The owned drag moved (every pointer move). */
  onDragMove?: (e: PlanTapEvent, ctx: PlanOverlayContext) => void;
  /** The owned drag ended: released, or cancelled (pointer cancel, second finger) — then don't save anything. */
  onDragEnd?: (e: PlanTapEvent, ctx: PlanOverlayContext, cancelled: boolean) => void;
  /** Long-press (touch / pen) or right-click (mouse) on the plan, before the editor's. Return true when handled. */
  onLongPress?: (e: PlanTapEvent, ctx: PlanOverlayContext) => boolean | void;
}

const registry = new Map<string, PlanOverlay>();
let version = 0;
let snapshot: PlanOverlay[] = [];
const listeners = new Set<() => void>();

function changed() {
  version++;
  snapshot = [...registry.values()].sort((a, b) => (a.order ?? 200) - (b.order ?? 200));
  listeners.forEach((l) => l());
}

/** Add (or replace, by id) an overlay on every plan view. Returns an unregister function. */
export function registerPlanOverlay(o: PlanOverlay): () => void {
  registry.set(o.id, o);
  changed();
  return () => {
    if (registry.get(o.id) === o) {
      registry.delete(o.id);
      changed();
    }
  };
}

export function planOverlaysVersion() {
  return version;
}

/** Registered overlays merged with ones passed as a prop (prop wins on the same id), sorted by order. */
export function usePlanOverlays(extra?: PlanOverlay[]): PlanOverlay[] {
  const reg = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
  return useMemo(() => {
    if (!extra?.length) return reg;
    const ids = new Set(extra.map((o) => o.id));
    return [...reg.filter((o) => !ids.has(o.id)), ...extra].sort((a, b) => (a.order ?? 200) - (b.order ?? 200));
  }, [reg, extra]);
}

/**
 * The live transform for a component drawn over the plan. Re-renders once per animation frame while the view moves —
 * fine for a handful of HTML pins; for heavy content prefer a Konva overlay (moves with the stage for free).
 */
export function useViewTransform(viewport: PlanViewport): ViewportSnapshot {
  return useSyncExternalStore(viewport.subscribe, viewport.getSnapshot, viewport.getSnapshot);
}

// ---- One tool owns plan taps at a time ----------------------------------------------------------------------------
// Measure, Markups, Walk, the Link tool, dropping a task and the editor's own tools (place, wire, calibrate…) each take
// over taps on the plan. Starting one closes the others: a feature registers how to stop (`registerPlanInput`) and calls
// `claimPlanInput(id)` when it starts. A release only closes its own feature (it never claims).

/** Who can own plan input. */
export type PlanInputId = "measure" | "markups" | "walk" | "links" | "task-drop" | "editor-tool";

const releasers: { id: PlanInputId; release: () => void }[] = [];
let claiming = false;

/** How to stop owning plan input (close the toolbar, disarm…). Returns an unregister function. */
export function registerPlanInput(id: PlanInputId, release: () => void): () => void {
  const entry = { id, release };
  releasers.push(entry);
  return () => {
    const i = releasers.indexOf(entry);
    if (i >= 0) releasers.splice(i, 1);
  };
}

function releaseWhere(keep: (id: PlanInputId) => boolean) {
  if (claiming) return;
  claiming = true;
  try {
    for (const r of [...releasers]) if (!keep(r.id)) r.release();
  } finally {
    claiming = false;
  }
}

/** `id` starts owning plan input: every other registered owner is released. */
export function claimPlanInput(id: PlanInputId): void {
  releaseWhere((k) => k === id);
}

/** Release every owner (leaving the plan, switching jobs). */
export function releaseAllPlanInput(): void {
  releaseWhere(() => false);
}

// ---- Keyboard safety ----------------------------------------------------------------------------------------------
// Plan shortcuts never act behind a dialog, while typing, or on a focused button's own Space / Enter.

/** Text entry: every key belongs to it. */
const TEXT_ENTRY = "input,textarea,select,[contenteditable=''],[contenteditable='true'],[role=textbox],[role=combobox],[role=searchbox],[role=spinbutton]";
/** Controls: Space / Enter (and arrows for the ones that move between options) belong to them. */
const CONTROL = "button,a[href],summary,[role=button],[role=link],[role=menuitem],[role=switch],[role=checkbox],[role=radio],[role=tab],[role=option],[role=slider]";
const ARROW_CONTROL = "[role=radio],[role=tab],[role=option],[role=slider],[role=menuitem]";
const DIALOG = "[role=dialog],[role=alertdialog],[aria-modal='true']";

type KeyLike = Pick<KeyboardEvent, "key"> & { target: EventTarget | null };
type Doc = Pick<Document, "querySelector"> | null;
const pageDoc = (): Doc => (typeof document === "undefined" ? null : document);

function asElement(t: EventTarget | null): Element | null {
  return t && typeof (t as Element).closest === "function" ? (t as Element) : null;
}

/** A modal (aria-modal="true") is open anywhere on the page. */
export function modalOpen(doc: Doc = pageDoc()): boolean {
  return !!doc?.querySelector("[aria-modal='true']");
}

/**
 * True when a plan shortcut must ignore this key: a modal is open, the key happened inside a dialog or a text field,
 * or it is Space / Enter (arrows in option groups) on a focused control.
 */
export function planKeyBlocked(e: KeyLike, doc: Doc = pageDoc()): boolean {
  if (modalOpen(doc)) return true;
  const t = asElement(e.target);
  if (!t) return false;
  if (t.closest(DIALOG)) return true;
  if (t.closest(TEXT_ENTRY)) return true;
  if (t.closest(CONTROL)) {
    if (e.key === " " || e.key === "Spacebar" || e.key === "Enter") return true;
    if (e.key.startsWith("Arrow") && t.closest(ARROW_CONTROL)) return true;
  }
  return false;
}

/** Keys that change something once per press: holding them down must not repeat (E toggles the mode, Delete deletes). */
export function repeatBlocked(e: Pick<KeyboardEvent, "key" | "repeat">): boolean {
  if (!e.repeat) return false;
  const k = e.key.toLowerCase();
  return k === "e" || k === "delete" || k === "backspace";
}

/** A single printable character with no ⌘ / Ctrl / Alt (Shift allowed: "?" needs it) — follows the letters setting. */
export function isLetterShortcut(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">): boolean {
  return e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
}

// Single-letter shortcuts on / off (this device). Off: ⌘ / Ctrl keys, Esc, arrows and Delete still work.
const LETTERS_KEY = "pinplan.shortcuts.letters";
let lettersOn: boolean | null = null;
const letterListeners = new Set<() => void>();

export function letterShortcutsOn(): boolean {
  if (lettersOn == null) {
    try {
      lettersOn = typeof localStorage === "undefined" ? true : localStorage.getItem(LETTERS_KEY) !== "off";
    } catch {
      lettersOn = true;
    }
  }
  return lettersOn;
}

export function setLetterShortcuts(on: boolean): void {
  lettersOn = on;
  try {
    localStorage.setItem(LETTERS_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  letterListeners.forEach((l) => l());
}

export function useLetterShortcuts(): boolean {
  return useSyncExternalStore(
    (l) => {
      letterListeners.add(l);
      return () => letterListeners.delete(l);
    },
    letterShortcutsOn,
    () => true,
  );
}

// ---- Layout of the plan's chrome ----------------------------------------------------------------------------------
// Shared by the rails (editor/overlays/PlanRail.tsx) and tests/planLayout.test.ts, so "nothing overlaps" is checked on
// the numbers the page uses. Screen px inside the plan view.

export const PLAN_CHROME = {
  /** Phones: up to this plan-view width (Tailwind's sm is 640). */
  phoneMax: 639,
  /** Gap to the plan's edges (p-2 / sm:p-3). */
  gutter: { phone: 8, wide: 12 },
  /** Top bar (sheet pill, tools, View / Edit): 44 px buttons, 52 px on touch screens. */
  topBarHeight: 52,
  /** Both rails start under the top bar. */
  railTop: { phone: 64, wide: 72 },
  /** Gap between stacked rail items. */
  railGap: 8,
  /** The right rail is one button wide. */
  rightRailWidth: 44,
  /** Room the left rail leaves on its right for the right rail (phones: calc(100% - 4rem)). */
  leftRailReserve: { phone: 64, wide: 72 },
  /** The bottom controls (device menu, zoom, the toolbar row on narrow plans) reach this high. */
  bottomReserve: { row: 128, wide: 76 },
} as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const boxesIntersect = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const isPhoneWidth = (viewW: number) => viewW <= PLAN_CHROME.phoneMax;

function frame(viewW: number, toolbarRow: boolean) {
  const phone = isPhoneWidth(viewW);
  return {
    phone,
    gutter: phone ? PLAN_CHROME.gutter.phone : PLAN_CHROME.gutter.wide,
    top: phone ? PLAN_CHROME.railTop.phone : PLAN_CHROME.railTop.wide,
    bottom: toolbarRow ? PLAN_CHROME.bottomReserve.row : PLAN_CHROME.bottomReserve.wide,
    reserve: phone ? PLAN_CHROME.leftRailReserve.phone : PLAN_CHROME.leftRailReserve.wide,
  };
}

/** Where the left rail sits and how wide its content may be (`toolbarRow`: the plan toolbar has its own bottom row). */
export function leftRailFrame(viewW: number, viewH: number, toolbarRow = isPhoneWidth(viewW)) {
  const f = frame(viewW, toolbarRow);
  return { x: f.gutter, y: f.top, maxW: viewW - f.gutter - f.reserve + (f.phone ? f.gutter : 0), maxH: Math.max(0, viewH - f.top - f.bottom) };
}

/** The right rail's column (its buttons are rightRailWidth wide, against the right edge). */
export function rightRailFrame(viewW: number, viewH: number, toolbarRow = isPhoneWidth(viewW)): Box {
  const f = frame(viewW, toolbarRow);
  return { x: viewW - f.gutter - PLAN_CHROME.rightRailWidth, y: f.top, w: PLAN_CHROME.rightRailWidth, h: Math.max(0, viewH - f.top - f.bottom) };
}

/** Stack items top-down in the left rail (a flex column with railGap), each capped at the rail's width. */
export function stackLeftRail(viewW: number, viewH: number, items: { id: string; w: number; h: number }[], toolbarRow?: boolean): Record<string, Box> {
  const f = leftRailFrame(viewW, viewH, toolbarRow);
  const out: Record<string, Box> = {};
  let y = f.y;
  for (const it of items) {
    out[it.id] = { x: f.x, y, w: Math.min(it.w, f.maxW), h: it.h };
    y += it.h + PLAN_CHROME.railGap;
  }
  return out;
}

/** CSS for a rail host (absolutely positioned inside the plan view): the same numbers as the frames above. */
export function railStyle(side: "left" | "right", phone: boolean, toolbarRow: boolean): CSSProperties {
  const f = frame(phone ? 0 : PLAN_CHROME.phoneMax + 1, toolbarRow);
  if (side === "right") return { top: f.top, right: f.gutter, bottom: f.bottom };
  return { top: f.top, left: f.gutter, bottom: f.bottom, maxWidth: `calc(100% - ${f.reserve + (f.phone ? 0 : f.gutter)}px)` };
}
