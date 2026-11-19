import { CLOSET_KINDS } from "./catalog";
import { countOf, linkedTypes } from "./charges";
import { CABLE_PREFIX, cableChoices, cableKey, productSplit, productTitle, type ProductSplit } from "./products";
import { computeTakeoff, type Takeoff } from "./takeoff";
import type { Closet, ClosetKind, DeviceType, EstimateLine, Marker, PricingSettings, Product, Project, Run, Sheet } from "./types";

export interface ComputedLine {
  key: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  /** Tentative (?) items are optional: listed but only counted when included. */
  optional: boolean;
  included: boolean;
  deviceTypeId?: string;
  group: "devices" | "lighting" | "wire" | "labor" | "infrastructure" | "custom";
  overridden: boolean;
}

export interface Estimate {
  lines: ComputedLine[];
  subtotal: number;
  tax: number;
  total: number;
  optionalTotal: number;
}

/** Round to cents, half away from zero (as Swift's `rounded()`), nudged by an epsilon so 1.005 → 1.01 rather than 1.00
 * (binary floats store 1.005 as 1.00499…). Mirrors PinPlanCore `Money.round` so both apps show the same totals. */
export function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(Math.abs(n) * 100 * (1 + Number.EPSILON)) / 100;
  return n < 0 && r !== 0 ? -r : r;
}

/** One deposit line: pct % of the subtotal, in cents. */
export const depositAmount = (subtotal: number, pct: number) => money((subtotal * pct) / 100);

/** Products by title (case-insensitive, then id): the same line order on web and iOS. */
export function compareProducts(a: Pick<Product, "id" | "brand" | "model">, b: Pick<Product, "id" | "brand" | "model">): number {
  const ta = productTitle(a).toLowerCase();
  const tb = productTitle(b).toLowerCase();
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The product behind an estimate line (for its SKU): "prod:<id>" / "optprod:<id>", or the job's cable product for "wire:<type>"
 * (only when it really is a product for that cable, as buildEstimate prices it). */
export function lineProductId(key: string, project: Pick<Project, "productChoices">, products: Pick<Product, "id" | "deviceTypeId" | "deleted">[]): string | null {
  let id: string | null | undefined = null;
  let wantType: string | null = null;
  if (key.startsWith("prod:") || key.startsWith("optprod:")) id = key.slice(key.indexOf(":") + 1);
  else if (key.startsWith(CABLE_PREFIX)) {
    id = project.productChoices?.[key];
    wantType = key;
  }
  if (!id) return null;
  const p = products.find((x) => x.id === id && !x.deleted);
  return p && (wantType == null || p.deviceTypeId === wantType) ? p.id : null;
}

export interface ProductPricing {
  products?: Product[];
  /** Quantities per device type per product (from productSplit). */
  split?: ProductSplit;
  /** Job cable product id per cable type. */
  cableChoices?: Record<string, string>;
}

/** Build the client estimate from the takeoff, catalog prices and pricing settings, then apply overrides.
 * When the job picks products (brand + model) for device types, their quantities get their own lines at the
 * product's price; whatever has no product stays on the device type's line. */
export function buildEstimate(
  takeoff: Takeoff,
  catalog: DeviceType[],
  pricing: PricingSettings,
  overrides: EstimateLine[] = [],
  pp: ProductPricing = {},
): Estimate {
  const t = takeoff.total;
  const mk = 1 + pricing.markupPct / 100;
  const base: ComputedLine[] = [];
  const push = (l: Omit<ComputedLine, "total" | "included" | "overridden">) =>
    base.push({ ...l, total: 0, included: !l.optional, overridden: false });
  const sorted = [...catalog].sort((a, b) => a.sort - b.sort);

  const priceFor = (d: DeviceType) =>
    pricing.laborMode === "combined" ? d.unitPrice * mk + d.laborPrice : d.unitPrice * mk;
  const combined = pricing.laborMode === "combined";
  const suffix = combined ? " — installed" : "";
  const qtyOf = (d: DeviceType) => {
    const all = d.kind === "led" ? (t.ledFt[d.id] ?? 0) : (t.counts[d.id] ?? 0);
    const tent = d.kind === "led" ? (t.ledTentativeFt[d.id] ?? 0) : (t.tentative[d.id] ?? 0);
    return { confirmed: d.kind === "led" ? all : all - tent, tentative: tent };
  };
  const productById = new Map((pp.products ?? []).filter((p) => !p.deleted).map((p) => [p.id, p]));
  const productParts = (d: DeviceType) =>
    Object.entries(pp.split?.[d.id] ?? {})
      .map(([pid, q]) => ({ p: productById.get(pid), ...q }))
      .filter((x): x is { p: Product; confirmed: number; tentative: number } => !!x.p && x.p.deviceTypeId === d.id)
      .sort((a, b) => compareProducts(a.p, b.p));
  const productPrice = (p: Product) => (combined ? p.unitPrice * mk + p.laborPrice : p.unitPrice * mk);

  for (const d of sorted) {
    const q = qtyOf(d);
    const unit = d.unit === "LF" ? "LF" : "each";
    const group = d.kind === "led" ? "lighting" : "devices";
    let restC = q.confirmed;
    let restT = q.tentative;
    for (const part of productParts(d)) {
      const c = Math.min(part.confirmed, restC);
      const tt = Math.min(part.tentative, restT);
      restC -= c;
      restT -= tt;
      const desc = `${productTitle(part.p)} — ${d.name}${suffix}`;
      if (c > 0) push({ key: `prod:${part.p.id}`, description: desc, qty: c, unit, unitPrice: productPrice(part.p), optional: false, deviceTypeId: d.id, group });
      if (tt > 0) push({ key: `optprod:${part.p.id}`, description: `${desc} (optional — marked ?)`, qty: tt, unit, unitPrice: productPrice(part.p), optional: true, deviceTypeId: d.id, group });
    }
    if (restC > 0.0001)
      push({ key: `dev:${d.id}`, description: d.name + suffix, qty: restC, unit, unitPrice: priceFor(d), optional: false, deviceTypeId: d.id, group });
    if (restT > 0.0001)
      push({ key: `opt:${d.id}`, description: `${d.name}${suffix} (optional — marked ?)`, qty: restT, unit, unitPrice: priceFor(d), optional: true, deviceTypeId: d.id, group });
  }
  // LED drawn without a type.
  if (t.ledFt["led-unassigned"])
    push({ key: "dev:led-unassigned", description: "LED strip", qty: t.ledFt["led-unassigned"], unit: "LF", unitPrice: 0, optional: false, group: "lighting" });

  for (const wt of Object.keys(t.wireFt).sort()) {
    const ft = t.wireFt[wt];
    if (!ft) continue;
    const runs = t.wireRuns[wt] ?? 0;
    // The job's cable product for this type (brand/model, price per ft), else the default price per ft.
    const cp = productById.get(pp.cableChoices?.[wt] ?? "");
    if (cp && cp.deviceTypeId === cableKey(wt)) {
      push({ key: `wire:${wt}`, description: `${wt} — ${productTitle(cp)} (home runs: ${runs})`, qty: ft, unit: "ft", unitPrice: productPrice(cp), optional: false, group: "wire" });
      if (!combined && cp.laborPrice > 0)
        push({ key: `labor:wire:${wt}`, description: `Labor — pull ${wt}`, qty: ft, unit: "ft", unitPrice: cp.laborPrice, optional: false, group: "labor" });
    } else {
      push({ key: `wire:${wt}`, description: `${wt} cable (home runs: ${runs})`, qty: ft, unit: "ft", unitPrice: (pricing.wirePrices[wt] ?? 0) * mk, optional: false, group: "wire" });
    }
  }

  for (const k of Object.keys(t.closets) as ClosetKind[]) {
    if (!t.closets[k]) continue;
    const meta = CLOSET_KINDS.find((c) => c.id === k)!;
    push({ key: `closet:${k}`, description: meta.name, qty: t.closets[k], unit: "each", unitPrice: 0, optional: false, group: "infrastructure" });
  }

  if (pricing.laborMode === "separate") {
    for (const d of sorted) {
      const q = qtyOf(d);
      const unit = d.unit === "LF" ? "LF" : "each";
      let restC = q.confirmed;
      let restT = q.tentative;
      for (const part of productParts(d)) {
        const c = Math.min(part.confirmed, restC);
        const tt = Math.min(part.tentative, restT);
        restC -= c;
        restT -= tt;
        if (!part.p.laborPrice) continue;
        const title = productTitle(part.p);
        if (c > 0) push({ key: `labor:prod:${part.p.id}`, description: `Labor — ${title}`, qty: c, unit, unitPrice: part.p.laborPrice, optional: false, deviceTypeId: d.id, group: "labor" });
        if (tt > 0) push({ key: `optlabor:prod:${part.p.id}`, description: `Labor — ${title} (optional — marked ?)`, qty: tt, unit, unitPrice: part.p.laborPrice, optional: true, deviceTypeId: d.id, group: "labor" });
      }
      if (!d.laborPrice) continue;
      if (restC > 0.0001)
        push({ key: `labor:${d.id}`, description: `Labor — ${d.name}`, qty: restC, unit, unitPrice: d.laborPrice, optional: false, deviceTypeId: d.id, group: "labor" });
      if (restT > 0.0001)
        push({ key: `optlabor:${d.id}`, description: `Labor — ${d.name} (optional — marked ?)`, qty: restT, unit, unitPrice: d.laborPrice, optional: true, deviceTypeId: d.id, group: "labor" });
    }
  }

  const byKey = new Map(overrides.filter((o) => !o.deleted).map((o) => [o.key, o]));
  const lines: ComputedLine[] = [];
  for (const l of base) {
    const o = byKey.get(l.key);
    if (o?.removed) continue;
    const line = { ...l };
    if (o) {
      if (o.description != null && o.description !== "") line.description = o.description;
      if (o.qty != null) line.qty = o.qty;
      if (o.unit) line.unit = o.unit;
      if (o.unitPrice != null) line.unitPrice = o.unitPrice;
      line.overridden = o.description != null || o.qty != null || o.unitPrice != null || !!o.unit;
    }
    line.included = l.optional ? (o?.include ?? pricing.includeTentative) : true;
    lines.push(line);
  }
  // Added charges in the order they were added (sort stamp), as on iOS — not the database's id order.
  const custom = overrides.filter((o) => !o.deleted && !o.removed && o.key.startsWith("custom:"));
  custom.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const o of custom) {
    // Per-device charges (prewire to each camera…) follow the plan until a quantity is typed.
    const linked = linkedTypes(o.key);
    lines.push({
      key: o.key,
      description: o.description || "Custom item",
      qty: o.qty ?? (linked ? countOf(t, linked) : 1),
      unit: o.unit || "each",
      unitPrice: o.unitPrice ?? 0,
      total: 0,
      optional: false,
      included: true,
      group: "custom",
      overridden: true,
    });
  }

  let subtotal = 0;
  let optionalTotal = 0;
  for (const l of lines) {
    l.unitPrice = money(l.unitPrice);
    l.total = money(l.qty * l.unitPrice);
    if (l.included) subtotal += l.total;
    else optionalTotal += l.total;
  }
  subtotal = money(subtotal);
  const tax = money((subtotal * pricing.taxPct) / 100);
  return { lines, subtotal, tax, total: money(subtotal + tax), optionalTotal: money(optionalTotal) };
}

/** The job's estimate: takeoff × prices, using the job's chosen products and cable products where set. */
export function projectEstimate(
  data: { project: Project; sheets: Sheet[]; markers: Marker[]; runs: Run[]; closets: Closet[]; estimateLines: EstimateLine[] },
  catalog: DeviceType[],
  products: Product[],
  pricing: PricingSettings,
  takeoff: Takeoff = computeTakeoff(data),
): Estimate {
  return buildEstimate(takeoff, catalog, pricing, data.estimateLines, {
    products,
    split: productSplit(data, takeoff, catalog, products),
    cableChoices: cableChoices(data.project),
  });
}

export function estimateCsv(est: Estimate): string {
  const rows: (string | number)[][] = [["Description", "Qty", "Unit", "Unit price", "Total", "Included"]];
  for (const l of est.lines) rows.push([l.description, l.qty, l.unit, l.unitPrice, l.total, l.included ? "yes" : "optional"]);
  rows.push(["Subtotal", "", "", "", est.subtotal, ""]);
  rows.push(["Tax", "", "", "", est.tax, ""]);
  rows.push(["Total", "", "", "", est.total, ""]);
  return rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");
}

export function formatMoney(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
