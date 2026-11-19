import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { buildEstimate } from "@/lib/estimate";
import { buildLegend } from "@/lib/legend";
import { buildSnapshot, newToken, packClientNote, parseClientNote, proposalTotals, sectionTotals } from "@/lib/proposal";
import { computeTakeoff } from "@/lib/takeoff";
import type { Marker, Project, Sheet } from "@/lib/types";

const ts = "2026-11-15T00:00:00.000Z";
const catalog = seedCatalog().map((d) => (d.id === "wap" ? { ...d, unitPrice: 300 } : d.id === "speaker" ? { ...d, unitPrice: 150 } : d));
const sheets: Sheet[] = [{ id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, createdAt: ts, updatedAt: ts }];
const project: Project = { id: "p", clientName: "Jane Client", clientEmail: "jane@example.com", address: "12 Maple Ridge Rd", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
const mk = (id: string, type: string, tentative = false): Marker => ({
  id, projectId: "p", sheetId: "s1", deviceTypeId: type, x: 0.5, y: 0.5, label: id, room: "", mount: "ceiling", wireType: "Cat6", tentative, notes: "", createdAt: ts, updatedAt: ts,
});

describe("client proposal snapshot", () => {
  const markers = [mk("w1", "wap"), mk("w2", "wap"), mk("s1", "speaker", true)];
  const takeoff = computeTakeoff({ sheets, markers, runs: [], closets: [] });
  const pricing = { ...DEFAULT_SETTINGS.pricing, taxPct: 10 };
  const estimate = buildEstimate(takeoff, catalog, pricing, []);
  const snap = buildSnapshot({
    project, sheets, catalog, takeoff, estimate, business: { ...DEFAULT_SETTINGS.business, name: "Bright AV" }, currency: "USD", taxPct: 10,
    validDays: 30, detail: "lines", depositPct: 50, images: { s1: "https://x/s1.jpg" }, now: new Date("2026-11-15T12:00:00Z"),
  });

  it("freezes the client, scope, plans and lines", () => {
    expect(snap.client).toMatchObject({ name: "Jane Client", email: "jane@example.com", address: "12 Maple Ridge Rd" });
    expect(snap.validUntil).toBe("2026-12-15");
    expect(snap.scope.find((s) => s.label === "Devices")?.value).toBe("2");
    expect(snap.floors[0]).toMatchObject({ name: "1st Fl", image: "https://x/s1.jpg" });
    expect(snap.floors[0].items).toContainEqual({ name: "In-ceiling speaker", count: "1 optional" });
    const opt = snap.lines.find((l) => l.optional)!;
    expect(opt.description).toBe("In-ceiling speaker — installed");
    expect(opt.included).toBe(false);
  });

  it("totals follow the client's optional picks, with tax and deposit", () => {
    expect(proposalTotals(snap, [])).toEqual({ subtotal: 600, tax: 60, total: 660, optional: 150, deposit: 330 });
    const key = snap.lines.find((l) => l.optional)!.key;
    expect(proposalTotals(snap, [key]).total).toBe(825);
    expect(sectionTotals(snap.lines, [key]).get("devices")).toBe(750);
  });

  it("makes long, URL-safe link tokens", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9]{22,}$/);
    expect(newToken()).not.toBe(a);
  });
});

describe("plan review (no prices) with a legend", () => {
  const markers = [mk("w1", "wap"), mk("w2", "wap"), mk("s1", "speaker", true), mk("c1", "cam-outdoor")];
  const takeoff = computeTakeoff({ sheets, markers, runs: [], closets: [] });
  const legend = buildLegend(takeoff, catalog, (d) => `icon:${d.id}`);
  const snap = buildSnapshot({
    kind: "review", legend, project, sheets, catalog, takeoff, business: { ...DEFAULT_SETTINGS.business, name: "Bright AV" }, currency: "USD", taxPct: 10,
    validDays: 30, detail: "lines", depositPct: 50, images: { s1: "https://x/s1.jpg" }, now: new Date("2026-11-15T12:00:00Z"),
  });

  it("explains every symbol on the plan, in category order, with counts", () => {
    expect(legend.map((l) => l.key)).toEqual(["cam-outdoor", "wap", "speaker"]);
    expect(legend[1]).toMatchObject({ name: "Wi-Fi access point", count: "2", icon: "icon:wap" });
    expect(legend[1].description).toMatch(/Wi-Fi/);
    expect(legend[2].count).toBe("1 optional");
  });

  it("carries the plans and legend but no prices, terms, deposit or expiry", () => {
    expect(snap.kind).toBe("review");
    expect(snap.title).toBe("Preliminary plan — 12 Maple Ridge Rd");
    expect(snap.lines).toEqual([]);
    expect(snap.terms).toBe("");
    expect(snap.depositPct).toBeNull();
    expect(snap.validUntil).toBeNull();
    expect(snap.legend).toHaveLength(3);
    expect(snap.floors[0].image).toBe("https://x/s1.jpg");
    expect(JSON.stringify(snap)).not.toMatch(/unitPrice|"total"/);
  });
});

describe("client review pins in the note", () => {
  it("packs pins as readable lines numbered in order", () => {
    const note = packClientNote("  Looks good apart from these.  ", [
      { floor: "1st Fl", x: 0.4249, y: 0.3051, note: "move TV" },
      { floor: "2nd Fl", x: 1.4, y: -0.2, note: "add a\nspeaker here " },
      { floor: "", x: 0.5, y: 0.5, note: "" },
    ]);
    expect(note).toBe(
      "Looks good apart from these.\n\nPinned on the plan:\n1st Fl, pin 1 at (42%, 31%): move TV\n2nd Fl, pin 2 at (100%, 0%): add a speaker here\nPlan, pin 3 at (50%, 50%):",
    );
  });

  it("leaves a plain note unchanged and needs no text when there are pins", () => {
    expect(packClientNote("Move the office speaker", [])).toBe("Move the office speaker");
    expect(packClientNote("", [{ floor: "Basement", x: 0.1, y: 0.2, note: "no camera" }])).toBe("Pinned on the plan:\nBasement, pin 1 at (10%, 20%): no camera");
  });

  it("parses pins back with their coordinates (round trip)", () => {
    const parsed = parseClientNote(packClientNote("General: darker speaker grilles", [
      { floor: "1st Fl, east wing", x: 0.42, y: 0.31, note: "move TV: other wall" },
      { floor: "2nd Fl", x: 0.07, y: 0.9, note: "" },
    ]));
    expect(parsed.text).toBe("General: darker speaker grilles");
    expect(parsed.pins).toEqual([
      { floor: "1st Fl, east wing", n: 1, x: 0.42, y: 0.31, note: "move TV: other wall" },
      { floor: "2nd Fl", n: 2, x: 0.07, y: 0.9, note: "" },
    ]);
  });

  it("treats notes without pins (or empty) as plain text", () => {
    expect(parseClientNote("Please move the TV to the other wall.\nThanks!")).toEqual({ text: "Please move the TV to the other wall.\nThanks!", pins: [] });
    expect(parseClientNote(null)).toEqual({ text: "", pins: [] });
    expect(parseClientNote("Office, pin 2 at (5%, 95%): add a dimmer").pins).toEqual([{ floor: "Office", n: 2, x: 0.05, y: 0.95, note: "add a dimmer" }]);
  });
});
