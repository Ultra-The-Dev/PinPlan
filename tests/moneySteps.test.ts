// Money tab: which documents each step lists, and when a client's approval still needs its approved quote made.
import { describe, expect, it } from "vitest";
import { approvalNeedsQuote, docsForStep, docStepFor, newDocument, normalizeDocSettings, proposalQuoteId } from "@/lib/documents";
import type { Project, SalesDoc } from "@/lib/types";

const NOW = "2026-11-19T15:00:00.000Z";
const S = normalizeDocSettings({});
const project: Project = { id: "p1", clientName: "Jane Client", address: "12 Maple Ridge Rd", status: "estimate", billduDocs: [], createdAt: NOW, updatedAt: NOW };
let n = 0;
const doc = (over: Partial<SalesDoc> = {}): SalesDoc => ({ ...newDocument({ id: `d${++n}`, kind: "invoice", project, settings: S, now: NOW, day: "2026-11-19" }), ...over });

describe("Money steps", () => {
  it("lists quotes on Quote and invoices + credit notes on Invoices & payments", () => {
    const q = doc({ kind: "quote" });
    const inv = doc({ kind: "invoice" });
    const cn = doc({ kind: "credit_note" });
    expect(docsForStep([q, inv, cn], "quote")).toEqual([q]);
    expect(docsForStep([q, inv, cn], "invoices")).toEqual([inv, cn]);
    expect(docStepFor("quote")).toBe("quote");
    expect(docStepFor("invoice")).toBe("invoices");
    expect(docStepFor("credit_note")).toBe("invoices");
  });
});

describe("approved quote from a client approval", () => {
  const approval = { id: "prop1", responded_at: "2026-11-19T12:00:00.000Z" };

  it("is needed when the job has no quote for it", () => {
    expect(approvalNeedsQuote([], approval)).toBe(true);
    expect(approvalNeedsQuote([doc({ kind: "quote", status: "draft" })], approval)).toBe(true);
  });

  it("is not made twice", () => {
    const made = doc({ id: proposalQuoteId("prop1"), kind: "quote", status: "accepted", options: { approval: { proposalId: "prop1", source: "proposal" } } as SalesDoc["options"] });
    expect(made.id).toBe("quote-from-prop1");
    expect(approvalNeedsQuote([made], approval)).toBe(false);
    // A deleted one doesn't count.
    expect(approvalNeedsQuote([{ ...made, deleted: true }], approval)).toBe(true);
  });

  it("is not made when the office approved its own quote or billed from one after the approval", () => {
    expect(approvalNeedsQuote([doc({ kind: "quote", status: "accepted", createdAt: "2026-11-19T13:00:00.000Z" })], approval)).toBe(false);
    const quote = doc({ kind: "quote", status: "sent" });
    expect(approvalNeedsQuote([quote, doc({ kind: "invoice", source: "quote", convertedFrom: quote.id, createdAt: "2026-11-19T13:00:00.000Z" })], approval)).toBe(false);
    // Made before the client answered: still needed.
    expect(approvalNeedsQuote([doc({ kind: "quote", status: "accepted", createdAt: "2026-11-18T13:00:00.000Z" })], approval)).toBe(true);
  });
});
