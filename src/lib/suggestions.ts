"use client";
import { create } from "zustand";
import { db, newId, nowIso } from "./db";
import type { ScanResult } from "./scanParse";
import { useEditor } from "./store";
import type { Suggestion } from "./types";

// AI "ghost" suggestions. Stored locally only; they never count toward the takeoff until accepted,
// at which point they become ordinary markers / LED runs through the editor store (undoable).

interface SuggestionState {
  projectId: string | null;
  items: Suggestion[];
  selectedIds: string[];
  load(projectId: string): Promise<void>;
  replaceForSheet(sheetId: string, items: Suggestion[]): Promise<void>;
  move(id: string, x: number, y: number): Promise<void>;
  toggleSelect(id: string): void;
  setSelected(ids: string[]): void;
  reject(ids: string[]): Promise<void>;
  accept(ids: string[]): Promise<number>;
}

export const useSuggestions = create<SuggestionState>((set, get) => ({
  projectId: null,
  items: [],
  selectedIds: [],

  async load(projectId) {
    const items = await db().suggestions.where("projectId").equals(projectId).toArray();
    set({ projectId, items, selectedIds: [] });
  },

  async replaceForSheet(sheetId, items) {
    const d = db();
    await d.transaction("rw", d.suggestions, async () => {
      await d.suggestions.where("sheetId").equals(sheetId).delete();
      await d.suggestions.bulkPut(items);
    });
    set((s) => ({
      items: [...s.items.filter((i) => i.sheetId !== sheetId), ...items],
      selectedIds: s.selectedIds.filter((id) => !s.items.some((i) => i.id === id && i.sheetId === sheetId)),
    }));
  },

  async move(id, x, y) {
    const it = get().items.find((i) => i.id === id);
    if (!it) return;
    const next = { ...it, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    await db().suggestions.put(next);
    set((s) => ({ items: s.items.map((i) => (i.id === id ? next : i)) }));
  },

  toggleSelect(id) {
    set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] }));
  },
  setSelected(ids) {
    set({ selectedIds: ids });
  },

  async reject(ids) {
    if (!ids.length) return;
    await db().suggestions.bulkDelete(ids);
    set((s) => ({ items: s.items.filter((i) => !ids.includes(i.id)), selectedIds: s.selectedIds.filter((x) => !ids.includes(x)) }));
  },

  async accept(ids) {
    const editor = useEditor.getState;
    const chosen = get().items.filter((i) => ids.includes(i.id));
    const done: string[] = [];
    // Group by sheet: markers are always created on the active sheet.
    const sheets = [...new Set(chosen.map((i) => i.sheetId))];
    const startSheet = editor().activeSheetId;
    for (const sheetId of sheets) {
      if (editor().activeSheetId !== sheetId) editor().setActiveSheet(sheetId);
      for (const it of chosen.filter((i) => i.sheetId === sheetId)) {
        if (it.kind === "led") {
          const r = await editor().addRun({
            kind: "led",
            deviceTypeId: it.deviceTypeId ?? "led-ceiling",
            points: [Math.max(0, it.x - 0.02), it.y, Math.min(1, it.x + 0.02), it.y],
            typedFt: it.lf ?? null,
            zone: it.zone ?? "",
            switchLabel: it.switchLabel ?? "",
          });
          if (r) done.push(it.id);
        } else {
          if (!it.deviceTypeId) continue; // needs a device type first
          const tentative = !!it.tentative || (!!it.symbolText && /\?/.test(it.symbolText));
          const m = await editor().addMarker(it.deviceTypeId, it.x, it.y, { tentative });
          if (!m) continue;
          done.push(it.id);
        }
      }
    }
    if (startSheet && editor().activeSheetId !== startSheet && sheets.length > 1) editor().setActiveSheet(startSheet);
    await get().reject(done);
    return done.length;
  },
}));

/** Convert a scan result into suggestion rows for a sheet. */
export function suggestionsFromScan(projectId: string, sheetId: string, r: ScanResult): Suggestion[] {
  const ts = nowIso();
  return [
    ...r.symbols.map<Suggestion>((s) => ({
      id: newId(),
      projectId,
      sheetId,
      kind: "marker",
      deviceTypeId: s.deviceTypeId,
      x: s.x,
      y: s.y,
      symbolText: s.symbolText,
      confidence: s.confidence,
      tentative: s.tentative,
      createdAt: ts,
    })),
    ...r.ledCallouts.map<Suggestion>((c) => ({
      id: newId(),
      projectId,
      sheetId,
      kind: "led",
      deviceTypeId: "led-ceiling",
      x: c.x,
      y: c.y,
      zone: c.zone,
      lf: c.lf,
      switchLabel: c.switchLabel,
      confidence: c.confidence,
      createdAt: ts,
    })),
  ];
}

/** Change the device type of a suggestion before accepting it. */
export async function setSuggestionType(id: string, deviceTypeId: string) {
  const it = useSuggestions.getState().items.find((i) => i.id === id);
  if (!it) return;
  const next = { ...it, deviceTypeId };
  await db().suggestions.put(next);
  useSuggestions.setState((s) => ({ items: s.items.map((i) => (i.id === id ? next : i)) }));
}
