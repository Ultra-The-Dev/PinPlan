import { describe, expect, it } from "vitest";
import { DEFAULT_CHARGES, chargeKey, linkedTypes } from "@/lib/charges";
import { DEFAULT_SETTINGS, seedCatalog } from "@/lib/catalog";
import { buildEstimate } from "@/lib/estimate";
import { computeTakeoff } from "@/lib/takeoff";
import type { EstimateLine, Marker, Sheet } from "@/lib/types";

const ts = "2026-11-15T00:00:00.000Z";
const sheets: Sheet[] = [{ id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i", width: 100, height: 100, createdAt: ts, updatedAt: ts }];
const mk = (i: number, type: string, tentative = false): Marker => ({
  id: `m${i}`, projectId: "p", sheetId: "s1", deviceTypeId: type, x: 0.5, y: 0.5, label: `L${i}`, room: "", mount: "ceiling", wireType: "Cat6", tentative, notes: "", createdAt: ts, updatedAt: ts,
});
const line = (key: string, extra: Partial<EstimateLine> = {}): EstimateLine => ({ id: key, projectId: "p", key, description: "x", unitPrice: 180, updatedAt: ts, ...extra });

describe("quick charges", () => {
  const cam = DEFAULT_CHARGES.find((c) => c.id === "prewire-cam")!;
  const key = chargeKey(cam, "abc");
  const markers = [mk(1, "cam-indoor"), mk(2, "cam-indoor"), mk(3, "cam-outdoor"), mk(4, "cam-outdoor", true), mk(5, "wap")];
  const t = computeTakeoff({ sheets, markers, runs: [], closets: [] });
  const est = (overrides: EstimateLine[]) => buildEstimate(t, seedCatalog(), DEFAULT_SETTINGS.pricing, overrides);

  it("per-device charges count the placed devices (not the ? ones)", () => {
    expect(key).toBe("custom:abc@cam-indoor+cam-outdoor");
    expect(linkedTypes(key)).toEqual(["cam-indoor", "cam-outdoor"]);
    const l = est([line(key)]).lines.find((x) => x.key === key)!;
    expect(l.qty).toBe(3);
    expect(l.total).toBe(540);
  });

  it("a typed quantity wins; fixed charges default to 1", () => {
    expect(est([line(key, { qty: 10 })]).lines.find((x) => x.key === key)!.qty).toBe(10);
    expect(est([line("custom:fixed")]).lines.find((x) => x.key === "custom:fixed")!.qty).toBe(1);
  });
});
