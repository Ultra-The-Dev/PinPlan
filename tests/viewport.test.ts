import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, activeFilterCount, layerCounts, markerVisibility, normalizeFilters, runVisibility } from "@/lib/planFilter";
import { MOUSE_HIT, TOUCH_HIT, distToSegment, hitTestPlan } from "@/lib/planHit";
import {
  centerOn,
  chooseLevel,
  clampTransform,
  decayVelocity,
  fitTransform,
  fromMemory,
  lerpTransform,
  markerSizeFactor,
  parentTile,
  pinchTransform,
  pyramidInfo,
  relToScreen,
  releaseVelocity,
  screenToRel,
  screenToSheetPx,
  sheetPxToScreen,
  tileSourceRect,
  toMemory,
  visibleSheetRect,
  visibleTiles,
  zoomAbout,
  zoomLimits,
  zoomTo,
} from "@/lib/viewport";

const view = { w: 1000, h: 800 };
const sheet = { width: 8000, height: 6000 };
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("coordinate conversions", () => {
  const t = { scale: 0.25, x: 40, y: -12 };
  it("sheet px ↔ screen round-trips", () => {
    const p = { x: 1234, y: 567 };
    const s = sheetPxToScreen(t, p);
    expect(s).toEqual({ x: 1234 * 0.25 + 40, y: 567 * 0.25 - 12 });
    const back = screenToSheetPx(t, s);
    close(back.x, p.x);
    close(back.y, p.y);
  });
  it("relative (0–1) ↔ screen round-trips", () => {
    const r = { x: 0.3, y: 0.85 };
    const s = relToScreen(t, sheet, r);
    expect(s.x).toBeCloseTo(0.3 * 8000 * 0.25 + 40);
    const back = screenToRel(t, sheet, s);
    close(back.x, r.x);
    close(back.y, r.y);
  });
  it("visible rectangle is the view in sheet px", () => {
    expect(visibleSheetRect({ scale: 0.5, x: -100, y: -40 }, view)).toEqual({ x: 200, y: 80, w: 2000, h: 1600 });
  });
});

describe("fit, limits, clamping", () => {
  it("fits the whole sheet with a margin, centred", () => {
    const t = fitTransform(view, sheet, "sheet", 16);
    close(t.scale, Math.min(968 / 8000, 768 / 6000));
    // Centred horizontally and vertically.
    close(t.x * 2 + sheet.width * t.scale, view.w);
    close(t.y * 2 + sheet.height * t.scale, view.h);
  });
  it("fit width fills the width and starts a tall sheet at the top", () => {
    const tall = { width: 2000, height: 9000 };
    const t = fitTransform(view, tall, "width", 16);
    close(t.scale, 968 / 2000);
    expect(t.y).toBe(16);
  });
  it("limits: half of fit to at least 4 screen px per image px", () => {
    const l = zoomLimits(view, sheet);
    close(l.min, l.fit * 0.5);
    expect(l.max).toBe(4);
    // A small photo can zoom to 8× its fit.
    const small = zoomLimits(view, { width: 200, height: 100 });
    expect(small.max).toBeCloseTo(small.fit * 8);
    expect(small.min).toBe(1);
  });
  it("keeps a sheet edge from passing the middle of the view", () => {
    const t = clampTransform({ scale: 1, x: 900, y: -99999 }, view, sheet);
    expect(t.x).toBe(500);
    expect(t.y).toBe(400 - 6000);
    const ok = { scale: 1, x: -100, y: -100 };
    expect(clampTransform(ok, view, sheet)).toBe(ok);
  });
});

describe("zoom", () => {
  it("zooming keeps the point under the cursor fixed", () => {
    const t = { scale: 0.2, x: 13, y: 7 };
    const p = { x: 420, y: 310 };
    const before = screenToSheetPx(t, p);
    const z = zoomAbout(t, p, 3);
    close(z.scale, 0.6);
    const after = screenToSheetPx(z, p);
    close(after.x, before.x);
    close(after.y, before.y);
  });
  it("clamps to the limits but still pivots on the point", () => {
    const z = zoomAbout({ scale: 1, x: 0, y: 0 }, { x: 100, y: 100 }, 100, { min: 0.1, max: 4 });
    expect(z.scale).toBe(4);
    expect(screenToSheetPx(z, { x: 100, y: 100 })).toEqual({ x: 100, y: 100 });
  });
  it("zoomTo sets an absolute scale", () => {
    expect(zoomTo({ scale: 0.5, x: 0, y: 0 }, 1, { x: 0, y: 0 }).scale).toBe(1);
  });
  it("pinch: scale by finger spread, follow the centre", () => {
    const t = { scale: 1, x: 0, y: 0 };
    const n = pinchTransform(t, { center: { x: 100, y: 100 }, dist: 100 }, { center: { x: 150, y: 120 }, dist: 200 });
    expect(n.scale).toBe(2);
    // The sheet point that was under the old centre is now under the new centre.
    expect(sheetPxToScreen(n, { x: 100, y: 100 })).toEqual({ x: 150, y: 120 });
  });
  it("animation interpolates scale geometrically and ends exactly", () => {
    const a = { scale: 0.25, x: 0, y: 0 };
    const b = { scale: 1, x: -500, y: -300 };
    expect(lerpTransform(a, b, 0, view)).toBe(a);
    expect(lerpTransform(a, b, 1, view)).toBe(b);
    close(lerpTransform(a, b, 0.5, view).scale, 0.5);
  });
  it("centerOn puts a sheet point in the middle", () => {
    const t = centerOn(view, { x: 4000, y: 3000 }, 0.5);
    expect(sheetPxToScreen(t, { x: 4000, y: 3000 })).toEqual({ x: 500, y: 400 });
  });
});

describe("momentum", () => {
  it("release velocity uses only the last 100 ms", () => {
    const v = releaseVelocity([
      { x: 0, y: 0, t: 0 },
      { x: 500, y: 0, t: 10 }, // old, ignored
      { x: 500, y: 0, t: 200 },
      { x: 600, y: 50, t: 250 },
    ]);
    close(v.x, 2);
    close(v.y, 1);
    expect(releaseVelocity([{ x: 0, y: 0, t: 0 }])).toEqual({ x: 0, y: 0 });
  });
  it("decays with friction", () => {
    const v = decayVelocity({ x: 1, y: -1 }, 325);
    close(v.x, Math.exp(-1));
    close(v.y, -Math.exp(-1));
  });
});

describe("per-sheet memory", () => {
  it("survives a different screen size", () => {
    const t = zoomAbout(fitTransform(view, sheet), { x: 300, y: 200 }, 3);
    const m = toMemory(t, view, sheet);
    close(m.zoom, 3);
    const other = { w: 390, h: 700 };
    const t2 = fromMemory(m, other, sheet);
    // Same zoom relative to fit, same sheet point in the middle.
    close(t2.scale / fitTransform(other, sheet).scale, 3, 1e-9);
    const c = screenToRel(t2, sheet, { x: 195, y: 350 });
    close(c.x, m.cx, 1e-9);
    close(c.y, m.cy, 1e-9);
  });
});

describe("marker size", () => {
  it("is a bit smaller at fit, 1 at about 2.6× fit, capped", () => {
    expect(markerSizeFactor(1, 1)).toBeCloseTo(0.86);
    expect(markerSizeFactor(0.25, 1)).toBe(0.72);
    expect(markerSizeFactor(64, 1)).toBe(1.15);
    expect(markerSizeFactor(2, 1)).toBeGreaterThan(markerSizeFactor(1, 1));
  });
});

describe("image pyramid", () => {
  it("small images are their own preview (no tiles)", () => {
    const p = pyramidInfo(1600, 1200);
    expect(p.previewScale).toBe(1);
    expect(p.levels).toEqual([]);
    expect(chooseLevel(p, 4, 2)).toBe(-1);
  });
  it("a 10000 px plan gets three tiled levels above a 2048 px preview", () => {
    const p = pyramidInfo(10000, 7000);
    expect(p.previewWidth).toBe(2048);
    expect(p.levels.map((l) => [l.level, l.width, l.cols, l.rows])).toEqual([
      [0, 10000, 20, 14],
      [1, 5000, 10, 7],
      [2, 2500, 5, 4],
    ]);
  });
  it("chooses the coarsest level that is still sharp", () => {
    const p = pyramidInfo(10000, 7000);
    expect(chooseLevel(p, 0.1, 1)).toBe(-1); // preview (0.2048) is enough
    expect(chooseLevel(p, 0.12, 2)).toBe(2); // 0.24 device px per image px → level ¼
    expect(chooseLevel(p, 0.3, 1)).toBe(1);
    expect(chooseLevel(p, 0.6, 1)).toBe(0);
    expect(chooseLevel(p, 8, 2)).toBe(0);
  });
  it("lists only on-screen tiles, centre first", () => {
    const p = pyramidInfo(10000, 7000);
    // Level 0 at 1:1, looking at image px 1000..2000 × 1000..1800.
    const t = { scale: 1, x: -1000, y: -1000 };
    const tiles = visibleTiles(p, 0, t, view);
    const cols = new Set(tiles.map((x) => x.col));
    const rows = new Set(tiles.map((x) => x.row));
    expect([...cols].sort()).toEqual([1, 2, 3]);
    expect([...rows].sort()).toEqual([1, 2, 3]);
    expect(tiles[0]).toMatchObject({ col: 2, row: 2 });
    expect(tiles[0]).toMatchObject({ x: 1024, y: 1024, w: 512, h: 512 });
    // A coarser level covers the same area with bigger tiles.
    const l1 = visibleTiles(p, 1, t, view);
    expect(l1.every((x) => x.w === 1024)).toBe(true);
    // Off the sheet: nothing.
    expect(visibleTiles(p, 0, { scale: 1, x: 5000, y: 5000 }, view)).toEqual([]);
  });
  it("edge tiles are cut short and have a parent", () => {
    const p = pyramidInfo(10000, 7000);
    expect(tileSourceRect(p, 0, 19, 13)).toEqual({ x: 9728, y: 6656, w: 272, h: 344 });
    expect(parentTile(p, { level: 0, col: 19, row: 13 })).toEqual({ level: 1, col: 9, row: 6 });
    expect(parentTile(p, { level: 2, col: 0, row: 0 })).toBeNull();
  });
});

describe("hit testing", () => {
  const S = { width: 1000, height: 1000 };
  const input = {
    markers: [
      { id: "a", x: 0.1, y: 0.1 },
      { id: "b", x: 0.12, y: 0.1 },
    ],
    closets: [{ id: "c", x: 0.5, y: 0.5 }],
    runs: [{ id: "r", points: [0.2, 0.8, 0.8, 0.8] }],
  };
  it("finds the nearest marker within the screen radius", () => {
    expect(hitTestPlan(input, S, { x: 118, y: 100 }, 1)).toEqual({ kind: "marker", id: "b" });
    expect(hitTestPlan(input, S, { x: 100, y: 100 }, 1)).toEqual({ kind: "marker", id: "a" });
    // Zoomed out, the same sheet distance is fewer screen px.
    expect(hitTestPlan(input, S, { x: 160, y: 100 }, 1)).toBeNull();
    expect(hitTestPlan(input, S, { x: 160, y: 100 }, 0.3)).toEqual({ kind: "marker", id: "b" });
  });
  it("closets, then run lines", () => {
    expect(hitTestPlan(input, S, { x: 510, y: 515 }, 1)).toEqual({ kind: "closet", id: "c" });
    expect(hitTestPlan(input, S, { x: 500, y: 806 }, 1)).toEqual({ kind: "run", id: "r" });
    expect(hitTestPlan(input, S, { x: 500, y: 830 }, 1, MOUSE_HIT)).toBeNull();
    expect(hitTestPlan(input, S, { x: 500, y: 812 }, 1, TOUCH_HIT)).toEqual({ kind: "run", id: "r" });
  });
  it("run handles win when shown", () => {
    const h = hitTestPlan({ ...input, handlesFor: input.runs[0] }, S, { x: 801, y: 799 }, 1);
    expect(h).toEqual({ kind: "handle", id: "r", index: 1 });
  });
  it("distance to a segment", () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
});

describe("layers & filters", () => {
  const m = { deviceTypeId: "cam", tentative: false, room: "Kitchen" };
  it("hidden layers hide, filters hide or fade", () => {
    expect(markerVisibility(m, "security", [], DEFAULT_FILTERS)).toBe("show");
    expect(markerVisibility(m, "security", ["security"], { ...DEFAULT_FILTERS, dim: true })).toBe("hide");
    expect(markerVisibility(m, "security", [], { ...DEFAULT_FILTERS, onlyType: "wap" })).toBe("hide");
    expect(markerVisibility(m, "security", [], { ...DEFAULT_FILTERS, onlyType: "wap", dim: true })).toBe("dim");
    expect(markerVisibility(m, "security", [], { ...DEFAULT_FILTERS, hiddenTypes: ["cam"] })).toBe("hide");
    expect(markerVisibility(m, "security", [], { ...DEFAULT_FILTERS, status: "tentative" })).toBe("hide");
    expect(markerVisibility({ ...m, tentative: true }, "security", [], { ...DEFAULT_FILTERS, status: "tentative" })).toBe("show");
    expect(markerVisibility(m, "security", [], { ...DEFAULT_FILTERS, rooms: ["Garage"] })).toBe("hide");
    expect(markerVisibility(m, "security", [], { ...DEFAULT_FILTERS, rooms: ["Kitchen"] })).toBe("show");
  });
  it("wire runs follow their device; LED runs their own type", () => {
    const wire = { kind: "wire" as const, deviceTypeId: null, tentative: false, markerId: "m1" };
    expect(runVisibility(wire, ["wiring"], DEFAULT_FILTERS)).toBe("hide");
    expect(runVisibility(wire, [], DEFAULT_FILTERS, () => "show")).toBe("show");
    expect(runVisibility(wire, [], DEFAULT_FILTERS, () => "hide")).toBe("hide");
    expect(runVisibility(wire, [], { ...DEFAULT_FILTERS, dim: true }, () => "dim")).toBe("dim");
    const led = { kind: "led" as const, deviceTypeId: "led-strip", tentative: false, markerId: null };
    expect(runVisibility(led, ["lighting"], DEFAULT_FILTERS)).toBe("hide");
    expect(runVisibility(led, [], { ...DEFAULT_FILTERS, onlyType: "cam" })).toBe("hide");
  });
  it("counts per layer and active filters", () => {
    const counts = layerCounts([{ deviceTypeId: "cam" }, { deviceTypeId: "cam" }, { deviceTypeId: "wap" }], [{ kind: "wire" }, { kind: "led" }], (id) => (id === "cam" ? "security" : "network"));
    expect(counts).toEqual({ security: 2, network: 1, wiring: 1, lighting: 1 });
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, status: "firm", rooms: ["A"] })).toBe(2);
  });
  it("normalizes stored filters", () => {
    expect(normalizeFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(normalizeFilters({ status: "nope", closets: false, labels: true, hiddenTypes: ["x", 3] })).toEqual({ ...DEFAULT_FILTERS, closets: false, labels: true, hiddenTypes: ["x"] });
  });
});
