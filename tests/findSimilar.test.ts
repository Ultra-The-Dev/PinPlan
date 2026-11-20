import { describe, expect, it } from "vitest";
import {
  boxFromCorners,
  chooseScale,
  clampBox,
  distinctOrientations,
  grayStd,
  inkBounds,
  MAX_WORK_SIDE,
  MIN_TEMPLATE_PX,
  nonMaxSuppress,
  ORIENTATIONS,
  orientGray,
  orientedSize,
  peakToCandidate,
  scorePeaks,
  tapBox,
  thresholdFor,
  withoutExisting,
} from "@/lib/findSimilar/match";
import { defaultTagPrefixes, findTags, parsePrefixes, scheduleTags, tagPattern } from "@/lib/findSimilar/tags";
import type { TextItem } from "@/lib/sheetIndex";

// A 3 × 2 image:   1 2 3
//                  4 5 6
const IMG = [1, 2, 3, 4, 5, 6];
const rows = (g: { data: Uint8Array; w: number }) => Array.from({ length: g.data.length / g.w }, (_, r) => Array.from(g.data.slice(r * g.w, r * g.w + g.w)));

describe("rotation and mirror", () => {
  it("has eight orientations: four turns, plain and mirrored", () => {
    expect(ORIENTATIONS).toHaveLength(8);
    expect(new Set(ORIENTATIONS.map((o) => `${o.rot}${o.flip}`)).size).toBe(8);
  });

  it("turns clockwise and swaps the sides at 90 / 270", () => {
    expect(rows(orientGray(IMG, 3, 2, { rot: 0, flip: false }))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(rows(orientGray(IMG, 3, 2, { rot: 90, flip: false }))).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ]);
    expect(rows(orientGray(IMG, 3, 2, { rot: 180, flip: false }))).toEqual([
      [6, 5, 4],
      [3, 2, 1],
    ]);
    expect(rows(orientGray(IMG, 3, 2, { rot: 270, flip: false }))).toEqual([
      [3, 6],
      [2, 5],
      [1, 4],
    ]);
    expect(orientedSize(3, 2, { rot: 90, flip: true })).toEqual({ w: 2, h: 3 });
  });

  it("mirrors left↔right before turning", () => {
    expect(rows(orientGray(IMG, 3, 2, { rot: 0, flip: true }))).toEqual([
      [3, 2, 1],
      [6, 5, 4],
    ]);
    expect(rows(orientGray(IMG, 3, 2, { rot: 90, flip: true }))).toEqual([
      [6, 3],
      [5, 2],
      [4, 1],
    ]);
  });

  it("four quarter turns come back to the start", () => {
    let g: { data: Uint8Array; w: number; h: number } = { data: Uint8Array.from(IMG), w: 3, h: 2 };
    for (let i = 0; i < 4; i++) g = orientGray(g.data, g.w, g.h, { rot: 90, flip: false });
    expect(Array.from(g.data)).toEqual(IMG);
  });

  it("searches a symmetric symbol once, an asymmetric one (a door swing) in all eight ways", () => {
    const square = [0, 0, 0, 0];
    expect(distinctOrientations(square, 2, 2)).toHaveLength(1);
    // An L (door leaf + swing corner): no symmetry.
    const L = [0, 255, 255, 0, 255, 255, 0, 0, 9];
    expect(distinctOrientations(L, 3, 3)).toHaveLength(8);
    // Mirror symmetric only (left↔right): four.
    const T = [0, 0, 0, 255, 0, 255, 255, 0, 255];
    expect(distinctOrientations(T, 3, 3)).toHaveLength(4);
  });
});

describe("peaks and non-max suppression", () => {
  it("finds local maxima above the threshold, best first", () => {
    // 5 × 3 score map with two peaks.
    const s = [
      0.1, 0.2, 0.1, 0.0, 0.0, //
      0.2, 0.9, 0.3, 0.6, 0.7, //
      0.1, 0.2, 0.1, 0.5, 0.6,
    ];
    expect(scorePeaks(s, 5, 3, 0.5, 1)).toEqual([
      { x: 1, y: 1, score: 0.9 },
      { x: 4, y: 1, score: 0.7 },
    ]);
    expect(scorePeaks(s, 5, 3, 0.8, 1)).toEqual([{ x: 1, y: 1, score: 0.9 }]);
  });

  it("gives one peak for a flat top", () => {
    const s = [0.8, 0.8, 0.8, 0.8];
    expect(scorePeaks(s, 4, 1, 0.5, 1)).toHaveLength(1);
  });

  it("keeps the best of overlapping candidates and every far one", () => {
    const c = [
      { cx: 100, cy: 100, score: 0.8 },
      { cx: 104, cy: 102, score: 0.95 },
      { cx: 300, cy: 100, score: 0.6 },
      { cx: 309, cy: 100, score: 0.7 },
      { cx: 500, cy: 500, score: 0.5 },
    ];
    const kept = nonMaxSuppress(c, 10);
    expect(kept.map((k) => k.score)).toEqual([0.95, 0.7, 0.5]);
  });

  it("filtering by a higher threshold after NMS equals NMS on the filtered list (the slider)", () => {
    const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const c = Array.from({ length: 300 }, (_, i) => ({ cx: rnd(i) * 400, cy: rnd(i + 999) * 400, score: 0.45 + 0.5 * rnd(i + 5000) }));
    for (const t of [0.5, 0.7, 0.85]) {
      const a = nonMaxSuppress(c, 15).filter((k) => k.score >= t);
      const b = nonMaxSuppress(
        c.filter((k) => k.score >= t),
        15,
      );
      expect(a).toEqual(b);
    }
  });

  it("maps a peak (top-left, work px) to a centre in sheet px", () => {
    const c = peakToCandidate({ x: 10, y: 20, score: 0.9 }, { w: 30, h: 20 }, 0.5, { rot: 90, flip: false });
    expect(c).toMatchObject({ cx: 50, cy: 60, w: 60, h: 40, score: 0.9 });
  });
});

describe("boxes and scale", () => {
  it("slider 0–100 maps to a threshold, higher finds more", () => {
    expect(thresholdFor(50)).toBe(0.7);
    expect(thresholdFor(0)).toBe(0.95);
    expect(thresholdFor(100)).toBe(0.45);
    expect(thresholdFor(80)).toBeLessThan(thresholdFor(20));
  });

  it("shrinks the sheet so the symbol is ~32 px, never enlarging, and caps the sheet size", () => {
    expect(chooseScale({ w: 128, h: 96 }, { width: 4000, height: 3000 })).toBeCloseTo(32 / 96);
    expect(chooseScale({ w: 20, h: 20 }, { width: 1000, height: 800 })).toBe(1);
    const s = chooseScale({ w: 400, h: 400 }, { width: 40000, height: 30000 })!;
    expect(40000 * s).toBeLessThanOrEqual(MAX_WORK_SIDE + 1);
    expect(chooseScale({ w: 5, h: 50 }, { width: 1000, height: 800 })).toBeNull();
    expect(chooseScale({ w: 0, h: 50 }, { width: 1000, height: 800 })).toBeNull();
    // Big sheet, small symbol: the template stays matchable (at least MIN_TEMPLATE_PX).
    const t = chooseScale({ w: 40, h: 40 }, { width: 20000, height: 20000 })!;
    expect(40 * t).toBeGreaterThanOrEqual(MIN_TEMPLATE_PX - 0.01);
  });

  it("a tap picks a door-sized square (4 ft with a scale), kept on the sheet", () => {
    expect(tapBox({ x: 500, y: 500 }, { width: 2000, height: 1000, pxPerFt: 20 })).toEqual({ x: 460, y: 460, w: 80, h: 80 });
    expect(tapBox({ x: 5, y: 5 }, { width: 2000, height: 1000 })).toEqual({ x: 0, y: 0, w: 30, h: 30 });
    expect(clampBox({ x: 1990, y: 990, w: 30, h: 30 }, { width: 2000, height: 1000 })).toEqual({ x: 1970, y: 970, w: 30, h: 30 });
    expect(boxFromCorners({ x: 5, y: 1 }, { x: 2, y: 4 })).toEqual({ x: 2, y: 1, w: 3, h: 3 });
  });

  it("trims a crop to its ink and spots blank paper", () => {
    const w = 6;
    const h = 5;
    const g = new Array(w * h).fill(255);
    g[2 * w + 3] = 0;
    g[3 * w + 4] = 0;
    expect(inkBounds(g, w, h, 160, 0)).toEqual({ x: 3, y: 2, w: 2, h: 2 });
    expect(inkBounds(g, w, h, 160, 1)).toEqual({ x: 2, y: 1, w: 4, h: 4 });
    expect(inkBounds(new Array(9).fill(255), 3, 3)).toBeNull();
    expect(grayStd(new Array(9).fill(255))).toBe(0);
    expect(grayStd(g)).toBeGreaterThan(20);
  });
});

describe("de-duplication against placed devices", () => {
  const sheet = { sheetId: "s1", deviceTypeId: "door", width: 1000, height: 500, radiusPx: 20 };
  const finds = [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.5 },
    { x: 0.9, y: 0.9 },
  ];
  it("hides finds on a device of the same type on the same sheet", () => {
    const markers = [
      { x: 0.105, y: 0.1, deviceTypeId: "door", sheetId: "s1" }, // 5 px away: hides
      { x: 0.5, y: 0.5, deviceTypeId: "window", sheetId: "s1" }, // other type: keeps
      { x: 0.9, y: 0.9, deviceTypeId: "door", sheetId: "s2" }, // other sheet: keeps
    ];
    expect(withoutExisting(finds, markers, sheet)).toEqual([finds[1], finds[2]]);
  });
  it("ignores deleted devices and measures in sheet px (not 0–1)", () => {
    expect(withoutExisting(finds, [{ x: 0.1, y: 0.1, deviceTypeId: "door", sheetId: "s1", deleted: true }], sheet)).toHaveLength(3);
    // 0.03 across = 30 px > 20; 0.03 down = 15 px < 20.
    expect(withoutExisting([{ x: 0.13, y: 0.1 }], [{ x: 0.1, y: 0.1, deviceTypeId: "door", sheetId: "s1" }], sheet)).toHaveLength(1);
    expect(withoutExisting([{ x: 0.1, y: 0.13 }], [{ x: 0.1, y: 0.1, deviceTypeId: "door", sheetId: "s1" }], sheet)).toHaveLength(0);
  });
});

describe("Read tags", () => {
  const item = (str: string, x: number, y: number, w = 0.02, h = 0.01): TextItem => ({ str, x, y, w, h });

  it("defaults by device type name", () => {
    expect(defaultTagPrefixes("Door contact")).toBe("D, DR");
    expect(defaultTagPrefixes("Window sensor")).toBe("W, WD, WIN");
    expect(defaultTagPrefixes("Smoke detector")).toBe("");
    // "Indoor" is not a door.
    expect(defaultTagPrefixes("Indoor camera")).toBe("");
    expect(defaultTagPrefixes("Doors")).toBe("D, DR");
  });

  it("parses prefixes and builds a whole-word pattern", () => {
    expect(parsePrefixes(" d, dr;W  wd ")).toEqual(["DR", "WD", "D", "W"]);
    expect(parsePrefixes("")).toEqual([]);
    const re = tagPattern(parsePrefixes("D, DR"))!;
    for (const ok of ["D1", "D-12", "D.3", "DR4", "D101A"]) expect(re.test(ok)).toBe(true);
    for (const no of ["D", "DOOR", "D1234", "AD1", "D1-2", "W3", "DD1"]) expect(re.test(no)).toBe(false);
    const w = tagPattern(parsePrefixes("W, WD"))!;
    expect(["W3", "WD2", "W-14B"].every((t) => w.test(t))).toBe(true);
    expect(tagPattern([])).toBeNull();
  });

  it("finds tags with their centres, inside longer text runs and punctuation", () => {
    const items = [item("D1", 0.1, 0.2), item("(D-12)", 0.5, 0.5, 0.06), item("KITCHEN", 0.3, 0.3, 0.1), item("SEE D3, W4", 0.6, 0.7, 0.1)];
    const tags = findTags(items, parsePrefixes("D"));
    expect(tags.map((t) => t.tag)).toEqual(["D1", "D-12", "D3"]);
    expect(tags[0].x).toBeCloseTo(0.11);
    expect(tags[0].y).toBeCloseTo(0.205);
    // "SEE D3, W4" is 10 characters: D3, starts at index 4.
    expect(tags[2].x).toBeCloseTo(0.6 + 0.1 * (4 / 10) + (0.1 * (3 / 10)) / 2);
    expect(findTags(items, parsePrefixes("W")).map((t) => t.tag)).toEqual(["W4"]);
  });

  it("counts a tag drawn twice on the same spot once, but the same tag elsewhere again", () => {
    const items = [item("D1", 0.1, 0.2), item("D1", 0.1005, 0.2), item("D1", 0.6, 0.2)];
    expect(findTags(items, ["D"])).toHaveLength(2);
  });

  it("skips a schedule (a column of four or more tags) but keeps tags on the plan", () => {
    const sched = [0, 1, 2, 3, 4].map((i) => item(`D${i + 1}`, 0.85, 0.1 + i * 0.015));
    const plan = [item("D1", 0.2, 0.3), item("D2", 0.4, 0.6), item("D3", 0.2, 0.31 + 0.2)];
    const tags = findTags([...sched, ...plan], ["D"]);
    expect(tags).toHaveLength(3);
    expect(tags.every((t) => t.x < 0.5)).toBe(true);
    expect(findTags([...sched, ...plan], ["D"], { skipSchedules: false })).toHaveLength(8);
    // Three in a column is not a schedule; four spread far apart isn't either.
    expect(scheduleTags([0, 1, 2].map((i) => ({ tag: `D${i}`, x: 0.5, y: 0.1 + i * 0.01 }))).size).toBe(0);
    expect(scheduleTags([0, 1, 2, 3].map((i) => ({ tag: `D${i}`, x: 0.5, y: 0.1 + i * 0.2 }))).size).toBe(0);
  });
});
