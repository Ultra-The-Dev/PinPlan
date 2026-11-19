import { describe, expect, it } from "vitest";
import { NO_ROOM, mapSections, readSnapshotSections, reportComments, reportPages, reportSections, snapshotSections } from "@/lib/photoReport";
import type { Photo, PhotoComment } from "@/lib/types";

const photo = (id: string, takenAt: string, extra: Partial<Photo> = {}): Photo => ({ id, projectId: "p", imageId: `i-${id}`, width: 4, height: 3, takenAt, createdAt: takenAt, updatedAt: takenAt, ...extra });
// Local-noon timestamps so the local day is the same in every time zone the tests run in.
const at = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).toISOString();
const ids = (cells: Photo[][]) => cells.map((c) => c.map((p) => p.id).join("+"));

const a = photo("a", at("2026-11-17", 9), { room: "Kitchen" });
const b = photo("b", at("2026-11-17", 10), { room: "living room" });
const c = photo("c", at("2026-11-18", 9), { room: " Living  Room " });
const d = photo("d", at("2026-11-18", 11));
const e = photo("e", at("2026-11-19", 9), { room: "Kitchen", beforeId: "a" });
const all = [e, d, c, b, a];

describe("reportSections", () => {
  it("defaults to one untitled section, oldest first, nothing paired", () => {
    const s = reportSections(all, { groupBy: "none", pairs: false });
    expect(s).toHaveLength(1);
    expect(s[0].title).toBe("");
    expect(ids(s[0].cells)).toEqual(["a", "b", "c", "d", "e"]);
    expect(reportSections([], { groupBy: "none", pairs: false })).toEqual([]);
  });

  it("groups by room A–Z, ignoring case and spacing, with no-room photos last", () => {
    const s = reportSections(all, { groupBy: "room", pairs: false });
    expect(s.map((x) => x.title)).toEqual(["Kitchen", "living room", NO_ROOM]);
    expect(s.map((x) => ids(x.cells))).toEqual([["a", "e"], ["b", "c"], ["d"]]);
  });

  it("groups by local day, oldest day first, with a readable heading", () => {
    const s = reportSections(all, { groupBy: "day", pairs: false, dayTitle: (k) => `Day ${k}` });
    expect(s.map((x) => x.title)).toEqual(["Day 2026-11-17", "Day 2026-11-18", "Day 2026-11-19"]);
    expect(s.map((x) => ids(x.cells))).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(reportSections([a], { groupBy: "day", pairs: false })[0].title).toMatch(/2026/);
  });

  it("pairs before/after where the before is, only when both are chosen", () => {
    expect(ids(reportSections(all, { groupBy: "none", pairs: true })[0].cells)).toEqual(["a+e", "b", "c", "d"]);
    expect(ids(reportSections([b, e], { groupBy: "none", pairs: true })[0].cells)).toEqual(["b", "e"]);
    // Grouped by day, the pair sits under the before's day.
    const s = reportSections(all, { groupBy: "day", pairs: true, dayTitle: (k) => k });
    expect(s.map((x) => ids(x.cells))).toEqual([["a+e", "b"], ["c", "d"]]);
  });

  it("uses each photo in at most one pair", () => {
    const e2 = photo("e2", at("2026-11-20"), { beforeId: "a" });
    const f = photo("f", at("2026-11-21"), { beforeId: "e" }); // e is already the after of a
    const self = photo("s", at("2026-11-22"), { beforeId: "s" });
    expect(ids(reportSections([a, e, e2, f, self], { groupBy: "none", pairs: true })[0].cells)).toEqual(["a+e", "e2", "f", "s"]);
  });
});

describe("reportPages", () => {
  const singles = (n: number) => [{ key: "", title: "", cells: Array.from({ length: n }, (_, i) => [i]) }];
  const shape = (pages: ReturnType<typeof reportPages<number>>) => pages.map((pg) => pg.map((r) => (r.kind === "heading" ? `#${r.title}` : `${r.pair ? "P" : ""}${r.items.join(",")}`)));

  it("matches the original fixed layout without headings or pairs", () => {
    expect(shape(reportPages(singles(5), 1))).toEqual([["0"], ["1"], ["2"], ["3"], ["4"]]);
    expect(shape(reportPages(singles(5), 2))).toEqual([["0,1"], ["2,3"], ["4"]]);
    expect(shape(reportPages(singles(5), 4))).toEqual([["0,1", "2,3"], ["4"]]);
  });

  it("starts each section on a fresh row, gives pairs a row, and never ends a page on a heading", () => {
    const secs = [
      { key: "k", title: "Kitchen", cells: [[0], [1, 2], [3]] },
      { key: "l", title: "Living", cells: [[4], [5]] },
    ];
    expect(shape(reportPages(secs, 4))).toEqual([
      ["#Kitchen", "0", "P1,2"],
      ["3", "#Living", "4,5"],
    ]);
    expect(shape(reportPages(secs, 2))).toEqual([["#Kitchen", "0"], ["P1,2"], ["3"], ["#Living", "4,5"]]);
    expect(shape(reportPages(secs, 1))).toEqual([["#Kitchen", "0"], ["P1,2"], ["3"], ["#Living", "4"], ["5"]]);
  });

  it("maps cells to report items", () => {
    const s = mapSections(reportSections([a, e], { groupBy: "none", pairs: true }), (p) => p.imageId);
    expect(s[0].cells).toEqual([["i-a", "i-e"]]);
  });
});

describe("comments", () => {
  const cm = (id: string, photoId: string, text: string, createdAt: string, extra: Partial<PhotoComment> = {}): PhotoComment => ({ id, projectId: "p", photoId, text, createdAt, updatedAt: createdAt, ...extra });
  it("lists a photo's live comments oldest first", () => {
    const list = [cm("2", "a", "second", "2026-11-19T02:00:00Z", { author: " Sam " }), cm("1", "a", " first ", "2026-11-19T01:00:00Z"), cm("3", "a", "gone", "2026-11-19T03:00:00Z", { deleted: true }), cm("4", "b", "other", "2026-11-19T01:00:00Z"), cm("5", "a", "  ", "2026-11-19T04:00:00Z")];
    expect(reportComments(list, "a")).toEqual([
      { author: "", text: "first", at: "2026-11-19T01:00:00Z" },
      { author: "Sam", text: "second", at: "2026-11-19T02:00:00Z" },
    ]);
  });
});

describe("share-link snapshot sections", () => {
  it("round-trips sections as photo indexes", () => {
    const secs = reportSections(all, { groupBy: "room", pairs: true });
    const order = [a, b, c, d, e];
    const snap = snapshotSections(secs, new Map(order.map((p, i) => [p.id, i])));
    expect(snap).toEqual([
      { title: "Kitchen", cells: [[0, 4]] },
      { title: "living room", cells: [[1], [2]] },
      { title: NO_ROOM, cells: [[3]] },
    ]);
    expect(readSnapshotSections(5, JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it("old snapshots (no sections) show every photo in order", () => {
    expect(readSnapshotSections(3, undefined)).toEqual([{ title: "", cells: [[0], [1], [2]] }]);
    expect(readSnapshotSections(0, undefined)).toEqual([]);
  });

  it("survives malformed sections and adds any photos they miss", () => {
    const raw = [{ title: "Kitchen", cells: [[0, 9], [0], "x", [1, 2, 3]] }, null, { cells: "bad" }, { title: 5, cells: [[-1]] }];
    expect(readSnapshotSections(5, raw)).toEqual([
      { title: "Kitchen", cells: [[0], [1, 2]] },
      { title: NO_ROOM, cells: [[3], [4]] },
    ]);
    expect(readSnapshotSections(2, "nope")).toEqual([{ title: "", cells: [[0], [1]] }]);
  });
});
