import { describe, expect, it } from "vitest";
import { computeTakeoff } from "@/lib/takeoff";
import {
  applyTransform,
  carryRow,
  changedSinceEstimate,
  clampWarning,
  composeTransforms,
  CURRENT,
  extractSheetNumbers,
  IDENTITY,
  invertTransform,
  isIdentity,
  matchPagesToSheets,
  needsRecalibration,
  nextRevisionLabel,
  pixelScale,
  pushRevision,
  registerRevisionCarry,
  revisionCarries,
  revisionChain,
  rollbackRevision,
  scaleAfterAlign,
  similarityFromPairs,
  toPixelMatrix,
  transformBetween,
  transformPoints,
  type Affine,
  type Pt,
} from "@/lib/revisions";
import { TABLES } from "@/lib/syncMap";
import type { Sheet } from "@/lib/types";
import { buildSampleJob } from "./fixtures/sampleJob";

const ts = "2026-11-12T00:00:00.000Z";
const sheet = (over: Partial<Sheet> = {}): Sheet => ({
  id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "img-a", width: 3000, height: 2000,
  pxPerFt: 24, pxPerInch: 300, scaleLabel: "1/4\" = 1'-0\"", createdAt: ts, updatedAt: ts, ...over,
});
const close = (a: number[], b: number[], eps = 1e-9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], -Math.log10(eps)));

describe("sheet numbers and page matching", () => {
  it("reads sheet numbers in common formats", () => {
    expect(extractSheetNumbers("PROJECT 12 MAPLE RIDGE SHEET NO. E-101 FIRST FLOOR")[0]).toBe("E101");
    expect(extractSheetNumbers("LOW VOLTAGE PLAN SHEET LV-2.1")[0]).toBe("LV2.1");
    expect(extractSheetNumbers("FIRE ALARM FA1")[0]).toBe("FA1");
    // The labelled one beats a reference to another sheet.
    expect(extractSheetNumbers("SEE E-102 FOR RISER. SHEET: E-101")[0]).toBe("E101");
    expect(extractSheetNumbers("NO NUMBERS HERE")).toEqual([]);
  });

  it("matches pages by sheet number, floor name, then name similarity", () => {
    const sheets = [
      { id: "a", name: "E-101 First floor", pageNumber: 1, order: 0 },
      { id: "b", name: "2nd Fl", pageNumber: 2, order: 1 },
      { id: "c", name: "Garage lighting", pageNumber: 3, order: 2 },
    ];
    const pages = [
      { pageNumber: 1, text: "SECOND FLOOR PLAN SCALE 1/4\" = 1'-0\" SHEET E-102" },
      { pageNumber: 2, text: "FIRST FLOOR LIGHTING SHEET NO E-101 REV B" },
      { pageNumber: 3, text: "DETACHED GARAGE LIGHTING PLAN" },
      { pageNumber: 4, text: "RISER DIAGRAM SHEET E-501" },
    ];
    const m = matchPagesToSheets(pages, sheets);
    expect(m.map((x) => x.sheetId)).toEqual(["b", "a", "c", null]);
    expect(m[1].confidence).toBeGreaterThan(0.9);
    expect(m[0].confidence).toBeCloseTo(0.8);
    expect(m[3].sheetNumber).toBe("E501");
  });

  it("falls back to page order when a re-issue has the same page count, and uses each sheet once", () => {
    const sheets = [
      { id: "a", name: "Sheet 1", pageNumber: 1, order: 0 },
      { id: "b", name: "Sheet 2", pageNumber: 2, order: 1 },
    ];
    const m = matchPagesToSheets([{ pageNumber: 1, text: "" }, { pageNumber: 2, text: "" }], sheets);
    expect(m.map((x) => x.sheetId)).toEqual(["a", "b"]);
    const one = matchPagesToSheets([{ pageNumber: 1, text: "ATTIC PLAN" }, { pageNumber: 2, text: "ATTIC PLAN ENLARGED" }], [{ id: "x", name: "Attic", pageNumber: 1, order: 0 }]);
    expect(one.filter((x) => x.sheetId === "x")).toHaveLength(1);
  });
});

describe("2-point alignment", () => {
  const oldSize = { width: 3000, height: 2000 };

  it("recovers a shift (same size)", () => {
    const pairs: [[Pt, Pt], [Pt, Pt]] = [
      [[0.1, 0.1], [0.15, 0.12]],
      [[0.8, 0.7], [0.85, 0.72]],
    ];
    const T = similarityFromPairs(pairs, oldSize, oldSize)!;
    close(applyTransform(T, 0.5, 0.5), [0.55, 0.52]);
    close(T.slice(0, 4), [1, 0, 0, 1]);
  });

  it("round-trips a scaled and rotated drawing on a different page size", () => {
    const newSize = { width: 2400, height: 3600 }; // portrait, rotated 90° and shrunk
    // Ground truth in pixels: rotate 90° CW, scale 0.8, then shift.
    const truth = (x: number, y: number): Pt => {
      const px = x * oldSize.width;
      const py = y * oldSize.height;
      const s = 0.8;
      const nx = -s * py + 2000; // cos 90 = 0, sin 90 = 1
      const ny = s * px + 100;
      return [nx / newSize.width, ny / newSize.height];
    };
    const A: Pt = [0.2, 0.3];
    const B: Pt = [0.7, 0.9];
    const T = similarityFromPairs([[A, truth(...A)], [B, truth(...B)]], oldSize, newSize)!;
    for (const p of [[0.5, 0.5], [0, 0], [1, 1], [0.33, 0.66]] as Pt[]) close(applyTransform(T, ...p), truth(...p));
    expect(pixelScale(T, oldSize, newSize)).toBeCloseTo(0.8);
    const inv = invertTransform(T)!;
    close(applyTransform(inv, ...applyTransform(T, 0.42, 0.17)), [0.42, 0.17]);
    expect(isIdentity(composeTransforms(T, inv))).toBe(true);
    close(transformPoints(T, [0.5, 0.5, 0.33, 0.66]), [...truth(0.5, 0.5), ...truth(0.33, 0.66)]);
    // Pixel matrix for canvas drawing maps old pixels to new pixels.
    const M = toPixelMatrix(T, oldSize, newSize);
    const [x, y] = [0.5 * 3000, 0.5 * 2000];
    close([M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]], [truth(0.5, 0.5)[0] * 2400, truth(0.5, 0.5)[1] * 3600], 1e-6);
  });

  it("rejects two identical points", () => {
    expect(similarityFromPairs([[[0.5, 0.5], [0.5, 0.5]], [[0.5, 0.5], [0.6, 0.6]]], oldSize, oldSize)).toBeNull();
  });
});

describe("pushRevision", () => {
  it("swaps the image, keeps the row and the history, and keeps the scale for the same size", () => {
    const s = sheet();
    const { sheet: next, scale } = pushRevision(s, { imageId: "img-b", width: 3010, height: 2005, pxPerInch: 300 }, "Rev B", "me@x", "2026-11-20T00:00:00.000Z", "r1");
    expect(next.id).toBe(s.id);
    expect(next.imageId).toBe("img-b");
    expect(next.revisionLabel).toBe("Rev B");
    expect(scale).toBe("kept");
    expect(next.pxPerFt).toBe(24);
    expect(next.revisions).toHaveLength(1);
    expect(next.revisions![0]).toMatchObject({ id: "r1", label: "Original", imageId: "img-a", width: 3000, pxPerFt: 24, uploadedAt: ts, replacedAt: "2026-11-20T00:00:00.000Z", replacedBy: "me@x", transformToNext: null });
    expect(needsRecalibration(next)).toBe(false);
  });

  it("recomputes the scale from the paper scale for a PDF page of another size", () => {
    const { sheet: next, scale } = pushRevision(sheet(), { imageId: "img-b", width: 4500, height: 3000, pxPerInch: 450 }, "Rev B", null, ts);
    expect(scale).toBe("recomputed");
    expect(next.pxPerFt).toBeCloseTo(36);
    expect(next.scaleLabel).toBe("1/4\" = 1'-0\"");
  });

  it("clears the scale (recalibrate) for a photo of another size, or reads a printed one", () => {
    const { sheet: next, scale } = pushRevision(sheet(), { imageId: "img-b", width: 2000, height: 2000 }, "Rev B", null, ts);
    expect(scale).toBe("cleared");
    expect(next.pxPerFt).toBeNull();
    expect(needsRecalibration(next)).toBe(true);
    const printed = pushRevision(sheet({ pxPerFt: null, pxPerInch: null }), { imageId: "i", width: 100, height: 100, pxPerInch: 72, printedScale: { label: "1/8", inchesPerFoot: 0.125 } }, "", null, ts);
    expect(printed.scale).toBe("printed");
    expect(printed.sheet.pxPerFt).toBeCloseTo(9);
    expect(printed.sheet.revisionLabel).toBeNull();
  });

  it("leaves markers alone: counts are unchanged after a revision with the identity transform", () => {
    const data = buildSampleJob();
    const before = computeTakeoff(data);
    const sheets = data.sheets.map((s) => pushRevision(s, { imageId: `${s.id}-b`, width: s.width, height: s.height }, "Rev B", null, ts).sheet);
    const markers = data.markers.map((m) => carryRow(m as unknown as Record<string, unknown>, { xy: ["x", "y"] }, IDENTITY).row as unknown as typeof m);
    const runs = data.runs.map((r) => carryRow(r as unknown as Record<string, unknown>, { points: "points" }, IDENTITY).row as unknown as typeof r);
    expect(markers).toEqual(data.markers);
    const after = computeTakeoff({ ...data, sheets, markers, runs });
    expect(after.floors.map((f) => [f.name, f.counts, f.ledZones, f.ledTotalFt])).toEqual(before.floors.map((f) => [f.name, f.counts, f.ledZones, f.ledTotalFt]));
  });

  it("labels the next revision", () => {
    expect(nextRevisionLabel({ revisionLabel: null, revisions: [] })).toBe("Rev B");
    expect(nextRevisionLabel({ revisionLabel: "Rev C" })).toBe("Rev D");
    expect(nextRevisionLabel({ revisionLabel: "IFC Rev 2" })).toBe("IFC Rev 3");
    expect(nextRevisionLabel({ revisionLabel: "IFC 2026-11-20", revisions: [sheet() as never, sheet() as never] })).toBe("Rev D");
  });
});

describe("scale through an alignment", () => {
  const half: Affine = [0.5, 0, 0, 0.5, 0, 0]; // new drawing shows the plan at half size on the same page
  it("restores a reset scale from the previous drawing", () => {
    const { sheet: s } = pushRevision(sheet(), { imageId: "img-b", width: 1500, height: 1000 }, "Rev B", null, ts);
    expect(s.pxPerFt).toBeNull();
    expect(scaleAfterAlign(s, IDENTITY)).toBeCloseTo(12);
  });
  it("updates a scale kept from the previous drawing when the content was zoomed", () => {
    const { sheet: s } = pushRevision(sheet(), { imageId: "img-b", width: 3000, height: 2000 }, "Rev B", null, ts);
    expect(s.pxPerFt).toBe(24);
    expect(scaleAfterAlign(s, half)).toBeCloseTo(12);
    // A small tap error doesn't disturb it.
    expect(scaleAfterAlign(s, [1.004, 0, 0, 1.004, 0.01, 0])).toBeNull();
    // Re-aligning a link that already carried the scale follows the new alignment.
    const aligned: Sheet = { ...s, pxPerFt: 12, revisions: [{ ...s.revisions![0], transformToNext: half }] };
    expect(scaleAfterAlign(aligned, IDENTITY)).toBeCloseTo(24);
  });
  it("leaves a scale calibrated on the new drawing alone", () => {
    const { sheet: s } = pushRevision(sheet(), { imageId: "img-b", width: 3000, height: 2000 }, "Rev B", null, ts);
    expect(scaleAfterAlign({ ...s, pxPerFt: 30 }, half)).toBeNull();
    expect(scaleAfterAlign({ ...s, revisions: [] }, half)).toBeNull();
  });
});

describe("history chain and rollback", () => {
  const shiftB: Affine = [1, 0, 0, 1, 0.1, 0];
  const shiftC: Affine = [1, 0, 0, 1, 0, 0.2];
  function threeRevs() {
    let s = sheet();
    s = pushRevision(s, { imageId: "img-b", width: 3000, height: 2000 }, "Rev B", null, "2026-11-13T00:00:00.000Z", "ra").sheet;
    s = { ...s, revisions: [{ ...s.revisions![0], transformToNext: shiftB }] };
    s = pushRevision(s, { imageId: "img-c", width: 3000, height: 2000 }, "Rev C", null, "2026-11-14T00:00:00.000Z", "rb").sheet;
    s = { ...s, revisions: [{ ...s.revisions![0], transformToNext: shiftC }, ...s.revisions!.slice(1)] };
    return s;
  }

  it("composes transforms between any two drawings", () => {
    const s = threeRevs();
    expect(revisionChain(s).map((e) => e.label)).toEqual(["Rev C", "Rev B", "Original"]);
    expect(revisionChain(s)[1].since).toBe("2026-11-13T00:00:00.000Z");
    close(applyTransform(transformBetween(s, "ra", CURRENT)!, 0.5, 0.5), [0.6, 0.7]);
    close(applyTransform(transformBetween(s, CURRENT, "ra")!, 0.6, 0.7), [0.5, 0.5]);
    close(applyTransform(transformBetween(s, "rb", CURRENT)!, 0.5, 0.5), [0.5, 0.7]);
    expect(transformBetween(s, "nope", CURRENT)).toBeNull();
  });

  it("rolls back to an earlier drawing and keeps the newer one in history", () => {
    const s = threeRevs();
    const r = rollbackRevision(s, "ra", "me", "2026-11-15T00:00:00.000Z", "rc")!;
    expect(r.sheet.imageId).toBe("img-a");
    expect(r.sheet.revisionLabel).toBe("Original");
    expect(r.sheet.pxPerFt).toBe(24);
    expect(r.sheet.revisions!.map((x) => x.label)).toEqual(["Rev C", "Rev B"]);
    expect(r.sheet.revisions![0]).toMatchObject({ imageId: "img-c", replacedBy: "me", note: "Rolled back to Original" });
    // Markup moves from Rev C positions back to the original's.
    close(applyTransform(r.transform, 0.6, 0.7), [0.5, 0.5]);
    // The chain still resolves: Rev B → (Rev C) → Original is the inverse of the original shift into B.
    close(applyTransform(transformBetween(r.sheet, r.sheet.revisions![1].id, CURRENT)!, 0.6, 0.5), [0.5, 0.5]);
    expect(rollbackRevision(s, "missing")).toBeNull();
  });

  it("closes the gap when rolling back to a drawing in the middle", () => {
    const s = threeRevs();
    const r = rollbackRevision(s, "rb", null, "2026-11-15T00:00:00.000Z", "rc")!;
    expect(r.sheet.imageId).toBe("img-b");
    expect(r.sheet.revisions!.map((x) => x.label)).toEqual(["Rev C", "Original"]);
    // Original now links straight to Rev C (shift B then shift C).
    close(applyTransform(r.sheet.revisions![1].transformToNext!, 0.5, 0.5), [0.6, 0.7]);
    close(applyTransform(transformBetween(r.sheet, r.sheet.revisions![1].id, CURRENT)!, 0.5, 0.5), [0.6, 0.5]);
  });

  it("notes a drawing changed after the estimate", () => {
    const s = threeRevs();
    expect(changedSinceEstimate(s, [{ updatedAt: "2026-11-13T12:00:00.000Z" }])).toBe(true);
    expect(changedSinceEstimate(s, [{ updatedAt: "2026-11-14T12:00:00.000Z" }])).toBe(false);
    expect(changedSinceEstimate(s, [])).toBe(false);
    expect(changedSinceEstimate(sheet(), [{ updatedAt: ts }])).toBe(false);
  });
});

describe("carrying markup", () => {
  it("clamps rows that fall off the new sheet and says so", () => {
    const T: Affine = [1, 0, 0, 1, 0.3, 0];
    const rows = [{ id: "1", x: 0.5, y: 0.5 }, { id: "2", x: 0.8, y: 0.5 }, { id: "3", x: 0.9, y: 0.1 }, { id: "4", x: 0.95, y: 0.9 }];
    const out = rows.map((r) => carryRow(r, { xy: ["x", "y"] }, T));
    expect(out.map((o) => o.row.x)).toEqual([0.8, 1, 1, 1]);
    const n = out.filter((o) => o.clamped).length;
    expect(n).toBe(3);
    expect(clampWarning({ devices: n })).toMatch(/^3 devices fell off the new sheet/);
    expect(clampWarning({ devices: 0 })).toBeNull();
    const run = carryRow({ id: "r", points: [0.1, 0.1, 0.9, 0.9] }, { points: "points" }, T);
    expect(run.row.points).toEqual([0.4, 0.1, 1, 0.9]);
    expect(run.clamped).toBe(true);
    // Rows without the fields (closets without x/y, photos) pass through.
    expect(carryRow({ id: "p" }, { xy: ["x", "y"] }, T)).toMatchObject({ changed: false, clamped: false });
  });

  it("has built-ins and lets other features register", () => {
    expect(revisionCarries().map((c) => c.table)).toEqual(expect.arrayContaining(["markers", "runs", "closets", "photos"]));
    registerRevisionCarry("planMarkups", { points: "points" });
    registerRevisionCarry("planMarkups", { points: "points" });
    expect(revisionCarries().filter((c) => c.table === "planMarkups")).toHaveLength(1);
  });

  it("syncs the revision fields", () => {
    expect(TABLES.sheets.columns).toMatchObject({ revisionLabel: "revision_label", revisions: "revisions" });
  });
});
