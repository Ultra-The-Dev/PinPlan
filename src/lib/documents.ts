// Quotes, invoices and credit notes: totals, statuses, numbering, A/R aging, CSV and the client snapshot.
// Pure (no browser, database or network) so the web app, the server and tests share it; the iPad app mirrors it
// (see docs/documents.md). Money is rounded to cents half away from zero, like the estimate (`money`).
import { money } from "./estimate";
import type {
  Adjust,
  BusinessSettings,
  DocClient,
  DocColumns,
  DocDisplayStatus,
  DocFee,
  DocKind,
  DocLine,
  DocPayment,
  DocStatus,
  DocTaxRate,
  DocTemplate,
  DocumentSettings,
  PaymentMethod,
  Project,
  SalesDoc,
} from "./types";

// ---------------------------------------------------------------- defaults

export const DEFAULT_COLUMNS: DocColumns = { qty: true, unit: true, unitPrice: true, discount: false, tax: false, sku: false, lineTotal: true };

export const DEFAULT_DOC_SETTINGS: DocumentSettings = {
  kinds: {
    quote: { label: "Estimate", format: "EST-{0000}", yearlyReset: false, terms: "", notes: "Thank you for the opportunity to quote this project.", footer: "" },
    invoice: { label: "Invoice", format: "INV-{YYYY}-{0000}", yearlyReset: true, terms: "", notes: "Thank you for your business!", footer: "" },
    credit_note: { label: "Credit note", format: "CN-{0000}", yearlyReset: false, terms: "", notes: "", footer: "" },
  },
  paymentTermsDays: 30,
  quoteValidDays: 30,
  depositPct: 50,
  lateFee: "",
  taxes: [],
  laborTaxable: false,
  currency: "USD",
  locale: "en-US",
  columns: DEFAULT_COLUMNS,
  grouping: "category",
  detail: "lines",
  lineDetails: true,
  template: "classic",
  payment: { instructions: "", bank: "", zelle: "", checkPayable: "", payUrl: "" },
  signatureOnQuotes: true,
  reminders: { enabled: true, daysBeforeDue: 3, daysAfterDue: [7, 14, 30] },
};

/** Settings with every key present (older or partial copies merged over the defaults). */
export function normalizeDocSettings(s: Partial<DocumentSettings> | null | undefined, fallbackCurrency?: string): DocumentSettings {
  const d = DEFAULT_DOC_SETTINGS;
  const x = s ?? {};
  const kinds = {} as DocumentSettings["kinds"];
  for (const k of DOC_KINDS) kinds[k] = { ...d.kinds[k], ...(x.kinds?.[k] ?? {}) };
  return {
    ...d,
    ...x,
    currency: x.currency || fallbackCurrency || d.currency,
    kinds,
    columns: { ...d.columns, ...(x.columns ?? {}) },
    payment: { ...d.payment, ...(x.payment ?? {}) },
    reminders: { ...d.reminders, ...(x.reminders ?? {}) },
    taxes: Array.isArray(x.taxes) ? x.taxes.filter((t) => t && typeof t.rate === "number") : [],
  };
}

export const DOC_KINDS: DocKind[] = ["quote", "invoice", "credit_note"];

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "check", label: "Check" },
  { id: "ach", label: "ACH / bank transfer" },
  { id: "card", label: "Card" },
  { id: "zelle", label: "Zelle" },
  { id: "cash", label: "Cash" },
  { id: "other", label: "Other" },
];

export const PAYMENT_TERMS: { days: number; label: string }[] = [
  { days: 0, label: "Due on receipt" },
  { days: 7, label: "Net 7" },
  { days: 15, label: "Net 15" },
  { days: 30, label: "Net 30" },
  { days: 45, label: "Net 45" },
  { days: 60, label: "Net 60" },
];

export function termsLabel(days: number | null | undefined): string {
  if (days == null) return "";
  return PAYMENT_TERMS.find((t) => t.days === days)?.label ?? `Net ${days}`;
}

// ---------------------------------------------------------------- dates (YYYY-MM-DD, calendar days, no time zones)

const DAY = 86_400_000;
const parseDay = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
export const isDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function addDays(day: string, n: number): string {
  return new Date(parseDay(day) + n * DAY).toISOString().slice(0, 10);
}

/** b − a in whole days. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / DAY);
}

/** The local calendar day of `d` (not UTC: an evening invoice is dated today). */
export function today(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dueDateFor(issueDate: string, termsDays: number | null | undefined): string | null {
  if (!isDay(issueDate) || termsDays == null || !Number.isFinite(termsDays)) return null;
  return addDays(issueDate, Math.max(0, Math.round(termsDays)));
}

// ---------------------------------------------------------------- totals

export interface LineAmounts {
  gross: number;
  discount: number;
  net: number;
}

const isItem = (l: DocLine) => (l.kind ?? "item") === "item";

/** qty × price, less the line discount (a fixed discount never goes past the line amount). */
export function lineAmounts(l: Pick<DocLine, "qty" | "unitPrice" | "discount">): LineAmounts {
  const gross = money((Number(l.qty) || 0) * (Number(l.unitPrice) || 0));
  let discount = 0;
  const d = l.discount;
  if (d && d.value && gross > 0) discount = d.type === "pct" ? money((gross * Math.min(100, Math.max(0, d.value))) / 100) : money(Math.min(Math.max(0, d.value), gross));
  return { gross, discount, net: money(gross - discount) };
}

export interface TaxLine extends DocTaxRate {
  base: number;
  amount: number;
}

export interface SectionTotal {
  /** Id of the section row; null for items above the first heading. */
  id: string | null;
  title: string;
  total: number;
}

export interface DocTotals {
  /** Sum of the counted lines after line discounts. */
  subtotal: number;
  /** Document discount (before tax). */
  discountTotal: number;
  feeTotal: number;
  taxLines: TaxLine[];
  taxTotal: number;
  total: number;
  /** Deposit asked for, or null. */
  deposit: number | null;
  /** Optional lines (not counted). */
  optionalTotal: number;
  sections: SectionTotal[];
  /** Net amount per line id (items only). */
  lineNet: Record<string, number>;
}

type TotalsInput = Pick<SalesDoc, "lines" | "taxes"> & Partial<Pick<SalesDoc, "discount" | "fees" | "deposit">>;

/**
 * Totals: line nets → subtotal → document discount (spread over the lines in proportion, so tax is on the discounted
 * amount) → fees → each tax on its taxable base → total. Every step is rounded to cents.
 */
export function documentTotals(doc: TotalsInput): DocTotals {
  const lineNet: Record<string, number> = {};
  const sections: SectionTotal[] = [];
  let current: SectionTotal | null = null;
  let subtotal = 0;
  let optionalTotal = 0;
  for (const l of doc.lines ?? []) {
    if (!isItem(l)) {
      current = { id: l.id, title: l.description, total: 0 };
      sections.push(current);
      continue;
    }
    const { net } = lineAmounts(l);
    lineNet[l.id] = net;
    if (l.optional) {
      optionalTotal += net;
      continue;
    }
    subtotal += net;
    if (!current) {
      current = { id: null, title: "", total: 0 };
      sections.unshift(current);
    }
    current.total = money(current.total + net);
  }
  subtotal = money(subtotal);
  optionalTotal = money(optionalTotal);

  const discountTotal = adjustAmount(doc.discount, subtotal);
  // The part of each line that's left after the document discount.
  const keep = subtotal > 0 ? (subtotal - discountTotal) / subtotal : 1;
  const fees = (doc.fees ?? []).filter((f) => f && Number.isFinite(f.amount));
  const feeTotal = money(fees.reduce((s, f) => s + money(f.amount), 0));

  const taxLines: TaxLine[] = (doc.taxes ?? []).map((t) => {
    let base = 0;
    for (const l of doc.lines ?? []) {
      if (!isItem(l) || l.optional || !l.taxable) continue;
      if (l.taxIds && !l.taxIds.includes(t.id)) continue;
      base += lineNet[l.id] * keep;
    }
    for (const f of fees) if (f.taxable) base += money(f.amount);
    base = money(base);
    return { ...t, base, amount: money((base * (Number(t.rate) || 0)) / 100) };
  });
  const taxTotal = money(taxLines.reduce((s, t) => s + t.amount, 0));
  const total = money(subtotal - discountTotal + feeTotal + taxTotal);
  const deposit = doc.deposit && doc.deposit.value > 0 ? adjustAmount(doc.deposit, total) : null;
  return { subtotal, discountTotal, feeTotal, taxLines, taxTotal, total, deposit, optionalTotal, sections: sections.filter((s) => s.id !== null || s.total !== 0), lineNet };
}

/** A % of, or a fixed amount up to, `of` (never negative, never more than `of` when `of` is positive). */
export function adjustAmount(a: Adjust | null | undefined, of: number): number {
  if (!a || !a.value || !Number.isFinite(a.value)) return 0;
  if (a.type === "pct") return money((of * Math.min(100, Math.max(0, a.value))) / 100);
  return money(of > 0 ? Math.min(Math.max(0, a.value), of) : Math.max(0, a.value));
}

// ---------------------------------------------------------------- payments and status

export interface PaymentSummary {
  /** Payments less refunds (voided and deleted ones don't count). */
  paid: number;
  /** Credit notes issued against it. */
  credited: number;
  balance: number;
  /** Day of the payment that cleared it (when paid in full). */
  paidOn: string | null;
}

export function paymentSummary(total: number, payments: Pick<DocPayment, "amount" | "date" | "voided" | "deleted">[], creditNotes: Pick<SalesDoc, "total" | "status" | "deleted">[] = []): PaymentSummary {
  const live = payments.filter((p) => !p.voided && !p.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const paid = money(live.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const credited = money(creditNotes.filter((c) => !c.deleted && c.status !== "draft" && c.status !== "void").reduce((s, c) => s + c.total, 0));
  const balance = money(total - paid - credited);
  let paidOn: string | null = null;
  if (balance <= 0 && total > 0) {
    let run = credited;
    for (const p of live) {
      run = money(run + p.amount);
      if (run >= total) {
        paidOn = p.date;
        break;
      }
    }
  }
  return { paid, credited, balance, paidOn };
}

/** The stored status after money changes: paid / partially paid follow the balance; drafts, quotes and void stay. */
export function invoiceStatus(doc: Pick<SalesDoc, "kind" | "status" | "viewedAt">, total: number, s: PaymentSummary): DocStatus {
  if (doc.kind !== "invoice" || doc.status === "draft" || doc.status === "void") return doc.status;
  if (total > 0 && s.balance <= 0) return "paid";
  if (s.paid > 0 || s.credited > 0) return "partially_paid";
  return doc.viewedAt ? "viewed" : "sent";
}

/** What to show: adds "overdue" (invoice past its due date with money owed) and "expired" (quote past valid-until). */
export function displayStatus(doc: Pick<SalesDoc, "kind" | "status" | "dueDate" | "validUntil" | "balanceDue">, day: string = today()): DocDisplayStatus {
  const st = doc.status;
  if (st === "draft" || st === "void") return st;
  if (doc.kind === "invoice") {
    if (st === "paid") return st;
    if (isDay(doc.dueDate) && doc.dueDate < day && doc.balanceDue > 0) return "overdue";
    return st;
  }
  if (doc.kind === "quote" && (st === "sent" || st === "viewed") && isDay(doc.validUntil) && doc.validUntil < day) return "expired";
  return st;
}

export const STATUS_LABEL: Record<DocDisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  partially_paid: "Partly paid",
  paid: "Paid",
  void: "Void",
  overdue: "Overdue",
  expired: "Expired",
};

/** Recompute the denormalised money fields and the status from lines, payments and credit notes. */
export function withTotals<T extends SalesDoc>(doc: T, payments: DocPayment[] = [], creditNotes: SalesDoc[] = []): T {
  const t = documentTotals(doc);
  const s = doc.kind === "invoice" ? paymentSummary(t.total, payments, creditNotes) : { paid: 0, credited: 0, balance: doc.kind === "credit_note" ? 0 : t.total, paidOn: null };
  const status = invoiceStatus(doc, t.total, s);
  return {
    ...doc,
    subtotal: t.subtotal,
    discountTotal: t.discountTotal,
    taxTotal: t.taxTotal,
    total: t.total,
    amountPaid: money(s.paid + s.credited),
    balanceDue: doc.kind === "invoice" ? s.balance : doc.kind === "quote" ? t.total : 0,
    status,
    paidAt: status === "paid" ? (doc.paidAt ?? s.paidOn) : null,
  };
}

// ---------------------------------------------------------------- numbering (mirrors public.format_document_number)

/**
 * "INV-{YYYY}-{0000}" + 42 on 2026-03-05 → "INV-2026-0042". Tokens: {YYYY} {YY} {MM}; {0…0} pads the counter to that
 * many digits (never cuts it); {#} is the bare counter. A format without a counter token gets {0000} at the end.
 */
export function formatDocNumber(format: string, seq: number, day: string): string {
  let out = format?.trim() || "{0000}";
  if (!/\{(0+|#)\}/.test(out)) out += "{0000}";
  out = out.replaceAll("{YYYY}", day.slice(0, 4)).replaceAll("{YY}", day.slice(2, 4)).replaceAll("{MM}", day.slice(5, 7)).replaceAll("{#}", String(seq));
  return out.replace(/\{(0+)\}/g, (_, z: string) => String(seq).padStart(z.length, "0"));
}

/** A problem with a number format, or null. */
export function numberFormatProblem(format: string): string | null {
  const f = format.trim();
  if (!f) return "Enter a number format.";
  if (f.length > 40) return "Keep the format under 40 characters.";
  if (!/\{(0+|#)\}/.test(f)) return "Add {0000} (or {#}) where the running number goes.";
  if (/\{(?!(?:YYYY|YY|MM|0+|#)\})[^}]*\}/.test(f)) return "Only {YYYY}, {YY}, {MM}, {0000} and {#} can go in braces.";
  return null;
}

// ---------------------------------------------------------------- A/R aging

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90";
export const AGING_LABELS: Record<AgingBucket, string> = { current: "Current", d1_30: "1–30 days", d31_60: "31–60 days", d61_90: "61–90 days", d90: "90+ days" };

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90";
}

/** Money still owed, by how late it is (from the due date, else the issue date). Only issued, unpaid invoices. */
export function aging(docs: Pick<SalesDoc, "kind" | "status" | "dueDate" | "issueDate" | "balanceDue" | "deleted">[], day: string = today()): Record<AgingBucket, number> & { total: number } {
  const out = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 };
  for (const d of docs) {
    if (d.deleted || d.kind !== "invoice" || d.status === "draft" || d.status === "void" || !(d.balanceDue > 0)) continue;
    const from = isDay(d.dueDate) ? d.dueDate : isDay(d.issueDate) ? d.issueDate : day;
    const b = agingBucket(daysBetween(from, day));
    out[b] = money(out[b] + d.balanceDue);
    out.total = money(out.total + d.balanceDue);
  }
  return out;
}

/** Outstanding, overdue and paid-this-month figures for the invoices page. */
export function receivables(docs: SalesDoc[], payments: DocPayment[], day: string = today()) {
  let outstanding = 0;
  let overdue = 0;
  let drafts = 0;
  for (const d of docs) {
    if (d.deleted || d.kind !== "invoice" || d.status === "void") continue;
    if (d.status === "draft") {
      drafts = money(drafts + d.total);
      continue;
    }
    if (d.balanceDue > 0) {
      outstanding = money(outstanding + d.balanceDue);
      if (displayStatus(d, day) === "overdue") overdue = money(overdue + d.balanceDue);
    }
  }
  const month = day.slice(0, 7);
  const live = new Set(docs.filter((d) => !d.deleted && d.status !== "void").map((d) => d.id));
  const paidThisMonth = money(payments.filter((p) => !p.deleted && !p.voided && live.has(p.documentId) && p.date.slice(0, 7) === month).reduce((s, p) => s + p.amount, 0));
  return { outstanding, overdue, paidThisMonth, drafts };
}

/** Reminder due for an invoice today per the settings ("before" the due date, or N days "after"), or null. */
export function reminderDue(doc: Pick<SalesDoc, "kind" | "status" | "dueDate" | "balanceDue">, r: DocumentSettings["reminders"], day: string = today()): "before" | "after" | null {
  if (!r.enabled || doc.kind !== "invoice" || !isDay(doc.dueDate) || !(doc.balanceDue > 0)) return null;
  if (doc.status === "draft" || doc.status === "void" || doc.status === "paid") return null;
  const late = daysBetween(doc.dueDate, day);
  if (late < 0 && -late <= r.daysBeforeDue) return "before";
  if (late > 0 && r.daysAfterDue.some((n) => late >= n)) return "after";
  return null;
}

// ---------------------------------------------------------------- formatting

export function formatDocMoney(n: number, currency = "USD", locale = "en-US"): string {
  try {
    return new Intl.NumberFormat(locale || "en-US", { style: "currency", currency: currency || "USD" }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function formatDocDate(day: string | null | undefined, locale = "en-US"): string {
  if (!isDay(day)) return "";
  try {
    return new Intl.DateTimeFormat(locale || "en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(parseDay(day)));
  } catch {
    return day;
  }
}

/** Title shown on the document: its own title, else the kind's label ("Estimate", "Invoice"…). */
export function docTitle(doc: Pick<SalesDoc, "kind" | "title" | "invoiceType">, s: DocumentSettings): string {
  if (doc.title?.trim()) return doc.title.trim();
  return s.kinds[doc.kind]?.label || DEFAULT_DOC_SETTINGS.kinds[doc.kind].label;
}

/** Short name for lists: "INV-2026-0003", or "Draft invoice" / "Invoice (number on sync)". */
export function docName(doc: Pick<SalesDoc, "kind" | "number" | "status" | "title" | "invoiceType">, s: DocumentSettings): string {
  if (doc.number) return doc.number;
  const label = s.kinds[doc.kind]?.label || DEFAULT_DOC_SETTINGS.kinds[doc.kind].label;
  return doc.status === "draft" ? `Draft ${label.toLowerCase()}` : `${label} (number pending)`;
}

/** The company's pay-online link with {amount} {number} {currency} filled in; only http(s) links. */
export function payUrl(template: string, doc: { number?: string | null; balanceDue: number; currency: string }): string | null {
  if (!template?.trim()) return null;
  const url = template
    .trim()
    .replaceAll("{amount}", Math.max(0, doc.balanceDue).toFixed(2))
    .replaceAll("{number}", encodeURIComponent(doc.number ?? ""))
    .replaceAll("{currency}", encodeURIComponent(doc.currency));
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function docColumns(doc: Pick<SalesDoc, "options">, s: DocumentSettings): DocColumns {
  return { ...s.columns, ...(doc.options?.columns ?? {}) };
}

// ---------------------------------------------------------------- building documents

let idSeq = 0;
/** Short id for lines/fees inside a document (unique within it). */
export function lineId(): string {
  idSeq = (idSeq + 1) % 1_000_000;
  return `l${Date.now().toString(36)}${idSeq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function clientFromProject(p: Pick<Project, "clientName" | "clientEmail" | "clientPhone" | "address">): DocClient {
  return { name: p.clientName ?? "", email: p.clientEmail ?? "", phone: p.clientPhone ?? "", siteAddress: p.address ?? "", billingAddress: p.address ?? "" };
}

export function defaultTaxes(s: DocumentSettings): DocTaxRate[] {
  return s.taxes.filter((t) => t.default).map(({ id, name, rate }) => ({ id, name, rate }));
}

/** A new empty document for a job, with the company's defaults. */
export function newDocument(input: { id: string; kind: DocKind; project: Project; settings: DocumentSettings; now: string; day: string }): SalesDoc {
  const { kind, settings: s, day } = input;
  const k = s.kinds[kind];
  const doc: SalesDoc = {
    id: input.id,
    projectId: input.project.id,
    kind,
    title: null,
    number: null,
    status: "draft",
    issueDate: day,
    dueDate: kind === "invoice" ? dueDateFor(day, s.paymentTermsDays) : null,
    validUntil: kind === "quote" && s.quoteValidDays > 0 ? addDays(day, s.quoteValidDays) : null,
    termsDays: kind === "invoice" ? s.paymentTermsDays : null,
    client: clientFromProject(input.project),
    lines: [],
    discount: null,
    taxes: defaultTaxes(s),
    fees: [],
    deposit: kind === "quote" && s.depositPct > 0 ? { type: "pct", value: s.depositPct } : null,
    currency: s.currency,
    notes: k.notes,
    terms: k.terms,
    footer: k.footer,
    internalNotes: "",
    options: kind === "quote" ? { requireSignature: s.signatureOnQuotes } : {},
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    total: 0,
    amountPaid: 0,
    balanceDue: 0,
    source: "manual",
    convertedFrom: null,
    invoiceType: kind === "invoice" ? "standard" : null,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return withTotals(doc);
}

export function blankLine(taxable = true): DocLine {
  return { id: lineId(), kind: "item", description: "", qty: 1, unit: "each", unitPrice: 0, taxable };
}

/** Copy of a document as a new draft (no number, link, answers or payments). */
export function duplicateDocument(doc: SalesDoc, input: { id: string; now: string; day: string; settings: DocumentSettings; kind?: DocKind }): SalesDoc {
  const kind = input.kind ?? doc.kind;
  const s = input.settings;
  const copy: SalesDoc = {
    ...doc,
    id: input.id,
    kind,
    number: null,
    status: "draft",
    issueDate: input.day,
    dueDate: kind === "invoice" ? dueDateFor(input.day, doc.termsDays ?? s.paymentTermsDays) : null,
    validUntil: kind === "quote" && s.quoteValidDays > 0 ? addDays(input.day, s.quoteValidDays) : null,
    lines: doc.lines.map((l) => ({ ...l, id: lineId() })),
    source: "duplicate",
    convertedFrom: doc.id,
    shareToken: null,
    shareHash: null,
    sentAt: null,
    viewedAt: null,
    respondedAt: null,
    signerName: null,
    signature: null,
    clientNote: null,
    paidAt: null,
    voidedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
    deleted: false,
  };
  return withTotals(copy);
}

export type InvoiceMode =
  | { mode: "full" }
  | { mode: "deposit"; pct: number }
  | { mode: "progress"; pct: number }
  | { mode: "lines"; lineIds: string[] }
  | { mode: "final" };

/** Invoices already made from a quote (not void or deleted). */
export function invoicesFromQuote(quoteId: string, docs: SalesDoc[]): SalesDoc[] {
  return docs.filter((d) => d.kind === "invoice" && d.convertedFrom === quoteId && !d.deleted && d.status !== "void");
}

/**
 * An invoice from a quote. full: every line. deposit / progress: one untaxed line for pct % of the quote total
 * (taxes included, so the deposits add up to what the client signed for). lines: the chosen lines, taxed as on the quote.
 * final: every line, less one line per invoice already made from this quote.
 */
export function invoiceFromQuote(quote: SalesDoc, how: InvoiceMode, input: { id: string; now: string; day: string; settings: DocumentSettings; prior?: SalesDoc[]; quoteName?: string }): SalesDoc {
  const s = input.settings;
  const name = input.quoteName ?? quote.number ?? docTitle(quote, s);
  const base: SalesDoc = {
    ...duplicateDocument(quote, { id: input.id, now: input.now, day: input.day, settings: s, kind: "invoice" }),
    title: null,
    source: "quote",
    convertedFrom: quote.id,
    termsDays: s.paymentTermsDays,
    dueDate: dueDateFor(input.day, s.paymentTermsDays),
    validUntil: null,
    deposit: null,
    notes: s.kinds.invoice.notes,
    terms: s.kinds.invoice.terms || quote.terms || "",
    footer: s.kinds.invoice.footer,
    options: { ...(quote.options ?? {}), requireSignature: false },
    invoiceType: "standard",
    billedPct: null,
  };
  const quoteTotal = documentTotals(quote).total;
  const counted = quote.lines.filter((l) => !l.optional);
  if (how.mode === "deposit" || how.mode === "progress") {
    const pct = Math.min(100, Math.max(0, how.pct));
    const amount = money((quoteTotal * pct) / 100);
    const label = how.mode === "deposit" ? `Deposit (${pct}%)` : `Progress billing (${pct}%)`;
    return withTotals({
      ...base,
      invoiceType: how.mode,
      billedPct: pct,
      discount: null,
      fees: [],
      lines: [{ id: lineId(), kind: "item", description: `${label} — ${name}`, details: `${pct}% of ${formatDocMoney(quoteTotal, quote.currency, s.locale)}`, qty: 1, unit: "each", unitPrice: amount, taxable: false }],
    });
  }
  if (how.mode === "lines") {
    const want = new Set(how.lineIds);
    // Keep the headings of the sections that still have a chosen line.
    const out: DocLine[] = [];
    let heading: DocLine | null = null;
    for (const l of counted) {
      if (!isItem(l)) heading = l;
      else if (want.has(l.id)) {
        if (heading) {
          out.push({ ...heading, id: lineId() });
          heading = null;
        }
        out.push({ ...l, id: lineId() });
      }
    }
    return withTotals({ ...base, lines: out, discount: null, fees: [] });
  }
  const lines = counted.map((l) => ({ ...l, id: lineId() }));
  if (how.mode === "final") {
    const prior = input.prior ?? [];
    if (prior.length) lines.push({ id: lineId(), kind: "section", description: "Less amounts already invoiced", qty: 0, unitPrice: 0, taxable: false });
    for (const p of prior)
      lines.push({ id: lineId(), kind: "item", description: `Less ${p.number ?? "earlier invoice"}${p.invoiceType && p.invoiceType !== "standard" ? ` (${p.invoiceType})` : ""}`, qty: 1, unit: "each", unitPrice: -p.total, taxable: false });
    return withTotals({ ...base, lines, invoiceType: prior.length ? "final" : "standard" });
  }
  return withTotals({ ...base, lines });
}

/** A credit note against an invoice: its lines, to edit down to what is being credited. */
export function creditNoteFor(invoice: SalesDoc, input: { id: string; now: string; day: string; settings: DocumentSettings }): SalesDoc {
  const s = input.settings;
  return withTotals({
    ...duplicateDocument(invoice, { ...input, kind: "credit_note" }),
    title: null,
    source: "invoice",
    convertedFrom: invoice.id,
    dueDate: null,
    termsDays: null,
    deposit: null,
    invoiceType: null,
    notes: invoice.number ? `Credit against invoice ${invoice.number}.` : s.kinds.credit_note.notes,
    terms: s.kinds.credit_note.terms,
    footer: s.kinds.credit_note.footer,
    lines: invoice.lines.filter((l) => !l.optional).map((l) => ({ ...l, id: lineId() })),
  });
}

// ---------------------------------------------------------------- clients directory

export interface ClientEntry extends DocClient {
  /** Jobs for this client. */
  projectIds: string[];
  lastUsed: string;
}

/** Distinct clients from the jobs and the documents' client blocks (repeat customers), newest first. */
export function clientDirectory(projects: Pick<Project, "id" | "clientName" | "clientEmail" | "clientPhone" | "address" | "updatedAt" | "deleted">[], docs: Pick<SalesDoc, "projectId" | "client" | "updatedAt" | "deleted">[] = []): ClientEntry[] {
  const byKey = new Map<string, ClientEntry>();
  const keyOf = (c: { name?: string | null; email?: string | null }) => (c.email?.trim().toLowerCase() || c.name?.trim().toLowerCase() || "");
  const merge = (c: DocClient, projectId: string, when: string) => {
    const k = keyOf(c);
    if (!k) return;
    const e = byKey.get(k);
    if (!e) {
      byKey.set(k, { ...c, projectIds: [projectId], lastUsed: when });
      return;
    }
    if (!e.projectIds.includes(projectId)) e.projectIds.push(projectId);
    const newer = when > e.lastUsed;
    for (const f of ["name", "company", "email", "phone", "billingAddress", "siteAddress"] as const) if (c[f] && (newer || !e[f])) e[f] = c[f];
    if (newer) e.lastUsed = when;
  };
  for (const p of projects) if (!p.deleted) merge(clientFromProject(p), p.id, p.updatedAt);
  for (const d of docs) if (!d.deleted && d.client) merge(d.client, d.projectId, d.updatedAt);
  return [...byKey.values()].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
}

// ---------------------------------------------------------------- CSV for the accountant

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Formula injection: a cell that starts with = + - @ is shown as text in spreadsheets.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

const KIND_LABEL: Record<DocKind, string> = { quote: "Quote", invoice: "Invoice", credit_note: "Credit note" };

export function documentsCsv(docs: SalesDoc[], projects: Map<string, Pick<Project, "address" | "clientName">>, day: string = today()): string {
  const rows: unknown[][] = [["Number", "Type", "Status", "Client", "Company", "Client email", "Job", "Issue date", "Due date", "Subtotal", "Discount", "Tax", "Total", "Paid", "Balance", "Currency"]];
  for (const d of docs) {
    if (d.deleted) continue;
    rows.push([
      d.number ?? "",
      KIND_LABEL[d.kind],
      STATUS_LABEL[displayStatus(d, day)],
      d.client?.name ?? "",
      d.client?.company ?? "",
      d.client?.email ?? "",
      projects.get(d.projectId)?.address ?? "",
      d.issueDate ?? "",
      d.dueDate ?? "",
      d.subtotal.toFixed(2),
      d.discountTotal.toFixed(2),
      d.taxTotal.toFixed(2),
      d.total.toFixed(2),
      d.amountPaid.toFixed(2),
      d.balanceDue.toFixed(2),
      d.currency,
    ]);
  }
  return toCsv(rows);
}

export function paymentsCsv(payments: DocPayment[], docs: Map<string, Pick<SalesDoc, "number" | "client" | "currency">>): string {
  const rows: unknown[][] = [["Date", "Invoice", "Client", "Method", "Reference", "Amount", "Currency", "Note"]];
  for (const p of [...payments].sort((a, b) => a.date.localeCompare(b.date))) {
    if (p.deleted || p.voided) continue;
    const d = docs.get(p.documentId);
    rows.push([p.date, d?.number ?? "", d?.client?.name ?? "", PAYMENT_METHODS.find((m) => m.id === p.method)?.label ?? p.method, p.reference ?? "", p.amount.toFixed(2), d?.currency ?? "", p.note ?? ""]);
  }
  return toCsv(rows);
}

// ---------------------------------------------------------------- client snapshot (what the link and PDF show)

export interface DocSnapshot {
  version: 1;
  kind: DocKind;
  title: string;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  validUntil: string | null;
  termsLabel: string;
  currency: string;
  locale: string;
  business: Pick<BusinessSettings, "name" | "address" | "phone" | "email" | "website" | "tagline" | "logo" | "brandColor" | "accentColor">;
  client: DocClient;
  lines: (DocLine & { net: number })[];
  sections: SectionTotal[];
  detail: "lines" | "sections";
  columns: DocColumns;
  template: DocTemplate;
  discount: Adjust | null;
  fees: DocFee[];
  totals: Pick<DocTotals, "subtotal" | "discountTotal" | "feeTotal" | "taxLines" | "taxTotal" | "total" | "deposit" | "optionalTotal">;
  notes: string;
  terms: string;
  footer: string;
  lateFee: string;
  payment: DocumentSettings["payment"];
  plansUrl: string | null;
  requireSignature: boolean;
  invoiceType: SalesDoc["invoiceType"];
  createdAt: string;
}

/** Everything the client sees, frozen. Internal notes, payments and ids of other documents are never included. */
export function buildDocSnapshot(doc: SalesDoc, input: { settings: DocumentSettings; business: BusinessSettings; origin?: string; now: string }): DocSnapshot {
  const s = input.settings;
  const t = documentTotals(doc);
  const b = input.business;
  const logo = b.logo?.startsWith("/") && input.origin ? input.origin.replace(/\/$/, "") + b.logo : (b.logo ?? "");
  return {
    version: 1,
    kind: doc.kind,
    title: docTitle(doc, s),
    number: doc.number ?? null,
    issueDate: doc.issueDate ?? null,
    dueDate: doc.kind === "invoice" ? (doc.dueDate ?? null) : null,
    validUntil: doc.kind === "quote" ? (doc.validUntil ?? null) : null,
    termsLabel: doc.kind === "invoice" ? termsLabel(doc.termsDays) : "",
    currency: doc.currency,
    locale: s.locale,
    business: { name: b.name, address: b.address, phone: b.phone, email: b.email, website: b.website, tagline: b.tagline ?? "", logo, brandColor: b.brandColor ?? "", accentColor: b.accentColor ?? "" },
    client: { ...doc.client },
    lines: doc.lines.map((l) => ({ ...l, net: t.lineNet[l.id] ?? 0 })),
    sections: t.sections,
    detail: doc.options?.detail ?? s.detail,
    columns: docColumns(doc, s),
    template: doc.options?.template ?? s.template,
    discount: doc.discount ?? null,
    fees: doc.fees ?? [],
    totals: { subtotal: t.subtotal, discountTotal: t.discountTotal, feeTotal: t.feeTotal, taxLines: t.taxLines, taxTotal: t.taxTotal, total: t.total, deposit: t.deposit, optionalTotal: t.optionalTotal },
    notes: doc.notes ?? "",
    terms: doc.terms ?? "",
    footer: doc.footer ?? "",
    lateFee: doc.kind === "invoice" ? s.lateFee : "",
    payment: doc.kind === "invoice" ? s.payment : { instructions: "", bank: "", zelle: "", checkPayable: "", payUrl: "" },
    plansUrl: doc.options?.plansUrl ?? null,
    requireSignature: doc.kind === "quote" && (doc.options?.requireSignature ?? s.signatureOnQuotes),
    invoiceType: doc.invoiceType ?? null,
    createdAt: input.now,
  };
}

/** A fingerprint of what the client sees, to tell when a published link is out of date. */
export function snapshotHash(snap: DocSnapshot): string {
  const { createdAt: _c, number: _n, ...rest } = snap;
  const str = JSON.stringify(rest);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function documentUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/d?t=${encodeURIComponent(token)}`;
}
