// Estimate → quote document: the job's priced estimate (takeoff × catalog, with the office's overrides) frozen into
// editable document lines, grouped by category, floor or room. Pure; the iPad app mirrors it (docs/documents.md).
import { CATEGORIES } from "./catalog";
import { defaultTaxes, lineId, documentTotals, withTotals } from "./documents";
import { lineProductId, money, type ComputedLine, type Estimate } from "./estimate";
import { runLengthFt } from "./geometry";
import { cableTypeFromKey, productIdFor, runCables } from "./products";
import { GROUP_LABELS, type ProposalLine, type ProposalSnapshot } from "./proposal";
import { markerQty, pinLabel } from "./markerCount";
import type { Closet, DeviceType, DocGrouping, DocLine, DocTaxRate, DocumentSettings, Marker, Product, Project, Run, SalesDoc, Sheet } from "./types";

export interface QuoteBuildOptions {
  grouping: DocGrouping;
  /** Rooms / device labels under each line. */
  details: boolean;
  /** "sections": the client sees section totals only. */
  detail: "lines" | "sections";
  /** Keep optional ("?") lines that aren't included, shown as optional. */
  includeOptional: boolean;
}

export interface JobData {
  project: Project;
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
  catalog: DeviceType[];
  products: Product[];
}

const OTHER = "Additional items";
const CABLING = "Cabling & infrastructure";
const OPT_SUFFIX = / \(optional — marked \?\)$/;

/** Who is behind an estimate line: the markers, LED runs, wire or closets it counts. */
interface Unit {
  /** Section it belongs to for the chosen grouping. */
  group: string;
  weight: number;
  room?: string;
  label?: string;
  floor?: string;
}

/** Split `qty` over weights: whole numbers stay whole (largest remainder), feet to 2 decimals. Sums to qty exactly. */
export function allocate(qty: number, weights: number[]): number[] {
  const W = weights.reduce((a, b) => a + b, 0);
  if (!(W > 0) || !weights.length) return weights.map(() => 0);
  const whole = Number.isInteger(qty);
  const step = whole ? 1 : 0.01;
  const units = Math.round(qty / step);
  const raw = weights.map((w) => (units * w) / W);
  const out = raw.map(Math.floor);
  let left = units - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i] += 1;
  return out.map((u) => (whole ? u : Math.round(u) / 100));
}

/** The document lines for a job's estimate. */
export function quoteLinesFromEstimate(est: Estimate, job: JobData, opts: QuoteBuildOptions, settings: DocumentSettings): DocLine[] {
  const liveSheets = job.sheets.filter((s) => !s.deleted).sort((a, b) => a.order - b.order);
  const floorName = new Map(liveSheets.map((s) => [s.id, s.name || "Plan"]));
  const floorOrder = new Map(liveSheets.map((s, i) => [s.id, i]));
  const multiFloor = liveSheets.length > 1;
  const typeById = new Map(job.catalog.map((d) => [d.id, d]));
  const markers = job.markers.filter((m) => !m.deleted && floorName.has(m.sheetId));
  const runs = job.runs.filter((r) => !r.deleted && floorName.has(r.sheetId));
  const closets = job.closets.filter((c) => !c.deleted && floorName.has(c.sheetId));
  const productOf = new Map(markers.map((m) => [m.id, productIdFor(m, job.project, job.products)]));
  const roomLabel = (m: Marker) => {
    const room = m.room?.trim() || "Other areas";
    return multiFloor ? `${floorName.get(m.sheetId)} · ${room}` : room;
  };
  const markerUnit = (m: Marker): Unit => ({
    group: opts.grouping === "floor" ? floorName.get(m.sheetId)! : roomLabel(m),
    weight: markerQty(m),
    room: m.room?.trim() || "",
    label: pinLabel(m),
    floor: floorName.get(m.sheetId),
  });

  /** The markers / runs behind a line key, or null when it isn't tied to the plan. */
  function unitsFor(l: ComputedLine): Unit[] | null {
    const key = materialKey(l.key);
    const tentative = l.optional;
    const cable = cableTypeFromKey(key);
    if (cable) {
      if (opts.grouping === "room") return null;
      return runs
        .filter((r) => r.kind === "wire" && runCables(r).includes(cable))
        .map((r) => ({ group: floorName.get(r.sheetId)!, weight: (runLengthFt(r) ?? 0) * runCables(r).filter((c) => c === cable).length, floor: floorName.get(r.sheetId) }));
    }
    if (key.startsWith("closet:")) {
      if (opts.grouping === "room") return null;
      const kind = key.slice(7);
      return closets.filter((c) => c.kind === kind).map((c) => ({ group: floorName.get(c.sheetId)!, weight: 1, floor: floorName.get(c.sheetId) }));
    }
    let typeId: string | undefined = l.deviceTypeId;
    let productId: string | null = null;
    if (key.startsWith("prod:") || key.startsWith("optprod:")) productId = key.slice(key.indexOf(":") + 1);
    else if (!(key.startsWith("dev:") || key.startsWith("opt:"))) return null;
    if (!typeId) typeId = key.slice(key.indexOf(":") + 1);
    const type = typeById.get(typeId);
    if (type?.kind === "led" || typeId === "led-unassigned") {
      const led = runs.filter((r) => (r.kind === "led" || r.kind === "stair") && (r.deviceTypeId ?? (r.kind === "stair" ? "led-stair" : "led-unassigned")) === typeId && !!r.tentative === tentative);
      return led.map((r) => ({
        group: opts.grouping === "floor" ? floorName.get(r.sheetId)! : multiFloor ? `${floorName.get(r.sheetId)} · Lighting` : "Lighting",
        weight: runLengthFt(r) ?? 0,
        floor: floorName.get(r.sheetId),
      }));
    }
    return markers
      .filter((m) => m.deviceTypeId === typeId && m.tentative === tentative && (productId ? productOf.get(m.id) === productId : !productOf.get(m.id)))
      .map(markerUnit);
  }

  const sectionFor = (l: ComputedLine): string => {
    if (opts.grouping === "category") {
      if (l.group === "wire") return "Cabling";
      if (l.group === "labor") return "Labor";
      if (l.group === "infrastructure") return "Infrastructure";
      if (l.group === "custom") return OTHER;
      const cat = l.deviceTypeId ? typeById.get(l.deviceTypeId)?.category : l.group === "lighting" ? "lighting" : undefined;
      return CATEGORIES.find((c) => c.id === cat)?.name ?? (l.group === "lighting" ? "Lighting" : "Equipment");
    }
    if (l.group === "custom") return OTHER;
    return opts.grouping === "room" && (l.group === "wire" || l.group === "infrastructure") ? CABLING : OTHER;
  };

  const sections = new Map<string, { order: number; lines: DocLine[] }>();
  const rank = (title: string, unit?: Unit): number => {
    if (title === OTHER) return 1e9;
    if (title === CABLING) return 1e9 - 1;
    if (opts.grouping === "category") {
      const i = ["Equipment", ...CATEGORIES.map((c) => c.name), "Cabling", "Labor"].indexOf(title);
      return i < 0 ? 500 : i;
    }
    if (opts.grouping === "floor") {
      const sid = liveSheets.find((s) => (s.name || "Plan") === title)?.id;
      return sid != null ? (floorOrder.get(sid) ?? 0) : 600;
    }
    // Rooms: by floor, then name.
    const fi = liveSheets.findIndex((s) => (s.name || "Plan") === unit?.floor);
    return (fi < 0 ? 900 : fi) * 1000;
  };
  const push = (title: string, line: DocLine, unit?: Unit) => {
    let s = sections.get(title);
    if (!s) sections.set(title, (s = { order: rank(title, unit), lines: [] }));
    s.lines.push(line);
  };

  const laborTaxable = settings.laborTaxable;
  for (const l of est.lines) {
    if (l.qty === 0 && l.total === 0) continue;
    if (l.unitPrice === 0) continue; // unpriced rows (closets, unpriced cable) stay off the client copy, as on the PDF
    if (l.optional && !l.included && !opts.includeOptional) continue;
    const pid = lineProductId(l.key, job.project, job.products);
    const sku = pid ? (job.products.find((p) => p.id === pid)?.sku ?? null) : null;
    const base: Omit<DocLine, "id" | "qty"> = {
      kind: "item",
      description: l.description.replace(OPT_SUFFIX, ""),
      unit: l.unit,
      unitPrice: money(l.unitPrice),
      taxable: l.group === "labor" ? laborTaxable : true,
      optional: l.optional && !l.included,
      sku,
      key: l.key,
    };
    const units = opts.grouping === "flat" || opts.grouping === "category" ? null : unitsFor(l);
    if (units && units.length && units.some((u) => u.weight > 0)) {
      // Group the units, then split the line's quantity over the groups.
      const groups = new Map<string, Unit[]>();
      for (const u of units) if (u.weight > 0) groups.set(u.group, [...(groups.get(u.group) ?? []), u]);
      const names = [...groups.keys()];
      const qtys = allocate(l.qty, names.map((g) => groups.get(g)!.reduce((a, u) => a + u.weight, 0)));
      names.forEach((g, i) => {
        if (!qtys[i]) return;
        const us = groups.get(g)!;
        push(g, { ...base, id: lineId(), qty: qtys[i], details: opts.details ? describe(us, opts.grouping) : null }, us[0]);
      });
      continue;
    }
    const title = opts.grouping === "flat" ? "" : sectionFor(l);
    const det = opts.details ? describe(unitsFor(l) ?? [], opts.grouping === "flat" ? "category" : opts.grouping) : null;
    push(title, { ...base, id: lineId(), qty: l.qty, details: det });
  }

  const out: DocLine[] = [];
  const ordered = [...sections.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
  for (const [title, s] of ordered) {
    if (title) out.push({ id: lineId(), kind: "section", description: title, qty: 0, unitPrice: 0, taxable: false });
    out.push(...s.lines);
  }
  return out;
}

/** The material line a labor line belongs to: labor:cam → dev:cam, optlabor:prod:p → optprod:p, labor:wire:Cat6 → wire:Cat6. */
export function materialKey(key: string): string {
  if (key.startsWith("optlabor:prod:")) return `optprod:${key.slice("optlabor:prod:".length)}`;
  if (key.startsWith("optlabor:")) return `opt:${key.slice("optlabor:".length)}`;
  if (key.startsWith("labor:")) {
    const rest = key.slice("labor:".length);
    return rest.startsWith("prod:") || rest.startsWith("wire:") ? rest : `dev:${rest}`;
  }
  return key;
}

/** "Living room (2), Kitchen" / "CAM-1-01, CAM-1-02" / "1st Floor 3 · 2nd Floor 2". */
function describe(units: Unit[], grouping: DocGrouping): string | null {
  if (!units.length) return null;
  const count = (keyOf: (u: Unit) => string | undefined) => {
    const m = new Map<string, number>();
    for (const u of units) {
      const k = keyOf(u)?.trim();
      // Devices, not pins: a count pin (×12) counts 12.
      if (k) m.set(k, (m.get(k) ?? 0) + (u.label != null ? u.weight : 0));
    }
    return [...m.entries()];
  };
  if (grouping === "room") {
    const labels = units.map((u) => u.label).filter(Boolean) as string[];
    return labels.length ? labels.slice(0, 12).join(", ") + (labels.length > 12 ? ` +${labels.length - 12} more` : "") : null;
  }
  if (grouping === "floor") {
    const rooms = count((u) => u.room);
    return rooms.length ? rooms.map(([r, n]) => (n > 1 ? `${r} (${n})` : r)).join(", ") : null;
  }
  const floors = new Map<string, number>();
  for (const u of units) if (u.floor) floors.set(u.floor, (floors.get(u.floor) ?? 0) + (u.label != null ? u.weight : 0));
  if (floors.size < 2) {
    const rooms = count((u) => u.room);
    return rooms.length ? rooms.map(([r, n]) => (n > 1 ? `${r} (${n})` : r)).join(", ") : null;
  }
  return [...floors.entries()].map(([f, n]) => (n ? `${f}: ${n}` : f)).join(" · ");
}

/**
 * Taxes for a quote made from the job's pricing. The company's default taxes when it has any (labor taxed per its
 * setting); otherwise the job's pricing tax % on everything, labor included, exactly as the estimate taxes it, so the
 * quote comes to the same total as the pricing.
 */
export function quoteTaxSetup(settings: DocumentSettings, pricingTaxPct: number | null | undefined): { taxes: DocTaxRate[]; laborTaxable: boolean } {
  const defaults = defaultTaxes(settings);
  if (defaults.length) return { taxes: defaults, laborTaxable: settings.laborTaxable };
  const rate = Number(pricingTaxPct) || 0;
  return rate > 0 ? { taxes: [{ id: "sales-tax", name: "Sales tax", rate }], laborTaxable: true } : { taxes: [], laborTaxable: settings.laborTaxable };
}

/**
 * A quote document built from the job's estimate (a frozen copy; editing it never changes the estimate). With
 * `pricingTaxPct` and a base without taxes, the quote is taxed like the estimate (see quoteTaxSetup).
 */
export function quoteFromEstimate(base: SalesDoc, est: Estimate, job: JobData, opts: QuoteBuildOptions, settings: DocumentSettings, pricingTaxPct?: number | null): SalesDoc {
  const seed = pricingTaxPct != null && !base.taxes.length ? quoteTaxSetup(settings, pricingTaxPct) : null;
  const lines = quoteLinesFromEstimate(est, job, opts, seed ? { ...settings, laborTaxable: seed.laborTaxable } : settings);
  const doc = withTotals({ ...base, lines, taxes: seed ? seed.taxes : base.taxes, source: "estimate", options: { ...(base.options ?? {}), detail: opts.detail } });
  return doc;
}

/** Money difference between a quote and the pricing total it was built from (with tax), for the new-quote warning. */
export function quoteVsPricing(doc: Pick<SalesDoc, "lines" | "taxes" | "discount" | "fees">, est: Pick<Estimate, "total">): number {
  return money(documentTotals(doc).total - est.total);
}

// ---------------------------------------------------------------- the client approved a proposal

/** What quoteFromProposal needs from a proposal row (proposalCloud's ProposalRow). */
export interface ApprovedProposal {
  id: string;
  snapshot: ProposalSnapshot;
  client_name: string | null;
  signature: string | null;
  chosen_options: string[] | null;
  accepted_total: number | null;
  client_note: string | null;
  responded_at: string | null;
}

/**
 * The approved quote for a proposal the client approved: the proposal's frozen lines and prices, one section per
 * group, the options the client ticked counted and the others listed as optional; its tax % on every line and its
 * deposit %. Status "accepted" (Approved) and locked, with the signer, signature and answer time kept in
 * options.approval. Its total equals what the client approved (proposalTotals).
 */
export function quoteFromProposal(base: SalesDoc, row: ApprovedProposal): SalesDoc {
  const snap = row.snapshot;
  const chosen = new Set(row.chosen_options ?? []);
  const order: ProposalLine["group"][] = ["devices", "lighting", "wire", "infrastructure", "labor", "custom"];
  const groups = new Map<ProposalLine["group"], DocLine[]>();
  for (const l of snap.lines) {
    if (!(l.unitPrice || l.total)) continue;
    const counted = !l.optional || chosen.has(l.key);
    // qty × price when it gives the frozen total; otherwise one line at the frozen total, so the sums match exactly.
    const exact = money(l.qty * l.unitPrice) === money(l.total);
    const line: DocLine = {
      id: lineId(),
      kind: "item",
      description: l.description,
      qty: exact ? l.qty : 1,
      unit: exact ? l.unit : "lot",
      unitPrice: exact ? money(l.unitPrice) : money(l.total),
      details: exact ? null : `${l.qty} ${l.unit}`,
      taxable: true,
      optional: !counted,
      key: l.key,
    };
    groups.set(l.group, [...(groups.get(l.group) ?? []), line]);
  }
  const lines: DocLine[] = [];
  for (const g of [...order, ...[...groups.keys()].filter((k) => !order.includes(k))]) {
    const ls = groups.get(g);
    if (!ls?.length) continue;
    lines.push({ id: lineId(), kind: "section", description: GROUP_LABELS[g] ?? "Other", qty: 0, unitPrice: 0, taxable: false }, ...ls);
  }
  const rate = Number(snap.taxPct) || 0;
  return withTotals({
    ...base,
    title: snap.title || base.title,
    status: "accepted",
    issueDate: (row.responded_at ?? snap.createdAt).slice(0, 10),
    validUntil: snap.validUntil ?? base.validUntil,
    lines,
    discount: null,
    fees: [],
    taxes: rate > 0 ? [{ id: "sales-tax", name: "Sales tax", rate }] : [],
    deposit: snap.depositPct ? { type: "pct", value: snap.depositPct } : null,
    terms: snap.terms || base.terms,
    source: "estimate",
    sentAt: snap.createdAt,
    respondedAt: row.responded_at,
    signerName: row.client_name,
    signature: row.signature,
    clientNote: row.client_note,
    options: {
      ...(base.options ?? {}),
      detail: snap.detail,
      approval: {
        source: "proposal",
        proposalId: row.id,
        signerName: row.client_name,
        respondedAt: row.responded_at,
        signature: row.signature,
        chosenOptions: [...chosen],
        clientNote: row.client_note,
        total: row.accepted_total,
      },
    },
  });
}

/** The approved quote already made for a proposal, if any. */
export function quoteForProposal<T extends Pick<SalesDoc, "kind" | "deleted" | "options">>(docs: T[], proposalId: string): T | null {
  return docs.find((d) => d.kind === "quote" && !d.deleted && d.options?.approval?.proposalId === proposalId) ?? null;
}

/** Difference between the document and the estimate it came from (cents from splitting lines over floors). */
export function estimateDrift(doc: SalesDoc, est: Estimate): number {
  return money(documentTotals({ ...doc, taxes: [], discount: null, fees: [] }).subtotal - est.subtotal);
}
