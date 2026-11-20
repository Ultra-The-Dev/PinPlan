// Estimate overrides: one per line key. Older builds gave every override a random id, so two devices overriding the
// same line made two rows; the estimate now takes the newest row per key (by updatedAt), new overrides get the id
// `<project>:<key>` on every device, and removing an override removes every row with its key.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { db, put } from "@/lib/db";
import { buildEstimate, estimateLineId, latestOverrides, newestOverride } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import type { Takeoff, TakeoffBucket } from "@/lib/takeoff";
import type { EstimateLine, PricingSettings, Project } from "@/lib/types";

const t0 = "2026-11-15T00:00:00.000Z";
const t1 = "2026-11-16T00:00:00.000Z";
const t2 = "2026-11-17T00:00:00.000Z";
const bucket = (patch: Partial<TakeoffBucket>): TakeoffBucket => ({
  counts: {}, tentative: {}, ledFt: {}, ledTentativeFt: {}, ledZones: 0, ledTotalFt: 0, stairFt: 0, stairSteps: 0,
  wireFt: {}, wireRuns: {}, closets: { equipment: 0, switch: 0, rack: 0 }, unmeasuredRuns: 0, ...patch,
});
const takeoff: Takeoff = { floors: [], total: bucket({ counts: { "cam-indoor": 3, wap: 2 }, tentative: { "cam-indoor": 1 }, wireFt: { Cat6: 123.4 }, wireRuns: { Cat6: 5 } }) };
const pricing: PricingSettings = { ...DEFAULT_SETTINGS.pricing, markupPct: 12.5, taxPct: 8.875, laborMode: "separate", includeTentative: false, wirePrices: { Cat6: 0.335 } };
const line = (id: string, key: string, updatedAt: string, extra: Partial<EstimateLine>): EstimateLine => ({ id, projectId: "p1", key, updatedAt, ...extra });
const est = (overrides: EstimateLine[]) => buildEstimate(takeoff, seedCatalog(), pricing, overrides);

describe("buildEstimate with duplicate override keys", () => {
  const singles = [
    line("a", "dev:wap", t1, { unitPrice: 99.99 }),
    line("b", "opt:cam-indoor", t1, { include: true }),
    line("c", "custom:trip", t1, { description: "Trip", unitPrice: 45, qty: 1, sort: 1 }),
    line("d", "wire:Cat6", t1, { removed: true }),
  ];

  it("single rows: same totals as before (pinned numbers)", () => {
    const e = est(singles);
    // Pinned from buildEstimate before this change (one row per key, so nothing to choose between).
    expect({ subtotal: e.subtotal, tax: e.tax, total: e.total, optionalTotal: e.optionalTotal }).toEqual({ subtotal: 244.98, tax: 21.74, total: 266.72, optionalTotal: 0 });
    expect(e.lines.map((l) => [l.key, l.unitPrice, l.qty, l.included])).toEqual([
      ["dev:cam-indoor", 0, 2, true],
      ["opt:cam-indoor", 0, 1, true],
      ["dev:wap", 99.99, 2, true],
      ["custom:trip", 45, 1, true],
    ]);
    expect(e.lines.find((l) => l.key === "dev:wap")?.unitPrice).toBe(99.99);
    expect(e.lines.some((l) => l.key === "wire:Cat6")).toBe(false);
    expect(e.lines.filter((l) => l.key === "custom:trip")).toHaveLength(1);
  });

  it("the newest row per key wins, wherever it sits in the list", () => {
    const older = [line("a-old", "dev:wap", t0, { unitPrice: 1 }), line("c-old", "custom:trip", t0, { description: "Old trip", unitPrice: 1000, qty: 1, sort: 1 })];
    const expected = est(singles);
    for (const list of [[...older, ...singles], [...singles, ...older]]) {
      const e = est(list);
      expect(e.total).toBe(expected.total);
      expect(e.lines.map((l) => [l.key, l.unitPrice, l.qty])).toEqual(expected.lines.map((l) => [l.key, l.unitPrice, l.qty]));
      expect(e.lines.filter((l) => l.key === "custom:trip")).toHaveLength(1);
    }
  });

  it("a deleted row never counts, even when it is the newest", () => {
    const e = est([line("a", "dev:wap", t1, { unitPrice: 99.99 }), line("a2", "dev:wap", t2, { unitPrice: 5, deleted: true })]);
    expect(e.lines.find((l) => l.key === "dev:wap")?.unitPrice).toBe(99.99);
  });

  it("latestOverrides / newestOverride", () => {
    const rows = [line("x1", "dev:wap", t2, { unitPrice: 2 }), line("x2", "dev:wap", t1, { unitPrice: 1 })];
    expect(latestOverrides(rows).get("dev:wap")?.id).toBe("x1");
    expect(newestOverride(rows, "dev:wap")?.id).toBe("x1");
    expect(newestOverride(rows, "dev:none")).toBeNull();
    // Same stamp: the later row in the list, as before.
    expect(latestOverrides([line("y1", "k", t1, {}), line("y2", "k", t1, {})]).get("k")?.id).toBe("y2");
  });
});

describe("editor: override ids and removal", () => {
  const project: Project = { id: "p1", clientName: "Test", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: t0, updatedAt: t0 };

  beforeEach(async () => {
    await db().delete();
    await db().open();
    await put("projects", project);
    useEditor.setState({ project: null, past: [], future: [], loaded: false });
  });

  it("a new override gets the id <project>:<key> (the same on every device)", async () => {
    await useEditor.getState().load("p1");
    await useEditor.getState().upsertEstimateLine("dev:wap", { unitPrice: 50 });
    expect(estimateLineId("p1", "dev:wap")).toBe("p1:dev:wap");
    expect(await db().estimateLines.get("p1:dev:wap")).toMatchObject({ key: "dev:wap", unitPrice: 50 });
    await useEditor.getState().upsertEstimateLine("dev:wap", { unitPrice: 60 });
    expect((await db().estimateLines.toArray()).filter((l) => !l.deleted)).toHaveLength(1);
  });

  it("editing a key with duplicates edits the row the estimate shows (the newest)", async () => {
    await db().estimateLines.bulkPut([line("old", "dev:wap", t0, { unitPrice: 1 }), line("new", "dev:wap", t1, { unitPrice: 2 })]);
    await useEditor.getState().load("p1");
    await useEditor.getState().upsertEstimateLine("dev:wap", { unitPrice: 3 });
    expect(await db().estimateLines.get("new")).toMatchObject({ unitPrice: 3 });
    expect(await db().estimateLines.get("old")).toMatchObject({ unitPrice: 1 });
  });

  it("removing an override removes every row with its key", async () => {
    await db().estimateLines.bulkPut([line("old", "dev:wap", t0, { unitPrice: 1 }), line("new", "dev:wap", t1, { unitPrice: 2 }), line("other", "dev:cam", t1, { unitPrice: 3 })]);
    await useEditor.getState().load("p1");
    await useEditor.getState().removeEstimateOverride("dev:wap");
    expect(await db().estimateLines.get("old")).toMatchObject({ deleted: true });
    expect(await db().estimateLines.get("new")).toMatchObject({ deleted: true });
    expect(await db().estimateLines.get("other")).not.toHaveProperty("deleted", true);
    expect(useEditor.getState().estimateLines.map((l) => l.id)).toEqual(["other"]);
    // Both deletions go up.
    const queued = (await db().syncQueue.toArray()).filter((q) => q.table === "estimateLines").map((q) => q.rowId);
    expect(queued).toEqual(expect.arrayContaining(["old", "new"]));
  });
});
