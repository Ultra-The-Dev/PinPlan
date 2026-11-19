import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { allocate, materialKey, quoteFromEstimate, quoteLinesFromEstimate } from "@/lib/docFromEstimate";
import {
  addDays,
  adjustAmount,
  aging,
  buildDocSnapshot,
  clientDirectory,
  creditNoteFor,
  DEFAULT_DOC_SETTINGS,
  displayStatus,
  documentsCsv,
  documentTotals,
  dueDateFor,
  duplicateDocument,
  formatDocNumber,
  invoiceFromQuote,
  invoiceStatus,
  lineAmounts,
  newDocument,
  normalizeDocSettings,
  numberFormatProblem,
  paymentsCsv,
  paymentSummary,
  payUrl,
  receivables,
  reminderDue,
  snapshotHash,
  withTotals,
} from "@/lib/documents";
import { buildEstimate, money } from "@/lib/estimate";
import { computeTakeoff } from "@/lib/takeoff";
import type { DocLine, DocPayment, Project, SalesDoc } from "@/lib/types";
import { buildSampleJob } from "./fixtures/sampleJob";

const NOW = "2026-11-19T15:00:00.000Z";
const DAY = "2026-11-19";
const S = normalizeDocSettings({ taxes: [{ id: "ny", name: "NY Sales Tax", rate: 8.875, default: true }] });
const project: Project = { id: "p1", clientName: "Jane Client", clientEmail: "jane@example.com", clientPhone: "555", address: "12 Maple Ridge Rd", status: "estimate", billduDocs: [], createdAt: NOW, updatedAt: NOW };

let n = 0;
const item = (p: Partial<DocLine> & { qty: number; unitPrice: number }): DocLine => ({ id: `i${++n}`, kind: "item", description: "Item", taxable: true, ...p });
const section = (title: string): DocLine => ({ id: `s${++n}`, kind: "section", description: title, qty: 0, unitPrice: 0, taxable: false });
const doc = (over: Partial<SalesDoc> = {}): SalesDoc => ({ ...newDocument({ id: `d${++n}`, kind: "invoice", project, settings: S, now: NOW, day: DAY }), ...over });
const pay = (amount: number, date = DAY, over: Partial<DocPayment> = {}): DocPayment => ({ id: `pay${++n}`, projectId: "p1", documentId: "x", amount, date, method: "check", createdAt: NOW, updatedAt: NOW, ...over });

describe("money edge cases", () => {
  it("rounds lines half away from zero, per line", () => {
    expect(lineAmounts({ qty: 3, unitPrice: 0.335, discount: null }).net).toBe(1.01); // 1.005 → 1.01
    expect(lineAmounts({ qty: 1, unitPrice: -1.005, discount: null }).net).toBe(-1.01);
    expect(lineAmounts({ qty: 0.1, unitPrice: 0.2, discount: null }).net).toBe(0.02);
    // Three lines of 0.333… each round to 0.33; the subtotal is the sum of rounded lines.
    const t = documentTotals({ lines: [item({ qty: 1, unitPrice: 1 / 3 }), item({ qty: 1, unitPrice: 1 / 3 }), item({ qty: 1, unitPrice: 1 / 3 })], taxes: [] });
    expect(t.subtotal).toBe(0.99);
  });

  it("line discounts: percent and fixed (capped at the line)", () => {
    expect(lineAmounts({ qty: 2, unitPrice: 100, discount: { type: "pct", value: 15 } })).toEqual({ gross: 200, discount: 30, net: 170 });
    expect(lineAmounts({ qty: 1, unitPrice: 50, discount: { type: "fixed", value: 80 } }).net).toBe(0);
    expect(lineAmounts({ qty: 1, unitPrice: 50, discount: { type: "pct", value: 150 } }).net).toBe(0);
    expect(lineAmounts({ qty: 1, unitPrice: -50, discount: { type: "pct", value: 10 } }).net).toBe(-50);
  });

  it("adjustments never go negative or past the amount", () => {
    expect(adjustAmount({ type: "fixed", value: 500 }, 100)).toBe(100);
    expect(adjustAmount({ type: "fixed", value: -5 }, 100)).toBe(0);
    expect(adjustAmount({ type: "pct", value: 12.5 }, 99.99)).toBe(12.5);
    expect(adjustAmount(null, 100)).toBe(0);
  });
});

describe("documentTotals", () => {
  it("mixed tax rates, per-line taxable and per-line tax choice", () => {
    const t = documentTotals({
      lines: [
        item({ qty: 4, unitPrice: 250, taxIds: null }), // 1000, both taxes
        item({ qty: 1, unitPrice: 600, taxable: false }), // labor, untaxed
        item({ qty: 2, unitPrice: 100, taxIds: ["state"] }), // 200, state only
      ],
      taxes: [
        { id: "state", name: "State", rate: 4 },
        { id: "city", name: "City", rate: 4.875 },
      ],
    });
    expect(t.subtotal).toBe(1800);
    expect(t.taxLines.map((x) => [x.base, x.amount])).toEqual([
      [1200, 48],
      [1000, 48.75],
    ]);
    expect(t.taxTotal).toBe(96.75);
    expect(t.total).toBe(1896.75);
  });

  it("applies the document discount before tax, spread over the taxable lines", () => {
    const t = documentTotals({
      lines: [item({ qty: 1, unitPrice: 800 }), item({ qty: 1, unitPrice: 200, taxable: false })],
      taxes: [{ id: "t", name: "Tax", rate: 10 }],
      discount: { type: "pct", value: 10 },
    });
    expect(t.discountTotal).toBe(100);
    // Taxable 800 keeps 90% → 720 → tax 72.
    expect(t.taxLines[0].base).toBe(720);
    expect(t.total).toBe(1000 - 100 + 72);
  });

  it("fixed discount, fees (taxable and not), deposit %", () => {
    const t = documentTotals({
      lines: [item({ qty: 1, unitPrice: 1000 })],
      taxes: [{ id: "t", name: "Tax", rate: 8 }],
      discount: { type: "fixed", value: 50 },
      fees: [
        { id: "f1", label: "Shipping", amount: 25, taxable: true },
        { id: "f2", label: "Permit", amount: 100 },
      ],
      deposit: { type: "pct", value: 50 },
    });
    expect(t.feeTotal).toBe(125);
    expect(t.taxLines[0].base).toBe(975); // 950 + taxable shipping
    expect(t.taxTotal).toBe(78);
    expect(t.total).toBe(950 + 125 + 78);
    expect(t.deposit).toBe(money((950 + 125 + 78) / 2));
  });

  it("optional lines are listed but not counted; sections total their items", () => {
    const t = documentTotals({
      lines: [item({ qty: 1, unitPrice: 5 }), section("1st Floor"), item({ qty: 2, unitPrice: 10 }), item({ qty: 1, unitPrice: 99, optional: true }), section("Empty"), section("2nd Floor"), item({ qty: 1, unitPrice: 7 })],
      taxes: [{ id: "t", name: "Tax", rate: 10 }],
    });
    expect(t.subtotal).toBe(32);
    expect(t.optionalTotal).toBe(99);
    expect(t.taxTotal).toBe(3.2);
    expect(t.sections.map((s) => [s.title, s.total])).toEqual([
      ["", 5],
      ["1st Floor", 20],
      ["Empty", 0],
      ["2nd Floor", 7],
    ]);
  });
});

describe("payments, credits and statuses", () => {
  it("payments, refunds and voided payments", () => {
    const s = paymentSummary(1000, [pay(400, "2026-11-01"), pay(700, "2026-11-10"), pay(-100, "2026-11-12"), pay(300, "2026-11-11", { voided: true })]);
    expect(s).toEqual({ paid: 1000, credited: 0, balance: 0, paidOn: "2026-11-10" }); // first paid in full on the 10th (then a refund)
  });

  it("credit notes reduce the balance; drafts don't", () => {
    const cn = (total: number, status: SalesDoc["status"]) => ({ total, status, deleted: false });
    const s = paymentSummary(1000, [pay(500)], [cn(200, "sent"), cn(300, "draft"), cn(50, "void")]);
    expect(s.balance).toBe(300);
    expect(s.credited).toBe(200);
  });

  it("invoice status follows the balance", () => {
    const d = { kind: "invoice" as const, status: "sent" as const, viewedAt: null };
    expect(invoiceStatus(d, 100, { paid: 0, credited: 0, balance: 100, paidOn: null })).toBe("sent");
    expect(invoiceStatus(d, 100, { paid: 40, credited: 0, balance: 60, paidOn: null })).toBe("partially_paid");
    expect(invoiceStatus(d, 100, { paid: 100, credited: 0, balance: 0, paidOn: DAY })).toBe("paid");
    // A refund after paying in full re-opens it (viewed when the client had opened it).
    expect(invoiceStatus({ ...d, status: "paid", viewedAt: NOW }, 100, { paid: 0, credited: 0, balance: 100, paidOn: null })).toBe("viewed");
    expect(invoiceStatus({ ...d, status: "draft" }, 100, { paid: 100, credited: 0, balance: 0, paidOn: DAY })).toBe("draft");
    expect(invoiceStatus({ ...d, status: "void" }, 100, { paid: 0, credited: 0, balance: 100, paidOn: null })).toBe("void");
  });

  it("withTotals keeps the denormalised fields in step", () => {
    const d = withTotals(doc({ status: "sent", lines: [item({ qty: 2, unitPrice: 500 })], taxes: [] }), [pay(250)]);
    expect([d.total, d.amountPaid, d.balanceDue, d.status]).toEqual([1000, 250, 750, "partially_paid"]);
    const paid = withTotals(d, [pay(250), pay(750, "2026-11-20")]);
    expect([paid.status, paid.paidAt]).toEqual(["paid", "2026-11-20"]);
  });

  it("overdue: an issued invoice past its due date with money owed; expired quotes", () => {
    const inv = { kind: "invoice" as const, status: "sent" as const, dueDate: "2026-11-18", validUntil: null, balanceDue: 10 };
    expect(displayStatus(inv, DAY)).toBe("overdue");
    expect(displayStatus({ ...inv, dueDate: DAY }, DAY)).toBe("sent"); // due today isn't late
    expect(displayStatus({ ...inv, balanceDue: 0, status: "paid" }, DAY)).toBe("paid");
    expect(displayStatus({ ...inv, status: "draft" }, DAY)).toBe("draft");
    expect(displayStatus({ ...inv, status: "partially_paid" }, DAY)).toBe("overdue");
    const q = { kind: "quote" as const, status: "viewed" as const, dueDate: null, validUntil: "2026-11-01", balanceDue: 10 };
    expect(displayStatus(q, DAY)).toBe("expired");
    expect(displayStatus({ ...q, status: "accepted" }, DAY)).toBe("accepted");
  });

  it("payment reminders before and after the due date", () => {
    const r = DEFAULT_DOC_SETTINGS.reminders;
    const inv = { kind: "invoice" as const, status: "sent" as const, dueDate: "2026-11-21", balanceDue: 5 };
    expect(reminderDue(inv, r, DAY)).toBe("before");
    expect(reminderDue({ ...inv, dueDate: "2026-11-30" }, r, DAY)).toBeNull();
    expect(reminderDue({ ...inv, dueDate: "2026-11-15" }, r, DAY)).toBeNull(); // 4 days late, first reminder at 7
    expect(reminderDue({ ...inv, dueDate: "2026-11-10" }, r, DAY)).toBe("after");
    expect(reminderDue({ ...inv, dueDate: "2026-11-10", status: "paid" }, r, DAY)).toBeNull();
    expect(reminderDue({ ...inv, dueDate: "2026-11-10" }, { ...r, enabled: false }, DAY)).toBeNull();
  });
});

describe("numbering", () => {
  it("formats like the database", () => {
    expect(formatDocNumber("INV-{YYYY}-{0000}", 42, "2026-03-05")).toBe("INV-2026-0042");
    expect(formatDocNumber("Q-{0000}", 12345, DAY)).toBe("Q-12345"); // never cut
    expect(formatDocNumber("{YY}{MM}-{#}", 7, "2026-03-05")).toBe("2603-7");
    expect(formatDocNumber("EST", 3, DAY)).toBe("EST0003");
    expect(formatDocNumber("", 3, DAY)).toBe("0003");
    expect(formatDocNumber("{000}/{0}", 5, DAY)).toBe("005/5");
  });

  it("checks formats", () => {
    expect(numberFormatProblem("INV-{YYYY}-{0000}")).toBeNull();
    expect(numberFormatProblem("INV-")).toMatch(/0000/);
    expect(numberFormatProblem("{DD}-{0000}")).toMatch(/braces/);
    expect(numberFormatProblem("")).toMatch(/Enter/);
  });
});

describe("dates and aging", () => {
  it("due dates from payment terms", () => {
    expect(dueDateFor("2026-12-20", 30)).toBe("2027-01-19");
    expect(dueDateFor(DAY, 0)).toBe(DAY);
    expect(dueDateFor(DAY, null)).toBeNull();
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("buckets what is owed by days late", () => {
    const inv = (dueDate: string, balanceDue: number, status: SalesDoc["status"] = "sent") => ({ kind: "invoice" as const, status, dueDate, issueDate: dueDate, balanceDue, deleted: false });
    const a = aging(
      [inv("2026-12-01", 100), inv(DAY, 1), inv("2026-11-18", 10), inv("2026-10-20", 20), inv("2026-10-19", 30), inv("2026-08-21", 40), inv("2026-08-20", 50), inv("2026-01-01", 999, "draft"), inv("2026-01-01", 999, "void")],
      DAY,
    );
    expect(a).toEqual({ current: 101, d1_30: 30, d31_60: 30, d61_90: 40, d90: 50, total: 251 });
  });

  it("receivables: outstanding, overdue and paid this month", () => {
    const a = withTotals(doc({ status: "sent", dueDate: "2026-11-01", lines: [item({ qty: 1, unitPrice: 100 })], taxes: [] }));
    const b = withTotals(doc({ status: "sent", dueDate: "2026-12-30", lines: [item({ qty: 1, unitPrice: 300 })], taxes: [] }));
    const c = withTotals(doc({ status: "draft", lines: [item({ qty: 1, unitPrice: 50 })], taxes: [] }));
    const r = receivables([a, b, c], [pay(80, "2026-11-03", { documentId: b.id }), pay(5, "2026-10-30", { documentId: b.id })], DAY);
    expect(r).toEqual({ outstanding: 400, overdue: 100, paidThisMonth: 80, drafts: 50 });
  });
});

describe("conversions", () => {
  const quote = withTotals({
    ...newDocument({ id: "q1", kind: "quote", project, settings: S, now: NOW, day: DAY }),
    number: "EST-0007",
    status: "accepted",
    lines: [section("Cameras"), item({ id: "c1", qty: 4, unitPrice: 450 }), item({ id: "c2", qty: 1, unitPrice: 600, taxable: false }), item({ id: "c3", qty: 1, unitPrice: 999, optional: true })],
  });

  it("quote defaults: validity, deposit, default tax", () => {
    const q = newDocument({ id: "q", kind: "quote", project, settings: S, now: NOW, day: DAY });
    expect(q.validUntil).toBe("2026-12-19");
    expect(q.deposit).toEqual({ type: "pct", value: 50 });
    expect(q.taxes).toEqual([{ id: "ny", name: "NY Sales Tax", rate: 8.875 }]);
    expect(q.client).toMatchObject({ name: "Jane Client", email: "jane@example.com", siteAddress: "12 Maple Ridge Rd" });
    const inv = newDocument({ id: "i", kind: "invoice", project, settings: S, now: NOW, day: DAY });
    expect([inv.dueDate, inv.termsDays, inv.deposit]).toEqual(["2026-12-19", 30, null]);
  });

  it("full invoice copies the counted lines with taxes", () => {
    const inv = invoiceFromQuote(quote, { mode: "full" }, { id: "i1", now: NOW, day: DAY, settings: S });
    expect(inv.kind).toBe("invoice");
    expect(inv.convertedFrom).toBe("q1");
    expect(inv.number).toBeNull();
    expect(inv.status).toBe("draft");
    expect(inv.total).toBe(quote.total);
    expect(inv.lines.some((l) => l.optional)).toBe(false);
  });

  it("deposit + progress + final invoices add up to the quote", () => {
    const dep = { ...invoiceFromQuote(quote, { mode: "deposit", pct: 30 }, { id: "i2", now: NOW, day: DAY, settings: S }), number: "INV-1", status: "sent" as const };
    expect(dep.total).toBe(money(quote.total * 0.3));
    expect(dep.taxTotal).toBe(0);
    expect(dep.invoiceType).toBe("deposit");
    expect(dep.lines[0].description).toContain("EST-0007");
    const prog = { ...invoiceFromQuote(quote, { mode: "progress", pct: 40 }, { id: "i3", now: NOW, day: DAY, settings: S }), number: "INV-2", status: "paid" as const };
    const fin = invoiceFromQuote(quote, { mode: "final" }, { id: "i4", now: NOW, day: DAY, settings: S, prior: [dep, prog] });
    expect(fin.invoiceType).toBe("final");
    expect(money(dep.total + prog.total + fin.total)).toBe(quote.total);
    expect(fin.deductions?.map((l) => l.label)).toEqual(["Less INV-1 (deposit)", "Less INV-2 (progress)"]);
    expect(fin.lines.some((l) => l.unitPrice < 0)).toBe(false);
  });

  it("final invoice keeps the quote's discount and tax: deposit + final = quote, to the cent", () => {
    const q = withTotals({ ...quote, discount: { type: "pct", value: 5 }, fees: [{ id: "f", label: "Permit", amount: 75, taxable: true }] });
    const dep = { ...invoiceFromQuote(q, { mode: "deposit", pct: 30 }, { id: "d1", now: NOW, day: DAY, settings: S }), number: "INV-7", status: "sent" as const };
    const fin = invoiceFromQuote(q, { mode: "final" }, { id: "f1", now: NOW, day: DAY, settings: S, prior: [dep] });
    expect(fin.discountTotal).toBe(q.discountTotal);
    expect(fin.taxTotal).toBe(q.taxTotal);
    expect(documentTotals(fin).grossTotal).toBe(q.total);
    expect(money(dep.total + fin.total)).toBe(q.total);
  });

  it("selected lines keep their section heading", () => {
    const inv = invoiceFromQuote(quote, { mode: "lines", lineIds: ["c2"] }, { id: "i5", now: NOW, day: DAY, settings: S });
    expect(inv.lines.map((l) => l.kind)).toEqual(["section", "item"]);
    expect(inv.total).toBe(600);
  });

  it("credit note against an invoice, and duplicates start fresh", () => {
    const inv = { ...invoiceFromQuote(quote, { mode: "full" }, { id: "i6", now: NOW, day: DAY, settings: S }), number: "INV-9", status: "sent" as const, shareToken: "tok", signature: "sig" };
    const cn = creditNoteFor(inv, { id: "cn1", now: NOW, day: DAY, settings: S });
    expect([cn.kind, cn.convertedFrom, cn.total, cn.dueDate]).toEqual(["credit_note", "i6", inv.total, null]);
    expect(cn.notes).toContain("INV-9");
    const dup = duplicateDocument(inv, { id: "dup", now: NOW, day: DAY, settings: S });
    expect([dup.number, dup.status, dup.shareToken, dup.signature, dup.source]).toEqual([null, "draft", null, null, "duplicate"]);
    expect(dup.lines[0].id).not.toBe(inv.lines[0].id);
  });
});

describe("estimate → quote", () => {
  const data = buildSampleJob();
  const catalog = seedCatalog().map((d) => ({ ...d, unitPrice: d.unitPrice || 100, laborPrice: 50 }));
  const takeoff = computeTakeoff(data);
  const pricing = { ...DEFAULT_SETTINGS.pricing, wirePrices: { ...DEFAULT_SETTINGS.pricing.wirePrices, Cat6: 0.5 } };
  const est = buildEstimate(takeoff, catalog, pricing, []);
  const job = { project: { ...project, id: data.sheets[0].projectId }, sheets: data.sheets, markers: data.markers, runs: data.runs, closets: data.closets, catalog, products: [] };
  const opts = { details: true, detail: "lines" as const, includeOptional: true };
  const sum = (lines: DocLine[]) => money(lines.filter((l) => l.kind !== "section" && !l.optional).reduce((s, l) => s + money(l.qty * l.unitPrice), 0));

  it("splits quantities exactly", () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(7.5, [1, 2])).toEqual([2.5, 5]);
    expect(allocate(3, [0, 0])).toEqual([0, 0]);
    expect(materialKey("optlabor:prod:p1")).toBe("optprod:p1");
    expect(materialKey("labor:cam")).toBe("dev:cam");
    expect(materialKey("labor:wire:Cat6")).toBe("wire:Cat6");
  });

  for (const grouping of ["flat", "category", "floor", "room"] as const) {
    it(`${grouping}: same counted total as the estimate`, () => {
      const lines = quoteLinesFromEstimate(est, job, { ...opts, grouping }, S);
      expect(sum(lines)).toBe(est.subtotal);
      if (grouping === "flat") expect(lines.some((l) => l.kind === "section")).toBe(false);
      else expect(lines[0].kind).toBe("section");
    });
  }

  it("by floor: one section per floor in sheet order, with the floor's quantities", () => {
    const lines = quoteLinesFromEstimate(est, job, { ...opts, grouping: "floor" }, S);
    const heads = lines.filter((l) => l.kind === "section").map((l) => l.description);
    expect(heads.slice(0, 4)).toEqual(["Attic", "1st Fl", "2nd Fl", "Cellar"]);
    const attic = takeoff.floors[0];
    const i = lines.findIndex((l) => l.description === "Attic");
    const next = lines.findIndex((l, k) => k > i && l.kind === "section");
    const camLine = lines.slice(i, next).find((l) => l.key === `dev:${Object.keys(attic.counts)[0]}`);
    if (camLine) expect(camLine.qty).toBe(attic.counts[Object.keys(attic.counts)[0]] - (attic.tentative[Object.keys(attic.counts)[0]] ?? 0));
  });

  it("quote from estimate keeps optional ? lines as optional and labels the source", () => {
    const base = newDocument({ id: "qq", kind: "quote", project, settings: S, now: NOW, day: DAY });
    const q = quoteFromEstimate(base, est, job, { ...opts, grouping: "category" }, S);
    expect(q.source).toBe("estimate");
    expect(q.lines.some((l) => l.optional)).toBe(true);
    expect(q.subtotal).toBe(est.subtotal);
  });
});

describe("snapshot, links, CSV and clients", () => {
  it("never puts internal notes in the client snapshot", () => {
    const d = withTotals(doc({ internalNotes: "margin is 40%", notes: "Thanks", lines: [item({ qty: 1, unitPrice: 10 })] }));
    const snap = buildDocSnapshot(d, { settings: S, business: DEFAULT_SETTINGS.business, now: NOW });
    expect(JSON.stringify(snap)).not.toContain("margin is 40%");
    expect(snap.notes).toBe("Thanks");
    expect(snap.totals.total).toBe(d.total);
    expect(snapshotHash(snap)).toBe(snapshotHash({ ...snap, createdAt: "later", number: "INV-1" }));
    expect(snapshotHash(snap)).not.toBe(snapshotHash({ ...snap, notes: "changed" }));
  });

  it("pay-online link template", () => {
    expect(payUrl("https://pay.example.com/acme?amt={amount}&ref={number}&c={currency}", { number: "INV 1", balanceDue: 1234.5, currency: "USD" })).toBe("https://pay.example.com/acme?amt=1234.50&ref=INV%201&c=USD");
    expect(payUrl("javascript:alert(1)", { number: "x", balanceDue: 1, currency: "USD" })).toBeNull();
    expect(payUrl("", { number: "x", balanceDue: 1, currency: "USD" })).toBeNull();
  });

  it("CSV for the accountant, safe against formulas", () => {
    const d = withTotals(doc({ number: "INV-1", status: "sent", client: { name: "=HYPERLINK(1)", company: "Acme, Inc." }, lines: [item({ qty: 1, unitPrice: 10 })], taxes: [] }));
    const csv = documentsCsv([d], new Map([["p1", { address: "12 Maple", clientName: "x" }]]), DAY);
    const row = csv.split("\r\n")[1];
    expect(row).toContain("'=HYPERLINK(1)");
    expect(row).toContain('"Acme, Inc."');
    expect(row).toContain("10.00");
    const pcsv = paymentsCsv([pay(-5, DAY, { documentId: d.id, method: "zelle" })], new Map([[d.id, d]]));
    expect(pcsv.split("\r\n")[1]).toBe(`${DAY},INV-1,'=HYPERLINK(1),Zelle,,-5.00,USD,`);
  });

  it("collects repeat clients from jobs and documents", () => {
    const projects = [
      { ...project, id: "a", clientEmail: "JANE@example.com", updatedAt: "2026-01-01" },
      { ...project, id: "b", clientName: "Jane C.", updatedAt: "2026-02-01" },
      { ...project, id: "c", clientName: "Bob", clientEmail: "", updatedAt: "2026-03-01" },
    ];
    const dir = clientDirectory(projects, [{ projectId: "a", client: { name: "Jane Client", company: "Jane LLC", email: "jane@example.com" }, updatedAt: "2025-01-01" }]);
    expect(dir.map((c) => c.name)).toEqual(["Bob", "Jane C."]);
    expect(dir[1].projectIds.sort()).toEqual(["a", "b"]);
    expect(dir[1].company).toBe("Jane LLC");
  });

  it("normalises partial settings", () => {
    const s = normalizeDocSettings({ kinds: { quote: { label: "Quote" } } } as never, "CAD");
    expect(s.kinds.quote.label).toBe("Quote");
    expect(s.kinds.quote.format).toBe("EST-{0000}");
    expect(s.kinds.invoice.label).toBe("Invoice");
    expect(s.currency).toBe("CAD");
    expect(s.columns.qty).toBe(true);
  });
});
