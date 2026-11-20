import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findFloorName, floorKey, isDefaultSheetName, parseFloorName, proposeSheetName, titleCaseName, type FloorTextItem } from "@/lib/floorName";
import { guessFloorName, pageTextItems } from "@/lib/importPlans";
import { parseSheetNumber, parseSheetTitle, proposeSheetMeta } from "@/lib/sheetIndex";

/** Cases shared with the Swift tests (ios/PinPlanCore/Tests/PinPlanCoreTests/FloorNameTests.swift). */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures/floorNames.json"), "utf8")) as {
  titleBlock: [string, string][];
  notFloors: string[];
  text: [string, string | null][];
  samplesExpected: Record<string, string[]>;
  samples: Record<string, FloorTextItem[][]>;
};

const t = (str: string, x: number, y: number, h = 0.01, w = str.length * h * 0.6): FloorTextItem => ({ str, x, y, w, h });

/** A sheet with room labels in the plan and the floor name alone in the title block (bottom right). */
function titleBlock(name: string, extra: FloorTextItem[] = []): FloorTextItem[] {
  return [
    t("LIVING", 0.2, 0.3, 0.02),
    t("KITCHEN", 0.45, 0.3, 0.02),
    t("BEDROOM", 0.3, 0.6, 0.02),
    t("12 MAPLE RIDGE RD", 0.86, 0.86, 0.011),
    t(name, 0.86, 0.9, 0.028),
    t('A-101 · SCALE 1/8" = 1\'-0"', 0.86, 0.94, 0.016),
    ...extra,
  ];
}

describe("parseFloorName: title block wording", () => {
  const cases = fixture.titleBlock;
  for (const [printed, name] of cases) {
    it(`"${printed}" → "${name}"`, () => {
      expect(parseFloorName(titleBlock(printed))).toBe(name);
    });
  }
});

describe("parseFloorName: false positives", () => {
  const none = fixture.notFloors;
  for (const printed of none) {
    it(`"${printed}" isn't a floor name`, () => {
      expect(parseFloorName([t(printed, 0.4, 0.4, 0.012), t("RISER DIAGRAM", 0.85, 0.9, 0.02)])).toBeNull();
    });
  }

  it("a note in the plan never beats the title block", () => {
    const items = titleBlock("2ND FLOOR", [t("1. PROVIDE 2\" CONDUIT FROM RACK TO ATTIC.", 0.05, 0.05, 0.01), t("ATTIC ACCESS HATCH", 0.6, 0.4, 0.012)]);
    expect(parseFloorName(items)).toBe("2nd Floor");
  });

  it("a room label the size of the others doesn't name the sheet when the title block does", () => {
    const items = titleBlock("1ST. FL", [t("ATTIC", 0.6, 0.5, 0.02)]);
    expect(parseFloorName(items)).toBe("1st Fl");
  });

  it("schedule rows that mention floors don't name a sheet", () => {
    const rows = [t("DOOR SCHEDULE", 0.6, 0.1, 0.012), t("D1 2ND FLOOR HALL 3'-0\" x 6'-8\" SOLID CORE", 0.6, 0.12, 0.008), t("D2 1ST FLOOR BATH 2'-8\" x 6'-8\"", 0.6, 0.14, 0.008), t("RISER DIAGRAM", 0.5, 0.5, 0.03)];
    expect(parseFloorName(rows)).toBeNull();
  });

  it("finds nothing on an empty page", () => {
    expect(parseFloorName([])).toBeNull();
    expect(parseFloorName("")).toBeNull();
  });
});

describe("parseFloorName: where it looks", () => {
  it("reads a vertical title strip down the right edge", () => {
    // Text turned 90°: a tall, narrow run.
    const items = [t("LIVING", 0.2, 0.3, 0.02), { str: "THIRD FLOOR PLAN", x: 0.95, y: 0.4, w: 0.02, h: 0.25 }];
    expect(parseFloorName(items)).toBe("Third Floor");
  });

  it("prefers large type anywhere when there's no title block", () => {
    const items = [t("BASEMENT", 0.4, 0.05, 0.04), t("STORAGE", 0.3, 0.5, 0.012), t("MECH", 0.6, 0.5, 0.012)];
    expect(parseFloorName(items)).toBe("Basement");
  });

  it("joins a title set in separate runs on one line", () => {
    const items = [t("LIVING", 0.2, 0.3, 0.02), t("SECOND", 0.8, 0.9, 0.025), t("FLOOR", 0.88, 0.9, 0.025)];
    expect(parseFloorName(items)).toBe("Second Floor");
  });

  it("returns the line it read for debugging", () => {
    expect(findFloorName(titleBlock("CELLAR"))).toMatchObject({ name: "Cellar", key: "cellar", line: "CELLAR" });
  });
});

describe("parseFloorName: plain text (no positions)", () => {
  it("keeps the old guessFloorName rules: a sheet title beats a passing mention", () => {
    expect(guessFloorName("NOTES: PROVIDE ATTIC ACCESS HATCH. 2ND FLOOR PLAN SCALE 1/4\" = 1'-0\"", "Sheet 1")).toBe("2nd Floor");
    expect(guessFloorName("STAIR DOWN TO BASEMENT FIRST FLOOR PLAN", "Sheet 1")).toBe("First Floor");
    expect(guessFloorName("BASEMENT FLOOR PLAN", "Sheet 1")).toBe("Basement");
    expect(guessFloorName("NOTE: ATTIC VENTS BY OTHERS. SITE PLAN", "Sheet 1")).toBe("Site Plan");
    expect(guessFloorName("ROOF PLAN. SEE BASEMENT FOR PANEL", "Sheet 1")).toBe("Roof");
    expect(guessFloorName("A-101 ATTIC", "Sheet 1")).toBe("Attic");
    expect(guessFloorName("DETAILS", "Sheet 4")).toBe("Sheet 4");
    expect(guessFloorName("L2", "Sheet 4")).toBe("Level 2");
  });
});

describe("shared fixture", () => {
  for (const [text, name] of fixture.text) {
    it(`plain text "${text}" → ${name ?? "none"}`, () => expect(parseFloorName(text)).toBe(name));
  }
  it("the samples' text in the fixture is what PDF.js reads today (scripts/floor-name-fixture.mjs)", async () => {
    for (const [file, expected] of Object.entries(fixture.samplesExpected)) {
      expect(fixture.samples[file].map((p) => parseFloorName(p))).toEqual(expected);
      const live = await readSample(file);
      expect(live.map((p) => p.map((i) => i.str))).toEqual(fixture.samples[file].map((p) => p.map((i) => i.str)));
    }
  });
});

describe("helpers", () => {
  it("title-cases the plan's wording", () => {
    expect(titleCaseName("1ST. FL")).toBe("1st Fl");
    expect(titleCaseName("ELECTRICAL RISER DIAGRAM")).toBe("Electrical Riser Diagram");
    expect(titleCaseName("UNIT 3B")).toBe("Unit 3B");
  });

  it("keys floors however they're written", () => {
    expect(floorKey("FIRST FLOOR")).toBe(floorKey("1st Fl"));
    expect(floorKey("1ST FLR")).toBe("f1");
    expect(floorKey("2nd Fl")).toBe(floorKey("Second Floor"));
    expect(floorKey("Level 2")).toBe(floorKey("L2"));
    expect(floorKey("Level 2")).not.toBe(floorKey("2nd Floor"));
    expect(floorKey("Garage lighting")).toBe("garage lighting");
  });

  it("knows the app's made-up names", () => {
    expect(isDefaultSheetName("Sheet 3")).toBe(true);
    expect(isDefaultSheetName("Page 12")).toBe(true);
    expect(isDefaultSheetName("IMG_4031")).toBe(true);
    expect(isDefaultSheetName("plans-rev2", "plans-rev2")).toBe(true);
    expect(isDefaultSheetName("Kitchen remodel")).toBe(false);
    expect(isDefaultSheetName("1st Fl")).toBe(false);
  });

  it("proposes floor, else title, else number, else the current name", () => {
    expect(proposeSheetName({ floor: "First Floor", title: "FIRST FLOOR POWER PLAN", number: "E-101" }, "Sheet 1")).toBe("First Floor");
    expect(proposeSheetName({ floor: null, title: "ELECTRICAL RISER DIAGRAM", number: "E-501" }, "Sheet 2")).toBe("Electrical Riser Diagram");
    expect(proposeSheetName({ number: "E-001" }, "Sheet 3")).toBe("E-001");
    expect(proposeSheetName({}, "Sheet 4")).toBe("Sheet 4");
  });
});

/** The real sample PDFs in samples/, read in Node with the PDF.js legacy build (the same text the browser gets). */
async function readSample(file: string): Promise<FloorTextItem[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(path.resolve(__dirname, "..", "samples", file)));
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  const pages: FloorTextItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    pages.push(pageTextItems(await page.getTextContent(), page.getViewport({ scale: 1 })));
  }
  await task.destroy();
  return pages;
}

describe("sample plan sets (samples/)", () => {
  it("demo-plan-set.pdf: the floor names that the title-only rule missed", async () => {
    const pages = await readSample("demo-plan-set.pdf");
    expect(pages.map((p) => parseFloorName(p))).toEqual(["Attic", "1st Fl", "2nd Fl", "Cellar"]);
    // Root cause: none of these title blocks says PLAN / DETAILS…, so no sheet title was ever proposed.
    expect(pages.map((p) => parseSheetTitle(p, parseSheetNumber(p)))).toEqual([null, null, null, null]);
    expect(pages.map((p) => proposeSheetMeta(p).number)).toEqual(["A-101", "A-102", "A-103", "A-104"]);
  });

  it("doors-windows-demo.pdf: a title block in small print", async () => {
    const [page] = await readSample("doors-windows-demo.pdf");
    expect(parseFloorName(page)).toBe("1st Fl");
  });
});
