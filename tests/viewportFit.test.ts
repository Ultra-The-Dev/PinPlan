// Fitting a sheet clear of the plan's chrome (top bar, left rail): fitTransform's insets and PlanViewport's default.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_CHROME, leftRailFrame } from "@/lib/planOverlays";
import { LEFT_RAIL_FIT_WIDTH, PlanViewport, planFitInsets } from "@/lib/planViewport";
import { fitTransform, toMemory, zoomLimits, type ViewTransform } from "@/lib/viewport";

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const view = { w: 1000, h: 800 };
const sheet = { width: 8000, height: 6000 };
/** The sheet's on-screen box under a transform. */
const box = (t: ViewTransform, s = sheet) => ({ x: t.x, y: t.y, w: s.width * t.scale, h: s.height * t.scale });

describe("fitTransform with insets", () => {
  it("no insets (or all smaller than the margin) is the plain fit", () => {
    const plain = fitTransform(view, sheet, "sheet", 16);
    expect(fitTransform(view, sheet, "sheet", 16, {})).toEqual(plain);
    expect(fitTransform(view, sheet, "sheet", 16, { top: 4, left: 10, right: 0, bottom: 16 })).toEqual(plain);
    expect(fitTransform(view, { width: 2000, height: 9000 }, "width", 16, {})).toEqual(fitTransform(view, { width: 2000, height: 9000 }, "width", 16));
  });

  it("fits the sheet inside the free area and centres it there", () => {
    const ins = { top: 64, left: 140 };
    const t = fitTransform(view, sheet, "sheet", 16, ins);
    // Free area: x 140…984 (844 wide), y 64…784 (720 high).
    close(t.scale, Math.min(844 / 8000, 720 / 6000));
    const b = box(t);
    expect(b.x).toBeGreaterThanOrEqual(140 - 1e-9);
    expect(b.y).toBeGreaterThanOrEqual(64 - 1e-9);
    expect(b.x + b.w).toBeLessThanOrEqual(984 + 1e-9);
    expect(b.y + b.h).toBeLessThanOrEqual(784 + 1e-9);
    close(b.x - 140, 984 - (b.x + b.w));
    close(b.y - 64, 784 - (b.y + b.h));
  });

  it("each side keeps at least the margin", () => {
    const t = fitTransform(view, sheet, "sheet", 30, { left: 100 });
    // Width-limited: 1000 - 100 - 30 = 870 wide.
    close(t.scale, Math.min(870 / 8000, 740 / 6000));
    const b = box(t);
    expect(b.x).toBeGreaterThanOrEqual(100 - 1e-9);
    expect(b.y).toBeGreaterThanOrEqual(30 - 1e-9);
  });

  it("fit width fills the free width; a tall sheet starts under the top inset", () => {
    const tall = { width: 2000, height: 9000 };
    const t = fitTransform(view, tall, "width", 16, { top: 64, left: 140 });
    close(t.scale, (1000 - 140 - 16) / 2000);
    close(t.x, 140);
    expect(t.y).toBe(64);
    // A wide, short sheet is centred vertically in the free area.
    const wide = { width: 8000, height: 1000 };
    const w = fitTransform(view, wide, "width", 16, { top: 64, left: 140 });
    close(w.y - 64, 784 - (w.y + 1000 * w.scale));
  });

  it("insets larger than the view still give a positive scale", () => {
    const t = fitTransform({ w: 100, h: 100 }, sheet, "sheet", 16, { left: 200, top: 200 });
    expect(t.scale).toBeGreaterThan(0);
    expect(Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
  });

  it("zoom limits and view memory still use the plain fit", () => {
    expect(zoomLimits(view, sheet).fit).toBe(fitTransform(view, sheet).scale);
    const fitted = fitTransform(view, sheet, "sheet", 16, { top: 64, left: 140 });
    expect(toMemory(fitted, view, sheet).zoom).toBeCloseTo(fitted.scale / fitTransform(view, sheet).scale);
  });
});

describe("default plan insets", () => {
  it("wide plans keep the top bar and the left rail clear", () => {
    const ins = planFitInsets({ w: 1110, h: 700 });
    const rail = leftRailFrame(1110, 700);
    expect(ins.top).toBeGreaterThanOrEqual(PLAN_CHROME.gutter.wide + PLAN_CHROME.topBarHeight);
    expect(ins.top!).toBeLessThanOrEqual(rail.y);
    expect(ins.left).toBeGreaterThanOrEqual(rail.x + LEFT_RAIL_FIT_WIDTH);
  });
  it("phones keep only the top bar clear", () => {
    const ins = planFitInsets({ w: 390, h: 700 });
    expect(ins.left).toBeUndefined();
    expect(ins.top).toBeGreaterThan(0);
  });
});

describe("PlanViewport fit", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  // 1366 px window with the device menu open (256 px): the plan view is about 1110 × 700.
  const size = { w: 1110, h: 700 };
  const wideSheet = { width: 10800, height: 4800 }; // 36″ × 16″ at 300 dpi: width-limited at this size
  const railRight = PLAN_CHROME.gutter.wide + LEFT_RAIL_FIT_WIDTH;

  it("the first view of a sheet starts right of the left rail and under the top bar", () => {
    const vp = new PlanViewport();
    vp.setSize(size);
    vp.setSheet(wideSheet);
    const b = box(vp.transform, wideSheet);
    expect(b.x).toBeGreaterThanOrEqual(railRight);
    expect(b.y).toBeGreaterThanOrEqual(PLAN_CHROME.gutter.wide + PLAN_CHROME.topBarHeight);
    expect(b.x + b.w).toBeLessThanOrEqual(size.w);
    // The plain fit would have put it under the rail.
    expect(fitTransform(size, wideSheet).x).toBeLessThan(railRight);
  });

  it("fit() uses the same insets; setFitInsets overrides and null restores", () => {
    const vp = new PlanViewport();
    vp.setSize(size);
    vp.setSheet(wideSheet);
    const first = vp.transform;
    vp.zoomAt({ x: 500, y: 300 }, 2);
    vp.fit("sheet", false);
    expect(vp.transform).toEqual(first);
    vp.setFitInsets({});
    vp.fit("sheet", false);
    expect(vp.transform).toEqual(fitTransform(size, wideSheet));
    vp.setFitInsets((s) => ({ left: s.w / 4 }));
    expect(vp.fitted().x).toBeGreaterThanOrEqual(size.w / 4);
    vp.setFitInsets(null);
    expect(vp.fitted()).toEqual(first);
  });

  it("zoom limits are unchanged by the insets", () => {
    const vp = new PlanViewport();
    vp.setSize(size);
    vp.setSheet(wideSheet);
    expect(vp.limits).toEqual(zoomLimits(size, wideSheet));
  });
});
