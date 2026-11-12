import { CLOSET_KINDS } from "./catalog";
import type { Takeoff } from "./takeoff";
import type { ClosetKind, DeviceType, EstimateLine, PricingSettings } from "./types";

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

const money = (n: number) => Math.round(n * 100) / 100;

/** Build the client estimate from the takeoff, catalog prices and pricing settings, then apply overrides. */
export function buildEstimate(
  takeoff: Takeoff,
  catalog: DeviceType[],
  pricing: PricingSettings,
  overrides: EstimateLine[] = [],
): Estimate {
  const t = takeoff.total;
  const mk = 1 + pricing.markupPct / 100;
  const base: ComputedLine[] = [];
  const push = (l: Omit<ComputedLine, "total" | "included" | "overridden">) =>
    base.push({ ...l, total: 0, included: !l.optional, overridden: false });
  const sorted = [...catalog].sort((a, b) => a.sort - b.sort);

  const priceFor = (d: DeviceType) =>
    pricing.laborMode === "combined" ? d.unitPrice * mk + d.laborPrice : d.unitPrice * mk;
  const suffix = pricing.laborMode === "combined" ? " — installed" : "";

  for (const d of sorted) {
    const all = d.kind === "led" ? (t.ledFt[d.id] ?? 0) : (t.counts[d.id] ?? 0);
    const tent = d.kind === "led" ? (t.ledTentativeFt[d.id] ?? 0) : (t.tentative[d.id] ?? 0);
    const confirmed = d.kind === "led" ? all : all - tent;
    const unit = d.unit === "LF" ? "LF" : "each";
    const group = d.kind === "led" ? "lighting" : "devices";
    if (confirmed > 0)
      push({ key: `dev:${d.id}`, description: d.name + suffix, qty: confirmed, unit, unitPrice: priceFor(d), optional: false, deviceTypeId: d.id, group });
    if (tent > 0)
      push({ key: `opt:${d.id}`, description: `${d.name}${suffix} (optional — marked ?)`, qty: tent, unit, unitPrice: priceFor(d), optional: true, deviceTypeId: d.id, group });
  }
  // LED drawn without a type.
  if (t.ledFt["led-unassigned"])
    push({ key: "dev:led-unassigned", description: "LED strip", qty: t.ledFt["led-unassigned"], unit: "LF", unitPrice: 0, optional: false, group: "lighting" });

  for (const [wt, ft] of Object.entries(t.wireFt)) {
    if (!ft) continue;
    push({ key: `wire:${wt}`, description: `${wt} cable (home runs: ${t.wireRuns[wt] ?? 0})`, qty: ft, unit: "ft", unitPrice: (pricing.wirePrices[wt] ?? 0) * mk, optional: false, group: "wire" });
  }

  for (const k of Object.keys(t.closets) as ClosetKind[]) {
    if (!t.closets[k]) continue;
    const meta = CLOSET_KINDS.find((c) => c.id === k)!;
    push({ key: `closet:${k}`, description: meta.name, qty: t.closets[k], unit: "each", unitPrice: 0, optional: false, group: "infrastructure" });
  }

  if (pricing.laborMode === "separate") {
    for (const d of sorted) {
      if (!d.laborPrice) continue;
      const all = d.kind === "led" ? (t.ledFt[d.id] ?? 0) : (t.counts[d.id] ?? 0);
      const tent = d.kind === "led" ? (t.ledTentativeFt[d.id] ?? 0) : (t.tentative[d.id] ?? 0);
      const confirmed = d.kind === "led" ? all : all - tent;
      const unit = d.unit === "LF" ? "LF" : "each";
      if (confirmed > 0)
        push({ key: `labor:${d.id}`, description: `Labor — ${d.name}`, qty: confirmed, unit, unitPrice: d.laborPrice, optional: false, deviceTypeId: d.id, group: "labor" });
      if (tent > 0)
        push({ key: `optlabor:${d.id}`, description: `Labor — ${d.name} (optional — marked ?)`, qty: tent, unit, unitPrice: d.laborPrice, optional: true, deviceTypeId: d.id, group: "labor" });
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
  for (const o of overrides) {
    if (o.deleted || o.removed || !o.key.startsWith("custom:")) continue;
    lines.push({
      key: o.key,
      description: o.description || "Custom item",
      qty: o.qty ?? 1,
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
