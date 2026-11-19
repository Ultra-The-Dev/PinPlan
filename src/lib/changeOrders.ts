// Change orders: extra (or removed) work priced from the same catalog as the estimate, approved by the client on a
// link with a signature. Pure (no browser, database or network) except `approvedChangeOrderLines`, which reads the
// local database lazily. See docs/change-orders.md for the data model and the rules.
import { nanoid } from "nanoid";
import { money } from "./estimate";
import { productIdFor, productTitle } from "./products";
import type {
  AppSettings,
  ChangeOrder,
  ChangeOrderLine,
  ChangeOrderPublicView,
  ChangeOrderReason,
  ChangeOrderStatus,
  DeviceType,
  Marker,
  PricingSettings,
  Product,
  Project,
  Sheet,
} from "./types";

/** Pricing as change orders read it: the job's pricing plus an optional labor rate per hour (kept in the same JSON). */
export type CoPricing = PricingSettings & { laborRate?: number | null };

export const CO_REASONS: { id: ChangeOrderReason; label: string }[] = [
  { id: "client_request", label: "Client request" },
  { id: "plan_revision", label: "Plan revision" },
  { id: "field_condition", label: "Field condition" },
  { id: "rfi", label: "RFI response" },
  { id: "other", label: "Other" },
];
export const reasonLabel = (r: ChangeOrderReason | string) => CO_REASONS.find((x) => x.id === r)?.label ?? "Other";

export const CO_STATUS: Record<ChangeOrderStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  sent: { label: "Waiting on client", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-700 ring-red-200" },
  void: { label: "Void", cls: "bg-slate-50 text-slate-400 ring-slate-200" },
};

export const LINE_KINDS: { id: ChangeOrderLine["kind"]; label: string }[] = [
  { id: "device", label: "Device" },
  { id: "labor", label: "Labor" },
  { id: "material", label: "Material" },
  { id: "custom", label: "Other" },
];

// ---------------- pricing (same math as buildEstimate) ----------------

type PriceSource = Pick<DeviceType, "unitPrice" | "laborPrice">;

/**
 * A device's unit price on a change order: exactly the estimate's `dev:<type>` / `prod:<id>` line price
 * (material × (1 + markup), plus labor when labor is combined), rounded to cents like buildEstimate.
 */
export function priceDeviceLine(deviceType: PriceSource, product: PriceSource | null | undefined, pricing: Pick<PricingSettings, "markupPct" | "laborMode">): number {
  const src = product ?? deviceType;
  const mk = 1 + (pricing.markupPct || 0) / 100;
  return money(pricing.laborMode === "combined" ? src.unitPrice * mk + src.laborPrice : src.unitPrice * mk);
}

/** The labor unit price listed on its own line when labor is separate (the estimate's `labor:<type>`), else 0. */
export function priceLaborLine(deviceType: PriceSource, product: PriceSource | null | undefined, pricing: Pick<PricingSettings, "laborMode">): number {
  if (pricing.laborMode !== "separate") return 0;
  return money((product ?? deviceType).laborPrice);
}

const deviceUnit = (d: Pick<DeviceType, "unit">) => (d.unit === "LF" ? "LF" : "each");

/** The line for one catalog device (optionally a specific product). */
export function deviceLine(d: DeviceType, product: Product | null | undefined, qty: number, pricing: CoPricing, id: string = nanoid(10)): ChangeOrderLine {
  const suffix = pricing.laborMode === "combined" ? " — installed" : "";
  return {
    id,
    kind: "device",
    deviceTypeId: d.id,
    description: product ? `${productTitle(product)} — ${d.name}${suffix}` : d.name + suffix,
    qty,
    unit: deviceUnit(d),
    unitPrice: priceDeviceLine(d, product, pricing),
    taxable: true,
  };
}

/** Its labor line when labor is listed separately and the device has a labor price; else null. */
export function deviceLaborLine(d: DeviceType, product: Product | null | undefined, qty: number, pricing: CoPricing, id: string = nanoid(10)): ChangeOrderLine | null {
  const price = priceLaborLine(d, product, pricing);
  if (!price) return null;
  return { id, kind: "labor", deviceTypeId: d.id, description: `Labor — ${product ? productTitle(product) : d.name}`, qty, unit: deviceUnit(d), unitPrice: price, taxable: true };
}

/** Labor hours at the job's hourly rate. */
export function laborHoursLine(hours: number, pricing: CoPricing, description = "Labor", id: string = nanoid(10)): ChangeOrderLine {
  return { id, kind: "labor", deviceTypeId: null, description, qty: hours, unit: "hr", unitPrice: money(pricing.laborRate ?? 0), taxable: true };
}

/**
 * Lines for devices picked on the plan: one device line per type (and product), in catalog order, plus a labor
 * line each when labor is separate. Devices whose type is gone from the catalog are skipped.
 */
export function linesFromMarkers(
  markers: Pick<Marker, "id" | "deviceTypeId" | "productId" | "deleted">[],
  catalog: DeviceType[],
  products: Product[],
  pricing: CoPricing,
  opts: { project?: Pick<Project, "productChoices">; newId?: () => string } = {},
): ChangeOrderLine[] {
  const newId = opts.newId ?? (() => nanoid(10));
  const project = opts.project ?? { productChoices: null };
  const groups = new Map<string, { d: DeviceType; p: Product | null; qty: number }>();
  for (const m of markers) {
    if (m.deleted) continue;
    const d = catalog.find((x) => x.id === m.deviceTypeId);
    if (!d) continue;
    const pid = productIdFor(m, project, products);
    const p = pid ? (products.find((x) => x.id === pid) ?? null) : null;
    const key = `${d.id}|${p?.id ?? ""}`;
    const g = groups.get(key) ?? { d, p, qty: 0 };
    g.qty++;
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => a.d.sort - b.d.sort || a.d.name.localeCompare(b.d.name) || (a.p ? productTitle(a.p) : "").localeCompare(b.p ? productTitle(b.p) : ""));
  const out: ChangeOrderLine[] = sorted.map((g) => deviceLine(g.d, g.p, g.qty, pricing, newId()));
  for (const g of sorted) {
    const l = deviceLaborLine(g.d, g.p, g.qty, pricing, newId());
    if (l) out.push(l);
  }
  return out;
}

// ---------------- totals ----------------

export interface CoTotals {
  /** Lines at their own prices (before markup). */
  subtotal: number;
  /** Markup on material lines. */
  markup: number;
  tax: number;
  total: number;
}

export interface SellLine {
  id: string;
  description: string;
  qty: number;
  unit: string;
  /** Price the client sees (material lines include the markup). */
  unitPrice: number;
  total: number;
  /** Total before markup. */
  cost: number;
  taxable: boolean;
}

/**
 * Client prices per line. Like buildEstimate, markup is applied to the unit price and rounded to cents first, so the
 * client's lines add up exactly to subtotal + markup.
 */
export function sellLines(co: Pick<ChangeOrder, "lines" | "markupPct">): SellLine[] {
  const mk = 1 + (co.markupPct ?? 0) / 100;
  return (co.lines ?? []).map((l) => {
    const qty = Number.isFinite(l.qty) ? l.qty : 0;
    const base = money(Number.isFinite(l.unitPrice) ? l.unitPrice : 0);
    const unitPrice = l.kind === "material" ? money(base * mk) : base;
    return { id: l.id, description: l.description, qty, unit: l.unit, unitPrice, total: money(qty * unitPrice), cost: money(qty * base), taxable: l.taxable ?? true };
  });
}

/** Subtotal, markup, tax and total in cents (half away from zero, as the estimate). */
export function changeOrderTotals(co: Pick<ChangeOrder, "lines" | "markupPct" | "taxPct">): CoTotals {
  const lines = sellLines(co);
  let subtotal = 0;
  let sell = 0;
  let taxable = 0;
  for (const l of lines) {
    subtotal += l.cost;
    sell += l.total;
    if (l.taxable) taxable += l.total;
  }
  subtotal = money(subtotal);
  const markup = money(sell - subtotal);
  const tax = money((money(taxable) * (co.taxPct ?? 0)) / 100);
  return { subtotal, markup, tax, total: money(subtotal + markup + tax) };
}

// ---------------- numbering ----------------

/** The next number on a job: one more than the highest used (void and revised ones included, so numbers never repeat). */
export function nextCoNumber(cos: Pick<ChangeOrder, "number" | "deleted">[]): number {
  let max = 0;
  for (const c of cos) if (!c.deleted && Number.isFinite(c.number)) max = Math.max(max, c.number);
  return max + 1;
}

/** "CO-003". */
export const coCode = (n: number) => `CO-${String(Math.max(0, Math.trunc(n || 0))).padStart(3, "0")}`;

// ---------------- life cycle ----------------

export type CoAction = "send" | "approve" | "reject" | "void" | "revise";

export interface TransitionOptions {
  /** send: link token (kept when the CO already has one). */
  token?: string;
  /** approve / reject: who answered. Required to approve. */
  name?: string;
  signatureImageId?: string | null;
  comment?: string;
  /** revise: id for the new draft. */
  newId?: string;
  /** send: the frozen client view (publicCoView). */
  publicView?: ChangeOrderPublicView | null;
}

export interface TransitionResult {
  co: ChangeOrder;
  /** revise: the new draft. */
  copy?: ChangeOrder;
}

/** Only drafts can be edited. Approved change orders never change. */
export const canEdit = (co: Pick<ChangeOrder, "status">) => co.status === "draft";

const ALLOWED: Record<ChangeOrderStatus, CoAction[]> = {
  draft: ["send", "approve", "reject", "void"],
  sent: ["send", "approve", "reject", "void", "revise"],
  approved: [],
  rejected: ["void", "revise"],
  void: ["revise"],
};

export const canDo = (co: Pick<ChangeOrder, "status">, action: CoAction) => ALLOWED[co.status]?.includes(action) ?? false;

/** "Extra cameras" → "Extra cameras (rev 1)"; "… (rev 1)" → "… (rev 2)". */
export function revisedTitle(title: string): string {
  const m = /^(.*?)\s*\(rev (\d+)\)\s*$/i.exec(title);
  if (m) return `${m[1]} (rev ${Number(m[2]) + 1})`;
  return `${title.trim() || "Change order"} (rev 1)`;
}

/** Move a change order through its life cycle. Throws when the action isn't allowed from its status. */
export function transition(co: ChangeOrder, action: CoAction, now: string, opts: TransitionOptions = {}): TransitionResult {
  if (!canDo(co, action)) {
    if (co.status === "approved") throw new Error(`${coCode(co.number)} is approved and can't be changed. Make a new change order for further changes.`);
    throw new Error(`Can't ${action} a ${co.status} change order.`);
  }
  switch (action) {
    case "send": {
      if (!co.lines.length) throw new Error("Add at least one line before sending.");
      const token = co.shareToken || opts.token;
      if (!token) throw new Error("A link token is needed to send.");
      return { co: { ...co, status: "sent", shareToken: token, sentAt: co.sentAt ?? now, publicView: opts.publicView ?? co.publicView ?? null, updatedAt: now } };
    }
    case "approve": {
      const name = opts.name?.trim();
      if (!name) throw new Error("Enter who approved it.");
      return {
        co: { ...co, status: "approved", approvedName: name, respondedAt: now, signatureImageId: opts.signatureImageId ?? co.signatureImageId ?? null, clientComment: opts.comment?.trim() || co.clientComment || null, updatedAt: now },
      };
    }
    case "reject":
      return { co: { ...co, status: "rejected", approvedName: opts.name?.trim() || co.approvedName || null, respondedAt: now, clientComment: opts.comment?.trim() || co.clientComment || null, updatedAt: now } };
    case "void":
      return { co: { ...co, status: "void", updatedAt: now } };
    case "revise": {
      const copy: ChangeOrder = {
        ...co,
        id: opts.newId ?? nanoid(12),
        title: revisedTitle(co.title),
        status: "draft",
        lines: co.lines.map((l) => ({ ...l })),
        shareToken: null,
        publicView: null,
        sentAt: null,
        respondedAt: null,
        approvedName: null,
        signatureImageId: null,
        clientComment: null,
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };
      // A sent link is withdrawn, so the client can't approve the old version.
      const original = co.status === "sent" ? { ...co, status: "void" as const, updatedAt: now } : co;
      return { co: original, copy };
    }
  }
}

// ---------------- contract value ----------------

export interface ContractSummary {
  original: number;
  approved: number;
  /** Drafts and change orders waiting on the client. */
  pending: number;
  revised: number;
}

/**
 * Plan devices that belong to the original contract: everything except devices priced on a live change order (draft,
 * sent or approved). Confirming a CO's tentative devices on the plan then doesn't count them twice (estimate + CO).
 */
export function baseContractMarkers<T extends { id: string }>(markers: T[], cos: Pick<ChangeOrder, "status" | "markerIds" | "deleted">[]): T[] {
  const covered = new Set<string>();
  for (const c of cos) if (!c.deleted && (c.status === "draft" || c.status === "sent" || c.status === "approved")) for (const id of c.markerIds ?? []) covered.add(id);
  return covered.size ? markers.filter((m) => !covered.has(m.id)) : markers;
}

export function contractSummary(estimateTotal: number, cos: ChangeOrder[]): ContractSummary {
  let approved = 0;
  let pending = 0;
  for (const c of cos) {
    if (c.deleted) continue;
    const t = changeOrderTotals(c).total;
    if (c.status === "approved") approved += t;
    else if (c.status === "draft" || c.status === "sent") pending += t;
  }
  const original = money(estimateTotal);
  approved = money(approved);
  return { original, approved, pending: money(pending), revised: money(original + approved) };
}

// ---------------- client view ----------------

/** Everything the client link may show, and nothing else (no costs, markup %, internal ids, plan links or notes). */
export function publicCoView(
  co: ChangeOrder,
  project: Pick<Project, "address" | "clientName">,
  settings: Pick<AppSettings, "business"> & { pricing: Pick<PricingSettings, "currency"> },
  opts: { sentAt?: string; origin?: string; photoCaptions?: Record<string, string> } = {},
): ChangeOrderPublicView {
  const t = changeOrderTotals(co);
  const b = settings.business;
  const logo = b.logo?.startsWith("/") && opts.origin ? opts.origin.replace(/\/$/, "") + b.logo : (b.logo ?? "");
  return {
    v: 1,
    code: coCode(co.number),
    title: co.title || "Change order",
    reason: co.reason,
    reasonLabel: reasonLabel(co.reason),
    description: co.description ?? "",
    scheduleDays: co.scheduleDays ?? null,
    currency: settings.pricing.currency || "USD",
    lines: sellLines(co).map((l) => ({ description: l.description, qty: l.qty, unit: l.unit, unitPrice: l.unitPrice, total: l.total })),
    subtotal: money(t.subtotal + t.markup),
    tax: t.tax,
    taxPct: co.taxPct ?? 0,
    total: t.total,
    project: { address: project.address ?? "", clientName: project.clientName ?? "" },
    business: {
      name: b.name ?? "",
      address: b.address ?? "",
      phone: b.phone ?? "",
      email: b.email ?? "",
      website: b.website ?? "",
      tagline: b.tagline ?? "",
      logo,
      brandColor: b.brandColor ?? "",
      accentColor: b.accentColor ?? "",
    },
    photos: (co.photoIds ?? []).map((id) => ({ imageId: id, caption: opts.photoCaptions?.[id] ?? "" })),
    sentAt: opts.sentAt ?? co.sentAt ?? co.updatedAt,
  };
}

/** What /api/change-orders/public returns to the client page. */
export interface PublicCoResponse {
  view: Omit<ChangeOrderPublicView, "photos"> & { photos: { url: string; caption: string }[] };
  status: "sent" | "approved" | "rejected";
  respondedAt: string | null;
  approvedName: string | null;
  clientComment: string | null;
}

export function changeOrderUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/co?t=${encodeURIComponent(token)}`;
}

/** Plain-text email body for sending the link from the office's own mail app. */
export function mailtoBody(view: Pick<ChangeOrderPublicView, "code" | "title" | "total" | "currency" | "business" | "scheduleDays">, url: string, fmt: (n: number) => string): string {
  const days = view.scheduleDays ? `\nSchedule: ${view.scheduleDays > 0 ? "+" : ""}${view.scheduleDays} working day${Math.abs(view.scheduleDays) === 1 ? "" : "s"}` : "";
  return `Hi,\n\nHere is change order ${view.code} — ${view.title} — for ${fmt(view.total)}.${days}\n\nPlease review and approve it here:\n${url}\n\nThank you,\n${view.business.name || ""}`.trim();
}

// ---------------- from the plan ----------------

export interface PlanCandidate {
  marker: Marker;
  /** Tentative (?), or placed after the baseline date. Both can be true. */
  tentative: boolean;
  isNew: boolean;
  /** Already on another (non-void) change order. */
  onCo: string | null;
}

/**
 * Devices worth billing as a change: tentative ones and ones placed after `since` (the last proposal / estimate),
 * grouped by sheet in sheet order. Devices already on another live change order are flagged (not hidden).
 */
export function planCandidates(
  markers: Marker[],
  sheets: Pick<Sheet, "id" | "name" | "order" | "deleted">[],
  since: string | null,
  cos: Pick<ChangeOrder, "id" | "number" | "status" | "markerIds" | "deleted">[],
  excludeCoId?: string,
): { sheet: Pick<Sheet, "id" | "name">; items: PlanCandidate[] }[] {
  const onCo = new Map<string, string>();
  for (const c of cos) {
    if (c.deleted || c.status === "void" || c.status === "rejected" || c.id === excludeCoId) continue;
    for (const id of c.markerIds ?? []) onCo.set(id, coCode(c.number));
  }
  const sinceMs = since ? Date.parse(since) : NaN;
  const out: { sheet: Pick<Sheet, "id" | "name">; items: PlanCandidate[] }[] = [];
  for (const s of [...sheets].filter((x) => !x.deleted).sort((a, b) => a.order - b.order)) {
    const items: PlanCandidate[] = [];
    for (const m of markers) {
      if (m.deleted || m.sheetId !== s.id) continue;
      const isNew = Number.isFinite(sinceMs) && Date.parse(m.createdAt) > sinceMs;
      if (!m.tentative && !isNew) continue;
      items.push({ marker: m, tentative: !!m.tentative, isNew, onCo: onCo.get(m.id) ?? null });
    }
    items.sort((a, b) => a.marker.label.localeCompare(b.marker.label, undefined, { numeric: true }));
    if (items.length) out.push({ sheet: { id: s.id, name: s.name }, items });
  }
  return out;
}

// ---------------- for invoicing ----------------

export interface ApprovedCoLines {
  changeOrderId: string;
  code: string;
  title: string;
  approvedAt: string | null;
  approvedName: string | null;
  /** Client prices (markup folded into material lines), ready to become invoice lines. */
  lines: (SellLine & { kind: ChangeOrderLine["kind"]; deviceTypeId: string | null })[];
  taxPct: number;
  totals: CoTotals;
}

/** Approved change orders as billable lines, in number order. Pure version of approvedChangeOrderLines. */
export function approvedLinesFor(cos: ChangeOrder[]): ApprovedCoLines[] {
  return cos
    .filter((c) => !c.deleted && c.status === "approved")
    .sort((a, b) => a.number - b.number || (a.respondedAt ?? "").localeCompare(b.respondedAt ?? ""))
    .map((c) => {
      const kinds = new Map(c.lines.map((l) => [l.id, l]));
      return {
        changeOrderId: c.id,
        code: coCode(c.number),
        title: c.title,
        approvedAt: c.respondedAt ?? null,
        approvedName: c.approvedName ?? null,
        lines: sellLines(c).map((l) => ({ ...l, kind: kinds.get(l.id)?.kind ?? "custom", deviceTypeId: kinds.get(l.id)?.deviceTypeId ?? null })),
        taxPct: c.taxPct ?? 0,
        totals: changeOrderTotals(c),
      };
    });
}

/**
 * Hook for invoicing (not wired yet): a job's approved change orders as billable lines. Change orders never create
 * invoices themselves; an invoicing feature can call this to add "CO-002 — Extra cameras" lines to a progress or
 * final invoice. Reads this device's database (call in the browser only).
 */
export async function approvedChangeOrderLines(projectId: string): Promise<ApprovedCoLines[]> {
  const { db } = await import("./db");
  const rows = await db().changeOrders.where("projectId").equals(projectId).toArray();
  return approvedLinesFor(rows);
}
