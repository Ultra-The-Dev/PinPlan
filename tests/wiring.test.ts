import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog";
import { cableLabelsCsv, materialList, portSchedule } from "@/lib/wiring";
import type { Closet, Marker, Product, Project, Run, Sheet } from "@/lib/types";

const ts = "2026-11-15T00:00:00.000Z";
const catalog = seedCatalog();
const sheets: Sheet[] = [
  { id: "s2", projectId: "p", name: "2nd Fl", pageNumber: 2, order: 1, imageId: "i", width: 100, height: 100, pxPerFt: 1, createdAt: ts, updatedAt: ts },
  { id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, pxPerFt: 1, createdAt: ts, updatedAt: ts },
];
const project: Project = { id: "p", clientName: "", address: "", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
const eq: Closet = { id: "eq", projectId: "p", sheetId: "s1", kind: "equipment", x: 0, y: 0, name: "Equipment closet", createdAt: ts, updatedAt: ts };
const mk = (id: string, deviceTypeId: string, sheetId: string, label: string, extra: Partial<Marker> = {}): Marker => ({
  id, projectId: "p", sheetId, deviceTypeId, x: 0.5, y: 0.5, label, room: "Den", mount: "wall", wireType: "Cat6", closetId: "eq", tentative: false, notes: "", createdAt: ts, updatedAt: ts, ...extra,
});
const run = (markerId: string, sheetId: string, ft: number, cables: string[]): Run => ({
  id: `r-${markerId}`, projectId: "p", sheetId, kind: "wire", points: [0, 0, 1, 1], typedFt: ft, wireType: cables[0], wireTypes: cables.length > 1 ? cables : null, markerId, closetId: "eq", createdAt: ts, updatedAt: ts,
});

describe("port schedule", () => {
  const markers = [
    mk("tv", "tv", "s2", "TV-2-01", { wireType: "HDMI", wires: ["HDMI", "Cat6", "Cat6"] }),
    mk("w2", "wap", "s1", "WAP-1-02"),
    mk("w10", "wap", "s1", "WAP-1-10"),
    mk("spk", "speaker", "s1", "SPK-1-01", { wireType: "16/4 speaker" }),
    mk("nc", "wap", "s1", "WAP-1-11", { closetId: null }),
  ];
  const rows = portSchedule({ project, sheets, markers, runs: [run("tv", "s2", 60, ["HDMI", "Cat6", "Cat6"])], closets: [eq] }, catalog);

  it("numbers ports per closet in floor then label order, patch panels for Cat6", () => {
    expect(rows.map((r) => `${r.label}:${r.port}`)).toEqual([
      "SPK-1-01:SPK-01",
      "WAP-1-02:PP1-01",
      "WAP-1-10:PP1-02",
      "WAP-1-11:",
      "TV-2-01:HD-01",
      "TV-2-01-A:PP1-03",
      "TV-2-01-B:PP1-04",
    ]);
    expect(rows.find((r) => r.label === "TV-2-01-A")!.lengthFt).toBe(60);
  });

  it("rolls over to a second patch panel after 24 ports", () => {
    const many = Array.from({ length: 26 }, (_, i) => mk(`m${i}`, "wap", "s1", `WAP-1-${String(i + 1).padStart(2, "0")}`));
    const r = portSchedule({ project, sheets, markers: many, runs: [], closets: [eq] }, catalog);
    expect(r[23].port).toBe("PP1-24");
    expect(r[24].port).toBe("PP2-01");
  });

  it("makes two labels per cable", () => {
    const csv = cableLabelsCsv(rows).split("\n");
    expect(csv[0]).toBe("Cable ID,Device end,Closet end,Cable,Closet,Port,Room,Floor");
    expect(csv).toContain("TV-2-01-A,TV-2-01-A → Equipment closet PP1-03,PP1-03 → TV-2-01-A Den,Cat6,Equipment closet,PP1-03,Den,2nd Fl");
  });
});

describe("material order list", () => {
  const u7: Product = { id: "u7", deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro", sku: "U7-Pro", unitPrice: 189, laborPrice: 0, updatedAt: ts };
  const belden: Product = { id: "bel", deviceTypeId: "wire:Cat6", brand: "Belden", model: "2412", unitPrice: 0.3, laborPrice: 0, updatedAt: ts };
  const markers = [mk("w1", "wap", "s1", "WAP-1-01"), mk("w2", "wap", "s1", "WAP-1-02", { tentative: true }), mk("tv", "tv", "s1", "TV-1-01", { wires: ["HDMI", "Cat6"], wireType: "HDMI" })];
  const runs = [run("w1", "s1", 700, ["Cat6"]), run("w2", "s1", 400, ["Cat6"]), run("tv", "s1", 32, ["HDMI", "Cat6"])];
  const proj = { ...project, productChoices: { wap: "u7", "wire:Cat6": "bel" } };
  const list = materialList({ project: proj, sheets, markers, runs, closets: [eq] }, catalog, [u7, belden], { includeTentative: false });

  it("orders devices by product and leaves out ? items unless included", () => {
    expect(list.find((r) => r.item.startsWith("Ubiquiti U7 Pro"))).toMatchObject({ supplier: "Ubiquiti", qty: 1, unitCost: 189, sku: "U7-Pro" });
    expect(list.find((r) => r.item === "TV location")).toMatchObject({ supplier: "No product chosen", qty: 1 });
    const withQ = materialList({ project: proj, sheets, markers, runs, closets: [eq] }, catalog, [u7, belden], { includeTentative: true });
    expect(withQ.find((r) => r.item.startsWith("Ubiquiti U7 Pro"))!.qty).toBe(2);
  });

  it("buys cable by the box and HDMI by stock length", () => {
    const cat6 = list.find((r) => r.item.includes("Cat6 cable"))!;
    expect(cat6).toMatchObject({ supplier: "Belden", qty: 2, unit: "box", unitCost: 300 });
    expect(cat6.note).toBe("1132 ft needed · 868 ft left over");
    expect(list.find((r) => r.item.startsWith("HDMI cable"))).toMatchObject({ item: "HDMI cable — 35 ft", qty: 1 });
  });

  it("adds jacks, patch panels and patch cords for each Cat6 cable", () => {
    expect(list.find((r) => r.item === "Cat6 keystone jack")!.qty).toBe(2); // the ? access point is left out
    expect(list.find((r) => r.item === "24-port Cat6 patch panel")!.qty).toBe(1);
  });
});
