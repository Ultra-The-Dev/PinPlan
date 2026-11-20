// CSV formula injection: every CSV export runs text through csvCell, so a room, device or crew name typed as a formula
// (=1+1, =HYPERLINK(…), +cmd, -2+3, @SUM) opens in a spreadsheet as text, while numbers (and counts) stay numbers.
import { describe, expect, it } from "vitest";
import { csvCell as accountingCsvCell } from "@/lib/accountingExport";
import { seedCatalog } from "@/lib/catalog";
import { applyPriceList, catalogToCsv, parseCsv } from "@/lib/catalogCsv";
import { csvCell, csvUnescape } from "@/lib/csv";
import { weeklyHoursCsv, type WeeklyHours } from "@/lib/dailyReport";
import { computeTakeoff, takeoffCsv, toCsv } from "@/lib/takeoff";
import type { Marker, Sheet } from "@/lib/types";
import { cableLabelsCsv, materialCsv, portScheduleCsv, type MaterialRow, type PortRow } from "@/lib/wiring";

const EVIL = "=1+1";
const ts = "2026-11-15T00:00:00.000Z";
/** Every cell of a CSV text, unquoted. */
const cells = (csv: string) => parseCsv(csv).flat();
/** No cell of the file would run as a formula. */
function noFormulas(csv: string) {
  for (const c of cells(csv)) expect(/^[=+@\t\r]/.test(c) || (/^-/.test(c) && !/^-?\d+(\.\d+)?$/.test(c))).toBe(false);
}

describe("csvCell", () => {
  it("is the one accountingExport exports", () => {
    expect(accountingCsvCell).toBe(csvCell);
  });

  it("prefixes ' to text starting with = + - @ tab or CR", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell("\r=1")).toBe("\"'\r=1\"");
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it("leaves numbers and ordinary text alone", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(0)).toBe("0");
    expect(csvCell("Living room")).toBe("Living room");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes on quote, comma, CR or LF", () => {
    expect(csvCell('a "b"')).toBe('"a ""b"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
  });

  it("csvUnescape takes off only the prefix csvCell adds", () => {
    expect(csvUnescape("'=1+1")).toBe("=1+1");
    expect(csvUnescape("'quoted'")).toBe("'quoted'");
    expect(csvUnescape("plain")).toBe("plain");
  });
});

describe("exports with a '=1+1' room name", () => {
  it("toCsv (home-run schedule on the crew tab)", () => {
    const csv = toCsv([["Floor", "Label", "Device", "Room", "Cable ft"], ["1st Fl", "WAP-1-01", "WAP", EVIL, 42]]);
    expect(csv).toContain("'=1+1");
    expect(csv.split("\n")[1]).toBe("1st Fl,WAP-1-01,WAP,'=1+1,42");
    noFormulas(csv);
  });

  it("takeoff CSV (a floor named like a formula); counts unchanged", () => {
    const sheet: Sheet = { id: "s1", projectId: "p", name: EVIL, pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, pxPerFt: 1, createdAt: ts, updatedAt: ts };
    const m = (id: string): Marker => ({ id, projectId: "p", sheetId: "s1", deviceTypeId: "wap", x: 0.5, y: 0.5, label: id, room: EVIL, mount: "ceiling", wireType: "Cat6", closetId: null, tentative: false, notes: "", createdAt: ts, updatedAt: ts });
    const t = computeTakeoff({ sheets: [sheet], markers: [m("a"), m("b")], runs: [], closets: [] });
    const csv = takeoffCsv(t, seedCatalog());
    expect(csv).toContain("'=1+1");
    noFormulas(csv);
    const wap = parseCsv(csv).find((r) => r[0] === "'=1+1" && /access point|wap/i.test(r[1]));
    expect(wap?.[3]).toBe("2");
  });

  const port: PortRow = { closetId: "eq", closetName: "Equipment", port: "PP1-01", cable: "Cat6", markerId: "m", label: "WAP-1-01", deviceLabel: "WAP-1-01", device: "WAP", room: EVIL, floor: "1st Fl", lengthFt: 40, tentative: false } as PortRow;

  it("port schedule and cable labels", () => {
    for (const csv of [portScheduleCsv([port]), cableLabelsCsv([port])]) {
      expect(csv).toContain("'=1+1");
      noFormulas(csv);
    }
    expect(parseCsv(portScheduleCsv([port]))[1][7]).toBe("40");
  });

  it("material list", () => {
    const row = { supplier: EVIL, item: "@SUM(1)", sku: "+1", qty: 3, unit: "each", unitCost: 2.5, total: 7.5, note: "-x" } as MaterialRow;
    const csv = materialCsv([row]);
    noFormulas(csv);
    expect(parseCsv(csv)[1]).toEqual(["'=1+1", "'@SUM(1)", "'+1", "3", "each", "2.5", "7.5", "'-x"]);
  });

  it("weekly hours (a crew member named like a formula)", () => {
    const w: WeeklyHours = { days: ["2026-11-16"], rows: [{ name: EVIL, hours: [8], total: 8 }], dayTotals: [8], total: 8 };
    const csv = weeklyHoursCsv(w);
    expect(csv.split("\n")[1]).toBe("'=1+1,8,8");
    noFormulas(csv);
  });

  it("price list exports safely and imports back to the same names", () => {
    const catalog = seedCatalog();
    const evil = { ...catalog[0], id: "dt-evil", name: EVIL, sort: 9999, archived: false };
    const csv = catalogToCsv([...catalog, evil]);
    expect(csv).toContain("'=1+1");
    noFormulas(csv);
    // Round trip: nothing changes, the formula-looking name still matches its row.
    const same = applyPriceList(csv, [...catalog, evil]);
    expect(same.updated).toEqual([]);
    expect(same.unmatched).toEqual([]);
    expect(same.errors).toEqual([]);
    // Imported as a new item, the name comes back without the ' prefix.
    const created = applyPriceList(csv, catalog, { createMissing: true, newId: () => "new", now: ts });
    expect(created.created.map((t) => t.name)).toEqual([EVIL]);
  });

  it("accounting export cell", () => {
    expect(accountingCsvCell(EVIL)).toBe("'=1+1");
    expect(accountingCsvCell(-12.5)).toBe("-12.5");
  });
});
