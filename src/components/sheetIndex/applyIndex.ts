"use client";
// Saving sheet index edits (one undo step) and creating callout links after names are confirmed.
import { findCallouts, type ProposedLink, type TextItem } from "@/lib/sheetIndex";
import { useSheetLinks } from "@/lib/sheetLinks";
import { useEditor } from "@/lib/store";
import type { Sheet } from "@/lib/types";

export type SheetMetaPatch = Partial<Pick<Sheet, "number" | "title" | "discipline" | "tags">>;

/** Tags as stored: trimmed, no repeats (case-insensitive), null when none. */
export function cleanTags(tags: (string | null | undefined)[] | null | undefined): string[] | null {
  const out: string[] = [];
  for (const t of tags ?? []) {
    const v = (t ?? "").trim().replace(/\s+/g, " ");
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v.slice(0, 40));
  }
  return out.length ? out : null;
}

/** Apply sheet index changes to several sheets as one undo step. Unchanged sheets are skipped. */
export async function saveSheetMeta(patches: { id: string; patch: SheetMetaPatch }[]): Promise<number> {
  const st = useEditor.getState();
  const changes = [];
  for (const { id, patch } of patches) {
    const before = st.sheets.find((s) => s.id === id);
    if (!before) continue;
    const after: Sheet = { ...before, ...patch };
    const same = (["number", "title", "discipline"] as const).every((k) => (before[k] ?? null) === (after[k] ?? null)) && JSON.stringify(before.tags ?? null) === JSON.stringify(after.tags ?? null);
    if (!same) changes.push({ table: "sheets" as const, before, after });
  }
  if (changes.length) await st.commit(changes);
  return changes.length;
}

/** Links from callouts on these pages to sheets with (confirmed) numbers; repeats of existing links are skipped. */
export async function createCalloutLinks(pages: { sheetId: string; items: TextItem[] }[]): Promise<number> {
  const sheets = useEditor.getState().sheets;
  const proposed: ProposedLink[] = [];
  for (const p of pages) if (p.items.length) proposed.push(...findCallouts(p.items, sheets, p.sheetId));
  return useSheetLinks.getState().addProposed(proposed);
}
