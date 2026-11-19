"use client";
// UI state of the saved-measurements overlay (this device only): the measure toolbar, what's being drawn, the
// selection and the summary panel. The rows themselves live in useMeasurements (src/lib/measurements.ts).
import { create } from "zustand";
import type { Measurement, MeasurementKind } from "@/lib/types";

export const MEASURE_COLORS = ["#e11d48", "#f59e0b", "#16a34a", "#0284c7", "#7c3aed", "#334155"];

const PREFS_KEY = "pinplan.measure.prefs";

interface Prefs {
  kind: MeasurementKind;
  label: string;
  color: string;
  visible: boolean;
}

function readPrefs(): Partial<Prefs> {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
  } catch {
    return {};
  }
}
function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export interface MeasureUiState extends Prefs {
  /** The measure toolbar is open (taps on the plan draw measurements). */
  active: boolean;
  /** Points being drawn (relative pairs) and the sheet they belong to. */
  draft: number[];
  draftSheetId: string | null;
  /** Mouse/pen position for the live segment (relative), or null. */
  hover: { x: number; y: number } | null;
  selectedId: string | null;
  panelOpen: boolean;
  /** Just deleted (for Undo). */
  lastDeleted: Measurement | null;
  /** Centre this measurement once its sheet is shown. */
  pendingFocus: { sheetId: string; id: string; x: number; y: number } | null;
  hydrated: boolean;
  hydrate(): void;
  setActive(on: boolean): void;
  setKind(k: MeasurementKind): void;
  setLabel(l: string): void;
  setColor(c: string): void;
  setVisible(v: boolean): void;
  setDraft(points: number[], sheetId: string | null): void;
  setHover(p: { x: number; y: number } | null): void;
  select(id: string | null): void;
  setPanelOpen(open: boolean): void;
  setLastDeleted(m: Measurement | null): void;
  focus(f: MeasureUiState["pendingFocus"]): void;
}

export const useMeasureUi = create<MeasureUiState>((set, get) => {
  const save = () => {
    const s = get();
    writePrefs({ kind: s.kind, label: s.label, color: s.color, visible: s.visible });
  };
  return {
    active: false,
    kind: "polyline",
    label: "",
    color: MEASURE_COLORS[0],
    visible: true,
    draft: [],
    draftSheetId: null,
    hover: null,
    selectedId: null,
    panelOpen: false,
    lastDeleted: null,
    pendingFocus: null,
    hydrated: false,
    hydrate() {
      if (get().hydrated) return;
      const p = readPrefs();
      set({
        hydrated: true,
        ...(p.kind === "length" || p.kind === "polyline" || p.kind === "area" ? { kind: p.kind } : {}),
        ...(typeof p.label === "string" ? { label: p.label } : {}),
        ...(typeof p.color === "string" && /^#[0-9a-f]{6}$/i.test(p.color) ? { color: p.color } : {}),
        ...(typeof p.visible === "boolean" ? { visible: p.visible } : {}),
      });
    },
    setActive(on) {
      set({ active: on, draft: [], draftSheetId: null, hover: null, ...(on ? { visible: true } : {}) });
      save();
    },
    setKind(kind) {
      set({ kind, draft: [], draftSheetId: null });
      save();
    },
    setLabel(label) {
      set({ label });
      save();
    },
    setColor(color) {
      set({ color });
      save();
    },
    setVisible(visible) {
      set({ visible, ...(visible ? {} : { selectedId: null }) });
      save();
    },
    setDraft(draft, draftSheetId) {
      set({ draft, draftSheetId: draft.length ? draftSheetId : null });
    },
    setHover(hover) {
      const h = get().hover;
      if (h === hover || (h && hover && h.x === hover.x && h.y === hover.y)) return;
      set({ hover });
    },
    select(selectedId) {
      set({ selectedId });
    },
    setPanelOpen(panelOpen) {
      set({ panelOpen });
    },
    setLastDeleted(lastDeleted) {
      set({ lastDeleted });
    },
    focus(pendingFocus) {
      set({ pendingFocus });
    },
  };
});
