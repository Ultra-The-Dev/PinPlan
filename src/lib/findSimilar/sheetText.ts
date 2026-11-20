"use client";
// The PDF text layer of each sheet, kept on this device for Find similar → Read tags (docs/find-similar.md). Plan
// import saves it (SheetsTab); sheets imported earlier, or on another device, get it from "Choose the PDF". Keyed by
// image id: a sheet's image never changes once saved (rotating or a new revision saves a new image), so a stored text
// layer always matches the picture it was read with. Local only, in its own database (never synced, safe to clear).
import Dexie, { type EntityTable } from "dexie";
import { db } from "../db";
import { matchPagesToSheets, readPdfText, type TextItem } from "../sheetIndex";
import type { Sheet } from "../types";

interface SheetTextRow {
  imageId: string;
  items: TextItem[];
  savedAt: number;
}

class SheetTextDb extends Dexie {
  texts!: EntityTable<SheetTextRow, "imageId">;
  constructor() {
    super("pinplan-sheet-text");
    this.version(1).stores({ texts: "imageId, savedAt" });
  }
}

let instance: SheetTextDb | null = null;
const tdb = () => (instance ??= new SheetTextDb());

/** Keep a sheet image's text layer (empty for scans: then we know there is none). Never throws. */
export async function saveSheetText(imageId: string, items: TextItem[]): Promise<void> {
  try {
    await tdb().texts.put({ imageId, items, savedAt: Date.now() });
  } catch {
    /* storage full or unavailable: Read tags will ask for the PDF */
  }
}

/** The text layer saved for a sheet image: items (possibly none, for a scan), or null when we never read it. */
export async function loadSheetText(imageId: string): Promise<TextItem[] | null> {
  try {
    return (await tdb().texts.get(imageId))?.items ?? null;
  } catch {
    return null;
  }
}

/** Save the text layer of a just-imported sheet (looks up its image id). */
export async function saveImportedSheetText(sheetId: string, items: TextItem[]): Promise<void> {
  try {
    const sheet = await db().sheets.get(sheetId);
    if (sheet) await saveSheetText(sheet.imageId, items);
  } catch {
    /* best effort */
  }
}

/**
 * Read a PDF's text and keep it for every sheet whose page it is (same page number and shape). Returns how many
 * sheets got text and whether `sheetId` was one of them.
 */
export async function readTextFromPdf(file: File, sheets: Sheet[], sheetId: string, onProgress?: (done: number, total: number) => void): Promise<{ matched: number; thisSheet: boolean; hasText: boolean }> {
  const pages = await readPdfText(file, onProgress);
  const match = matchPagesToSheets(pages, sheets);
  let thisSheet = false;
  for (const p of pages) {
    const id = match.get(p.pageNumber);
    const sheet = id ? sheets.find((s) => s.id === id) : undefined;
    if (!sheet) continue;
    await saveSheetText(sheet.imageId, p.items);
    if (sheet.id === sheetId) thisSheet = true;
  }
  return { matched: match.size, thisSheet, hasText: pages.some((p) => p.items.length > 0) };
}
