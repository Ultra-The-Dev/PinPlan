// Client proposals: a frozen snapshot of the estimate (plus marked-up plan images) that a client opens by link,
// picks optional items, signs and accepts. The same JSON is written by the iPad app (Proposal.swift).
import type { Estimate, ComputedLine } from "./estimate";
import type { Takeoff } from "./takeoff";
import type { BusinessSettings, DeviceType, Project, Sheet } from "./types";

export type ProposalStatus = "sent" | "viewed" | "accepted" | "declined" | "revoked";

export interface ProposalLine {
  key: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  group: ComputedLine["group"];
  optional: boolean;
  /** Optional lines the installer pre-ticked. */
  included: boolean;
}

export interface ProposalSnapshot {
  version: 1;
  title: string;
  message: string;
  createdAt: string;
  validUntil: string | null;
  currency: string;
  taxPct: number;
  /** "lines": every line with qty × price; "sections": one price per section (lines listed without prices). */
  detail: "lines" | "sections";
  depositPct: number | null;
  terms: string;
  business: Pick<BusinessSettings, "name" | "address" | "phone" | "email" | "website">;
  client: { name: string; email: string; phone: string; address: string };
  /** Headline counts ("8 cameras", "120 LF of LED"). */
  scope: { label: string; value: string }[];
  floors: { name: string; image: string | null; items: { name: string; count: string }[] }[];
  lines: ProposalLine[];
}

export const GROUP_LABELS: Record<ComputedLine["group"], string> = {
  devices: "Equipment",
  lighting: "Lighting",
  wire: "Wiring",
  labor: "Labor",
  infrastructure: "Infrastructure",
  custom: "Other",
};

/** Random link token (URL-safe, ~143 bits). */
export function newToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 56]).join("") + Date.now().toString(36).slice(-4);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildSnapshot(input: {
  project: Project;
  sheets: Sheet[];
  catalog: DeviceType[];
  takeoff: Takeoff;
  estimate: Estimate;
  business: BusinessSettings;
  currency: string;
  taxPct: number;
  title?: string;
  message?: string;
  validDays: number | null;
  detail: ProposalSnapshot["detail"];
  depositPct: number | null;
  terms?: string;
  /** Image URL per sheet id (uploaded plan renders); missing → no image. */
  images?: Record<string, string>;
  now?: Date;
}): ProposalSnapshot {
  const now = input.now ?? new Date();
  const name = (id: string) => input.catalog.find((d) => d.id === id)?.name ?? id;
  const t = input.takeoff.total;
  const devices = Object.values(t.counts).reduce((a, b) => a + b, 0) - Object.values(t.tentative).reduce((a, b) => a + b, 0);
  const scope = [
    { label: "Floors", value: String(input.takeoff.floors.length) },
    { label: "Devices", value: String(devices) },
    ...(t.ledTotalFt ? [{ label: "LED lighting", value: `${t.ledTotalFt} LF` }] : []),
  ];
  const sheetById = new Map(input.sheets.map((s) => [s.id, s]));
  const floors = input.takeoff.floors.map((f) => ({
    name: f.name,
    image: input.images?.[f.sheetId] ?? null,
    items: [
      ...Object.entries(f.counts)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => {
          const opt = f.tentative[id] ?? 0;
          const firm = n - opt;
          return { name: name(id), count: opt ? (firm ? `${firm} (+${opt} optional)` : `${opt} optional`) : String(firm) };
        }),
      ...Object.entries(f.ledFt).filter(([, n]) => n > 0).map(([id, n]) => ({ name: name(id), count: `${n} LF` })),
    ],
    order: sheetById.get(f.sheetId)?.order ?? 0,
  }));
  const lines: ProposalLine[] = input.estimate.lines
    .filter((l) => l.qty !== 0 || l.total !== 0)
    .map((l) => ({
      key: l.key,
      description: l.description.replace(/ \(optional — marked \?\)$/, ""),
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      total: round2(l.total),
      group: l.group,
      optional: l.optional,
      included: l.optional && l.included,
    }));
  const valid = input.validDays ? new Date(now.getTime() + input.validDays * 86400000).toISOString().slice(0, 10) : null;
  return {
    version: 1,
    title: input.title?.trim() || `Proposal — ${input.project.address || input.project.clientName || "your project"}`,
    message: input.message?.trim() ?? "",
    createdAt: now.toISOString(),
    validUntil: valid,
    currency: input.currency,
    taxPct: input.taxPct,
    detail: input.detail,
    depositPct: input.depositPct && input.depositPct > 0 && input.depositPct < 100 ? input.depositPct : null,
    terms: input.terms ?? input.business.estimateTerms ?? "",
    business: { name: input.business.name, address: input.business.address, phone: input.business.phone, email: input.business.email, website: input.business.website },
    client: { name: input.project.clientName ?? "", email: input.project.clientEmail ?? "", phone: input.project.clientPhone ?? "", address: input.project.address ?? "" },
    scope,
    floors: floors.sort((a, b) => a.order - b.order).map(({ order: _o, ...f }) => f),
    lines,
  };
}

/** Totals for a set of chosen optional line keys (matches the server's respond_proposal). */
export function proposalTotals(s: Pick<ProposalSnapshot, "lines" | "taxPct" | "depositPct">, chosen: string[]) {
  const set = new Set(chosen);
  let subtotal = 0;
  let optional = 0;
  for (const l of s.lines) {
    if (!l.optional || set.has(l.key)) subtotal += l.total;
    else optional += l.total;
  }
  subtotal = round2(subtotal);
  const tax = round2((subtotal * (s.taxPct || 0)) / 100);
  const total = round2(subtotal + tax);
  return { subtotal, tax, total, optional: round2(optional), deposit: s.depositPct ? round2((total * s.depositPct) / 100) : null };
}

/** Section totals for the "sections" detail level. */
export function sectionTotals(lines: ProposalLine[], chosen: string[]) {
  const set = new Set(chosen);
  const out = new Map<ProposalLine["group"], number>();
  for (const l of lines) if (!l.optional || set.has(l.key)) out.set(l.group, round2((out.get(l.group) ?? 0) + l.total));
  return out;
}

export function proposalUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/p?t=${encodeURIComponent(token)}`;
}
