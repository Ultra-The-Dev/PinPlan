import { describe, expect, it } from "vitest";
import { estimateHomeRunFt, parseFeet, parseScale, polylineFt, runLengthFt } from "@/lib/geometry";
import { nextLabel } from "@/lib/labels";

describe("geometry", () => {
  it("parses typed lengths", () => {
    expect(parseFeet("12")).toBe(12);
    expect(parseFeet("12'6\"")).toBe(12.5);
    expect(parseFeet("12' 6\"")).toBe(12.5);
    expect(parseFeet("12ft 6in")).toBe(12.5);
    expect(parseFeet("18\"")).toBe(1.5);
    expect(parseFeet("abc")).toBeNull();
  });

  it("parses plan scales into paper inches per foot", () => {
    expect(parseScale("1/4\" = 1'-0\"")).toBe(0.25);
    expect(parseScale("1/8\"=1'")).toBe(0.125);
    expect(parseScale("3/16 = 1")).toBeCloseTo(0.1875);
    expect(parseScale("1:48")).toBe(0.25);
  });

  it("measures polylines with the sheet scale", () => {
    const sheet = { width: 1000, height: 500, pxPerFt: 10 };
    expect(polylineFt([0, 0, 0.1, 0, 0.1, 0.2], sheet)).toBeCloseTo(20);
    expect(polylineFt([0, 0, 1, 0], { ...sheet, pxPerFt: null })).toBeNull();
  });

  it("computes stair LED as steps × LF per step, typed LF beats measured", () => {
    const base = { id: "r", projectId: "p", sheetId: "s", points: [], createdAt: "", updatedAt: "" };
    expect(runLengthFt({ ...base, kind: "stair", steps: 14, lfPerStep: 3.5 })).toBe(49);
    expect(runLengthFt({ ...base, kind: "led", measuredFt: 20, typedFt: 24 })).toBe(24);
    expect(runLengthFt({ ...base, kind: "led", measuredFt: 20 })).toBe(20);
  });

  it("estimates home runs on the same floor and across floors", () => {
    const sheets = [
      { id: "a", width: 1000, height: 1000, pxPerFt: 10, order: 0 },
      { id: "b", width: 1000, height: 1000, pxPerFt: 10, order: 1 },
    ];
    const pricing = { wireSlackPct: 10, wireDropFt: 10, floorHeightFt: 10 };
    // 30 ft + 40 ft = 70 ft, ×1.1 + 10 = 87
    expect(estimateHomeRunFt({ x: 0.1, y: 0.1, sheetId: "a" }, { x: 0.4, y: 0.5, sheetId: "a" }, sheets, pricing)).toBe(87);
    // + one floor (10 ft): 80 × 1.1 + 10 = 98
    expect(estimateHomeRunFt({ x: 0.1, y: 0.1, sheetId: "a" }, { x: 0.4, y: 0.5, sheetId: "b" }, sheets, pricing)).toBe(98);
  });

  it("auto-numbers labels per floor", () => {
    const sheets = [{ id: "a", order: 0 }, { id: "b", order: 1 }];
    const markers = [{ sheetId: "a", label: "CAM-1-01" }, { sheetId: "a", label: "CAM-1-02" }, { sheetId: "b", label: "CAM-2-01" }];
    expect(nextLabel({ abbrev: "CAM" }, sheets[0], sheets, markers)).toBe("CAM-1-03");
    expect(nextLabel({ abbrev: "CAM" }, sheets[1], sheets, markers)).toBe("CAM-2-02");
    expect(nextLabel({ abbrev: "WAP" }, sheets[1], sheets, markers)).toBe("WAP-2-01");
  });
});
