// One money flow: job pricing → quote (same total, tax included) → the client approves (proposal → approved quote) →
// deposit and remaining-balance invoices, with approved change orders billed once → honest statuses.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { billableChanges, contractFromQuote, transition } from "@/lib/changeOrders";
import { quoteForProposal, quoteFromEstimate, quoteFromProposal, quoteTaxSetup, quoteVsPricing, type ApprovedProposal } from "@/lib/docFromEstimate";
import {
  billedChangeOrderIds,
  canAddChangeOrders,
  DEFAULT_DOC_SETTINGS,
  displayStatus,
  documentTotals,
  hasLegacyQuoteDefault,
  invoiceFromChanges,
  invoiceFromQuote,
  jobBilling,
  latestApprovedQuote,
  newDocument,
  normalizeDocSettings,
  reminderDue,
  STATUS_LABEL,
  wasSent,
  withTotals,
} from "@/lib/documents";
import { buildEstimate, money } from "@/lib/estimate";
import { buildSnapshot, proposalTotals } from "@/lib/proposal";
import { computeTakeoff } from "@/lib/takeoff";
import type { ChangeOrder, DeviceType, PricingSettings, Project, SalesDoc } from "@/lib/types";
import { buildSampleJob } from "./fixtures/sampleJob";

const NOW = "2026-11-19T15:00:00.000Z";
const DAY = "2026-11-19";
const data = buildSampleJob();
const takeoff = computeTakeoff(data);
// Awkward prices (fractions of a cent) and labor on every device, so rounding and labor tax are exercised.
const catalog: DeviceType[] = seedCatalog().map((d, i) => ({ ...d, unitPrice: 41.337 + i * 9.005, laborPrice: 25.125 + (i % 4) * 3.333 }));
const project: Project = { id: data.sheets[0].projectId, clientName: "Sample Client", clientEmail: "client@example.com", clientPhone: "", address: "12 Maple Ridge Rd", status: "estimate", billduDocs: [], createdAt: NOW, updatedAt: NOW };
const job = { project, sheets: data.sheets, markers: data.markers, runs: data.runs, closets: data.closets, catalog, products: [] };
const opts = { details: true, detail: "lines" as const, includeOptional: true };
const ctx = (id: string, settings = DEFAULT_DOC_SETTINGS) => ({ id, now: NOW, day: DAY, settings });

function pricingFor(laborMode: PricingSettings["laborMode"]): PricingSettings {
  return { ...DEFAULT_SETTINGS.pricing, markupPct: 15, taxPct: 8.875, laborMode, includeTentative: false, wirePrices: { ...DEFAULT_SETTINGS.pricing.wirePrices, Cat6: 0.47 } };
}

describe("tax parity: a quote from the job's pricing comes to the pricing total", () => {
  for (const laborMode of ["combined", "separate"] as const)
    for (const grouping of ["category", "flat"] as const)
      it(`${laborMode} labor, ${grouping}: quote total = estimate.total (company has no taxes set up)`, () => {
        const pricing = pricingFor(laborMode);
        const est = buildEstimate(takeoff, catalog, pricing);
        expect(est.tax).toBeGreaterThan(0);
        const base = newDocument({ ...ctx("q"), kind: "quote", project });
        expect(base.taxes).toEqual([]);
        const q = quoteFromEstimate(base, est, job, { ...opts, grouping }, DEFAULT_DOC_SETTINGS, pricing.taxPct);
        expect(q.taxes).toEqual([{ id: "sales-tax", name: "Sales tax", rate: 8.875 }]);
        expect(q.subtotal).toBe(est.subtotal);
        expect(q.taxTotal).toBe(est.tax);
        expect(q.total).toBe(est.total);
        expect(quoteVsPricing(q, est)).toBe(0);
        if (laborMode === "separate") expect(q.lines.filter((l) => l.key?.startsWith("labor:")).every((l) => l.taxable)).toBe(true);
      });

  it("the company's own taxes win; the difference is reported (labor untaxed there)", () => {
    const pricing = pricingFor("separate");
    const est = buildEstimate(takeoff, catalog, pricing);
    const s = normalizeDocSettings({ taxes: [{ id: "ny", name: "NY", rate: 8.875, default: true }], laborTaxable: false });
    const base = newDocument({ ...ctx("q2", s), kind: "quote", project });
    const q = quoteFromEstimate(base, est, job, { ...opts, grouping: "category" }, s, pricing.taxPct);
    expect(q.taxes.map((t) => t.id)).toEqual(["ny"]);
    expect(quoteVsPricing(q, est)).toBeLessThan(0);
    expect(quoteTaxSetup(normalizeDocSettings({ taxes: [{ id: "ny", name: "NY", rate: 8.875, default: true }], laborTaxable: true }), 8.875).laborTaxable).toBe(true);
    expect(quoteTaxSetup(DEFAULT_DOC_SETTINGS, 0)).toEqual({ taxes: [], laborTaxable: false });
  });

  it("without pricingTaxPct the old behaviour stays (no taxes seeded)", () => {
    const est = buildEstimate(takeoff, catalog, pricingFor("combined"));
    const q = quoteFromEstimate(newDocument({ ...ctx("q3"), kind: "quote", project }), est, job, { ...opts, grouping: "category" }, DEFAULT_DOC_SETTINGS);
    expect(q.taxes).toEqual([]);
    expect(q.total).toBe(est.subtotal);
  });
});

// ---------------------------------------------------------------- proposal approved → approved quote

function approvedProposal(): { row: ApprovedProposal; est: ReturnType<typeof buildEstimate> } {
  const pricing = { ...pricingFor("combined"), includeTentative: false };
  const est = buildEstimate(takeoff, catalog, pricing);
  const snap = buildSnapshot({ project, sheets: data.sheets, catalog, takeoff, estimate: est, business: DEFAULT_SETTINGS.business, currency: "USD", taxPct: 8.875, validDays: 30, detail: "lines", depositPct: 40, now: new Date(NOW) });
  const optional = snap.lines.filter((l) => l.optional);
  expect(optional.length).toBeGreaterThan(0);
  const chosen = [optional[0].key];
  const totals = proposalTotals(snap, chosen);
  return {
    est,
    row: { id: "tok_abcdefghijklmnopqrstu", snapshot: snap, client_name: "Sample Client", signature: "data:image/png;base64,AAAA", chosen_options: chosen, accepted_total: totals.total, client_note: "Go ahead", responded_at: "2026-11-20T18:30:00.000Z" },
  };
}

describe("the client approves a proposal: it becomes the approved quote", () => {
  it("same total the client approved, options as ticked, locked with the signature", () => {
    const { row } = approvedProposal();
    const q = quoteFromProposal(newDocument({ ...ctx("quote-from-x"), kind: "quote", project }), row);
    expect(q.status).toBe("accepted");
    expect(STATUS_LABEL[displayStatus(q, DAY)]).toBe("Approved");
    expect(q.total).toBe(row.accepted_total);
    expect(documentTotals(q).total).toBe(proposalTotals(row.snapshot, row.chosen_options ?? []).total);
    expect(q.deposit).toEqual({ type: "pct", value: 40 });
    expect(q.options?.approval).toMatchObject({ source: "proposal", proposalId: row.id, signerName: "Sample Client", signature: row.signature, respondedAt: row.responded_at });
    expect([q.signerName, q.signature, q.respondedAt]).toEqual(["Sample Client", row.signature, row.responded_at]);
    // The ticked option counts; the others are listed as optional.
    const ticked = q.lines.find((l) => l.key === row.chosen_options![0])!;
    expect(ticked.optional).toBe(false);
    expect(q.lines.some((l) => l.optional)).toBe(q.lines.filter((l) => l.key && row.snapshot.lines.find((x) => x.key === l.key)?.optional).length > 1);
    expect(quoteForProposal([q], row.id)?.id).toBe(q.id);
    expect(quoteForProposal([{ ...q, deleted: true }], row.id)).toBeNull();
  });

  it("“Bill the deposit” then the remaining balance add up to what the client approved", () => {
    const { row } = approvedProposal();
    const q = { ...quoteFromProposal(newDocument({ ...ctx("qp"), kind: "quote", project }), row), number: "Q-0001" };
    const dep = { ...invoiceFromQuote(q, { mode: "deposit", pct: q.deposit!.value }, ctx("d1")), number: "INV-1", status: "sent" as const };
    expect(dep.total).toBe(documentTotals(q).deposit);
    const fin = invoiceFromQuote(q, { mode: "final" }, { ...ctx("f1"), prior: [dep] });
    expect(money(dep.total + fin.total)).toBe(row.accepted_total);
    // Copies don't carry the client's approval.
    expect(dep.options?.approval).toBeUndefined();
  });
});

// ---------------------------------------------------------------- change orders, billed once

const now = () => NOW;
function co(id: string, number: number, lines: ChangeOrder["lines"], over: Partial<ChangeOrder> = {}): ChangeOrder {
  return { id, projectId: project.id, number, title: `Change ${number}`, reason: "client_request", status: "draft", lines, markupPct: 20, taxPct: 8.875, createdAt: NOW, updatedAt: NOW, ...over };
}
const approve = (c: ChangeOrder) => transition(c, "approve", now(), { name: "Sample Client" }).co;

describe("approved change orders on invoices", () => {
  const quote = withTotals({
    ...newDocument({ ...ctx("q9"), kind: "quote", project }),
    number: "Q-0009",
    status: "accepted" as const,
    respondedAt: NOW,
    taxes: [{ id: "sales-tax", name: "Sales tax", rate: 8.875 }],
    lines: [{ id: "a", kind: "item" as const, description: "Cameras", qty: 4, unitPrice: 412.37, taxable: true }],
  });
  const co1 = approve(co("co-1", 1, [{ id: "x", kind: "device", deviceTypeId: "cam", description: "Extra camera", qty: 2, unit: "each", unitPrice: 399.99, taxable: true }, { id: "y", kind: "material", deviceTypeId: null, description: "Wire", qty: 1, unit: "each", unitPrice: 33.33, taxable: true }]));
  const co2 = approve(co("co-2", 2, [{ id: "z", kind: "labor", deviceTypeId: null, description: "Labor", qty: 3, unit: "hr", unitPrice: 95, taxable: false }], { taxPct: 7 }));
  const pending = co("co-3", 3, [{ id: "w", kind: "custom", deviceTypeId: null, description: "Maybe", qty: 1, unit: "each", unitPrice: 50 }]);
  const changes = billableChanges([co1, co2, pending]);

  it("only approved, unbilled change orders are billable", () => {
    expect(changes.map((c) => c.code)).toEqual(["CO-001", "CO-002"]);
    expect(billableChanges([co1, co2], new Set(["co-1"])).map((c) => c.id)).toEqual(["co-2"]);
  });

  it("remaining balance with change orders: one section each, each at its own total and tax, ids recorded", () => {
    const fin = invoiceFromQuote(quote, { mode: "final" }, { ...ctx("f"), prior: [], changes });
    const heads = fin.lines.filter((l) => l.kind === "section").map((l) => l.description);
    expect(heads).toEqual(["CO-001 — Change 1", "CO-002 — Change 2"]);
    expect(fin.options?.changeOrderIds).toEqual(["co-1", "co-2"]);
    expect(fin.total).toBe(money(quote.total + changes[0].total + changes[1].total));
    expect(fin.options?.changeOrderAmount).toBe(money(changes[0].total + changes[1].total));
    // CO-001 has a tax line of its own at its 8.875% (so it bills exactly its approved total); CO-002 is untaxed labor,
    // so no 7% tax is added for it.
    expect(fin.taxes.map((t) => [t.name, t.rate])).toEqual([["Sales tax", 8.875], ["Sales tax — CO-001", 8.875]]);
    expect(billedChangeOrderIds([fin])).toEqual(new Set(["co-1", "co-2"]));
    expect(billedChangeOrderIds([{ ...fin, status: "void" }])).toEqual(new Set());
  });

  it("a deposit, then “Bill this change”, then the remaining balance: every dollar once", () => {
    const dep = { ...invoiceFromQuote(quote, { mode: "deposit", pct: 50 }, ctx("d")), number: "INV-1", status: "sent" as const };
    const coInv = { ...invoiceFromChanges(billableChanges([co1]), { ...ctx("c"), project }), number: "INV-2", status: "sent" as const };
    expect(coInv.total).toBe(changes[0].total);
    expect(coInv.title).toBe("Change order CO-001");
    expect(coInv.convertedFrom).toBeFalsy();
    const left = billableChanges([co1, co2], billedChangeOrderIds([dep, coInv]));
    expect(left.map((c) => c.id)).toEqual(["co-2"]);
    const fin = invoiceFromQuote(quote, { mode: "final" }, { ...ctx("f2"), prior: [dep], changes: left });
    expect(money(dep.total + coInv.total + fin.total)).toBe(money(quote.total + changes[0].total + changes[1].total));
  });

  it("an earlier invoice that carried change orders only takes the quote's share off the remaining balance", () => {
    const part = { ...invoiceFromQuote(quote, { mode: "amount", amount: 500 }, { ...ctx("p"), changes: [changes[1]] }), number: "INV-3", status: "sent" as const };
    expect(part.invoiceType).toBe("progress");
    expect(part.total).toBe(money(500 + changes[1].total));
    const fin = invoiceFromQuote(quote, { mode: "final" }, { ...ctx("f3"), prior: [part] });
    expect(fin.deductions?.[0].amount).toBe(500);
    expect(money(part.total + fin.total)).toBe(money(quote.total + changes[1].total));
  });

  it("custom amount: one untaxed line, never negative", () => {
    const inv = invoiceFromQuote(quote, { mode: "amount", amount: 1234.565 }, ctx("amt"));
    expect([inv.total, inv.taxTotal, inv.lines.length]).toEqual([1234.57, 0, 1]);
    expect(invoiceFromQuote(quote, { mode: "amount", amount: -5 }, ctx("neg")).total).toBe(0);
  });

  it("a quote with a discount: change orders go on their own invoice, never discounted", () => {
    const q = withTotals({ ...quote, discount: { type: "pct" as const, value: 10 } });
    const fin = invoiceFromQuote(q, { mode: "final" }, ctx("f4"));
    expect(canAddChangeOrders(fin)).toBe(false);
    expect(() => invoiceFromQuote(q, { mode: "final" }, { ...ctx("f5"), changes: [changes[1]] })).toThrow(/own invoice/);
    // Deposits and custom amounts carry no discount, so changes can ride along.
    expect(invoiceFromQuote(q, { mode: "amount", amount: 100 }, { ...ctx("f6"), changes: [changes[1]] }).total).toBe(money(100 + changes[1].total));
  });
});

describe("contract and job money", () => {
  const cos = [approve(co("a", 1, [{ id: "l", kind: "custom", deviceTypeId: null, description: "x", qty: 1, unitPrice: 100, unit: "each" }], { taxPct: 0 })), co("b", 2, [{ id: "m", kind: "custom", deviceTypeId: null, description: "y", qty: 1, unitPrice: 40, unit: "each" }], { taxPct: 0 })];

  it("change orders compare against the approved quote; live pricing only when nothing is approved", () => {
    expect(contractFromQuote(5000, 7777, cos)).toEqual({ original: 5000, approved: 100, pending: 40, revised: 5100, basis: "quote" });
    expect(contractFromQuote(null, 7777, cos)).toMatchObject({ original: 7777, revised: 7877, basis: "pricing" });
  });

  it("the newest approved quote supersedes older ones; Approved quote · Billed · Left to bill", () => {
    const q = (id: string, total: number, at: string, over: Partial<SalesDoc> = {}): SalesDoc =>
      withTotals({ ...newDocument({ ...ctx(id), kind: "quote", project }), status: "accepted", respondedAt: at, lines: [{ id: `${id}l`, kind: "item", description: "x", qty: 1, unitPrice: total, taxable: false }], ...over });
    const old = q("old", 9000, "2026-11-01T10:00:00Z");
    const newer = q("new", 10000, "2026-11-10T10:00:00Z");
    const voided = q("void", 99999, "2026-11-15T10:00:00Z", { status: "void" });
    expect(latestApprovedQuote([old, newer, voided])?.id).toBe("new");
    // Approved on a proposal: the server clears respondedAt, the approval keeps it.
    const viaProposal = q("prop", 12000, "", { respondedAt: null, options: { approval: { source: "proposal", proposalId: "t", signerName: "C", respondedAt: "2026-11-12T10:00:00Z" } } });
    expect(latestApprovedQuote([old, newer, viaProposal])?.id).toBe("prop");

    const inv = { ...invoiceFromQuote(newer, { mode: "deposit", pct: 30 }, ctx("i1")), status: "sent" as const, amountPaid: 1000, balanceDue: 2000 };
    const draft = invoiceFromQuote(newer, { mode: "final" }, ctx("i2"));
    const b = jobBilling([old, newer, inv, draft], 500);
    expect(b.quote?.id).toBe("new");
    expect(b.contract).toBe(10500);
    expect(b.billed).toBe(3000);
    expect(b.paid).toBe(1000);
    expect(b.unpaid).toBe(2000);
    expect(b.leftToBill).toBe(7500);
    expect(jobBilling([]).leftToBill).toBeNull();
  });
});

describe("honest statuses", () => {
  const inv = (over: Partial<SalesDoc> = {}) => withTotals({ ...newDocument({ ...ctx("s"), kind: "invoice", project }), status: "sent" as const, number: "INV-9", dueDate: "2026-11-01", lines: [{ id: "l", kind: "item" as const, description: "x", qty: 1, unitPrice: 100, taxable: false }], ...over });

  it("finalized but not shared: Ready to send; no overdue and no reminders until it's sent", () => {
    const d = inv();
    expect(wasSent(d)).toBe(false);
    expect(displayStatus(d, DAY)).toBe("ready");
    expect(STATUS_LABEL.ready).toBe("Ready to send");
    expect(reminderDue(d, DEFAULT_DOC_SETTINGS.reminders, DAY)).toBeNull();
    const sent = inv({ sentAt: "2026-10-20T10:00:00Z" });
    expect(displayStatus(sent, DAY)).toBe("overdue");
    expect(reminderDue(sent, DEFAULT_DOC_SETTINGS.reminders, DAY)).toBe("after");
    expect(displayStatus(inv({ shareToken: "tok" }), "2026-10-01")).toBe("sent");
    expect(displayStatus(inv({ viewedAt: "2026-10-02T10:00:00Z" }), "2026-10-01")).toBe("viewed");
    const q = withTotals({ ...newDocument({ ...ctx("qq"), kind: "quote", project }), status: "sent" as const, validUntil: "2026-11-01" });
    expect(displayStatus(q, DAY)).toBe("ready");
    expect(displayStatus({ ...q, sentAt: NOW }, DAY)).toBe("expired");
  });

  it("quotes default to “Quote” / Q-{0000}; untouched old defaults move over, chosen ones stay", () => {
    expect(DEFAULT_DOC_SETTINGS.kinds.quote).toMatchObject({ label: "Quote", format: "Q-{0000}" });
    const legacy = { kinds: { quote: { ...DEFAULT_DOC_SETTINGS.kinds.quote, label: "Estimate", format: "EST-{0000}" } } } as never;
    expect(hasLegacyQuoteDefault(legacy)).toBe(true);
    expect(normalizeDocSettings(legacy).kinds.quote).toMatchObject({ label: "Quote", format: "Q-{0000}" });
    const chosen = { kinds: { quote: { ...DEFAULT_DOC_SETTINGS.kinds.quote, label: "Estimate", format: "E-{YY}-{000}" } } } as never;
    expect(hasLegacyQuoteDefault(chosen)).toBe(false);
    expect(normalizeDocSettings(chosen).kinds.quote).toMatchObject({ label: "Estimate", format: "E-{YY}-{000}" });
    // Picking "Estimate" / EST-{0000} again after the change is a choice: saved copies carry version 2 and keep it.
    const upgraded = normalizeDocSettings(legacy);
    expect(upgraded.version).toBe(2);
    const picked = normalizeDocSettings({ ...upgraded, kinds: { ...upgraded.kinds, quote: { ...upgraded.kinds.quote, label: "Estimate", format: "EST-{0000}" } } });
    expect(hasLegacyQuoteDefault(picked)).toBe(false);
    expect(picked.kinds.quote).toMatchObject({ label: "Estimate", format: "EST-{0000}" });
  });
});
