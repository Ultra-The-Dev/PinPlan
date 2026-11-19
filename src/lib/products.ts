// Products (brand + model per device type), per-job choices, cable bundles and cable products.
// Mirrors PinPlanCore (Products.swift / Cables.swift) so a backup moved between the web and iPad apps prices the same.
import { WIRE_TYPES } from "./catalog";
import { ALL_WIRE_TYPES } from "./trades";
import { parseCsv } from "./catalogCsv";
import { toCsv, type Takeoff } from "./takeoff";
import type { DeviceType, Marker, Product, Project, Run } from "./types";

// ---------------- cables ----------------

/** Cables pulled to a device; repeats mean several of that type. Falls back to the single wire type. "None" = no cable. */
export function markerCables(m: Pick<Marker, "wireType" | "wires">): string[] {
  const list = m.wires?.length ? m.wires : [m.wireType];
  return list.filter((c) => !!c && c !== "None");
}

/** Patch that sets a device's cables (wireType stays the first one, for older readers). */
export function cablesPatch(list: string[]): Pick<Marker, "wireType" | "wires"> {
  const c = list.filter((x) => !!x && x !== "None");
  return { wires: c.length > 1 ? c : null, wireType: c[0] ?? "None" };
}

/** Cables a run carries: its bundle, else its single wire type. */
export function runCables(r: Pick<Run, "wireType" | "wireTypes">): string[] {
  if (r.wireTypes?.length) return r.wireTypes;
  return [r.wireType || "Unspecified"];
}

export interface CableCount {
  type: string;
  count: number;
}

/** HDMI ×1, Cat6 ×2 — in first-seen order. */
export function cableCounts(list: string[]): CableCount[] {
  const out: CableCount[] = [];
  for (const c of list) {
    const e = out.find((x) => x.type === c);
    if (e) e.count++;
    else out.push({ type: c, count: 1 });
  }
  return out;
}

/** "HDMI + 2× Cat6", or "No cable". */
export function cableSummary(list: string[]): string {
  const c = cableCounts(list);
  if (!c.length) return "No cable";
  return c.map((x) => (x.count > 1 ? `${x.count}× ${x.type}` : x.type)).join(" + ");
}

/** Change how many of one cable type are in a bundle (0 removes it), keeping the order. */
export function settingCable(type: string, count: number, list: string[]): string[] {
  const out: string[] = [];
  let placed = false;
  for (const c of cableCounts(list)) {
    if (c.type === type) {
      out.push(...Array(Math.max(0, count)).fill(type));
      placed = true;
    } else out.push(...Array(c.count).fill(c.type));
  }
  if (!placed && count > 0) out.push(...Array(count).fill(type));
  return out;
}

/** Cable products live in the product library under "wire:<cable type>". */
export const CABLE_PREFIX = "wire:";
export const cableKey = (cableType: string) => CABLE_PREFIX + cableType;
export const cableTypeFromKey = (key: string) => (key.startsWith(CABLE_PREFIX) ? key.slice(CABLE_PREFIX.length) : null);
export const CABLE_TYPES = WIRE_TYPES.filter((w) => w !== "None");

/** "cat 6", "CAT6 cable", "hdmi" → the cable type name, if it is one. */
export function matchCable(text: string): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/cable/g, "").replace(/wire/g, "").replace(/[^a-z0-9/+]/g, "");
  const t = norm(text);
  if (!t) return null;
  return CABLE_TYPES.find((w) => norm(w) === t) ?? ALL_WIRE_TYPES.find((w) => norm(w) === t) ?? null;
}

// ---------------- products ----------------

/** "Ubiquiti G5 Turret" */
export function productTitle(p: Pick<Product, "brand" | "model">): string {
  const t = [p.brand, p.model].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return t || "Unnamed product";
}

/** The product a device uses: its own choice, else the job's choice for its type (only if it fits the type). */
export function productIdFor(m: Pick<Marker, "productId" | "deviceTypeId">, project: Pick<Project, "productChoices">, products: Product[]): string | null {
  for (const id of [m.productId, project.productChoices?.[m.deviceTypeId]]) {
    if (!id) continue;
    const p = products.find((x) => x.id === id && !x.deleted);
    if (p && p.deviceTypeId === m.deviceTypeId) return id;
  }
  return null;
}

export type ProductSplit = Record<string, Record<string, { confirmed: number; tentative: number }>>;

/** Per device type: quantities by product id (confirmed / tentative). LED types use the job's product for their whole length. */
export function productSplit(
  input: { project: Pick<Project, "productChoices">; markers: Marker[]; sheets: { id: string; deleted?: boolean }[] },
  takeoff: Takeoff,
  catalog: DeviceType[],
  products: Product[],
): ProductSplit {
  const out: ProductSplit = {};
  const liveSheets = new Set(input.sheets.filter((s) => !s.deleted).map((s) => s.id));
  for (const m of input.markers) {
    if (m.deleted || !liveSheets.has(m.sheetId)) continue;
    const pid = productIdFor(m, input.project, products);
    if (!pid) continue;
    const byType = (out[m.deviceTypeId] ??= {});
    const e = (byType[pid] ??= { confirmed: 0, tentative: 0 });
    if (m.tentative) e.tentative++;
    else e.confirmed++;
  }
  for (const d of catalog) {
    if (d.kind !== "led") continue;
    const pid = input.project.productChoices?.[d.id];
    if (!pid || !products.some((p) => p.id === pid && p.deviceTypeId === d.id && !p.deleted)) continue;
    const c = takeoff.total.ledFt[d.id] ?? 0;
    const t = takeoff.total.ledTentativeFt[d.id] ?? 0;
    if (c > 0 || t > 0) (out[d.id] ??= {})[pid] = { confirmed: c, tentative: t };
  }
  return out;
}

/** Job cable products by cable type, from productChoices keys "wire:<type>". */
export function cableChoices(project: Pick<Project, "productChoices">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(project.productChoices ?? {})) {
    const t = cableTypeFromKey(k);
    if (t && v) out[t] = v;
  }
  return out;
}

/** New productChoices with one choice set (null clears it). */
export function withProductChoice(project: Pick<Project, "productChoices">, typeId: string, productId: string | null): Record<string, string> | null {
  const c = { ...(project.productChoices ?? {}) };
  if (productId) c[typeId] = productId;
  else delete c[typeId];
  return Object.keys(c).length ? c : null;
}

// ---------------- price list import ----------------

/** Device type by id, abbreviation, symbol or name (case-insensitive; also partial name matches like "camera"). */
export function matchType(text: string, catalog: DeviceType[]): DeviceType | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const live = catalog.filter((d) => !d.archived);
  return (
    live.find((d) => [d.id, d.abbrev, d.symbol, d.name].some((v) => v.toLowerCase() === t)) ??
    live.find((d) => d.name.toLowerCase().startsWith(t)) ??
    live.find((d) => d.name.toLowerCase().includes(t)) ??
    null
  );
}

const num = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export interface ProductImport {
  products: Product[];
  skipped: string[];
}

/** One product per row. Columns are found by header (any order): type/device, brand/manufacturer, model, sku/part, price/cost, labor, notes. */
export function parseProductCsv(text: string, catalog: DeviceType[], opts: { newId: () => string; now?: string }): ProductImport {
  const rows = parseCsv(text);
  if (!rows.length) return { products: [], skipped: [] };
  const h = rows[0].map((c) => c.trim().toLowerCase());
  const col = (names: string[]) => {
    const i = h.findIndex((cell) => names.some((n) => cell.includes(n)));
    return i < 0 ? null : i;
  };
  const cType = col(["type", "device", "category"]);
  const cBrand = col(["brand", "manufacturer", "make"]);
  const cModel = col(["model"]);
  const cSku = col(["sku", "part"]);
  const cPrice = col(["price", "cost"]);
  const cLabor = col(["labor", "labour", "install"]);
  const cNotes = col(["note", "spec"]);
  const now = opts.now ?? new Date().toISOString();
  const products: Product[] = [];
  const skipped: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const v = (c: number | null) => (c == null ? "" : (r[c] ?? "").trim());
    const typeText = v(cType);
    const cable = matchCable(typeText);
    const typeKey = cable ? cableKey(cable) : matchType(typeText, catalog)?.id;
    if (!typeKey) return void skipped.push(`Row ${i + 2}: unknown device or cable type “${typeText}”`);
    const brand = v(cBrand);
    const model = v(cModel);
    if (!brand && !model) return void skipped.push(`Row ${i + 2}: no brand or model`);
    products.push({
      id: opts.newId(),
      deviceTypeId: typeKey,
      brand,
      model,
      sku: v(cSku) || null,
      unitPrice: num(v(cPrice)),
      laborPrice: num(v(cLabor)),
      notes: v(cNotes) || null,
      updatedAt: now,
    });
  });
  return { products, skipped };
}

export function productCsvTemplate(catalog: DeviceType[]): string {
  const rows: (string | number)[][] = [["Device type", "Brand", "Model", "SKU", "Price", "Labor", "Notes"]];
  const cam = catalog.find((d) => d.id === "cam-indoor");
  const wap = catalog.find((d) => d.id === "wap");
  if (cam) rows.push([cam.name, "Ubiquiti", "G5 Turret Ultra", "UVC-G5-Turret-Ultra", 129, 85, ""]);
  if (wap) rows.push([wap.name, "Ubiquiti", "U7 Pro", "U7-Pro", 189, 95, ""]);
  rows.push(["Cat6", "Belden", "2412 CMR", "2412", 0.32, 0.25, "per ft"]);
  return toCsv(rows);
}

/** Display name for a product's type key (device type name, or "Cat6 cable"). */
export function typeKeyName(key: string, catalog: DeviceType[]): string {
  const cable = cableTypeFromKey(key);
  if (cable) return `${cable} cable`;
  return catalog.find((d) => d.id === key)?.name ?? key;
}
