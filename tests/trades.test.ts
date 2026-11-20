// Trade packs: low voltage must look exactly as before; the other packs must be well-formed; the panel schedule and
// the trade-aware helpers derive from the plan. Same rules as ios/PinPlanCore/Tests/PinPlanCoreTests/TradeTests.swift.
import { describe, expect, it } from "vitest";
import { ALARM_SEED_IDS, CATEGORIES, CLOSET_KINDS, LAYERS, LOW_VOLTAGE_CATEGORIES, WIRE_TYPES, closetMeta, seedCatalog } from "@/lib/catalog";
import { buildEstimate } from "@/lib/estimate";
import { CHECKLIST_TEMPLATES, allChecklistTemplates } from "@/lib/fieldDocs";
import { buildLegend } from "@/lib/legend";
import { circuitSpaces, numberCircuits, panelSchedule, panelScheduleCsv } from "@/lib/panelSchedule";
import { buildScanPrompt } from "@/lib/scanParse";
import { buildExplainPrompt } from "@/lib/planRead";
import { computeTakeoff } from "@/lib/takeoff";
import {
  TRADE_IDS,
  TRADE_PACKS,
  allCategoriesFor,
  deviceSpec,
  normalizeTrades,
  packAdditions,
  seedToDeviceType,
  tradeCategories,
  tradeChecklists,
  tradeClosetKinds,
  tradeLayers,
  tradePack,
  tradeVocab,
  tradeWireTypes,
  typeVisible,
  wireForBreaker,
} from "@/lib/trades";
import { DEFAULT_SETTINGS } from "@/lib/catalog";
import type { Closet, DeviceType, Marker, Run, Sheet, TradeId } from "@/lib/types";

const ts = "2026-11-20T00:00:00.000Z";
const LV: TradeId[] = ["lowvoltage"];
const EL: TradeId[] = ["electrical"];

describe("low voltage stays exactly as it was", () => {
  it("no trades set means low voltage", () => {
    expect(normalizeTrades(undefined)).toEqual(["lowvoltage"]);
    expect(normalizeTrades([])).toEqual(["lowvoltage"]);
    expect(normalizeTrades(["nope", "electrical", "electrical", 3])).toEqual(["electrical"]);
  });

  it("same categories, names, colours and order", () => {
    const original = CATEGORIES.filter((c) => LOW_VOLTAGE_CATEGORIES.includes(c.id));
    expect(tradeCategories(LV)).toEqual(original);
    expect(original.map((c) => c.id)).toEqual(["security", "network", "audio", "video", "smarthome", "lighting", "shades", "infrastructure"]);
    expect(allCategoriesFor(LV).slice(0, 8)).toEqual(original);
  });

  it("same layer toggles, wire list, closets and checklists", () => {
    expect(tradeLayers(LV)).toEqual([...LOW_VOLTAGE_CATEGORIES.map((id) => LAYERS.find((l) => l.id === id)!), { id: "wiring", name: "Wiring" }]);
    expect(tradeWireTypes(LV)).toEqual(WIRE_TYPES.filter((w) => w !== "None"));
    expect(tradeClosetKinds(LV).map((k) => [k.id, k.name, k.abbrev, k.color])).toEqual([
      ["equipment", "Equipment closet", "EQ", "#16a34a"],
      ["switch", "Switch closet", "SW", "#15803d"],
      ["rack", "Network rack", "RK", "#166534"],
    ]);
    expect(tradeChecklists(LV)).toEqual(CHECKLIST_TEMPLATES);
    expect(allChecklistTemplates([], tradeChecklists(LV))).toEqual(allChecklistTemplates([]));
    expect(tradeVocab(LV)).toEqual({ run: "Wire run", runs: "Home runs", runHint: "device → closet", closet: "closet", wire: "Cable" });
  });

  it("the whole original catalog is in the palette, archived items are not", () => {
    for (const d of seedCatalog()) expect(typeVisible(d, LV)).toBe(true);
    expect(typeVisible({ ...seedCatalog()[0], archived: true }, LV)).toBe(false);
    // The company's own types in its categories show too.
    expect(typeVisible({ id: "custom-1", category: "network" }, LV)).toBe(true);
  });

  it("the low-voltage pack is the original seed catalog (prices still start at 0, except the alarm items)", () => {
    const lv = tradePack("lowvoltage");
    expect(lv.catalog.map((s) => s.id)).toEqual(seedCatalog().map((d) => d.id));
    expect(lv.catalog.filter((s) => !ALARM_SEED_IDS.includes(s.id)).every((s) => s.unitPrice === 0 && s.laborPrice === 0)).toBe(true);
    // The alarm items come after the original 19, so the original sort order is unchanged.
    expect(lv.catalog.slice(19).map((s) => s.id)).toEqual(ALARM_SEED_IDS);
    for (const s of lv.catalog.slice(19)) {
      expect(s.category).toBe("security");
      expect(s.unitPrice, s.id).toBeGreaterThan(0);
      expect(s.laborPrice, s.id).toBeGreaterThan(0);
      expect(s.defaultWire).toBe("22/4 alarm");
      expect(s.description, s.id).toBeTruthy();
    }
    expect(WIRE_TYPES).toContain("22/4 alarm");
  });

  it("the default scan and plan-reader prompts are unchanged", () => {
    const cat = [{ id: "wap", name: "Wi-Fi", symbol: "W", category: "network" }];
    expect(buildScanPrompt(cat, "full", LV)).toBe(buildScanPrompt(cat, "full"));
    expect(buildScanPrompt(cat, "full")).toContain("low-voltage / smart-home installer");
    expect(buildExplainPrompt({ trades: LV })).toBe(buildExplainPrompt({}));
  });
});

describe("trade packs are well formed", () => {
  const allSeedIds = new Map<string, string>();
  for (const p of TRADE_PACKS) {
    it(`${p.id}`, () => {
      expect(TRADE_IDS).toContain(p.id);
      const ids = p.catalog.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      const cats = p.categories.map((c) => c.id);
      for (const s of p.catalog) {
        expect(cats, `${s.id} category ${s.category}`).toContain(s.category);
        expect(CATEGORIES.map((c) => c.id)).toContain(s.category);
        expect(s.symbol.length, s.id).toBeGreaterThan(0);
        expect(s.symbol.length, s.id).toBeLessThanOrEqual(3);
        expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
        expect(s.unitPrice).toBeGreaterThanOrEqual(0);
        if (s.kind === "led") expect(s.unit).toBe("LF");
        if (s.defaultWire && s.defaultWire !== "None" && p.id !== "lowvoltage") expect(p.wireTypes, `${s.id} wire`).toContain(s.defaultWire);
      }
      for (const k of p.closets) expect(CLOSET_KINDS.map((c) => c.id)).toContain(k);
      for (const w of Object.keys(p.wirePrices)) expect(p.wireTypes).toContain(w);
      for (const c of p.checklists) expect(c.items.length).toBeGreaterThan(0);
    });
  }

  it("a type shared by two packs is the same item in both", () => {
    for (const p of TRADE_PACKS)
      for (const s of p.catalog) {
        const prev = allSeedIds.get(s.id);
        if (prev) expect(JSON.stringify(s)).toBe(prev);
        allSeedIds.set(s.id, JSON.stringify(s));
      }
    expect(tradePack("electrical").catalog.some((s) => s.id === "ev-charger")).toBe(true);
    expect(tradePack("solar").catalog.some((s) => s.id === "ev-charger")).toBe(true);
  });

  it("checklist template ids are unique across packs", () => {
    const ids = TRADE_PACKS.flatMap((p) => p.checklists.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("electrical", () => {
  const el = tradePack("electrical");
  it("covers receptacles, switches, lighting, life safety and equipment with plan letters", () => {
    const sym = new Map(el.catalog.map((s) => [s.id, s.symbol]));
    expect(sym.get("el-rec20")).toBe("R20");
    expect(sym.get("el-gfci")).toBe("GFI");
    expect(sym.get("el-sw3")).toBe("S3");
    expect(sym.get("el-dim")).toBe("D");
    expect(sym.get("el-can6")).toBe("CAN");
    for (const id of ["el-rec15", "el-wr", "el-usb", "el-floor", "el-dryer", "el-range", "el-sw4", "el-occ", "el-timer", "el-can4", "el-pend", "el-fan", "el-ext", "el-ucab", "el-exit", "el-smoke", "el-co", "el-combo", "el-disc", "el-acdisc", "el-jbox", "el-meter", "el-xfmr", "ev-charger"])
      expect(sym.has(id), id).toBe(true);
    expect(el.wireTypes).toEqual(expect.arrayContaining(["14/2 NM-B", "12/2 NM-B", "12/3 NM-B", "10/2 NM-B", "6/3 NM-B", "14/2 MC", "12/2 MC", 'EMT 1/2"', 'EMT 3/4"']));
    expect(tradeVocab(EL).run).toBe("Circuit");
    expect(tradeClosetKinds(EL).map((k) => k.id)).toEqual(["panel", "subpanel"]);
  });

  it("shows its own items and the company's own in its categories, not the low-voltage starting catalog", () => {
    expect(typeVisible({ id: "el-rec20", category: "power" }, EL)).toBe(true);
    expect(typeVisible({ id: "cam-indoor", category: "security" }, EL)).toBe(false);
    expect(typeVisible({ id: "custom", category: "power" }, EL)).toBe(true);
    expect(typeVisible({ id: "custom", category: "security" }, EL)).toBe(false);
    // Electrical + low voltage: both.
    expect(typeVisible({ id: "cam-indoor", category: "security" }, ["electrical", "lowvoltage"])).toBe(true);
    expect(tradeCategories(["electrical", "lowvoltage"])[0].name).toBe("Receptacles");
    expect(tradeCategories(["electrical", "lowvoltage"]).find((c) => c.id === "lighting")!.name).toBe("Lighting");
  });

  it("device loads and circuits", () => {
    expect(deviceSpec({ id: "el-rec20", category: "power" })).toEqual({ va: 180, breakerA: 20, volts: 120, poles: 1 });
    expect(deviceSpec({ id: "el-range", category: "power" })).toEqual({ va: 8000, breakerA: 50, volts: 240, poles: 2 });
    expect(deviceSpec({ id: "mine", category: "power" }).va).toBe(180);
    expect(deviceSpec({ id: "cam-indoor", category: "security" }).va).toBe(0);
    expect(wireForBreaker(15)).toBe("14/2 NM-B");
    expect(wireForBreaker(20)).toBe("12/2 NM-B");
    expect(wireForBreaker(30, 240)).toBe("10/3 NM-B");
    expect(wireForBreaker(50, 240)).toBe("6/3 NM-B");
  });

  it("adding the pack only adds what's missing — never replaces, never deletes", () => {
    const catalog = seedCatalog();
    const mine: DeviceType = { ...seedToDeviceType(el.catalog[0], 0, ts), unitPrice: 9.99, name: "My receptacle" };
    const add = packAdditions("electrical", [...catalog, mine], { "12/2 NM-B": 1.11 }, ts);
    expect(add.types.some((t) => t.id === mine.id)).toBe(false);
    expect(add.types.length).toBe(el.catalog.length - 1);
    expect(Math.min(...add.types.map((t) => t.sort))).toBeGreaterThan(Math.max(...catalog.map((t) => t.sort)));
    expect(add.wirePrices["12/2 NM-B"]).toBeUndefined();
    expect(add.wirePrices["14/2 NM-B"]).toBe(0.65);
    const again = packAdditions("electrical", [...catalog, ...add.types, mine], { ...DEFAULT_SETTINGS.pricing.wirePrices, ...add.wirePrices, "12/2 NM-B": 1 }, ts);
    expect(again.types).toEqual([]);
    expect(again.wirePrices).toEqual({});
  });

  it("scan prompt speaks electrical and keeps the catalog", () => {
    const p = buildScanPrompt([{ id: "el-gfci", name: "GFCI receptacle", symbol: "GFI", category: "power" }], "full", EL);
    expect(p).toContain("electrical contractor");
    expect(p).toContain("el-gfci");
    expect(p).not.toContain("low-voltage / smart-home");
  });
});

describe("panel schedule", () => {
  const sheet: Sheet = { id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, pxPerFt: 1, createdAt: ts, updatedAt: ts };
  const panel: Closet = { id: "mp", projectId: "p", sheetId: "s1", kind: "panel", x: 0, y: 0, name: "Main panel", createdAt: ts, updatedAt: ts };
  const catalog = tradePack("electrical").catalog.map((s, i) => seedToDeviceType(s, i, ts));
  const mk = (id: string, type: string, room: string, extra: Partial<Marker> = {}): Marker => ({
    id, projectId: "p", sheetId: "s1", deviceTypeId: type, x: 0.5, y: 0.5, label: id.toUpperCase(), room, mount: "wall", wireType: "12/2 NM-B", closetId: "mp", tentative: false, notes: "", createdAt: ts, updatedAt: ts, ...extra,
  });
  const markers = [
    mk("r1", "el-rec20", "Kitchen", { circuit: "1" }),
    mk("r2", "el-rec20", "Kitchen", { circuit: "1" }),
    mk("g1", "el-gfci", "Kitchen", { circuit: "1" }),
    mk("dry", "el-dryer", "Laundry", { wireType: "10/3 NM-B" }),
    mk("c1", "el-can6", "Living", { wireType: "14/2 NM-B" }),
  ];
  const runs: Run[] = [
    { id: "k", projectId: "p", sheetId: "s1", kind: "wire", points: [0, 0, 30, 0].map((v) => v / 100), typedFt: 30, wireType: "12/2 NM-B", markerId: "r1", closetId: "mp", circuit: { number: "1", breakerA: 20, volts: 120, poles: 1, description: "Kitchen counter" }, createdAt: ts, updatedAt: ts },
    { id: "d", projectId: "p", sheetId: "s1", kind: "wire", points: [0, 0, 1, 1], typedFt: 25, wireType: "10/3 NM-B", markerId: "dry", closetId: "mp", circuit: { breakerA: 30, volts: 240, poles: 2 }, createdAt: ts, updatedAt: ts },
  ];
  const [sched] = panelSchedule({ sheets: [sheet], markers, runs, closets: [panel] }, catalog);

  it("groups devices into circuits, in breaker order, with loads", () => {
    expect(sched.name).toBe("Main panel");
    expect(sched.circuits.map((c) => [c.number, c.breakerA, c.poles, c.devices, c.va])).toEqual([
      ["1", 20, 1, 3, 540],
      ["", 30, 2, 1, 5000],
      ["unassigned", 15, 1, 1, 15],
    ]);
    const k = sched.circuits[0];
    expect(k.description).toBe("Kitchen counter");
    expect(k.devicesText).toBe("2 × Duplex receptacle 20A (TR), 1 × GFCI receptacle");
    expect(k.wire).toBe("12/2 NM-B");
    expect(k.wireFt).toBe(30);
    expect(sched.circuits[1].description).toBe("Laundry");
    expect(sched.totalVA).toBe(5555);
    expect(sched.amps240).toBe(23.1);
  });

  it("numbers unnumbered circuits into free spaces (2-pole takes two)", () => {
    expect(numberCircuits(sched)).toEqual({ d: "2/4" });
    expect(circuitSpaces("3/5")).toEqual([3, 5]);
  });

  it("exports CSV", () => {
    const csv = panelScheduleCsv([sched]);
    expect(csv.split("\n")[0]).toBe("Panel,Circuit,Breaker A,Poles,Volts,Description,Devices,Device count,Wire,Wire ft,Load VA");
    expect(csv).toContain("Main panel,1,20,1,120,Kitchen counter");
    expect(csv).toContain("Main panel,Total,,,,,,5,,,5555");
  });

  it("a low-voltage job has no panel schedule", () => {
    const eq: Closet = { ...panel, id: "eq", kind: "equipment", name: "EQ" };
    expect(panelSchedule({ sheets: [sheet], markers: [], runs: [], closets: [eq] }, seedCatalog())).toEqual([]);
  });

  it("panels count in the takeoff and estimate, by their own names", () => {
    const t = computeTakeoff({ sheets: [sheet], markers, runs, closets: [panel] });
    expect(t.total.closets.panel).toBe(1);
    expect(t.total.closets.equipment).toBe(0);
    const est = buildEstimate(t, catalog, DEFAULT_SETTINGS.pricing);
    expect(est.lines.find((l) => l.key === "closet:panel")!.description).toBe("Main panel");
    expect(est.lines.find((l) => l.key === "dev:el-rec20")!.qty).toBe(2);
    expect(est.lines.find((l) => l.key === "wire:12/2 NM-B")!.qty).toBe(30);
  });

  it("the client legend uses the trade's names and descriptions", () => {
    const t = computeTakeoff({ sheets: [sheet], markers, runs, closets: [panel] });
    const legend = buildLegend(t, catalog, () => undefined, EL);
    expect(legend[0].category).toBe("Receptacles");
    expect(legend.find((l) => l.key === "el-gfci")!.description).toContain("Ground-fault");
    expect(legend.find((l) => l.key === "closet:panel")!.description).toContain("electrical panel");
  });
});

describe("tolerant readers", () => {
  it("unknown categories and closet kinds fall back instead of crashing", () => {
    expect(closetMeta("spaceport").abbrev).toBe("EQ");
    expect(tradeCategories(EL).length).toBeGreaterThan(0);
    expect(allCategoriesFor(EL).map((c) => c.id).sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
  });
});
