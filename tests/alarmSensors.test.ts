// Alarm sensors from openings (docs/find-similar.md): which types are doors / windows, where Add sensors puts door
// contacts, window contacts and glass-breaks, that nothing is placed twice, the takeoff's "Openings" summary, the
// built-in items older catalogs get, and that $0 openings stay off the estimate. Same cases as
// ios/PinPlanCore/Tests/PinPlanCoreTests/AlarmSensorTests.swift.
import { describe, expect, it } from "vitest";
import {
  missingSensorTypes,
  openingKind,
  openingsSummary,
  planSensors,
  sensorOffsetPx,
  sheetOpenings,
  windowClusterPx,
  windowGroups,
  type Opening,
} from "@/lib/alarmSensors";
import { ALARM_SEED_IDS, DEFAULT_SETTINGS, OPENING_TYPE_IDS, seedCatalog } from "@/lib/catalog";
import { buildEstimate } from "@/lib/estimate";
import { computeTakeoff } from "@/lib/takeoff";
import { builtInAdditions, tradePack, typeVisible } from "@/lib/trades";
import type { DeviceType, Marker, Sheet } from "@/lib/types";

const SHEET = { id: "s1", width: 1000, height: 500, pxPerFt: 10 };
const op = (id: string, kind: "door" | "window", x: number, y: number, room = ""): Opening => ({ id, kind, x, y, room });
const mk = (id: string, deviceTypeId: string, x: number, y: number, room = "", sheetId = "s1"): Marker => ({
  id, projectId: "p1", sheetId, deviceTypeId, x, y, label: id, room, mount: "wall", wireType: "None", tentative: false, notes: "", createdAt: "", updatedAt: "",
});
const DX = (20 * Math.SQRT1_2) / 1000;
const DY = (20 * Math.SQRT1_2) / 500;

// Two doors, two windows in the kitchen (room written two ways), two windows close together with no room, and one
// window far from them.
const OPENINGS: Opening[] = [
  op("d1", "door", 0.1, 0.5),
  op("d2", "door", 0.5, 0.5, "Kitchen"),
  op("w1", "window", 0.2, 0.2, "Kitchen"),
  op("w2", "window", 0.3, 0.2, "kitchen "),
  op("w3", "window", 0.8, 0.2),
  op("w4", "window", 0.85, 0.25),
  op("w5", "window", 0.8, 0.9),
];

describe("which types are openings", () => {
  it("the generic Door and Window, and the company's own door / window types", () => {
    expect(openingKind({ id: "gen-door", name: "Anything" })).toBe("door");
    expect(openingKind({ id: "gen-window", name: "Anything" })).toBe("window");
    expect(openingKind({ id: "x1", name: "Sliding door" })).toBe("door");
    expect(openingKind({ id: "x2", name: "Doors" })).toBe("door");
    expect(openingKind({ id: "x3", name: "Window" })).toBe("window");
    expect(openingKind(undefined)).toBeNull();
  });

  it("not sensors, hardware or other things named after a door or window", () => {
    for (const name of ["Door contact", "Window contact", "Window sensor", "Door strike", "Doorbell", "Window shade", "Door chime", "Garage door opener", "Glass-break detector", "Indoor camera"])
      expect(openingKind({ id: "x", name }), name).toBeNull();
    for (const id of ALARM_SEED_IDS) expect(openingKind({ id, name: "Door" })).toBeNull();
  });

  it("lists the live doors and windows of one sheet with their rooms", () => {
    const catalog = [{ id: "gen-door", name: "Door" }, { id: "gen-window", name: "Window" }, { id: "cam-indoor", name: "Indoor camera" }];
    const markers = [mk("a", "gen-door", 0.1, 0.1, " Hall "), mk("b", "gen-window", 0.2, 0.2), mk("c", "cam-indoor", 0.3, 0.3), mk("d", "gen-door", 0.4, 0.4, "", "s2"), { ...mk("e", "gen-window", 0.5, 0.5), deleted: true }];
    expect(sheetOpenings(markers, catalog, "s1")).toEqual([op("a", "door", 0.1, 0.1, "Hall"), op("b", "window", 0.2, 0.2)]);
  });
});

describe("where sensors go", () => {
  it("offset 2 ft with a scale, 2.5% of the long side without; windows group within 15 ft / 6%", () => {
    expect(sensorOffsetPx(SHEET)).toBe(20);
    expect(sensorOffsetPx({ id: "s", width: 2000, height: 1000 })).toBe(50);
    expect(windowClusterPx(SHEET)).toBe(150);
    expect(windowClusterPx({ id: "s", width: 2000, height: 1000, pxPerFt: null })).toBe(120);
  });

  it("a contact on each door and window, up and to the right of it", () => {
    const p = planSensors(OPENINGS, [], SHEET, { kinds: ["door", "window"] });
    expect(p.counts).toEqual({ door: 2, window: 5, glass: 0 });
    expect(p.placements.map((x) => x.deviceTypeId)).toEqual(["door-contact", "door-contact", "window-contact", "window-contact", "window-contact", "window-contact", "window-contact"]);
    const d2 = p.placements[1];
    expect(d2.openingIds).toEqual(["d2"]);
    expect(d2.room).toBe("Kitchen");
    expect(d2.x).toBeCloseTo(0.5 + DX, 9);
    expect(d2.y).toBeCloseTo(0.5 - DY, 9);
  });

  it("one glass-break per room with windows; windows without a room grouped by distance", () => {
    const p = planSensors(OPENINGS, [], SHEET, { kinds: ["glass"] });
    expect(p.counts).toEqual({ door: 0, window: 0, glass: 3 });
    expect(p.placements.map((x) => x.openingIds)).toEqual([["w1", "w2"], ["w3", "w4"], ["w5"]]);
    expect(p.placements[0].room).toBe("Kitchen");
    // At the middle of its windows, up and to the left.
    expect(p.placements[0].x).toBeCloseTo(0.25 - DX, 9);
    expect(p.placements[0].y).toBeCloseTo(0.2 - DY, 9);
    expect(p.placements[1].x).toBeCloseTo(0.825 - DX, 9);
    expect(p.placements[1].y).toBeCloseTo(0.225 - DY, 9);
  });

  it("never twice: openings and rooms that already have their sensor are covered", () => {
    const existing = [
      mk("e1", "door-contact", 0.11, 0.5), // 10 px from d1
      mk("e2", "glass-break", 0.5, 0.5, "KITCHEN"),
      mk("e3", "window-contact", 0.2, 0.2, "", "s2"), // another sheet
      { ...mk("e4", "window-contact", 0.3, 0.2), deleted: true },
    ];
    const p = planSensors(OPENINGS, existing, SHEET, { kinds: ["door", "window", "glass"] });
    expect(p.counts).toEqual({ door: 1, window: 5, glass: 2 });
    expect(p.covered).toEqual({ door: 1, window: 0, glass: 1 });
    // Running it again after placing finds nothing new.
    const placed = p.placements.map((x, i) => mk(`n${i}`, x.deviceTypeId, x.x, x.y, x.room));
    const again = planSensors(OPENINGS, [...existing, ...placed], SHEET, { kinds: ["door", "window", "glass"] });
    expect(again.placements).toEqual([]);
    expect(again.covered).toEqual({ door: 2, window: 5, glass: 3 });
  });

  it("a glass-break near loose windows covers their group", () => {
    const p = planSensors(OPENINGS, [mk("g", "glass-break", 0.82, 0.3)], SHEET, { kinds: ["glass"] });
    expect(p.placements.map((x) => x.openingIds)).toEqual([["w1", "w2"], ["w5"]]);
  });

  it("openings left out get nothing", () => {
    const p = planSensors(OPENINGS, [], SHEET, { kinds: ["door", "window", "glass"], excluded: ["w5", "d1"] });
    expect(p.counts).toEqual({ door: 1, window: 4, glass: 2 });
    expect(p.placements.some((x) => x.openingIds.includes("w5") || x.openingIds.includes("d1"))).toBe(false);
  });

  it("stays on the sheet", () => {
    const p = planSensors([op("d", "door", 1, 0)], [], SHEET, { kinds: ["door"] });
    expect([p.placements[0].x, p.placements[0].y]).toEqual([1, 0]);
  });

  it("groups keep the order of their first window", () => {
    const g = windowGroups([op("a", "window", 0, 0), op("b", "window", 0.5, 0, "Den"), op("c", "window", 0.01, 0), op("d", "window", 0.6, 0, "den")], (x, y) => Math.abs(x.x - y.x) < 0.05);
    expect(g.map((x) => [x.room, x.windows.map((w) => w.id)])).toEqual([
      ["", ["a", "c"]],
      ["Den", ["b", "d"]],
    ]);
  });

  it("sensor types missing from the price list", () => {
    const cat = seedCatalog();
    expect(missingSensorTypes(cat)).toEqual([]);
    expect(missingSensorTypes(cat.map((d) => (d.id === "glass-break" ? { ...d, archived: true } : d)))).toEqual(["glass"]);
    expect(missingSensorTypes(cat.filter((d) => d.id !== "door-contact"), ["door", "window"])).toEqual(["door"]);
  });
});

describe("takeoff: openings", () => {
  const sheets: Sheet[] = [
    { id: "s1", projectId: "p1", name: "1st Fl", order: 0, imageId: "i1", width: 1000, height: 500, pxPerFt: 10 } as Sheet,
    { id: "s2", projectId: "p1", name: "2nd Fl", order: 1, imageId: "i2", width: 1000, height: 500, pxPerFt: 10 } as Sheet,
  ];
  const catalog = [...seedCatalog(), ...builtInAdditions(seedCatalog()), { id: "my-door", name: "Patio door" } as DeviceType];
  const markers = [
    mk("a", "gen-door", 0.1, 0.1), mk("b", "my-door", 0.2, 0.1), mk("c", "gen-window", 0.3, 0.1), mk("d", "gen-window", 0.3, 0.1, "", "s2"),
    mk("e", "door-contact", 0.1, 0.1), mk("f", "window-contact", 0.3, 0.1, "", "s2"), mk("g", "glass-break", 0.3, 0.1, "", "s2"), mk("h", "cam-indoor", 0.5, 0.5),
  ];
  it("doors and windows per floor and in total, and the sensors once there are any", () => {
    const s = openingsSummary(computeTakeoff({ sheets, markers, runs: [], closets: [] }), catalog);
    expect(s.floors.map((f) => [f.name, f.counts])).toEqual([
      ["1st Fl", { doors: 2, windows: 1, doorContacts: 1, windowContacts: 0, glassBreaks: 0 }],
      ["2nd Fl", { doors: 0, windows: 1, doorContacts: 0, windowContacts: 1, glassBreaks: 1 }],
    ]);
    expect(s.total).toEqual({ doors: 2, windows: 2, doorContacts: 1, windowContacts: 1, glassBreaks: 1 });
    expect([s.hasOpenings, s.hasSensors]).toEqual([true, true]);
    const none = openingsSummary(computeTakeoff({ sheets, markers: [mk("h", "cam-indoor", 0.5, 0.5)], runs: [], closets: [] }), catalog);
    expect([none.hasOpenings, none.hasSensors]).toEqual([false, false]);
  });
});

describe("catalog: alarm items and openings for everyone", () => {
  it("older catalogs get the alarm items and Door / Window, once, dated 1970, sorted after their items", () => {
    const old = seedCatalog().filter((d) => !ALARM_SEED_IDS.includes(d.id));
    const add = builtInAdditions(old);
    expect(add.map((d) => d.id)).toEqual([...ALARM_SEED_IDS, ...OPENING_TYPE_IDS]);
    expect(add.every((d) => d.updatedAt === new Date(0).toISOString())).toBe(true);
    expect(add.map((d) => d.sort)).toEqual(add.map((_, i) => old.length + i));
    expect(add.find((d) => d.id === "door-contact")).toMatchObject({ name: "Door contact", symbol: "DC", category: "security", unitPrice: 8, laborPrice: 45, defaultWire: "22/4 alarm" });
    expect(add.find((d) => d.id === "gen-door")).toMatchObject({ name: "Door", category: "general", unitPrice: 0 });
    // Nothing comes back that the catalog has a row for, archived or not.
    expect(builtInAdditions([...old, ...add])).toEqual([]);
    expect(builtInAdditions([...old, ...add.map((d) => ({ ...d, archived: true }))])).toEqual([]);
    expect(builtInAdditions(seedCatalog()).map((d) => d.id)).toEqual(OPENING_TYPE_IDS);
  });

  it("Door and Window are in every trade's palette", () => {
    const door = tradePack("general").catalog.find((s) => s.id === "gen-door")!;
    for (const t of ["lowvoltage", "electrical", "fire", "hvac", "plumbing", "solar", "general"] as const) expect(typeVisible({ id: door.id, category: door.category }, [t]), t).toBe(true);
    expect(typeVisible({ id: "gen-door", category: "general", archived: true }, ["electrical"])).toBe(false);
    // Other General items stay with the General trade.
    expect(typeVisible({ id: "gen-item", category: "general" }, ["electrical"])).toBe(false);
  });

  it("$0 doors and windows stay off the estimate; priced ones are on it", () => {
    const catalog = [...seedCatalog(), ...builtInAdditions(seedCatalog())];
    const takeoff = computeTakeoff({
      sheets: [{ id: "s1", projectId: "p1", name: "1", order: 0, imageId: "i", width: 1000, height: 500 } as Sheet],
      markers: [mk("a", "gen-door", 0.1, 0.1), mk("b", "gen-window", 0.2, 0.1), mk("c", "door-contact", 0.1, 0.1)],
      runs: [],
      closets: [],
    });
    for (const laborMode of ["combined", "separate"] as const) {
      const pricing = { ...DEFAULT_SETTINGS.pricing, laborMode };
      const keys = buildEstimate(takeoff, catalog, pricing).lines.map((l) => l.key);
      expect(keys.some((k) => k.includes("gen-"))).toBe(false);
      expect(keys).toContain("dev:door-contact");
      const priced = buildEstimate(takeoff, catalog.map((d) => (d.id === "gen-window" ? { ...d, laborPrice: 30 } : d)), pricing).lines.map((l) => l.key);
      expect(priced).toContain("dev:gen-window");
      expect(priced).not.toContain("dev:gen-door");
    }
    const est = buildEstimate(takeoff, catalog, DEFAULT_SETTINGS.pricing);
    expect(est.lines.find((l) => l.key === "dev:door-contact")).toMatchObject({ qty: 1, unitPrice: 53 });
  });
});
