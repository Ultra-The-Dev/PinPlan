// The plan's chrome must not overlap at any width. Vitest runs in node (no layout engine), so this checks the layout on
// the same numbers the page uses (PLAN_CHROME / railStyle in src/lib/planOverlays.ts, applied by PlanRail.tsx), and
// checks in the sources that the three left-hand controls are rail slots with no positions of their own.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { boxesIntersect, leftRailFrame, PLAN_CHROME, railStyle, rightRailFrame, stackLeftRail, type Box } from "@/lib/planOverlays";

const src = (f: string) => readFileSync(path.resolve(__dirname, "..", f), "utf8");

/** Rough on-screen sizes of the left-hand controls (px), closed and open. */
function leftItems(viewW: number, open: boolean) {
  const phone = viewW <= PLAN_CHROME.phoneMax;
  return [
    // "Back to E-101 Lighting Plan, Level 2" — long sheet names truncate at the rail's width.
    { id: "link-back", w: 420, h: 40 },
    // Phones: an icon button (+ count); wider: "Measure" with its count and the totals button. Open on sm+: the strip.
    { id: "measure-open", w: open ? (phone ? 64 : 600) : phone ? 112 : 172, h: 44 },
    // Closed: the Progress button; open: the 340 px bar (options are a bottom sheet on phones).
    { id: "progress-toolbar", w: open ? 340 : 116, h: open ? (phone ? 52 : 180) : 40 },
    // The office's link tool button.
    { id: "link-tool", w: 44, h: 44 },
  ];
}

const VIEWS = [
  { w: 390, h: 844, label: "phone 390" },
  { w: 1280, h: 800, label: "desktop 1280" },
  { w: 768, h: 1024, label: "tablet 768" },
];

describe("plan chrome layout", () => {
  for (const v of VIEWS) {
    for (const open of [false, true]) {
      it(`${v.label}, controls ${open ? "open" : "closed"}: back, measure and progress don't intersect anything`, () => {
        const boxes = stackLeftRail(v.w, v.h, leftItems(v.w, open));
        const ids = Object.keys(boxes);
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++) expect(boxesIntersect(boxes[ids[i]], boxes[ids[j]]), `${ids[i]} × ${ids[j]}`).toBe(false);

        const right = rightRailFrame(v.w, v.h);
        const phone = v.w <= PLAN_CHROME.phoneMax;
        const topBar: Box = { x: 0, y: 0, w: v.w, h: (phone ? PLAN_CHROME.gutter.phone : PLAN_CHROME.gutter.wide) + PLAN_CHROME.topBarHeight };
        const bottom = phone ? PLAN_CHROME.bottomReserve.row : PLAN_CHROME.bottomReserve.wide;
        const bottomBar: Box = { x: 0, y: v.h - bottom, w: v.w, h: bottom };
        for (const id of ids) {
          const b = boxes[id];
          expect(boxesIntersect(b, right), `${id} × right rail`).toBe(false);
          expect(boxesIntersect(b, topBar), `${id} × top bar`).toBe(false);
          expect(boxesIntersect(b, bottomBar), `${id} × bottom controls`).toBe(false);
          expect(b.x + b.w).toBeLessThanOrEqual(v.w);
        }
      });
    }
  }

  it("phones cap the left rail at calc(100% - 4rem), leaving the right rail its column", () => {
    expect(railStyle("left", true, true).maxWidth).toBe("calc(100% - 64px)");
    const f = leftRailFrame(390, 844);
    expect(f.maxW).toBe(390 - 64);
    expect(f.x + f.maxW).toBeLessThanOrEqual(rightRailFrame(390, 844).x);
  });

  it("the CSS of the rails uses the model's numbers", () => {
    for (const phone of [true, false]) {
      const w = phone ? 390 : 1280;
      const l = railStyle("left", phone, phone);
      const r = railStyle("right", phone, phone);
      const lf = leftRailFrame(w, 800, phone);
      const rf = rightRailFrame(w, 800, phone);
      expect([l.top, l.left]).toEqual([lf.y, lf.x]);
      expect(l.maxWidth).toBe(`calc(100% - ${w - lf.maxW}px)`);
      expect(r.top).toBe(rf.y);
      expect(w - (r.right as number) - PLAN_CHROME.rightRailWidth).toBe(rf.x);
    }
  });
});

describe("left-hand controls are rail slots", () => {
  const cases = [
    { file: "src/components/sheetIndex/LinksControls.tsx", testId: "link-back", order: 10 },
    { file: "src/components/measure/MeasureOverlay.tsx", testId: null, order: 20 },
    { file: "src/components/progress/ProgressToolbar.tsx", testId: "progress-toolbar", order: 30 },
  ];
  for (const c of cases) {
    it(`${c.file}: RailSlot side="left" order={${c.order}}`, () => {
      expect(src(c.file)).toContain(`<RailSlot side="left" order={${c.order}}>`);
    });
  }

  it("link-back, measure-open and progress-toolbar carry no absolute position of their own", () => {
    const files = ["src/components/sheetIndex/LinksControls.tsx", "src/components/measure/MeasureToolbar.tsx", "src/components/progress/ProgressToolbar.tsx"];
    for (const id of ["link-back", "measure-open", "progress-toolbar"]) {
      let seen = 0;
      for (const f of files) {
        const text = src(f);
        // The element's opening tag: from the last "<" before the test id.
        let at = text.indexOf(`data-testid="${id}"`);
        while (at >= 0) {
          const tag = text.slice(text.lastIndexOf("<", at), at);
          expect(tag, `${id} in ${f}`).not.toMatch(/\b(absolute|fixed)\b|\b(top|left|right|bottom)-\[/);
          seen++;
          at = text.indexOf(`data-testid="${id}"`, at + 1);
        }
      }
      expect(seen, id).toBeGreaterThan(0);
    }
  });

  it("measure and links register through editor/overlays/index.ts (not PlanEditor)", () => {
    const idx = src("src/components/editor/overlays/index.ts");
    expect(idx).toContain('import "@/components/measure/registerOverlay";');
    expect(idx).toContain('import "@/components/sheetIndex/registerOverlay";');
    expect(src("src/components/editor/PlanEditor.tsx")).not.toMatch(/registerOverlay/);
  });
});
