// Files for the accountant: issued invoices and credit notes as QuickBooks Online / Xero importable CSV, a plain CSV,
// and a QuickBooks Desktop IIF file (invoices, credit memos and payments). Pure: no browser, network or database.
//
// Every export is one row per line, and the rows of a document always add up to its total to the cent. To make that
// hold whatever the importer does with tax, the document's money is spelled out as separate lines:
//   items at qty × price (gross) · one "Discount" line (line discounts + the document discount, negative) · fees ·
//   one line per tax (its amount, on the tax item / tax account) · deductions on final invoices (negative).
// Lines are sent as not taxable, so the accounting app never adds its own tax on top. Credit notes are the same lines
// with the sign flipped (QuickBooks credit memo / Xero ACCRECCREDIT).
// See docs/integrations.md.
import { documentTotals, lineAmounts, type TaxLine } from "./documents";
import { money } from "./estimate";
import type { DocPayment, PaymentMethod, SalesDoc } from "./types";
import { csvCell } from "./csv";

export type CsvFormat = "qbo" | "xero" | "generic";
export type DateStyle = "mdy" | "dmy" | "iso";

/** Account and item names in the company's books (Settings: "Export for accountant" → More). */
export interface AccountNames {
  /** Accounts receivable account (IIF). */
  arAccount: string;
  /** Income account for item lines, discounts, fees and deductions (IIF, Xero account code). */
  incomeAccount: string;
  /** Product/service (QuickBooks) or line description used for tax lines. */
  taxItem: string;
  /** Liability account the sales tax goes to (IIF, Xero account code). */
  taxAccount: string;
  /** Product/service for ordinary lines when the line has no item code (QuickBooks). */
  defaultItem: string;
  /** Where payments land before they are deposited (IIF). */
  depositAccount: string;
  /** Xero tax type sent on every line (lines are never taxed by the importer; see above). */
  xeroTaxType: string;
  dateStyle: DateStyle;
}

export const DEFAULT_ACCOUNTS: AccountNames = {
  arAccount: "Accounts Receivable",
  incomeAccount: "Sales",
  taxItem: "Sales Tax",
  taxAccount: "Sales Tax Payable",
  defaultItem: "Services",
  depositAccount: "Undeposited Funds",
  xeroTaxType: "Tax Exempt",
  dateStyle: "mdy",
};

/** Stored names with blanks / bad values replaced by the defaults. */
export function normalizeAccounts(a: Partial<AccountNames> | null | undefined): AccountNames {
  const out = { ...DEFAULT_ACCOUNTS };
  if (!a || typeof a !== "object") return out;
  for (const k of Object.keys(DEFAULT_ACCOUNTS) as (keyof AccountNames)[]) {
    const v = a[k];
    if (typeof v === "string" && v.trim()) (out as Record<string, string>)[k] = v.trim().slice(0, 100);
  }
  if (!["mdy", "dmy", "iso"].includes(out.dateStyle)) out.dateStyle = DEFAULT_ACCOUNTS.dateStyle;
  return out;
}

export interface ExportRange {
  /** YYYY-MM-DD, inclusive. Empty: no limit. */
  from?: string | null;
  to?: string | null;
}

const inRange = (day: string | null | undefined, r: ExportRange) => !!day && (!r.from || day >= r.from) && (!r.to || day <= r.to);

/** Issued (not draft, not void, not deleted) invoices and credit notes with an issue date in the range, oldest first. */
export function exportableDocs(docs: SalesDoc[], range: ExportRange = {}): SalesDoc[] {
  return docs
    .filter((d) => !d.deleted && (d.kind === "invoice" || d.kind === "credit_note") && d.status !== "draft" && d.status !== "void" && inRange(d.issueDate, range))
    .sort((a, b) => (a.issueDate ?? "").localeCompare(b.issueDate ?? "") || (a.number ?? "").localeCompare(b.number ?? ""));
}

// ---------------------------------------------------------------- lines

export type ExportLineKind = "item" | "discount" | "fee" | "tax" | "deduction";

export interface ExportLine {
  kind: ExportLineKind;
  description: string;
  /** Item code / SKU (items only). */
  sku: string | null;
  qty: number;
  unitPrice: number;
  /** Signed amount in the document's direction (positive on invoices, negative on credit notes). */
  amount: number;
  /** Tax lines: the rate. */
  tax?: Pick<TaxLine, "id" | "name" | "rate"> | null;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * A document as accounting lines that add up to its total (credit notes: minus its total). Uses the same maths as the
 * document itself (lineAmounts / documentTotals), so nothing is recalculated differently here.
 */
export function exportLines(doc: SalesDoc): ExportLine[] {
  const sign = doc.kind === "credit_note" ? -1 : 1;
  const t = documentTotals(doc);
  const out: ExportLine[] = [];
  let lineDiscounts = 0;
  for (const l of doc.lines ?? []) {
    if ((l.kind ?? "item") !== "item" || l.optional) continue;
    const a = lineAmounts(l);
    if (!a.gross && !a.discount) continue;
    lineDiscounts += cents(a.discount);
    const details = l.details?.trim();
    out.push({
      kind: "item",
      description: details ? `${l.description} — ${details}` : l.description,
      sku: l.sku?.trim() || null,
      qty: sign * (Number(l.qty) || 0),
      unitPrice: Number(l.unitPrice) || 0,
      amount: sign * a.gross,
    });
  }
  const discount = (lineDiscounts + cents(t.discountTotal)) / 100;
  if (discount) out.push({ kind: "discount", description: "Discount", sku: null, qty: sign * 1, unitPrice: -discount, amount: -sign * discount });
  for (const f of doc.fees ?? []) {
    if (!f || !Number.isFinite(f.amount) || !money(f.amount)) continue;
    out.push({ kind: "fee", description: f.label || "Fee", sku: null, qty: sign * 1, unitPrice: money(f.amount), amount: sign * money(f.amount) });
  }
  for (const tl of t.taxLines) {
    if (!tl.amount) continue;
    out.push({ kind: "tax", description: `${tl.name || "Tax"} (${tl.rate}%)`, sku: null, qty: sign * 1, unitPrice: tl.amount, amount: sign * tl.amount, tax: { id: tl.id, name: tl.name, rate: tl.rate } });
  }
  for (const d of doc.deductions ?? []) {
    if (!d || !Number.isFinite(d.amount) || !money(d.amount)) continue;
    out.push({ kind: "deduction", description: d.label || "Less amount already invoiced", sku: null, qty: sign * 1, unitPrice: -money(d.amount), amount: -sign * money(d.amount) });
  }
  // Rounding: the document's total is the sum of rounded steps; make the lines agree with it exactly.
  const want = cents(sign * t.total);
  const have = out.reduce((s, l) => s + cents(l.amount), 0);
  if (want !== have && out.length) {
    const fix = (want - have) / 100;
    const last = out[out.length - 1];
    last.amount = money(last.amount + fix);
    if (Math.abs(last.qty) === 1) last.unitPrice = money(last.amount / last.qty);
  }
  return out;
}

/** The total the export lines add up to (signed). */
export const exportTotal = (lines: ExportLine[]) => lines.reduce((s, l) => s + cents(l.amount), 0) / 100;

// ---------------------------------------------------------------- formatting

/** Spreadsheet-safe CSV cell (src/lib/csv.ts): every CSV export uses this one. */
export { csvCell };
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function formatDay(day: string | null | undefined, style: DateStyle): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const [y, m, d] = day.split("-");
  return style === "iso" ? day : style === "dmy" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

const amt = (n: number) => (Object.is(n, -0) ? 0 : n).toFixed(2);
/** Unit prices keep up to 4 decimals (0.337 per foot), at least 2. */
const rate = (n: number) => {
  const s = (Math.round(n * 10000) / 10000).toFixed(4).replace(/(\.\d\d\d?)0+$/, "$1");
  return s === "-0.00" ? "0.00" : s;
};
const qtyText = (n: number) => String(Math.round(n * 10000) / 10000);
const customerName = (d: SalesDoc) => (d.client?.company?.trim() || d.client?.name?.trim() || "Customer").slice(0, 100);
/** Documents waiting for their number (issued offline) still export, under a stand-in the accountant can spot. */
export const docNumber = (d: SalesDoc) => d.number?.trim() || `PENDING-${d.id.slice(0, 8)}`;
const dueOrIssue = (d: SalesDoc) => d.dueDate || d.issueDate;
const firstLine = (s: string | null | undefined) => (s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] ?? "";
const lineItem = (l: ExportLine, a: AccountNames) => (l.kind === "tax" ? a.taxItem : l.kind === "item" ? l.sku || a.defaultItem : l.kind === "discount" ? "Discount" : l.description);

// ---------------------------------------------------------------- CSV

/**
 * One row per line. "qbo": QuickBooks Online's invoice import columns (credit notes marked "Credit Memo", negative).
 * "xero": Xero's sales invoice import template (credit notes as negative lines with Type ACCRECCREDIT).
 * "generic": a plain list for any other package or a spreadsheet.
 */
export function invoiceLinesCsv(docs: SalesDoc[], format: CsvFormat, opts: { range?: ExportRange; accounts?: Partial<AccountNames> } = {}): string {
  const a = normalizeAccounts(opts.accounts);
  const day = (d: string | null | undefined) => formatDay(d, a.dateStyle);
  const rows: unknown[][] = [];
  if (format === "qbo")
    rows.push(["InvoiceNo", "Type", "Customer", "InvoiceDate", "DueDate", "Memo", "Item(Product/Service)", "ItemDescription", "ItemQuantity", "ItemRate", "ItemAmount", "Taxable", "Currency"]);
  else if (format === "xero")
    rows.push(["*ContactName", "EmailAddress", "POAddressLine1", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "InventoryItemCode", "*Description", "*Quantity", "*UnitAmount", "LineAmount", "*AccountCode", "*TaxType", "Currency", "Type"]);
  else rows.push(["Number", "Type", "Status", "Customer", "Client email", "Issue date", "Due date", "Line type", "Item code", "Description", "Quantity", "Unit price", "Amount", "Document total", "Currency"]);

  for (const d of exportableDocs(docs, opts.range ?? {})) {
    const credit = d.kind === "credit_note";
    const lines = exportLines(d);
    const total = (credit ? -1 : 1) * d.total;
    for (const l of lines) {
      if (format === "qbo")
        rows.push([docNumber(d), credit ? "Credit Memo" : "Invoice", customerName(d), day(d.issueDate), day(dueOrIssue(d)), d.title ?? "", lineItem(l, a), l.description, qtyText(l.qty), rate(l.unitPrice), amt(l.amount), "N", d.currency]);
      else if (format === "xero")
        rows.push([
          customerName(d),
          d.client?.email ?? "",
          firstLine(d.client?.billingAddress),
          docNumber(d),
          d.title ?? "",
          day(d.issueDate),
          day(dueOrIssue(d)),
          l.kind === "item" ? (l.sku ?? "") : "",
          l.description,
          qtyText(l.qty),
          rate(l.unitPrice),
          amt(l.amount),
          l.kind === "tax" ? a.taxAccount : a.incomeAccount,
          a.xeroTaxType,
          d.currency,
          credit ? "ACCRECCREDIT" : "ACCREC",
        ]);
      else
        rows.push([docNumber(d), credit ? "Credit note" : "Invoice", d.status, customerName(d), d.client?.email ?? "", day(d.issueDate), day(d.dueDate), l.kind, l.sku ?? "", l.description, qtyText(l.qty), rate(l.unitPrice), amt(l.amount), amt(total), d.currency]);
    }
  }
  return csv(rows);
}

// ---------------------------------------------------------------- QuickBooks Desktop IIF

/** IIF fields are tab-separated: tabs, line breaks and quotes in text become spaces / plain quotes. */
function iifText(v: unknown): string {
  const s = (v == null ? "" : String(v)).replace(/[\t\r\n]+/g, " ").replace(/"/g, "'").trim();
  return /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
}
const iifRow = (cells: unknown[]) => cells.map(iifText).join("\t");

const METHOD_NAME: Record<PaymentMethod, string> = { cash: "Cash", check: "Check", card: "Credit Card", ach: "ACH", zelle: "Zelle", other: "Other" };

/**
 * QuickBooks Desktop import file: issued invoices (INVOICE) and credit notes (CREDIT MEMO), plus payments (PAYMENT)
 * against the invoices in the file. Tab-separated, CRLF line ends, MM/DD/YYYY dates.
 */
export function iifExport(docs: SalesDoc[], payments: DocPayment[], opts: Partial<AccountNames> & { range?: ExportRange } = {}): string {
  const a = normalizeAccounts(opts);
  const range = opts.range ?? {};
  const day = (d: string | null | undefined) => formatDay(d, "mdy");
  const out: string[] = [
    iifRow(["!TRNS", "TRNSID", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO", "CLEAR", "TOPRINT", "DUEDATE", "PAYMETH"]),
    iifRow(["!SPL", "SPLID", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO", "CLEAR", "QNTY", "PRICE", "INVITEM", "TAXABLE"]),
    iifRow(["!ENDTRNS"]),
  ];
  const issued = exportableDocs(docs, range);
  for (const d of issued) {
    const credit = d.kind === "credit_note";
    const type = credit ? "CREDIT MEMO" : "INVOICE";
    const lines = exportLines(d);
    const total = exportTotal(lines);
    out.push(iifRow(["TRNS", "", type, day(d.issueDate), a.arAccount, customerName(d), amt(total), docNumber(d), d.title ?? "", "N", "N", credit ? "" : day(dueOrIssue(d)), ""]));
    for (const l of lines) {
      const accnt = l.kind === "tax" ? a.taxAccount : a.incomeAccount;
      // Splits carry the opposite sign of the A/R line (income is a credit).
      out.push(iifRow(["SPL", "", type, day(d.issueDate), accnt, customerName(d), amt(-l.amount), docNumber(d), l.description, "N", qtyText(-l.qty), rate(l.unitPrice), lineItem(l, a), "N"]));
    }
    out.push(iifRow(["ENDTRNS"]));
  }
  // Payments go by their own date: a payment this month on an invoice issued last month is still in this file.
  const invoices = new Map(exportableDocs(docs).filter((d) => d.kind === "invoice").map((d) => [d.id, d]));
  for (const p of [...payments].sort((x, y) => x.date.localeCompare(y.date))) {
    const d = invoices.get(p.documentId);
    if (!d || p.deleted || p.voided || !inRange(p.date, range) || !money(p.amount)) continue;
    const memo = [`Payment for ${docNumber(d)}`, p.reference].filter(Boolean).join(" · ");
    out.push(iifRow(["TRNS", "", "PAYMENT", day(p.date), a.depositAccount, customerName(d), amt(money(p.amount)), p.reference ?? "", memo, "N", "N", "", METHOD_NAME[p.method] ?? "Other"]));
    out.push(iifRow(["SPL", "", "PAYMENT", day(p.date), a.arAccount, customerName(d), amt(-money(p.amount)), docNumber(d), memo, "N", "", "", "", "N"]));
    out.push(iifRow(["ENDTRNS"]));
  }
  return out.join("\r\n") + "\r\n";
}

/** File name for an export, e.g. "pinplan-invoices-qbo-2026-11-01-to-2026-11-30.csv". */
export function exportFileName(format: CsvFormat | "iif", range: ExportRange, day: string): string {
  const span = range.from || range.to ? `${range.from || "start"}-to-${range.to || day}` : day;
  return `pinplan-invoices-${format}-${span}.${format === "iif" ? "iif" : "csv"}`;
}
