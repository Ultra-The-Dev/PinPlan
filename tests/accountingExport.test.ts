import { describe, expect, it } from "vitest";
import {
  csvCell,
  DEFAULT_ACCOUNTS,
  exportableDocs,
  exportFileName,
  exportLines,
  exportTotal,
  formatDay,
  iifExport,
  invoiceLinesCsv,
  normalizeAccounts,
} from "@/lib/accountingExport";
import { creditNoteFor, newDocument, normalizeDocSettings, withTotals } from "@/lib/documents";
import type { DocLine, DocPayment, Project, SalesDoc } from "@/lib/types";

const NOW = "2026-11-19T15:00:00.000Z";
const DAY = "2026-11-19";
const S = normalizeDocSettings({ taxes: [{ id: "st", name: "State Tax", rate: 4, default: true }, { id: "ct", name: "City Tax", rate: 4.875, default: true }] });
const project: Project = { id: "p1", clientName: "Demo Client", clientEmail: "client@example.com", clientPhone: "", address: "1 Example St", status: "approved", billduDocs: [], createdAt: NOW, updatedAt: NOW };

let n = 0;
const item = (p: Partial<DocLine> & { qty: number; unitPrice: number }): DocLine => ({ id: `i${++n}`, kind: "item", description: "Item", taxable: true, ...p });
const issued = (over: Partial<SalesDoc> = {}): SalesDoc =>
  withTotals({ ...newDocument({ id: `doc-${++n}-abcdef`, kind: "invoice", project, settings: S, now: NOW, day: DAY }), status: "sent", number: `INV-${n}`, issueDate: DAY, dueDate: "2026-12-19", ...over });

/** A document that uses every money feature at once. */
function busyInvoice(over: Partial<SalesDoc> = {}) {
  return issued({
    lines: [
      { id: "h1", kind: "section", description: "Cameras", qty: 0, unitPrice: 0, taxable: false },
      item({ description: "Indoor camera", sku: "CAM-1", qty: 13, unitPrice: 319.99, discount: { type: "pct", value: 7.5 } }),
      item({ description: "Cat6", qty: 873.5, unitPrice: 0.337, taxable: true, taxIds: ["st"] }),
      item({ description: "Labor", qty: 7.25, unitPrice: 95, taxable: false, discount: { type: "fixed", value: 33.33 } }),
      item({ description: "Optional upgrade", qty: 1, unitPrice: 999, optional: true }),
    ],
    discount: { type: "pct", value: 3.3 },
    fees: [{ id: "f1", label: "Permit fee", amount: 125.5, taxable: true }, { id: "f2", label: "Trip", amount: 40 }],
    deductions: [{ id: "x1", label: "Deposit invoice INV-1", amount: 1000.01 }],
    ...over,
  });
}

const sumCol = (csv: string, col: string, filter?: (r: Record<string, string>) => boolean) => {
  const [head, ...rows] = csv.trim().split("\r\n").map((r) => r.split(","));
  const i = head.indexOf(col);
  if (i < 0) throw new Error(`no column ${col}`);
  return Math.round(rows.map((r) => Object.fromEntries(head.map((h, j) => [h, r[j]]))).filter((r) => !filter || filter(r)).reduce((s, r) => s + Number(r[col]) * 100, 0)) / 100;
};

describe("exportLines", () => {
  it("adds up to the document total with discounts, fees, two taxes and deductions", () => {
    const d = busyInvoice();
    expect(d.taxTotal).toBeGreaterThan(0);
    const lines = exportLines(d);
    expect(exportTotal(lines)).toBe(d.total);
    expect(lines.map((l) => l.kind)).toEqual(["item", "item", "item", "discount", "fee", "fee", "tax", "tax", "deduction"]);
    // Every line's qty × price is its amount, so importers that recompute agree.
    for (const l of lines) expect(Math.round(l.qty * l.unitPrice * 100) / 100).toBeCloseTo(l.amount, 2);
    // Optional lines and section headings are not exported.
    expect(lines.some((l) => l.description.includes("Optional"))).toBe(false);
  });

  it("matches the total for many random documents", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 300; k++) {
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () =>
        item({ qty: Math.round(rnd() * 5000) / 100, unitPrice: Math.round(rnd() * 100000) / 1000, taxable: rnd() > 0.3, taxIds: rnd() > 0.7 ? ["ct"] : null, discount: rnd() > 0.6 ? { type: rnd() > 0.5 ? "pct" : "fixed", value: Math.round(rnd() * 3000) / 100 } : null }),
      );
      const d = issued({
        lines,
        discount: rnd() > 0.5 ? { type: rnd() > 0.5 ? "pct" : "fixed", value: Math.round(rnd() * 2000) / 100 } : null,
        fees: rnd() > 0.5 ? [{ id: "f", label: "Fee", amount: Math.round(rnd() * 10000) / 100, taxable: rnd() > 0.5 }] : [],
        deductions: rnd() > 0.7 ? [{ id: "x", label: "Less", amount: Math.round(rnd() * 5000) / 100 }] : [],
      });
      expect(exportTotal(exportLines(d))).toBe(d.total);
    }
  });

  it("credit notes are the same lines, negative", () => {
    const inv = busyInvoice({ deductions: [] });
    const cn = withTotals({ ...creditNoteFor(inv, { id: "cn-1-abcdef", now: NOW, day: DAY, settings: S }), status: "sent", number: "CN-1" });
    expect(cn.total).toBeGreaterThan(0);
    expect(exportTotal(exportLines(cn))).toBe(-cn.total);
  });
});

describe("exportableDocs", () => {
  it("keeps issued invoices and credit notes in the date range, never drafts, void, deleted or quotes", () => {
    const keep = issued({ issueDate: "2026-11-05" });
    const docs = [
      keep,
      issued({ status: "draft" }),
      issued({ status: "void" }),
      issued({ deleted: true }),
      issued({ kind: "quote" }),
      issued({ issueDate: "2026-10-31" }),
      issued({ issueDate: "2026-12-01" }),
      issued({ status: "paid", issueDate: "2026-11-30" }),
    ];
    const out = exportableDocs(docs, { from: "2026-11-01", to: "2026-11-30" });
    expect(out.map((d) => d.id)).toEqual([keep.id, docs[7].id]);
  });
});

describe("invoiceLinesCsv", () => {
  const docs = [busyInvoice(), issued({ lines: [item({ qty: 2, unitPrice: 50 })] })];

  it("QuickBooks Online: one row per line, amounts add up per invoice, nothing taxable", () => {
    const out = invoiceLinesCsv(docs, "qbo");
    expect(out.endsWith("\r\n")).toBe(true);
    expect(out.split("\r\n")[0]).toBe("InvoiceNo,Type,Customer,InvoiceDate,DueDate,Memo,Item(Product/Service),ItemDescription,ItemQuantity,ItemRate,ItemAmount,Taxable,Currency");
    for (const d of docs) expect(sumCol(out, "ItemAmount", (r) => r.InvoiceNo === d.number)).toBe(d.total);
    expect(out).toContain(",11/19/2026,12/19/2026,");
    expect(out).toContain("CAM-1");
    expect(out.split("\r\n").filter((r) => r.includes(",Sales Tax,")).length).toBe(4);
    expect(out.split("\r\n").slice(1).filter(Boolean).every((r) => r.split(",")[11] === "N")).toBe(true);
  });

  it("Xero: tax lines go to the tax account, credit notes are ACCRECCREDIT with negative lines", () => {
    const inv = busyInvoice({ deductions: [] });
    const cn = withTotals({ ...creditNoteFor(inv, { id: "cn-2-abcdef", now: NOW, day: DAY, settings: S }), status: "sent", number: "CN-2" });
    const out = invoiceLinesCsv([inv, cn], "xero", { accounts: { incomeAccount: "200", taxAccount: "820", dateStyle: "iso" } });
    expect(sumCol(out, "LineAmount", (r) => r["*InvoiceNumber"] === inv.number)).toBe(inv.total);
    expect(sumCol(out, "LineAmount", (r) => r["*InvoiceNumber"] === "CN-2")).toBe(-cn.total);
    const rows = out.trim().split("\r\n").slice(1);
    expect(rows.filter((r) => r.includes("CN-2")).every((r) => r.endsWith(",ACCRECCREDIT"))).toBe(true);
    expect(rows.filter((r) => r.includes("State Tax")).every((r) => r.includes(",820,"))).toBe(true);
    expect(out).toContain(",2026-11-19,");
  });

  it("generic: carries the document total on every row", () => {
    const out = invoiceLinesCsv(docs, "generic");
    for (const d of docs) expect(sumCol(out, "Amount", (r) => r.Number === d.number)).toBe(d.total);
  });

  it("guards against formula injection and quotes commas", () => {
    const d = issued({ client: { name: "=HYPERLINK(\"x\")", company: null }, lines: [item({ qty: 1, unitPrice: 10, description: "+cmd, then more" })] });
    const out = invoiceLinesCsv([d], "generic");
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out).toContain(`"'+cmd, then more"`);
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("@x")).toBe("'@x");
  });

  it("pending numbers get a stand-in", () => {
    const d = issued({ number: null, lines: [item({ qty: 1, unitPrice: 10 })] });
    expect(invoiceLinesCsv([d], "generic")).toContain(`PENDING-${d.id.slice(0, 8)}`);
  });
});

describe("iifExport", () => {
  const inv = busyInvoice();
  const cn = withTotals({ ...creditNoteFor(busyInvoice({ deductions: [] }), { id: "cn-3-abcdef", now: NOW, day: DAY, settings: S }), status: "sent", number: "CN-3" });
  const pays: DocPayment[] = [
    { id: "pa1", projectId: "p1", documentId: inv.id, amount: 500, date: "2026-11-20", method: "check", reference: "1043", createdAt: NOW, updatedAt: NOW },
    { id: "pa2", projectId: "p1", documentId: inv.id, amount: 20, date: "2026-11-21", method: "card", voided: true, createdAt: NOW, updatedAt: NOW },
    { id: "pa3", projectId: "p1", documentId: "not-exported", amount: 70, date: "2026-11-21", method: "card", createdAt: NOW, updatedAt: NOW },
  ];
  const out = iifExport([inv, cn, issued({ status: "draft" })], pays, { arAccount: "A/R", incomeAccount: "Install Income", taxItem: "NY Tax", taxAccount: "Sales Tax Payable" });
  const rows = out.split("\r\n").filter(Boolean).map((r) => r.split("\t"));

  it("uses tabs, CRLF and the header rows", () => {
    expect(out.endsWith("\r\n")).toBe(true);
    expect(out.includes("\n") && !/[^\r]\n/.test(out)).toBe(true);
    expect(rows[0][0]).toBe("!TRNS");
    expect(rows[1][0]).toBe("!SPL");
    expect(rows[2][0]).toBe("!ENDTRNS");
  });

  it("each transaction balances and the A/R line is the document total", () => {
    const txns: string[][][] = [];
    let cur: string[][] = [];
    for (const r of rows.slice(3)) {
      if (r[0] === "ENDTRNS") {
        txns.push(cur);
        cur = [];
      } else cur.push(r);
    }
    expect(txns.length).toBe(3); // invoice, credit memo, one payment
    for (const t of txns) expect(Math.abs(Math.round(t.reduce((s, r) => s + Number(r[6]) * 100, 0)))).toBe(0);
    const i = txns.find((x) => x[0][2] === "INVOICE")!;
    const c = txns.find((x) => x[0][2] === "CREDIT MEMO")!;
    const p = txns.find((x) => x[0][2] === "PAYMENT")!;
    expect(i[0]).toEqual(expect.arrayContaining(["TRNS", "INVOICE", "11/19/2026", "A/R", inv.number!, inv.total.toFixed(2)]));
    expect(c[0]).toEqual(expect.arrayContaining(["TRNS", "CREDIT MEMO", "A/R", (-cn.total).toFixed(2)]));
    expect(i.some((r) => r[4] === "Sales Tax Payable" && r[12] === "NY Tax")).toBe(true);
    expect(i.filter((r) => r[0] === "SPL").every((r) => r[13] === "N")).toBe(true);
    expect(p[0]).toEqual(expect.arrayContaining(["TRNS", "PAYMENT", "11/20/2026", "Undeposited Funds", "500.00", "1043", "Check"]));
    expect(p[1]).toEqual(expect.arrayContaining(["SPL", "PAYMENT", "A/R", "-500.00", inv.number!]));
  });

  it("keeps tabs and line breaks out of fields", () => {
    const d = issued({ client: { name: "Tab\tName\r\nCo", company: null }, lines: [item({ qty: 1, unitPrice: 5, description: "two\nlines" })] });
    const t = iifExport([d], []);
    expect(t).toContain("\tTab Name Co\t");
    expect(t).toContain("\ttwo lines\t");
  });

  it("filters payments by the date range", () => {
    const t = iifExport([inv], pays, { range: { from: "2026-11-01", to: "2026-11-19" } });
    expect(t).not.toContain("PAYMENT");
  });

  it("includes a payment in the range on an invoice issued before it (the invoice itself is not repeated)", () => {
    const t = iifExport([inv], pays, { range: { from: "2026-11-20", to: "2026-11-30" } });
    const r = t.split("\r\n").filter(Boolean).map((x) => x.split("\t"));
    expect(r.filter((x) => x[0] === "TRNS").map((x) => x[2])).toEqual(["PAYMENT"]);
    expect(r.find((x) => x[0] === "SPL")).toEqual(expect.arrayContaining(["PAYMENT", "-500.00", inv.number!]));
  });
});

describe("settings and names", () => {
  it("normalizes account names", () => {
    expect(normalizeAccounts(null)).toEqual(DEFAULT_ACCOUNTS);
    expect(normalizeAccounts({ arAccount: "  ", incomeAccount: " Income ", dateStyle: "bad" as never })).toMatchObject({ arAccount: "Accounts Receivable", incomeAccount: "Income", dateStyle: "mdy" });
  });
  it("formats days and file names", () => {
    expect(formatDay("2026-03-05", "dmy")).toBe("05/03/2026");
    expect(formatDay("nope", "iso")).toBe("");
    expect(exportFileName("iif", { from: "2026-11-01" }, DAY)).toBe("pinplan-invoices-iif-2026-11-01-to-2026-11-19.iif");
    expect(exportFileName("qbo", {}, DAY)).toBe("pinplan-invoices-qbo-2026-11-19.csv");
  });
});
