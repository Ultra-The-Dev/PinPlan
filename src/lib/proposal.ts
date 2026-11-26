// Client proposals: a frozen snapshot of the estimate (plus marked-up plan images) that a client opens by link,
// picks optional items, signs and accepts. The same JSON is written by the iPad app (Proposal.swift).
import type { Estimate, ComputedLine } from "./estimate";
import type { LegendItem } from "./legend";
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
  /** "review": the plan only (no prices) for the client to check device locations; missing = a priced proposal. */
  kind?: "proposal" | "review";
  /** What each symbol on the plans means (plan reviews; proposals may include it too). */
  legend?: LegendItem[];
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
  business: Pick<BusinessSettings, "name" | "address" | "phone" | "email" | "website" | "tagline" | "logo" | "brandColor" | "accentColor" | "serviceArea">;
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
  custom: "Additional work",
};

/** Random link token (URL-safe): 18 random letters from 56 (about 104 bits; b % 56 is slightly uneven) and a time suffix. */
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
  /** Not needed for a plan review. */
  estimate?: Estimate;
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
  /** Site address, to turn a logo path like "/brand/logo.png" into a full URL. */
  origin?: string;
  now?: Date;
  kind?: ProposalSnapshot["kind"];
  legend?: LegendItem[];
}): ProposalSnapshot {
  const review = input.kind === "review";
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
  const lines: ProposalLine[] = review || !input.estimate ? [] : input.estimate.lines
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
    ...(review ? { kind: "review" as const } : {}),
    ...(input.legend?.length ? { legend: input.legend } : {}),
    title: input.title?.trim() || `${review ? "Preliminary plan" : "Quote"} — ${input.project.address || input.project.clientName || "your project"}`,
    message: input.message?.trim() ?? "",
    createdAt: now.toISOString(),
    validUntil: review ? null : valid,
    currency: input.currency,
    taxPct: review ? 0 : input.taxPct,
    detail: input.detail,
    depositPct: !review && input.depositPct && input.depositPct > 0 && input.depositPct < 100 ? input.depositPct : null,
    terms: review ? "" : (input.terms ?? input.business.estimateTerms ?? ""),
    business: {
      name: input.business.name,
      address: input.business.address,
      phone: input.business.phone,
      email: input.business.email,
      website: input.business.website,
      tagline: input.business.tagline ?? "",
      logo: input.business.logo?.startsWith("/") && input.origin ? input.origin.replace(/\/$/, "") + input.business.logo : (input.business.logo ?? ""),
      brandColor: input.business.brandColor ?? "",
      accentColor: input.business.accentColor ?? "",
      serviceArea: input.business.serviceArea ?? "",
    },
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

/** A spot the client pointed at on a plan review (x, y relative 0–1 to that floor's plan image). */
export interface ClientPin {
  floor: string;
  x: number;
  y: number;
  note: string;
}

/** Unique, single-line floor labels for pins (a repeated name gets " (2)", " (3)"…), so two floors with the same name don't share pins. */
export function floorLabels(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const name = raw.replace(/[\r\n]+/g, " ").trim() || "Plan";
    let label = name;
    for (let k = 2; used.has(label); k++) label = `${name} (${k})`;
    used.add(label);
    return label;
  });
}

/** Header line that starts the pinned comments inside a packed client note. */
export const PIN_HEADER = "Pinned on the plan:";
const PIN_LINE = /^(.+?), pin (\d+) at \((\d{1,3}(?:\.\d+)?)%, (\d{1,3}(?:\.\d+)?)%\):[ \t]*(.*)$/;
const pct = (v: number) => Math.round(Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) * 100);

/**
 * Packs the client's change request and their plan pins into the single text note the server stores (client_note), readable as is:
 *   "Move the office speaker\n\nPinned on the plan:\n1st Fl, pin 1 at (42%, 31%): move TV". Pins are numbered 1…n in order.
 */
export function packClientNote(text: string, pins: ClientPin[]): string {
  const lines = pins.map((p, i) => `${p.floor.replace(/[\r\n]+/g, " ").trim() || "Plan"}, pin ${i + 1} at (${pct(p.x)}%, ${pct(p.y)}%): ${p.note.replace(/\s*[\r\n]+\s*/g, " ").trim()}`.trimEnd());
  return [text.trim(), lines.length ? [PIN_HEADER, ...lines].join("\n") : ""].filter(Boolean).join("\n\n");
}

/** Reads a client note back: the free text, plus any pins (with their number) written by packClientNote. Plain notes give no pins. */
export function parseClientNote(note: string | null | undefined): { text: string; pins: (ClientPin & { n: number })[] } {
  const pins: (ClientPin & { n: number })[] = [];
  const rest: string[] = [];
  for (const line of (note ?? "").split(/\r?\n/)) {
    const m = PIN_LINE.exec(line.trim());
    if (m) pins.push({ floor: m[1].trim(), n: Number(m[2]), x: Math.min(100, Number(m[3])) / 100, y: Math.min(100, Number(m[4])) / 100, note: m[5].trim() });
    else if (line.trim() !== PIN_HEADER) rest.push(line);
  }
  return { text: rest.join("\n").trim(), pins };
}
