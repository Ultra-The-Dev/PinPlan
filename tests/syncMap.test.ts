import { describe, expect, it } from "vitest";
import { dedupeQueue, remoteWins, TABLES, toLocal, toRemote } from "@/lib/syncMap";
import { seedCatalog } from "@/lib/catalog";

describe("sync row mapping", () => {
  it("maps a sheet both ways, renaming order -> sort_order and dropping local-only fields", () => {
    const sheet = {
      id: "s1", projectId: "p1", name: "Attic", pageNumber: 1, order: 0, imageId: "img1", imageUrl: "blob:x",
      width: 3000, height: 2000, pxPerFt: 12, createdAt: "2026-11-11T00:00:00.000Z", updatedAt: "2026-11-11T01:00:00.000Z",
    };
    const remote = toRemote("sheets", sheet);
    expect(remote).toMatchObject({ id: "s1", project_id: "p1", sort_order: 0, image_id: "img1", px_per_ft: 12, px_per_inch: null, deleted: false });
    expect(remote).not.toHaveProperty("image_url");
    expect(remote).not.toHaveProperty("imageUrl");
    const back = toLocal("sheets", { ...remote, updated_at: "2026-11-11T01:00:00+00:00" });
    expect(back).toMatchObject({ id: "s1", projectId: "p1", order: 0, imageId: "img1", pxPerFt: 12, updatedAt: "2026-11-11T01:00:00.000Z" });
    expect(back).not.toHaveProperty("pxPerInch");
  });

  it("maps markers, runs and estimate lines", () => {
    const run = { id: "r1", projectId: "p", sheetId: "s", kind: "led", points: [0.1, 0.2, 0.3, 0.4], typedFt: 12, lfPerStep: undefined, createdAt: "", updatedAt: "" };
    const r = toRemote("runs", run);
    expect(r).toMatchObject({ sheet_id: "s", points: [0.1, 0.2, 0.3, 0.4], typed_ft: 12, lf_per_step: null, tentative: false });
    expect(toLocal("runs", r)).toMatchObject({ points: [0.1, 0.2, 0.3, 0.4], typedFt: 12 });

    const m = toRemote("markers", { id: "m", projectId: "p", sheetId: "s", deviceTypeId: "cam-indoor", x: 0.5, y: 0.25, closetId: null, tentative: true });
    expect(m).toMatchObject({ device_type_id: "cam-indoor", closet_id: null, tentative: true });

    const e = toRemote("estimateLines", { id: "e", projectId: "p", key: "dev:x", unitPrice: 10, include: true, updatedAt: "" });
    expect(e).toMatchObject({ key: "dev:x", unit_price: 10, include: true, removed: false });
  });

  it("maps the catalog with every DeviceType field", () => {
    const d = seedCatalog()[0];
    const r = toRemote("deviceTypes", d as unknown as Record<string, unknown>);
    expect(r).toMatchObject({ id: d.id, unit_price: 0, labor_price: 0, default_wire: "Cat6", sort_order: 0, kind: "device" });
    expect(r).not.toHaveProperty("owner_id");
    const back = toLocal("deviceTypes", r);
    const orig = d as unknown as Record<string, unknown>;
    for (const k of Object.keys(orig)) if (orig[k] != null) expect(back[k]).toEqual(orig[k]);
  });

  it("defaults project billdu docs to an array", () => {
    expect(toRemote("projects", { id: "p" }).billdu_docs).toEqual([]);
    expect(toLocal("projects", { id: "p", billdu_docs: null }).billduDocs).toEqual([]);
  });

  it("covers every synced table", () => {
    expect(Object.keys(TABLES).sort()).toEqual(["closets", "deviceTypes", "estimateLines", "markers", "projects", "runs", "sheets"]);
  });

  it("resolves conflicts last-write-wins", () => {
    expect(remoteWins(undefined, { updatedAt: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(remoteWins({ updatedAt: "2026-01-02T00:00:00Z" }, { updatedAt: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(remoteWins({ updatedAt: "2026-01-01T00:00:00Z" }, { updatedAt: "2026-01-02T00:00:00+00:00" })).toBe(true);
  });

  it("dedupes the queue keeping the latest item per row", () => {
    const q = dedupeQueue([
      { seq: 1, table: "markers", rowId: "a" },
      { seq: 2, table: "markers", rowId: "b" },
      { seq: 3, table: "markers", rowId: "a" },
    ]);
    expect(q.map((x) => x.seq)).toEqual([2, 3]);
  });
});
