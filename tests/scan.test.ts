import { describe, expect, it } from "vitest";
import { parseScanResult, prettyFloorName } from "@/lib/scanParse";

const ids = ["cam-indoor", "speaker", "wap"];

describe("parseScanResult", () => {
  it("keeps valid items and clamps positions and confidences", () => {
    const r = parseScanResult(
      {
        floorName: " ATTIC ",
        ledCallouts: [{ zone: 3, lf: "24", switchLabel: "S21", x: 1.4, y: -0.2, confidence: 2 }],
        symbols: [
          { deviceTypeId: "speaker", symbolText: "S", x: 0.5, y: 0.25, confidence: 0.9, tentative: true },
          { deviceTypeId: "made-up", symbolText: "Q", x: 50, y: 20, confidence: 0.3, tentative: false },
        ],
      },
      ids,
    );
    expect(r.floorName).toBe("ATTIC");
    expect(r.ledCallouts[0]).toEqual({ zone: "3", lf: 24, switchLabel: "S21", x: 1, y: 0, confidence: 1 });
    expect(r.symbols[0]).toMatchObject({ deviceTypeId: "speaker", tentative: true, x: 0.5 });
    // unknown id -> null; 0-100 positions rescaled
    expect(r.symbols[1]).toMatchObject({ deviceTypeId: null, x: 0.5, y: 0.2 });
  });

  it("drops items without a position and tolerates junk", () => {
    const r = parseScanResult({ floorName: 7, ledCallouts: "no", symbols: [null, { x: "a", y: 0.1 }, { x: 0.1, y: 0.2 }] }, ids);
    expect(r.ledCallouts).toEqual([]);
    expect(r.symbols).toHaveLength(1);
    expect(r.symbols[0]).toMatchObject({ deviceTypeId: null, confidence: 0.5, tentative: false });
  });

  it("parses fenced JSON text and rejects non-objects", () => {
    expect(parseScanResult('```json\n{"floorName":"CELLAR","ledCallouts":[],"symbols":[]}\n```', ids).floorName).toBe("CELLAR");
    expect(() => parseScanResult("not json", ids)).toThrow();
  });

  it("rejects negative or absurd LF values", () => {
    const r = parseScanResult({ ledCallouts: [{ x: 0.1, y: 0.1, lf: -5 }, { x: 0.1, y: 0.1, lf: 1e9 }] }, ids);
    expect(r.ledCallouts.map((c) => c.lf)).toEqual([null, null]);
  });

  it("prettifies title-block names", () => {
    expect(prettyFloorName("1ST. FL")).toBe("1st Fl");
    expect(prettyFloorName("ATTIC")).toBe("Attic");
    expect(prettyFloorName("2ND FLOOR")).toBe("2nd Floor");
  });
});
