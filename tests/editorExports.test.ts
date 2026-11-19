import { describe, expect, it } from "vitest";
import { MIN_CALIBRATION_PX, offsetPolyline, polylineMidpoint, polylinePx } from "@/lib/geometry";
import { guessFloorName } from "@/lib/importPlans";
import { nextLabel } from "@/lib/labels";

describe("nextLabel", () => {
  it("never reuses a label that sits on another sheet after the sheets are reordered", () => {
    // Sheet b was floor 1 when CAM-1-01..02 were placed; now a is first, so a is floor 1.
    const sheets = [{ id: "a", order: 0 }, { id: "b", order: 1 }];
    const markers = [{ sheetId: "b", label: "CAM-1-01" }, { sheetId: "b", label: "CAM-1-02" }];
    expect(nextLabel({ abbrev: "CAM" }, sheets[0], sheets, markers)).toBe("CAM-1-03");
  });

  it("reads the number from suffixed labels and ignores other abbreviations", () => {
    const sheets = [{ id: "a", order: 0 }];
    const markers = [{ sheetId: "a", label: "CAM-1-07-A" }, { sheetId: "a", label: "WCAM-1-20" }, { sheetId: "a", label: "CAM-1-xx" }];
    expect(nextLabel({ abbrev: "CAM" }, sheets[0], sheets, markers)).toBe("CAM-1-08");
  });
});

describe("polylineMidpoint", () => {
  it("lies on an L-shaped run, not between its ends", () => {
    // 0,0 → 10,0 → 10,10: halfway along is the corner; the chord midpoint (5,5) is off the line.
    expect(polylineMidpoint([0, 0, 10, 0, 10, 10])).toEqual({ x: 10, y: 0 });
    expect(polylineMidpoint([0, 0, 4, 0])).toEqual({ x: 2, y: 0 });
  });

  it("handles degenerate input", () => {
    expect(polylineMidpoint([3, 4])).toEqual({ x: 3, y: 4 });
    expect(polylineMidpoint([3, 4, 3, 4])).toEqual({ x: 3, y: 4 });
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 });
  });
});

describe("offsetPolyline", () => {
  const distToLine = (p: [number, number], a: [number, number], b: [number, number]) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
  };

  it("keeps bundle strands the full offset away from both legs at a right-angle bend", () => {
    const out = offsetPolyline([0, 0, 10, 0, 10, 10], 2);
    const corner: [number, number] = [out[2], out[3]];
    expect(distToLine(corner, [0, 0], [10, 0])).toBeCloseTo(2);
    expect(distToLine(corner, [10, 0], [10, 10])).toBeCloseTo(2);
    // Straight runs are a plain shift.
    expect(offsetPolyline([0, 0, 5, 0, 10, 0], 1)).toEqual([0, 1, 5, 1, 10, 1]);
  });

  it("does not blow up when the path doubles back", () => {
    const out = offsetPolyline([0, 0, 10, 0, 0, 0], 1);
    expect(out.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(out[2] - 10, out[3])).toBeCloseTo(1);
  });

  it("caps very sharp bends", () => {
    const out = offsetPolyline([0, 0, 10, 0, 0, 0.5], 1);
    expect(Math.hypot(out[2] - 10, out[3])).toBeLessThanOrEqual(4 + 1e-9);
  });
});

describe("calibration", () => {
  it("a line tapped twice on the same spot is too short to calibrate", () => {
    expect(polylinePx([0.5, 0.5, 0.5, 0.5], 3000, 2000)).toBeLessThan(MIN_CALIBRATION_PX);
    expect(polylinePx([0.1, 0.5, 0.4, 0.5], 3000, 2000)).toBeGreaterThan(MIN_CALIBRATION_PX);
  });
});

describe("guessFloorName", () => {
  it("prefers the sheet title over a passing mention in the notes", () => {
    expect(guessFloorName("NOTES: PROVIDE ATTIC ACCESS HATCH. 2ND FLOOR PLAN SCALE 1/4\" = 1'-0\"", "Sheet 1")).toBe("2nd Fl");
    expect(guessFloorName("STAIR DOWN TO BASEMENT FIRST FLOOR PLAN", "Sheet 1")).toBe("1st Fl");
    expect(guessFloorName("BASEMENT FLOOR PLAN", "Sheet 1")).toBe("Basement");
    // A site plan that mentions the attic in its notes is still the site plan.
    expect(guessFloorName("NOTE: ATTIC VENTS BY OTHERS. SITE PLAN", "Sheet 1")).toBe("Site plan");
    expect(guessFloorName("ROOF PLAN. SEE BASEMENT FOR PANEL", "Sheet 1")).toBe("Roof");
  });

  it("falls back to any floor word, then the fallback", () => {
    expect(guessFloorName("A-101 ATTIC", "Sheet 1")).toBe("Attic");
    expect(guessFloorName("SITE PLAN", "Sheet 1")).toBe("Site plan");
    expect(guessFloorName("DETAILS", "Sheet 4")).toBe("Sheet 4");
  });
});
