import { describe, expect, it } from "vitest";
import {
  arrowHead,
  bbox,
  canEditMarkup,
  cloudPath,
  exportableMarkups,
  handlesOf,
  hitTest,
  layerNames,
  resize,
  rotateMarkupCW,
  rotateMarkupPointsCW,
  simplifyStroke,
  translate,
  visibleMarkups,
} from "@/lib/markups";
import { TABLES, toLocal, toRemote, PUSH_ORDER } from "@/lib/syncMap";
import { computeTakeoff } from "@/lib/takeoff";
import type { MarkupKind, PlanMarkup } from "@/lib/types";

const ts = "2026-11-19T00:00:00.000Z";
const mk = (kind: MarkupKind, points: number[], extra: Partial<PlanMarkup> = {}): PlanMarkup => ({
  id: `${kind}-${points.join(",")}`,
  projectId: "p",
  sheetId: "s",
  kind,
  points,
  color: "#dc2626",
  width: 0.002,
  layer: "Redlines",
  createdAt: ts,
  updatedAt: ts,
  ...extra,
});
const W = 1000;
const H = 800;

describe("cloudPath", () => {
  it("is closed and stays inside its box", () => {
    const pts = cloudPath(100, 50, 400, 300, 30);
    expect(pts.length).toBeGreaterThan(40);
    expect(pts[0]).toBeCloseTo(pts[pts.length - 2]);
    expect(pts[1]).toBeCloseTo(pts[pts.length - 1]);
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(pts[i]).toBeLessThanOrEqual(400 + 1e-9);
      expect(pts[i + 1]).toBeGreaterThanOrEqual(50 - 1e-9);
      expect(pts[i + 1]).toBeLessThanOrEqual(300 + 1e-9);
    }
    // The scallops reach the box edges.
    expect(Math.min(...pts.filter((_, i) => i % 2 === 1))).toBeCloseTo(50, 0);
  });
  it("handles reversed corners and a flat box", () => {
    const a = cloudPath(400, 300, 100, 50, 30);
    expect(Math.min(...a.filter((_, i) => i % 2 === 0))).toBeGreaterThanOrEqual(100 - 1e-9);
    expect(cloudPath(0, 0, 10, 0, 5)).toEqual([0, 0, 10, 0, 10, 0, 0, 0, 0, 0]);
  });
});

describe("arrowHead", () => {
  it("puts the tip on the last point, pointing along the last segment", () => {
    const h = arrowHead([0, 0, 100, 0], 10);
    expect(h.slice(2, 4)).toEqual([100, 0]);
    expect(h[0]).toBeCloseTo(90);
    expect(h[4]).toBeCloseTo(90);
    expect(Math.abs(h[1] - h[5])).toBeCloseTo(10);
    expect(arrowHead([5, 5], 10)).toEqual([]);
    expect(arrowHead([5, 5, 5, 5], 10)).toEqual([]);
  });
});

describe("simplifyStroke", () => {
  it("shrinks a wobbly stroke and keeps both ends", () => {
    const pts: number[] = [];
    for (let i = 0; i <= 200; i++) pts.push(i, Math.sin(i / 3) * 0.2);
    const out = simplifyStroke(pts, 0.5);
    expect(out.length).toBeLessThan(pts.length / 10);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(-2)).toEqual(pts.slice(-2));
  });
  it("keeps corners", () => {
    const out = simplifyStroke([0, 0, 5, 0, 10, 0, 10, 5, 10, 10], 0.1);
    expect(out).toEqual([0, 0, 10, 0, 10, 10]);
  });
  it("leaves 1–2 point strokes alone", () => {
    expect(simplifyStroke([1, 2, 3, 4], 1)).toEqual([1, 2, 3, 4]);
  });
});

describe("hitTest", () => {
  const tol = 10;
  it("pen / highlight / line / arrow: near the line only", () => {
    for (const kind of ["pen", "highlight", "line", "arrow"] as MarkupKind[]) {
      const m = mk(kind, [0.1, 0.1, 0.5, 0.1]);
      expect(hitTest(m, 0.3, 0.1 + 5 / H, tol, W, H), kind).toBe(true);
      expect(hitTest(m, 0.3, 0.3, tol, W, H), kind).toBe(false);
    }
    // The highlighter is wider.
    expect(hitTest(mk("highlight", [0.1, 0.1, 0.5, 0.1], { width: 0.01 }), 0.3, 0.1 + 35 / H, tol, W, H)).toBe(true);
    expect(hitTest(mk("pen", [0.1, 0.1, 0.5, 0.1], { width: 0.01 }), 0.3, 0.1 + 35 / H, tol, W, H)).toBe(false);
  });
  it("rect / cloud: on the outline, not deep inside", () => {
    for (const kind of ["rect", "cloud"] as MarkupKind[]) {
      const m = mk(kind, [0.1, 0.1, 0.6, 0.6]);
      expect(hitTest(m, 0.1 + 3 / W, 0.3, tol, W, H), kind).toBe(true);
      expect(hitTest(m, 0.35, 0.35, tol, W, H), kind).toBe(false);
      expect(hitTest(m, 0.9, 0.9, tol, W, H), kind).toBe(false);
    }
  });
  it("ellipse: on the curve", () => {
    const m = mk("ellipse", [0.2, 0.2, 0.6, 0.6]); // centre (400, 320), radii 200 × 160
    expect(hitTest(m, 0.6, 0.4, tol, W, H)).toBe(true);
    expect(hitTest(m, 0.4, 0.4, tol, W, H)).toBe(false);
    expect(hitTest(m, 0.21, 0.21, tol, W, H)).toBe(false); // the box corner isn't on the curve
  });
  it("small boxes are hit anywhere inside", () => {
    expect(hitTest(mk("rect", [0.5, 0.5, 0.52, 0.52]), 0.51, 0.51, tol, W, H)).toBe(true);
  });
  it("text: anywhere in its box", () => {
    const m = mk("text", [0.1, 0.1], { text: "Relocate", fontSize: 0.02 });
    const b = bbox(m, W, H);
    expect(b.x1).toBeGreaterThan(0.1);
    expect(hitTest(m, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, tol, W, H)).toBe(true);
    expect(hitTest(m, b.x1 + 0.1, b.y1, tol, W, H)).toBe(false);
  });
});

describe("translate / resize", () => {
  it("moves and stays on the sheet", () => {
    expect(translate(mk("rect", [0.1, 0.1, 0.2, 0.2]), 0.1, 0.05).points).toEqual([0.2, 0.15000000000000002, 0.30000000000000004, 0.25]);
    const edge = translate(mk("rect", [0.7, 0.7, 0.9, 0.9]), 0.5, 0.5).points;
    expect(edge[2]).toBeCloseTo(1);
    expect(edge[0]).toBeCloseTo(0.8);
  });
  it("resizes boxes from a corner (the opposite corner stays) and lines by an end", () => {
    const r = mk("rect", [0.1, 0.1, 0.5, 0.5]);
    expect(handlesOf(r)).toHaveLength(4);
    expect(resize(r, 2, 0.7, 0.6).points).toEqual([0.1, 0.1, 0.7, 0.6]);
    // Dragging the top-left past the bottom-right flips cleanly.
    expect(resize(r, 0, 0.8, 0.9).points).toEqual([0.5, 0.5, 0.8, 0.9]);
    expect(resize(mk("arrow", [0, 0, 1, 1]), 1, 0.5, 0.25).points).toEqual([0, 0, 0.5, 0.25]);
    const pen = mk("pen", [0, 0, 1, 1]);
    expect(resize(pen, 0, 0.3, 0.3)).toBe(pen);
  });
});

describe("visibleMarkups", () => {
  const mine = mk("pen", [0, 0, 1, 1], { id: "mine", private: true, authorId: "me" });
  const theirsPrivate = mk("pen", [0, 0, 1, 1], { id: "theirs-private", private: true, authorId: "them" });
  const theirs = mk("pen", [0, 0, 1, 1], { id: "theirs", authorId: "them", layer: "As-built" });
  const deleted = mk("pen", [0, 0, 1, 1], { id: "gone", deleted: true });
  const local = mk("pen", [0, 0, 1, 1], { id: "local", private: true });
  it("hides other people's private markups, deleted ones and hidden layers", () => {
    const all = [mine, theirsPrivate, theirs, deleted, local];
    expect(visibleMarkups(all, { userId: "me" }).map((m) => m.id)).toEqual(["mine", "theirs", "local"]);
    expect(visibleMarkups(all, { userId: "me", hiddenLayers: ["As-built"] }).map((m) => m.id)).toEqual(["mine", "local"]);
    expect(visibleMarkups(all, { userId: "them", hiddenLayers: ["Redlines"] }).map((m) => m.id)).toEqual(["theirs"]);
    expect(visibleMarkups(all, { userId: "me", colorFilter: ["#2563EB"] })).toEqual([]);
  });
  it("never exports private markups", () => {
    expect(exportableMarkups([mine, theirs, local, deleted], "s").map((m) => m.id)).toEqual(["theirs"]);
    expect(exportableMarkups([theirs], "other")).toEqual([]);
  });
});

describe("canEditMarkup", () => {
  const own = { authorId: "me" };
  const other = { authorId: "them" };
  const otherPrivate = { authorId: "them", private: true };
  const unowned = { authorId: null };
  it.each([
    ["tech", own, true],
    ["tech", other, false],
    ["tech", otherPrivate, false],
    ["tech", unowned, true],
    ["admin", own, true],
    ["admin", other, true],
    ["admin", otherPrivate, false],
    ["owner", other, true],
    [null, other, true],
  ] as const)("%s editing %o → %s", (role, m, ok) => {
    expect(canEditMarkup(role, m, "me")).toBe(ok);
  });
});

describe("rotation", () => {
  it("turns points 90° clockwise with the sheet", () => {
    expect(rotateMarkupPointsCW([0, 0, 1, 0, 0.25, 0.75])).toEqual([1, 0, 1, 1, 0.25, 0.25]);
    // Four turns come back to the start.
    let p = [0.1, 0.2, 0.3, 0.4];
    for (let i = 0; i < 4; i++) p = rotateMarkupPointsCW(p);
    p.forEach((v, i) => expect(v).toBeCloseTo([0.1, 0.2, 0.3, 0.4][i]));
  });
  it("keeps strokes the same size on paper and text upright", () => {
    const r = rotateMarkupCW(mk("rect", [0.1, 0.2, 0.3, 0.4], { width: 0.002 }), 1000 / 800, 800);
    expect(r.points).toEqual([0.8, 0.1, 0.6, 0.3]);
    expect(r.width).toBeCloseTo(0.0025);
    const t = rotateMarkupCW(mk("text", [0.5, 0.5], { text: "hi", fontSize: 0.01 }), 1, 1000);
    expect(t.points[0]).toBeLessThan(0.5);
    expect(t.points[1]).toBeCloseTo(0.5);
  });
});

describe("layers", () => {
  it("offers the defaults, then used and added layers, once each", () => {
    expect(layerNames([{ layer: "Electrical RFI" }, { layer: "redlines" }, { layer: "Gone", deleted: true }], ["Punch", "  "])).toEqual([
      "Redlines",
      "As-built",
      "Notes",
      "Electrical RFI",
      "Punch",
    ]);
  });
});

describe("sync mapping", () => {
  it("round-trips a markup", () => {
    const m = mk("cloud", [0.1, 0.2, 0.3, 0.4], { id: "pm1", text: null, fontSize: null, private: true, author: "Sam", authorId: "u1" });
    const r = toRemote("planMarkups", m as unknown as Record<string, unknown>);
    expect(r).toMatchObject({ id: "pm1", project_id: "p", sheet_id: "s", kind: "cloud", points: [0.1, 0.2, 0.3, 0.4], private: true, author_id: "u1", font_size: null, deleted: false });
    expect(TABLES.planMarkups.remote).toBe("plan_markups");
    const back = toLocal("planMarkups", { ...r, updated_at: "2026-11-19T00:00:00+00:00" });
    expect(back).toMatchObject({ id: "pm1", sheetId: "s", kind: "cloud", points: [0.1, 0.2, 0.3, 0.4], private: true, authorId: "u1", updatedAt: ts });
    expect(back).not.toHaveProperty("fontSize");
    expect(toRemote("planMarkups", { id: "x", projectId: "p", sheetId: "s", kind: "pen" })).toMatchObject({ points: [], private: false });
  });
  it("pushes markups after sheets", () => {
    expect(PUSH_ORDER.indexOf("planMarkups")).toBeGreaterThan(PUSH_ORDER.indexOf("sheets"));
  });
});

describe("markups never count", () => {
  it("computeTakeoff takes no markups", () => {
    const sheet = { id: "s", projectId: "p", name: "1", pageNumber: 1, order: 0, imageId: "i", width: W, height: H, createdAt: ts, updatedAt: ts };
    const marker = { id: "m", projectId: "p", sheetId: "s", deviceTypeId: "wap", x: 0.5, y: 0.5, label: "WAP-1", room: "", mount: "ceiling" as const, wireType: "Cat6", tentative: false, notes: "", createdAt: ts, updatedAt: ts };
    const base = computeTakeoff({ sheets: [sheet], markers: [marker], runs: [], closets: [] });
    const withExtra = computeTakeoff({ sheets: [sheet], markers: [marker], runs: [], closets: [], planMarkups: [mk("rect", [0, 0, 1, 1])] } as Parameters<typeof computeTakeoff>[0]);
    expect(withExtra).toEqual(base);
  });
});
