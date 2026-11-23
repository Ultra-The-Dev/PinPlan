// Closet port schedule, cable labels and the material order list. All derived (pure) from placed devices and runs,
// so they always match the plan. Mirrors PinPlanCore/Wiring.swift.
import { runLengthFt } from "./geometry";
import { cableChoices, markerCables, productIdFor, productSplit, productTitle, runCables } from "./products";
import { computeTakeoff, toCsv } from "./takeoff";
import { markerQty } from "./markerCount";
import type { Closet, DeviceType, Marker, Product, Project, Run, Sheet } from "./types";

export interface WiringInput {
  project: Project;
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
}

const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);

/** "HDMI + Cat6" (the older combined wire type) is two cables. */
export function expandCable(c: string): string[] {
  return c === "HDMI + Cat6" ? ["HDMI", "Cat6"] : [c];
}

/** Port prefix per cable type. Cat6 lands on patch panels (PP1-01…); the rest are numbered per type. */
export const PORT_PREFIX: Record<string, string> = {
  "16/4 speaker": "SPK",
  HDMI: "HD",
  "18/2": "LV",
  "LV per driver": "DRV",
  "LV per manufacturer": "MFR",
  Coax: "CX",
  Fiber: "FB",
  // Alarm sensors land on the alarm panel's zones.
  "22/4 alarm": "ZN",
};
export const PANEL_PORTS = 24;

export interface PortRow {
  closetId: string | null;
  closetName: string;
  /** "PP1-07", "SPK-03"; empty when the device has no closet. */
  port: string;
  cable: string;
  markerId: string;
  /** Device label, with -A/-B when a device has several cables of one type. */
  label: string;
  deviceLabel: string;
  device: string;
  room: string;
  floor: string;
  lengthFt: number | null;
  tentative: boolean;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/**
 * Every cable from a device to its closet, with a port. Ports are numbered per closet in floor order, then device label,
 * so the schedule reads in a natural order. (Numbers shift if devices are added later — print labels once the plan is final.)
 * A count pin (×12) gets a row, a port and a label per device it stands for: "WC-1-03.1" … "WC-1-03.12".
 */
export function portSchedule(data: WiringInput, catalog: DeviceType[], products: Product[] = []): PortRow[] {
  const sheets = live(data.sheets).sort((a, b) => a.order - b.order);
  const order = new Map(sheets.map((s, i) => [s.id, i]));
  const closets = live(data.closets);
  const runs = live(data.runs).filter((r) => r.kind === "wire");
  const typeOf = (id: string) => catalog.find((d) => d.id === id);
  const markers = live(data.markers)
    .filter((m) => order.has(m.sheetId) && typeOf(m.deviceTypeId)?.kind !== "led")
    .sort((a, b) => order.get(a.sheetId)! - order.get(b.sheetId)! || natural(a.label, b.label));

  const counters = new Map<string, number>(); // closet|prefix -> last number
  const rows: PortRow[] = [];
  for (const m of markers) {
    const cables = markerCables(m).flatMap(expandCable);
    if (!cables.length) continue;
    const closet = closets.find((c) => c.id === m.closetId) ?? null;
    const run = runs.find((r) => r.markerId === m.id);
    const len = run ? runLengthFt(run) : null;
    const p = products.find((x) => x.id === productIdFor(m, data.project, products));
    const t = typeOf(m.deviceTypeId);
    const device = p ? `${productTitle(p)} (${t?.name ?? m.deviceTypeId})` : (t?.name ?? m.deviceTypeId);
    const perType = new Map<string, number>();
    for (const c of cables) perType.set(c, (perType.get(c) ?? 0) + 1);
    const qty = markerQty(m);
    for (let k = 1; k <= qty; k++) {
      const base = qty > 1 ? `${m.label}.${k}` : m.label;
      const seen = new Map<string, number>();
      for (const cable of cables) {
        const i = seen.get(cable) ?? 0;
        seen.set(cable, i + 1);
        const suffix = perType.get(cable)! > 1 ? `-${String.fromCharCode(65 + i)}` : "";
        let port = "";
        if (closet) {
          const prefix = cable === "Cat6" ? "PP" : (PORT_PREFIX[cable] ?? cable.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase());
          const key = `${closet.id}|${prefix}`;
          const n = (counters.get(key) ?? 0) + 1;
          counters.set(key, n);
          port = prefix === "PP" ? `PP${Math.ceil(n / PANEL_PORTS)}-${String(((n - 1) % PANEL_PORTS) + 1).padStart(2, "0")}` : `${prefix}-${String(n).padStart(2, "0")}`;
        }
        rows.push({
          closetId: closet?.id ?? null,
          closetName: closet?.name ?? "No closet",
          port,
          cable,
          markerId: m.id,
          label: base + suffix,
          deviceLabel: m.label,
          device,
          room: m.room,
          floor: sheets.find((s) => s.id === m.sheetId)?.name ?? "",
          lengthFt: len,
          tentative: m.tentative,
        });
      }
    }
  }
  return rows;
}

export function portScheduleCsv(rows: PortRow[]): string {
  const out: (string | number)[][] = [["Closet", "Port", "Cable", "Label", "Device", "Room", "Floor", "Length ft"]];
  for (const r of rows) out.push([r.closetName, r.port, r.cable, r.label, r.device, r.room, r.floor, r.lengthFt ?? ""]);
  return toCsv(out);
}

/** Two labels per cable (device end and closet end), one row per cable, for Brady / Dymo / P-touch CSV import. */
export function cableLabelsCsv(rows: PortRow[]): string {
  const out: (string | number)[][] = [["Cable ID", "Device end", "Closet end", "Cable", "Closet", "Port", "Room", "Floor"]];
  for (const r of rows) {
    const where = r.port ? `${r.closetName} ${r.port}` : r.closetName;
    out.push([r.label, `${r.label} → ${where}`, `${r.port || "—"} → ${r.label}${r.room ? ` ${r.room}` : ""}`, r.cable, r.closetName, r.port, r.room, r.floor]);
  }
  return toCsv(out);
}

// ---------------- material order list ----------------

/** Cable sold by the box/spool (ft). HDMI is bought as cut lengths instead. */
export const BOX_FT: Record<string, number> = {
  Cat6: 1000,
  "16/4 speaker": 500,
  "18/2": 500,
  "LV per driver": 500,
  "LV per manufacturer": 500,
  Coax: 1000,
  Fiber: 1000,
  "22/4 alarm": 500,
};
/** Stock HDMI lengths (ft). */
export const HDMI_LENGTHS = [6, 10, 15, 25, 35, 50, 75, 100, 150, 200];

export interface MaterialRow {
  /** Brand / supplier the line is ordered from ("No product chosen" when the job hasn't picked one). */
  supplier: string;
  item: string;
  sku: string;
  qty: number;
  unit: string;
  /** Your cost per unit (product price, else catalog price). */
  unitCost: number;
  total: number;
  note: string;
}

const NO_PRODUCT = "No product chosen";
const OTHER = "Terminations & hardware";

export function materialList(data: WiringInput, catalog: DeviceType[], products: Product[], opts: { includeTentative: boolean; wirePrices?: Record<string, number> }): MaterialRow[] {
  const takeoff = computeTakeoff(data);
  const t = takeoff.total;
  const split = productSplit(data, takeoff, catalog, products);
  const byId = new Map(products.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const rows: MaterialRow[] = [];
  const push = (r: Omit<MaterialRow, "total">) => rows.push({ ...r, total: Math.round(r.qty * r.unitCost * 100) / 100 });

  for (const d of [...catalog].sort((a, b) => a.sort - b.sort)) {
    const led = d.kind === "led";
    const all = led ? (t.ledFt[d.id] ?? 0) + (opts.includeTentative ? (t.ledTentativeFt[d.id] ?? 0) : 0) : (t.counts[d.id] ?? 0) - (opts.includeTentative ? 0 : (t.tentative[d.id] ?? 0));
    if (all <= 0) continue;
    const unit = led ? "LF" : "each";
    let rest = all;
    for (const [pid, q] of Object.entries(split[d.id] ?? {})) {
      const p = byId.get(pid);
      if (!p) continue;
      const n = Math.min(rest, q.confirmed + (opts.includeTentative ? q.tentative : 0));
      if (n <= 0) continue;
      rest -= n;
      push({ supplier: p.brand || NO_PRODUCT, item: `${productTitle(p)} — ${d.name}`, sku: p.sku ?? "", qty: Math.round(n * 10) / 10, unit, unitCost: p.unitPrice, note: p.notes ?? "" });
    }
    if (rest > 0.0001) push({ supplier: NO_PRODUCT, item: d.name, sku: "", qty: Math.round(rest * 10) / 10, unit, unitCost: d.unitPrice, note: "" });
  }

  // Cable: totals per type from the takeoff (home runs already include slack and drops), bought by the box.
  const ft: Record<string, number> = {};
  for (const [w, n] of Object.entries(t.wireFt)) for (const c of expandCable(w)) ft[c] = (ft[c] ?? 0) + n;
  const choices = cableChoices(data.project);
  for (const c of Object.keys(ft).sort()) {
    if (c === "Unspecified" || c === "HDMI" || !ft[c]) continue;
    const p = byId.get(choices[c] ?? "");
    const box = BOX_FT[c] ?? 1000;
    const boxes = Math.ceil(ft[c] / box);
    const perFt = p ? p.unitPrice : (opts.wirePrices?.[c] ?? 0);
    push({
      supplier: p?.brand || NO_PRODUCT,
      item: `${p ? `${productTitle(p)} ` : ""}${c} cable — ${box} ft box`,
      sku: p?.sku ?? "",
      qty: boxes,
      unit: "box",
      unitCost: Math.round(perFt * box * 100) / 100,
      note: `${Math.round(ft[c])} ft needed · ${boxes * box - Math.round(ft[c])} ft left over`,
    });
  }

  // HDMI: one cut length per run, rounded up to a stock length.
  const hdmiLens: number[] = [];
  for (const r of live(data.runs)) {
    if (r.kind !== "wire" || !live(data.sheets).some((s) => s.id === r.sheetId)) continue;
    const n = runCables(r).flatMap(expandCable).filter((c) => c === "HDMI").length;
    const len = runLengthFt(r);
    for (let i = 0; i < n; i++) hdmiLens.push(len ?? 0);
  }
  if (hdmiLens.length) {
    const p = byId.get(choices.HDMI ?? "");
    const counts = new Map<number, number>();
    for (const l of hdmiLens) {
      const stock = HDMI_LENGTHS.find((s) => s >= l) ?? Math.ceil(l / 50) * 50;
      counts.set(stock, (counts.get(stock) ?? 0) + 1);
    }
    for (const [stock, n] of [...counts].sort((a, b) => a[0] - b[0]))
      push({
        supplier: p?.brand || NO_PRODUCT,
        item: `${p ? `${productTitle(p)} ` : ""}HDMI cable — ${stock} ft`,
        sku: p?.sku ?? "",
        qty: n,
        unit: "each",
        unitCost: Math.round((p ? p.unitPrice : (opts.wirePrices?.HDMI ?? 0)) * stock * 100) / 100,
        note: hdmiLens.some((l) => !l) ? "Some HDMI runs have no length yet" : "",
      });
  }

  // Terminations from the port schedule: one jack + one patch-panel port + one patch cord per Cat6 cable.
  const ports = portSchedule(data, catalog, products).filter((r) => opts.includeTentative || !r.tentative);
  const cat6 = ports.filter((r) => r.cable === "Cat6");
  if (cat6.length) {
    const panels = [...new Set(cat6.filter((r) => r.closetId).map((r) => r.closetId))].reduce(
      (n, id) => n + Math.ceil(cat6.filter((r) => r.closetId === id).length / PANEL_PORTS),
      0,
    );
    push({ supplier: OTHER, item: "Cat6 keystone jack", sku: "", qty: cat6.length, unit: "each", unitCost: 0, note: "Device end" });
    if (panels) push({ supplier: OTHER, item: `${PANEL_PORTS}-port Cat6 patch panel`, sku: "", qty: panels, unit: "each", unitCost: 0, note: "Per closet, from the port schedule" });
    push({ supplier: OTHER, item: "Cat6 patch cord", sku: "", qty: cat6.length, unit: "each", unitCost: 0, note: "Patch panel to switch" });
  }
  const coax = ports.filter((r) => r.cable === "Coax").length;
  if (coax) push({ supplier: OTHER, item: "Coax F-connector", sku: "", qty: coax * 2, unit: "each", unitCost: 0, note: "Both ends" });

  return rows;
}

/** `prices: false` leaves out the cost columns (technicians don't see prices). */
export function materialCsv(rows: MaterialRow[], opts: { prices?: boolean } = {}): string {
  if (opts.prices === false) {
    const out: (string | number)[][] = [["Supplier", "Item", "SKU", "Qty", "Unit", "Note"]];
    for (const r of rows) out.push([r.supplier, r.item, r.sku, r.qty, r.unit, r.note]);
    return toCsv(out);
  }
  const out: (string | number)[][] = [["Supplier", "Item", "SKU", "Qty", "Unit", "Unit cost", "Total", "Note"]];
  for (const r of rows) out.push([r.supplier, r.item, r.sku, r.qty, r.unit, r.unitCost, r.total, r.note]);
  return toCsv(out);
}
