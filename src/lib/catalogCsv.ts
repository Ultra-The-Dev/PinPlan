// Price list CSV for the device catalog: export the catalog, edit prices in a spreadsheet, import it back.
import { CATEGORIES } from "./catalog";
import { toCsv } from "./takeoff";
import type { Category, DeviceType } from "./types";

export const PRICE_LIST_HEADERS = ["id", "name", "category", "unit", "unit_price", "labor_price", "default_wire"] as const;

export function catalogToCsv(types: DeviceType[]): string {
  const rows: (string | number)[][] = [[...PRICE_LIST_HEADERS]];
  for (const t of [...types].sort((a, b) => a.sort - b.sort)) {
    if (t.archived) continue;
    rows.push([t.id, t.name, t.category, t.unit, t.unitPrice, t.laborPrice, t.defaultWire]);
  }
  return toCsv(rows);
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, commas/newlines in quotes; ; or tab also accepted as separator). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const money = (s: string | undefined) => {
  if (s == null || s.trim() === "") return null;
  const n = Number(s.replace(/[$€£\s]/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export interface PriceImportResult {
  updated: DeviceType[];
  created: DeviceType[];
  unmatched: string[];
  errors: string[];
}

/**
 * Apply a price list to the catalog. Rows match by id, else by name (case-insensitive).
 * Unknown rows with a valid category become new device types when `createMissing` is set.
 */
export function applyPriceList(csv: string, catalog: DeviceType[], opts: { createMissing?: boolean; newId?: () => string; now?: string } = {}): PriceImportResult {
  const rows = parseCsv(csv);
  const res: PriceImportResult = { updated: [], created: [], unmatched: [], errors: [] };
  if (!rows.length) {
    res.errors.push("The file is empty.");
    return res;
  }
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (names: string[]) => head.findIndex((h) => names.includes(h));
  const iId = col(["id"]);
  const iName = col(["name", "device", "item", "description"]);
  const iCat = col(["category"]);
  const iUnit = col(["unit"]);
  const iPrice = col(["unit_price", "price", "material", "material_price"]);
  const iLabor = col(["labor_price", "labor", "labour", "install"]);
  const iWire = col(["default_wire", "wire", "wire_type"]);
  if (iName < 0 && iId < 0) {
    res.errors.push("Couldn't find an id or name column.");
    return res;
  }
  if (iPrice < 0 && iLabor < 0) {
    res.errors.push("Couldn't find a price or labor column.");
    return res;
  }
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const byName = new Map(catalog.map((t) => [t.name.trim().toLowerCase(), t]));
  const now = opts.now ?? new Date().toISOString();
  let sort = Math.max(0, ...catalog.map((t) => t.sort)) + 1;
  rows.slice(1).forEach((r, k) => {
    const line = k + 2;
    const id = iId >= 0 ? r[iId]?.trim() : "";
    const name = iName >= 0 ? r[iName]?.trim() : "";
    const price = iPrice >= 0 ? money(r[iPrice]) : null;
    const labor = iLabor >= 0 ? money(r[iLabor]) : null;
    if (iPrice >= 0 && r[iPrice]?.trim() && price == null) return void res.errors.push(`Line ${line}: price “${r[iPrice]}” isn't a number.`);
    if (iLabor >= 0 && r[iLabor]?.trim() && labor == null) return void res.errors.push(`Line ${line}: labor “${r[iLabor]}” isn't a number.`);
    const existing = (id && byId.get(id)) || (name && byName.get(name.toLowerCase())) || null;
    const wire = iWire >= 0 ? r[iWire]?.trim() : "";
    if (existing) {
      const next = { ...existing, unitPrice: price ?? existing.unitPrice, laborPrice: labor ?? existing.laborPrice, defaultWire: wire || existing.defaultWire };
      if (next.unitPrice !== existing.unitPrice || next.laborPrice !== existing.laborPrice || next.defaultWire !== existing.defaultWire) res.updated.push({ ...next, updatedAt: now });
      return;
    }
    const cat = (iCat >= 0 ? r[iCat]?.trim().toLowerCase() : "") as Category;
    if (!opts.createMissing || !name || !CATEGORIES.some((c) => c.id === cat)) return void res.unmatched.push(name || id || `line ${line}`);
    const unit = (iUnit >= 0 ? r[iUnit]?.trim() : "").toUpperCase() === "LF" ? "LF" : "each";
    const color = CATEGORIES.find((c) => c.id === cat)!.color;
    const abbrev = name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "DEV";
    res.created.push({
      id: opts.newId?.() ?? `dt-${Date.now().toString(36)}-${k}`,
      name,
      category: cat,
      symbol: abbrev.slice(0, 2),
      abbrev,
      shape: "circle",
      color,
      unit,
      unitPrice: price ?? 0,
      laborPrice: labor ?? 0,
      defaultWire: wire || "Cat6",
      defaultMount: "ceiling",
      kind: unit === "LF" ? "led" : "device",
      billduProductId: null,
      sort: sort++,
      updatedAt: now,
    });
  });
  return res;
}
