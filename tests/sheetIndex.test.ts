import { describe, expect, it } from "vitest";
import { pageTextItems, textItemBox } from "@/lib/importPlans";
import type { SheetLinkTarget } from "@/lib/types";
import {
  brokenReason,
  dedupeLinks,
  disciplineFromNumber,
  duplicateNumbers,
  findCallouts,
  groupSheetsByDiscipline,
  linkAt,
  looksLikeSheetNumber,
  matchPagesToSheets,
  matchSheet,
  normalizeUrl,
  parseSheetNumber,
  parseSheetTitle,
  proposeSheetMeta,
  rectFromCorners,
  rotateLinkCW,
  sheetDisplayName,
  sheetNumberKey,
  type TextItem,
} from "@/lib/sheetIndex";
import { TABLES, toLocal, toRemote } from "@/lib/syncMap";

const t = (str: string, x: number, y: number, h = 0.01, w = str.length * h * 0.6): TextItem => ({ str, x, y, w, h });

/** A realistic E-sheet: notes, a scale, dates, a revision, callouts and a title block in the bottom-right corner. */
const titleBlockPage: TextItem[] = [
  t("GENERAL NOTES", 0.05, 0.05, 0.012),
  t("1. ALL WORK PER NEC 2023. SEE E-001 FOR LEGEND.", 0.05, 0.07),
  t("FIRST FLOOR POWER PLAN", 0.3, 0.62, 0.014),
  t('SCALE: 1/4"=1\'-0"', 0.3, 0.64),
  t("3", 0.52, 0.4, 0.008),
  t("E-501", 0.51, 0.41, 0.008),
  t("REV 1", 0.8, 0.74),
  t("11.19.26", 0.8, 0.76),
  t("DATE: 11/19/2026", 0.8, 0.78),
  t("FIRST FLOOR", 0.78, 0.84, 0.016),
  t("POWER PLAN", 0.78, 0.86, 0.016),
  t("SHEET", 0.8, 0.92, 0.008),
  t("E-101", 0.84, 0.92, 0.03),
  t('1/4"=1\'-0"', 0.92, 0.95),
];

const sheets = [
  { id: "s1", number: "E-101", order: 0 },
  { id: "s2", number: "E-501", order: 1 },
  { id: "s3", number: "E-001", order: 2 },
];

describe("sheet numbers", () => {
  it("reads the title-block number and rejects scales, dates and revisions", () => {
    expect(parseSheetNumber(titleBlockPage)).toBe("E-101");
    expect(looksLikeSheetNumber('1/4"=1\'-0"')).toBe(false);
    expect(looksLikeSheetNumber("11.19.26")).toBe(false);
    expect(looksLikeSheetNumber("REV1")).toBe(false);
    expect(looksLikeSheetNumber("A1.01")).toBe(true);
    expect(looksLikeSheetNumber("FA-001")).toBe(true);
    expect(looksLikeSheetNumber("M201A")).toBe(true);
  });

  it("finds nothing outside a title block without a label, and nothing on scanned pages", () => {
    expect(parseSheetNumber([t("E-501", 0.4, 0.4)])).toBeNull();
    expect(parseSheetNumber([])).toBeNull();
    expect(proposeSheetMeta([], "")).toEqual({ number: null, title: null, discipline: null });
  });

  it("takes a labelled number outside the corner (title strip on the right edge)", () => {
    expect(parseSheetNumber([t("SHEET NO.", 0.9, 0.3), t("A-201", 0.9, 0.32, 0.02)])).toBe("A-201");
  });

  it("reads plain text: after a SHEET label, else the last known prefix", () => {
    expect(parseSheetNumber("PROJECT 2207 SHEET NO. E-102 DATE 11.19.26")).toBe("E-102");
    expect(parseSheetNumber("SEE A-501 FOR DETAILS. M-201")).toBe("M-201");
    expect(parseSheetNumber('SCALE 1/4"=1\'-0" 11/19/2026')).toBeNull();
  });

  it("keys sheet numbers loosely", () => {
    expect(sheetNumberKey("E-101")).toBe(sheetNumberKey("e101"));
    expect(sheetNumberKey("E.101")).toBe("E101");
    expect(sheetNumberKey("E1.01")).not.toBe(sheetNumberKey("E101"));
  });
});

describe("sheet titles", () => {
  it("joins a two-line title near the number", () => {
    expect(parseSheetTitle(titleBlockPage, "E-101")).toBe("FIRST FLOOR POWER PLAN");
  });
  it("picks the largest drawing-title line", () => {
    const items = [t("RISER DIAGRAM", 0.75, 0.88, 0.02), t("FIRE ALARM NOTES", 0.75, 0.8, 0.008), t("FA-401", 0.9, 0.95, 0.02)];
    expect(proposeSheetMeta(items)).toEqual({ number: "FA-401", title: "RISER DIAGRAM", discipline: "Fire alarm" });
  });
});

describe("disciplines", () => {
  it("maps prefixes", () => {
    expect(disciplineFromNumber("E-101")).toBe("Electrical");
    expect(disciplineFromNumber("G-001")).toBe("General");
    expect(disciplineFromNumber("A1.01")).toBe("Architectural");
    expect(disciplineFromNumber("S-201")).toBe("Structural");
    expect(disciplineFromNumber("M-101")).toBe("Mechanical");
    expect(disciplineFromNumber("P-101")).toBe("Plumbing");
    expect(disciplineFromNumber("FP-101")).toBe("Fire protection");
    expect(disciplineFromNumber("FA-001")).toBe("Fire alarm");
    expect(disciplineFromNumber("T-101")).toBe("Low voltage");
    expect(disciplineFromNumber("LV-2")).toBe("Low voltage");
    expect(disciplineFromNumber("TC-101")).toBe("Low voltage");
    expect(disciplineFromNumber("C-100")).toBe("Civil");
    expect(disciplineFromNumber("EP-1")).toBe("Electrical");
    expect(disciplineFromNumber("Z-9")).toBe("Other");
    expect(disciplineFromNumber("")).toBe("Other");
  });

  it("groups sheets in set order", () => {
    const g = groupSheetsByDiscipline([
      { id: "a", number: "E-101", order: 2 },
      { id: "b", number: "A-101", order: 1 },
      { id: "c", number: null, order: 0 },
      { id: "d", number: "E-001", order: 0 },
      { id: "e", number: "X-1", discipline: "Low voltage", order: 5 },
      { id: "f", number: "E-9", order: 9, deleted: true },
    ]);
    expect(g.map((x) => x.discipline)).toEqual(["Architectural", "Electrical", "Low voltage", "Other"]);
    expect(g[1].sheets.map((s) => s.id)).toEqual(["d", "a"]);
  });
});

describe("display", () => {
  it("names sheets by number and title", () => {
    expect(sheetDisplayName({ name: "1st Fl", number: "E-101", title: "POWER PLAN" })).toBe("E-101 POWER PLAN");
    expect(sheetDisplayName({ name: "1st Fl", number: "E-101", title: null })).toBe("E-101 1st Fl");
    expect(sheetDisplayName({ name: "1st Fl" })).toBe("1st Fl");
    expect(sheetDisplayName({ name: "1st Fl", number: "  " })).toBe("1st Fl");
  });
  it("searches number, title and name", () => {
    const s = { name: "Attic", number: "E-101", title: "POWER PLAN", tags: ["Phase 2"] };
    expect(matchSheet(s, "e101")).toBe(true);
    expect(matchSheet(s, "power")).toBe(true);
    expect(matchSheet(s, "phase 2")).toBe(true);
    expect(matchSheet(s, "riser")).toBe(false);
  });
});

describe("callouts", () => {
  it("links E-501 (with its detail number) but not the sheet's own number or the title block", () => {
    const links = findCallouts(titleBlockPage, sheets, "s1");
    const targets = links.map((l) => [l.label, l.target.sheetId]);
    expect(targets).toContainEqual(["3/E-501", "s2"]);
    expect(targets).toContainEqual(["E-001", "s3"]);
    expect(targets.some(([, id]) => id === "s1")).toBe(false);
    const e501 = links.find((l) => l.target.sheetId === "s2")!;
    // The rect covers the "3" above and "E-501".
    expect(e501.y).toBeLessThan(0.4);
    expect(e501.y + e501.h).toBeGreaterThan(0.418);
    expect(links.every((l) => l.auto && l.sheetId === "s1")).toBe(true);
  });

  it("skips a callout inside the title block and numbers shared by two sheets", () => {
    const items = [t("E-501", 0.85, 0.85), t("A-101", 0.2, 0.2)];
    const dupSheets = [...sheets, { id: "s4", number: "A-101" }, { id: "s5", number: "A101" }];
    expect(findCallouts(items, dupSheets, "s1")).toEqual([]);
    expect(duplicateNumbers(dupSheets)).toEqual(new Set(["A101"]));
  });

  it("reads 3/E-501 and punctuation, and dedupes repeats", () => {
    const items = [t("SEE 3/E-501.", 0.1, 0.1), t("(E-501)", 0.3, 0.3)];
    const links = findCallouts(items, sheets, "s1");
    expect(links.map((l) => l.label)).toEqual(["3/E-501", "E-501"]);
    // Same target, same place as an existing (even deleted) link: not proposed again.
    const again = dedupeLinks(links, [{ ...links[0], deleted: true } as (typeof links)[0]]);
    expect(again.map((l) => l.label)).toEqual(["E-501"]);
  });

  it("hit-tests the smallest link with a tolerance", () => {
    const big = { id: "big", x: 0, y: 0, w: 0.5, h: 0.5 };
    const small = { id: "small", x: 0.1, y: 0.1, w: 0.01, h: 0.01 };
    expect(linkAt([big, small], { x: 0.105, y: 0.105 })?.id).toBe("small");
    expect(linkAt([small], { x: 0.125, y: 0.105 })).toBeNull();
    expect(linkAt([small], { x: 0.125, y: 0.105 }, { x: 0.02, y: 0.02 })?.id).toBe("small");
    expect(rectFromCorners({ x: 0.5, y: 0.6 }, { x: 1.2, y: 0.4 })).toEqual({ x: 0.5, y: 0.4, w: 0.5, h: 0.19999999999999996 });
  });

  it("explains broken links and checks URLs", () => {
    const have = { sheets: [{ id: "s1" }], documents: [{ id: "d1", deleted: true }], photos: [] };
    expect(brokenReason({ target: { kind: "sheet", sheetId: "s1" } }, have)).toBeNull();
    expect(brokenReason({ target: { kind: "sheet", sheetId: "gone" } }, have)).toMatch(/deleted/);
    expect(brokenReason({ target: { kind: "document", documentId: "d1" } }, have)).toMatch(/deleted/);
    expect(normalizeUrl("example.com/spec.pdf")).toBe("https://example.com/spec.pdf");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("PDF text items", () => {
  it("maps a text item to a relative box with y from the top", () => {
    // A 612×792 page at scale 1: PDF.js's viewport flips y ([1,0,0,-1,0,792]).
    const box = textItemBox({ transform: [10, 0, 0, 10, 100, 692], width: 50, height: 10 }, [1, 0, 0, -1, 0, 792], 612, 792);
    expect(box.x).toBeCloseTo(100 / 612);
    expect(box.y).toBeCloseTo(90 / 792);
    expect(box.w).toBeCloseTo(50 / 612);
    expect(box.h).toBeCloseTo(10 / 792);
  });

  it("handles a rotated page and drops blank runs", () => {
    // Rotation 90: viewport transform [0,1,1,0,0,0] (x' = y, y' = x), viewport 792×612.
    const items = pageTextItems(
      { items: [{ str: "E-101", transform: [10, 0, 0, 10, 100, 200], width: 50, height: 10 }, { str: "  ", transform: [1, 0, 0, 1, 0, 0], width: 1, height: 1 }, { type: "beginMarkedContent" }] },
      { transform: [0, 1, 1, 0, 0, 0], width: 792, height: 612 },
    );
    expect(items).toHaveLength(1);
    expect(items[0].x).toBeCloseTo(200 / 792);
    expect(items[0].y).toBeCloseTo(100 / 612);
    expect(items[0].w).toBeCloseTo(10 / 792);
    expect(items[0].h).toBeCloseTo(50 / 612);
  });

  it("matches pages to earlier sheets by page number and shape", () => {
    const pages = [
      { pageNumber: 1, width: 1224, height: 792 },
      { pageNumber: 2, width: 1224, height: 792 },
    ];
    const sh = [
      { id: "a", pageNumber: 1, width: 4800, height: 3106, order: 0, pxPerInch: 200 },
      { id: "rot", pageNumber: 2, width: 3106, height: 4800, order: 1, pxPerInch: 200 },
      { id: "photo", pageNumber: 2, width: 4800, height: 3106, order: 2, pxPerInch: null },
    ];
    expect([...matchPagesToSheets(pages, sh)]).toEqual([[1, "a"]]);
  });
});

describe("sync", () => {
  it("maps sheet index fields and links both ways", () => {
    const sheet = { id: "s", projectId: "p", name: "1st", number: "E-101", title: "POWER PLAN", discipline: "Electrical", tags: ["Phase 1"] };
    const r = toRemote("sheets", sheet);
    expect(r).toMatchObject({ sheet_number: "E-101", sheet_title: "POWER PLAN", discipline: "Electrical", tags: ["Phase 1"] });
    expect(r).not.toHaveProperty("number");
    expect(toLocal("sheets", r)).toMatchObject(sheet);

    const link = { id: "l", projectId: "p", sheetId: "s", x: 0.1, y: 0.2, w: 0.03, h: 0.01, target: { kind: "sheet", sheetId: "s2" }, label: "E-501", auto: true, createdAt: "2026-11-19T00:00:00.000Z", updatedAt: "2026-11-19T00:00:00.000Z" };
    const lr = toRemote("sheetLinks", link);
    expect(TABLES.sheetLinks.remote).toBe("sheet_links");
    expect(lr).toMatchObject({ sheet_id: "s", target: { kind: "sheet", sheetId: "s2" }, auto: true, deleted: false });
    expect(toLocal("sheetLinks", lr)).toMatchObject(link);
    expect(toRemote("sheetLinks", { ...link, auto: undefined }).auto).toBe(false);
  });
});

describe("fixture PDF (tests/fixtures/sheet-links.pdf)", () => {
  it("names both sheets and links their callouts to each other", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(readFileSync(path.resolve(__dirname, "fixtures/sheet-links.pdf")));
    const task = pdfjs.getDocument({ data, verbosity: 0 });
    const doc = await task.promise;
    const pages: TextItem[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      pages.push(pageTextItems(await page.getTextContent(), page.getViewport({ scale: 1 })));
    }
    await task.destroy();
    const metas = pages.map((p) => proposeSheetMeta(p));
    expect(metas).toEqual([
      { number: "E-101", title: "FIRST FLOOR POWER PLAN", discipline: "Electrical" },
      { number: "E-501", title: "ELECTRICAL RISER DIAGRAM", discipline: "Electrical" },
    ]);
    const set = [
      { id: "p1", number: metas[0].number },
      { id: "p2", number: metas[1].number },
    ];
    const l1 = findCallouts(pages[0], set, "p1");
    const l2 = findCallouts(pages[1], set, "p2");
    expect(l1.map((l) => [l.label, l.target.sheetId])).toEqual([
      ["E-501", "p2"],
      ["3/E-501", "p2"],
    ]);
    expect(l2.map((l) => [l.label, l.target.sheetId])).toEqual([["E-101", "p1"]]);
  });
});

describe("rotateLinkCW", () => {
  const base = { id: "l", sheetId: "s1", x: 0.1, y: 0.2, w: 0.3, h: 0.05, target: { kind: "sheet", sheetId: "s2" } as SheetLinkTarget };
  it("turns a box on the rotated sheet like markers (x, y → 1 − y, x)", () => {
    const r = rotateLinkCW(base, "s1")!;
    expect(r.x).toBeCloseTo(0.75);
    expect(r.y).toBeCloseTo(0.1);
    expect(r.w).toBeCloseTo(0.05);
    expect(r.h).toBeCloseTo(0.3);
    // Four turns bring it back.
    let back = base;
    for (let i = 0; i < 4; i++) back = rotateLinkCW(back, "s1")!;
    expect(back.x).toBeCloseTo(base.x);
    expect(back.y).toBeCloseTo(base.y);
    expect(back.w).toBeCloseTo(base.w);
  });
  it("turns a target point into the rotated sheet and leaves other links alone", () => {
    const into = { ...base, target: { kind: "sheet", sheetId: "s1b", x: 0.2, y: 0.9 } as SheetLinkTarget };
    const r = rotateLinkCW(into, "s1b")!;
    expect(r.x).toBe(base.x);
    expect(r.target).toEqual({ kind: "sheet", sheetId: "s1b", x: expect.closeTo(0.1), y: 0.2 });
    expect(rotateLinkCW(base, "other")).toBeNull();
    expect(rotateLinkCW({ ...base, target: { kind: "url", url: "https://x.io" } }, "s2")).toBeNull();
  });
});
