import { describe, expect, it } from "vitest";
import { seedCatalog, DEFAULT_SETTINGS } from "@/lib/catalog";
import { buildEstimate } from "@/lib/estimate";
import { computeTakeoff, countOf, takeoffCsv } from "@/lib/takeoff";
import { ATTIC_SETUP_LED_LF, buildHilltop, EXTRA_S, HILLTOP_COUNTS } from "./fixtures/hilltop";

describe("20 Hilltop Dr E takeoff reproduces the hand counts", () => {
  const data = buildHilltop();
  const takeoff = computeTakeoff(data);
  const { TYPE_IDS } = data;

  it("keeps the floors in sheet order", () => {
    expect(takeoff.floors.map((f) => f.name)).toEqual(["Attic", "1st Fl", "2nd Fl", "Cellar"]);
  });

  for (const [name, expected] of Object.entries(HILLTOP_COUNTS)) {
    it(`${name}: device counts, LED zones and LED total`, () => {
      const f = takeoff.floors.find((x) => x.name === name)!;
      expect(f.counts[TYPE_IDS.indoorCam] ?? 0).toBe(expected.indoorCam);
      expect(f.counts[TYPE_IDS.outdoorCam] ?? 0).toBe(expected.outdoorCam);
      const extra = EXTRA_S[name as keyof typeof EXTRA_S] ?? 0;
      // Written speaker totals; extra circled S marks are placed as tentative items on top.
      expect((f.counts[TYPE_IDS.speakers] ?? 0) - extra).toBe(expected.speakers);
      expect(f.counts[TYPE_IDS.shades] ?? 0).toBe("shades" in expected ? expected.shades : 0);
      expect(f.counts[TYPE_IDS.tvs] ?? 0).toBe(expected.tvs);
      expect(f.counts[TYPE_IDS.sh] ?? 0).toBe(expected.sh);
      expect(f.counts[TYPE_IDS.vs] ?? 0).toBe(expected.vs);
      expect(f.counts[TYPE_IDS.wap] ?? 0).toBe(expected.wap);
      expect(f.ledZones).toBe(expected.ledZones);
      if (expected.ledTotal == null) {
        expect(f.ledTotalFt).toBe(0);
        expect(f.unmeasuredRuns).toBe(expected.ledZones);
      } else {
        expect(f.ledTotalFt).toBe(expected.ledTotal);
      }
    });
  }

  it("lists the two 1st Fl '?' speakers and the extra circled S marks as tentative", () => {
    const f = takeoff.floors.find((x) => x.name === "1st Fl")!;
    expect(f.tentative[TYPE_IDS.speakers]).toBe(2 + (EXTRA_S["1st Fl"] ?? 0));
    expect(countOf(f, [TYPE_IDS.speakers], { confirmedOnly: true })).toBe(0);
    const cellar = takeoff.floors.find((x) => x.name === "Cellar")!;
    expect(countOf(cellar, [TYPE_IDS.speakers], { confirmedOnly: true })).toBe(0);
    expect(cellar.tentative[TYPE_IDS.speakers]).toBe(EXTRA_S.Cellar);
  });

  it("keeps the Attic 'Setup LED 60' run optional: 3 zones / 48 LF confirmed, 60 LF tentative", () => {
    const f = takeoff.floors.find((x) => x.name === "Attic")!;
    expect(f.ledZones).toBe(3);
    expect(f.ledTotalFt).toBe(48);
    expect(f.ledTentativeFt["led-ceiling"]).toBe(ATTIC_SETUP_LED_LF);
  });

  it("totals the whole house", () => {
    const t = takeoff.total;
    expect(t.counts[TYPE_IDS.indoorCam]).toBe(13);
    expect(t.counts[TYPE_IDS.outdoorCam]).toBe(9);
    expect(countOf(t, [TYPE_IDS.indoorCam, TYPE_IDS.outdoorCam])).toBe(22);
    expect(t.counts[TYPE_IDS.speakers] - (EXTRA_S["1st Fl"] ?? 0) - (EXTRA_S.Cellar ?? 0)).toBe(4);
    expect(countOf(t, [TYPE_IDS.speakers], { confirmedOnly: true })).toBe(2);
    expect(t.counts[TYPE_IDS.shades]).toBe(1);
    expect(t.counts[TYPE_IDS.tvs]).toBe(4);
    expect(t.counts[TYPE_IDS.sh]).toBe(3);
    expect(t.counts[TYPE_IDS.vs]).toBe(2);
    expect(t.counts[TYPE_IDS.wap]).toBe(4);
    expect(t.ledZones).toBe(36);
    expect(t.ledTotalFt).toBe(48 + 305 + 520);
    expect(t.closets.equipment).toBe(1);
  });

  it("ignores deleted markers", () => {
    const d = buildHilltop();
    d.markers[0].deleted = true;
    const t = computeTakeoff(d);
    expect(t.floors[0].counts[TYPE_IDS.indoorCam]).toBe(2);
  });

  it("exports a CSV with a whole-project section", () => {
    const csv = takeoffCsv(takeoff, seedCatalog());
    expect(csv.split("\n")[0]).toBe("Floor,Item,Unit,Quantity,Tentative");
    expect(csv).toContain("Whole project,Indoor camera,each,13,0");
    expect(csv).toContain("Attic,LED total,LF,48,");
  });

  it("prices the takeoff into an estimate, keeping '?' items optional", () => {
    const catalog = seedCatalog().map((d) =>
      d.id === "cam-indoor" ? { ...d, unitPrice: 200, laborPrice: 100 } : d.id === "speaker" ? { ...d, unitPrice: 150 } : d.id === "led-ceiling" ? { ...d, unitPrice: 10 } : d,
    );
    const pricing = { ...DEFAULT_SETTINGS.pricing, markupPct: 10, taxPct: 5 };
    const est = buildEstimate(takeoff, catalog, pricing);
    const cam = est.lines.find((l) => l.key === "dev:cam-indoor")!;
    expect(cam.qty).toBe(13);
    expect(cam.unitPrice).toBe(320); // 200 * 1.10 + 100 labor
    const spk = est.lines.find((l) => l.key === "dev:speaker")!;
    expect(spk.qty).toBe(2); // 2nd Fl only; the 1st Fl pair and extra circled S marks are optional
    const opt = est.lines.find((l) => l.key === "opt:speaker")!;
    const optSpk = 2 + (EXTRA_S["1st Fl"] ?? 0) + (EXTRA_S.Cellar ?? 0);
    expect(opt.qty).toBe(optSpk);
    expect(opt.included).toBe(false);
    const led = est.lines.find((l) => l.key === "dev:led-ceiling")!;
    expect(led.qty).toBe(873);
    expect(led.unitPrice).toBe(11);
    expect(est.subtotal).toBe(13 * 320 + 2 * 165 + 873 * 11);
    expect(est.tax).toBe(Math.round(est.subtotal * 5) / 100);
    // Optional: tentative speakers + the Attic "Setup LED 60" run.
    expect(est.optionalTotal).toBe(optSpk * 165 + ATTIC_SETUP_LED_LF * 11);

    const withOverride = buildEstimate(takeoff, catalog, pricing, [
      { id: "o1", projectId: "hilltop", key: "dev:cam-indoor", unitPrice: 300, updatedAt: "" },
      { id: "o2", projectId: "hilltop", key: "opt:speaker", include: true, updatedAt: "" },
      { id: "o3", projectId: "hilltop", key: "custom:x", description: "Programming", qty: 8, unit: "hr", unitPrice: 125, updatedAt: "" },
    ]);
    expect(withOverride.lines.find((l) => l.key === "dev:cam-indoor")!.total).toBe(3900);
    expect(withOverride.lines.find((l) => l.key === "opt:speaker")!.included).toBe(true);
    expect(withOverride.lines.find((l) => l.key === "custom:x")!.total).toBe(1000);
  });
});
