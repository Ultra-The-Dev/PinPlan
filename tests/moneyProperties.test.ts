// Property-style checks of the money math: random documents and quotes, totals that must add up to the cent.
import { describe, expect, it } from "vitest";
import { exportLines, exportTotal } from "@/lib/accountingExport";
import { billableChanges, changeOrderTotals } from "@/lib/changeOrders";
import { adjustAmount, creditNoteFor, documentTotals, invoiceFromChanges, invoiceFromQuote, newDocument, normalizeDocSettings, withTotals } from "@/lib/documents";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { quoteLinesFromEstimate } from "@/lib/docFromEstimate";
import { buildEstimate } from "@/lib/estimate";
import { sumQty } from "@/lib/markerCount";
import { computeTakeoff } from "@/lib/takeoff";
import type { ChangeOrder, DocLine, Marker, Project, Run, SalesDoc, Sheet } from "@/lib/types";

const NOW = "2026-11-19T15:00:00.000Z";
const DAY = "2026-11-19";
const S = normalizeDocSettings({ taxes: [{ id: "st", name: "State", rate: 6.25, default: true }, { id: "co", name: "County", rate: 2.625, default: true }] });
const project: Project = { id: "p1", clientName: "A", clientEmail: "a@example.com", clientPhone: "", address: "1 Main", status: "estimate", billduDocs: [], createdAt: NOW, updatedAt: NOW };

// Small deterministic PRNG (mulberry32), so a failure is reproducible from its seed.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let n = 0;
function randomQuote(r: () => number): SalesDoc {
  const lines: DocLine[] = [];
  const count = 1 + Math.floor(r() * 25);
  for (let i = 0; i < count; i++) {
    if (r() < 0.15) lines.push({ id: `s${++n}`, kind: "section", description: `Room ${i}`, qty: 0, unitPrice: 0, taxable: false });
    const qty = r() < 0.3 ? Math.round(r() * 2000) / 10 : 1 + Math.floor(r() * 40);
    const unitPrice = Math.round(r() * 100000) / 100;
    const discount = r() < 0.2 ? (r() < 0.5 ? { type: "pct" as const, value: Math.round(r() * 3000) / 100 } : { type: "fixed" as const, value: Math.round(r() * 5000) / 100 }) : null;
    lines.push({ id: `l${++n}`, kind: "item", description: "x", qty, unitPrice, taxable: r() < 0.7, taxIds: r() < 0.2 ? ["st"] : null, optional: r() < 0.1, discount });
  }
  const base = newDocument({ id: `q${++n}`, kind: "quote", project, settings: S, now: NOW, day: DAY });
  return withTotals({
    ...base,
    lines,
    discount: r() < 0.3 ? (r() < 0.5 ? { type: "pct", value: Math.round(r() * 1500) / 100 } : { type: "fixed", value: Math.round(r() * 20000) / 100 }) : null,
    fees: r() < 0.3 ? [{ id: "f", label: "Permit", amount: Math.round(r() * 30000) / 100, taxable: r() < 0.5 }] : [],
  });
}

const cents = (x: number) => Math.round(x * 100);

describe("document totals add up (random documents)", () => {
  it("total = subtotal − discount + fees + taxes, every figure in whole cents", () => {
    const r = rng(42);
    for (let k = 0; k < 500; k++) {
      const q = randomQuote(r);
      const t = documentTotals(q);
      for (const v of [t.subtotal, t.discountTotal, t.feeTotal, t.taxTotal, t.total, t.optionalTotal, ...t.taxLines.map((x) => x.amount), ...Object.values(t.lineNet)])
        expect(Math.abs(v * 100 - cents(v))).toBeLessThan(1e-6);
      expect(cents(t.total)).toBe(cents(t.subtotal) - cents(t.discountTotal) + cents(t.feeTotal) + cents(t.taxTotal));
      expect(cents(t.taxTotal)).toBe(t.taxLines.reduce((s, x) => s + cents(x.amount), 0));
      expect(cents(t.subtotal)).toBe(t.sections.reduce((s, x) => s + cents(x.total), 0));
      expect(t.discountTotal).toBeLessThanOrEqual(Math.max(0, t.subtotal));
    }
  });

  it("deposit + progress + final invoices come to the quote total exactly", () => {
    const r = rng(7);
    for (let k = 0; k < 300; k++) {
      const q = { ...randomQuote(r), number: "Q-1" };
      const total = documentTotals(q).total;
      const prior: SalesDoc[] = [];
      const ctx = (id: string) => ({ id, now: NOW, day: DAY, settings: S, prior: [...prior] });
      prior.push(invoiceFromQuote(q, { mode: "deposit", pct: Math.round(r() * 5000) / 100 }, ctx(`a${k}`)));
      prior.push(invoiceFromQuote(q, { mode: "progress", pct: Math.round(r() * 3333) / 100 }, ctx(`b${k}`)));
      prior.push(invoiceFromQuote(q, { mode: "amount", amount: Math.round(r() * total * 10) / 100 }, ctx(`c${k}`)));
      const fin = invoiceFromQuote(q, { mode: "final" }, ctx(`d${k}`));
      const billed = [...prior, fin].reduce((s, d) => s + cents(d.total), 0);
      expect(billed).toBe(cents(total));
    }
  });

  it("a credit note for an invoice comes to that invoice's total (final invoices too)", () => {
    const r = rng(9);
    for (let k = 0; k < 100; k++) {
      const q = { ...randomQuote(r), number: "Q-1" };
      const dep = invoiceFromQuote(q, { mode: "deposit", pct: 30 }, { id: `a${k}`, now: NOW, day: DAY, settings: S });
      const fin = invoiceFromQuote(q, { mode: "final" }, { id: `b${k}`, now: NOW, day: DAY, settings: S, prior: [dep] });
      for (const inv of [dep, fin]) {
        const cn = creditNoteFor(inv, { id: `c${k}`, now: NOW, day: DAY, settings: S });
        expect(cn.total).toBe(inv.total);
      }
    }
  });
});

function randomChangeOrder(r: () => number, i: number): ChangeOrder {
  const kinds = ["device", "labor", "material", "custom"] as const;
  const lines = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, k) => ({
    id: `col${i}-${k}`,
    kind: kinds[Math.floor(r() * 4)],
    description: "Extra",
    qty: r() < 0.3 ? Math.round(r() * 500) / 10 : 1 + Math.floor(r() * 10),
    unit: "each",
    unitPrice: Math.round(r() * 50000) / 1000,
    taxable: r() < 0.7,
  }));
  const rates = [0, 8.875, 6.25, 2.625, 7];
  return { id: `co${i}`, projectId: "p1", number: i + 1, title: `Change ${i}`, reason: "client_request", status: "approved", lines, markupPct: r() < 0.5 ? Math.round(r() * 3000) / 100 : 0, taxPct: rates[Math.floor(r() * rates.length)], createdAt: NOW, updatedAt: NOW } as ChangeOrder;
}

describe("change orders billed on invoices (random)", () => {
  it("an invoice for change orders alone comes to their approved totals to the cent", () => {
    const r = rng(11);
    for (let k = 0; k < 300; k++) {
      const cos = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => randomChangeOrder(r, i));
      const inv = invoiceFromChanges(billableChanges(cos), { id: `i${k}`, now: NOW, day: DAY, settings: S, project });
      const want = cos.reduce((s, c) => s + cents(changeOrderTotals(c).total), 0);
      // One change order: exactly its approved total. Several: the invoice works tax out once per rate on their combined
      // base, so it can differ from the sum of their own rounded taxes by at most a cent per change order.
      if (cos.length === 1) expect(cents(inv.total)).toBe(want);
      else expect(Math.abs(cents(inv.total) - want)).toBeLessThanOrEqual(cos.length - 1);
      expect(cents(inv.options?.changeOrderAmount ?? 0)).toBe(cents(inv.total));
    }
  });

  it("deposit (with changes) + final come to quote + changes; the final takes off only the quote's share", () => {
    const r = rng(12);
    for (let k = 0; k < 200; k++) {
      const q = { ...randomQuote(r), discount: null, number: "Q-1" };
      const cos = [randomChangeOrder(r, 0)];
      const dep = invoiceFromQuote(q, { mode: "deposit", pct: 40 }, { id: `a${k}`, now: NOW, day: DAY, settings: S, changes: billableChanges(cos) });
      const fin = invoiceFromQuote(q, { mode: "final" }, { id: `b${k}`, now: NOW, day: DAY, settings: S, prior: [dep] });
      expect(cents(dep.total) + cents(fin.total)).toBe(cents(documentTotals(q).total) + cents(dep.options?.changeOrderAmount ?? 0));
    }
  });
});

describe("accounting export lines add up (random documents)", () => {
  it("QuickBooks / Xero lines sum to the document total, credit notes negative", () => {
    const r = rng(13);
    for (let k = 0; k < 300; k++) {
      const q = randomQuote(r);
      const inv = withTotals({ ...q, kind: "invoice" as const, deposit: null });
      expect(cents(exportTotal(exportLines(inv)))).toBe(cents(inv.total));
      const cn = creditNoteFor({ ...inv, number: "INV-1" }, { id: `c${k}`, now: NOW, day: DAY, settings: S });
      expect(cents(exportTotal(exportLines(cn))) + cents(cn.total)).toBe(0);
    }
  });
});

describe("estimate from count pins (random jobs)", () => {
  const typeIds = ["cam-indoor", "cam-outdoor", "wap", "speaker", "tv"];
  function randomJob(r: () => number) {
    const sheets: Sheet[] = [0, 1, 2].map((i) => ({ id: `sh${i}`, projectId: "p1", name: `Floor ${i}`, pageNumber: i + 1, order: i, imageId: "img", width: 1000, height: 800, pxPerFt: 10, createdAt: NOW, updatedAt: NOW }));
    const markers: Marker[] = Array.from({ length: 1 + Math.floor(r() * 30) }, (_, i) => ({
      id: `m${i}`, projectId: "p1", sheetId: `sh${Math.floor(r() * 3)}`, deviceTypeId: typeIds[Math.floor(r() * typeIds.length)], x: r(), y: r(), label: `D-${i}`,
      room: ["Den", "Hall", "Kitchen", ""][Math.floor(r() * 4)], mount: "wall", wireType: "None", tentative: r() < 0.2, notes: "", count: r() < 0.3 ? 2 + Math.floor(r() * 30) : null, createdAt: NOW, updatedAt: NOW,
    }) as Marker);
    return { sheets, markers, runs: [] as Run[], closets: [] };
  }

  it("a pin with count N is priced N times, once, in both labor modes; quotes by floor / room come to the estimate", () => {
    const r = rng(21);
    const catalog = seedCatalog().map((d, i) => ({ ...d, unitPrice: Math.round(((i * 37) % 500) * 100 + 99) / 100, laborPrice: Math.round(((i * 13) % 90) * 100 + 50) / 100 }));
    for (let k = 0; k < 150; k++) {
      const job = randomJob(r);
      for (const laborMode of ["combined", "separate"] as const) {
        const pricing = { ...DEFAULT_SETTINGS.pricing, laborMode, markupPct: Math.round(r() * 3000) / 100, includeTentative: r() < 0.5 };
        const e = buildEstimate(computeTakeoff(job), catalog, pricing, []);
        for (const id of typeIds) {
          const pins = job.markers.filter((m) => m.deviceTypeId === id);
          const qtyOf = (prefix: string) => e.lines.filter((l) => l.key === `${prefix}${id}`).reduce((s, l) => s + l.qty, 0);
          expect(qtyOf("dev:") + qtyOf("opt:")).toBe(sumQty(pins));
          expect(qtyOf("opt:")).toBe(sumQty(pins.filter((m) => m.tentative)));
          if (laborMode === "separate") expect(qtyOf("labor:") + qtyOf("optlabor:")).toBe(sumQty(pins));
          else expect(qtyOf("labor:")).toBe(0);
        }
        const data = { project: { ...project }, ...job, catalog, products: [] };
        for (const grouping of ["floor", "room"] as const) {
          const lines = quoteLinesFromEstimate(e, data, { grouping, details: true, detail: "lines", includeOptional: true }, S);
          const counted = lines.filter((l) => l.kind !== "section" && !l.optional).reduce((s, l) => s + cents(l.qty * l.unitPrice), 0);
          expect(counted).toBe(cents(e.subtotal));
        }
      }
    }
  });
});

describe("empty documents and credit notes", () => {
  it("a discount or deposit on a document with nothing counted is 0, never a negative total", () => {
    expect(adjustAmount({ type: "fixed", value: 50 }, 0)).toBe(0);
    expect(adjustAmount({ type: "pct", value: 10 }, -100)).toBe(0);
    const t = documentTotals({ lines: [], taxes: [], discount: { type: "fixed", value: 50 }, deposit: { type: "fixed", value: 20 } });
    expect([t.discountTotal, t.total, t.deposit]).toEqual([0, 0, 0]);
  });

  it("a credit note for a final invoice credits that invoice, not the whole job", () => {
    const q = withTotals({ ...newDocument({ id: "qf", kind: "quote", project, settings: S, now: NOW, day: DAY }), number: "Q-9", lines: [{ id: "x", kind: "item", description: "Cameras", qty: 10, unitPrice: 1000, taxable: true }] });
    const dep = { ...invoiceFromQuote(q, { mode: "deposit", pct: 50 }, { id: "d1", now: NOW, day: DAY, settings: S }), number: "INV-1" };
    const fin = { ...invoiceFromQuote(q, { mode: "final" }, { id: "f1", now: NOW, day: DAY, settings: S, prior: [dep] }), number: "INV-2" };
    const cn = creditNoteFor(fin, { id: "c1", now: NOW, day: DAY, settings: S });
    expect(fin.total).toBe(5443.75);
    expect(cn.total).toBe(5443.75);
    expect(cn.lines.map((l) => l.description)).toEqual(["Credit against INV-2"]);
    // An ordinary invoice keeps its own lines to edit down.
    expect(creditNoteFor(dep, { id: "c2", now: NOW, day: DAY, settings: S }).lines[0].description).toMatch(/^Deposit/);
  });
});
