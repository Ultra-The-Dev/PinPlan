import { describe, expect, it } from "vitest";
import { dedupeQueue, pendingUploadCount, remoteWins, TABLES, toLocal, toRemote } from "@/lib/syncMap";
import { seedCatalog } from "@/lib/catalog";
import type { SyncTable } from "@/lib/db";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

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
    expect(Object.keys(TABLES).sort()).toEqual(["changeOrders", "checklists", "closets", "deviceTypes", "documents", "estimateLines", "forms", "jobLogs", "jobTemplates", "markers", "measurements", "photoComments", "photos", "planMarkups", "products", "projects", "rfis", "runs", "salesDocs", "salesPayments", "scheduleItems", "sheetLinks", "sheets", "tasks"]);
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

describe("pendingUploadCount", () => {
  it("counts each queued image once, only for this job's files", () => {
    const queue = [
      { seq: 1, table: "images", rowId: "a" },
      { seq: 2, table: "images", rowId: "a" },
      { seq: 3, table: "images", rowId: "b" },
      { seq: 4, table: "images", rowId: "other-job" },
      { seq: 5, table: "photos", rowId: "c" },
    ];
    expect(pendingUploadCount(queue, ["a", "b", "c"])).toBe(2);
    expect(pendingUploadCount(queue, new Set(["c"]))).toBe(0);
    expect(pendingUploadCount(queue, [])).toBe(0);
    expect(pendingUploadCount([], ["a"])).toBe(0);
  });
});

/** NOT NULL columns per table, read from supabase/migrations (create table + alter table add/alter column). */
function notNullColumns(): Map<string, Set<string>> {
  const dir = path.resolve(__dirname, "../supabase/migrations");
  const out = new Map<string, Set<string>>();
  const get = (t: string) => out.get(t) ?? out.set(t, new Set()).get(t)!;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(dir, f), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi))
      for (const line of m[2].split(/,\s*\n/)) {
        const c = /^\s*(\w+)\s+[\w\s[\]().']+?\bnot null\b/i.exec(line);
        if (c && !/^(check|constraint|primary|unique|foreign)$/i.test(c[1])) get(m[1]).add(c[1]);
      }
    for (const m of sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?(\w+)([\s\S]*?);/gi)) {
      for (const a of m[2].matchAll(/add column (?:if not exists )?(\w+)[^,]*?\bnot null\b/gi)) get(m[1]).add(a[1]);
      for (const a of m[2].matchAll(/alter column (\w+) set not null/gi)) get(m[1]).add(a[1]);
      for (const a of m[2].matchAll(/alter column (\w+) drop not null/gi)) get(m[1]).delete(a[1]);
    }
  }
  return out;
}

describe("toRemote and NOT NULL columns", () => {
  const notNull = notNullColumns();

  it("finds the NOT NULL columns in the migrations", () => {
    expect([...(notNull.get("schedule_items") ?? [])]).toEqual(expect.arrayContaining(["name", "crew", "depends_on", "sheet_ids", "start_date"]));
    expect([...(notNull.get("sheet_links") ?? [])]).toEqual(expect.arrayContaining(["x", "y", "w", "h", "target"]));
    expect(notNull.get("sheets")?.has("px_per_ft")).toBe(false);
  });

  // An explicit null fails the insert even when the column has a default: one such row used to stop all syncing.
  it.each(Object.keys(TABLES) as SyncTable[])("toRemote(%s, {}) never sends null for a NOT NULL column", (table) => {
    const cols = notNull.get(TABLES[table].remote);
    expect(cols, `no table ${TABLES[table].remote} in the migrations`).toBeDefined();
    const remote = toRemote(table, {});
    // The row's own id and job are what make it a row at all: a row without them is refused (and set aside).
    const nulls = Object.entries(remote).filter(([k, v]) => v == null && cols!.has(k) && k !== "id" && k !== "project_id").map(([k]) => k);
    expect(nulls).toEqual([]);
  });

  it("fills dates and snapshots from the row itself", () => {
    const s = toRemote("scheduleItems", { id: "s", projectId: "p", end: "2026-12-01", createdAt: "2026-11-19T10:00:00.000Z" });
    expect(s).toMatchObject({ start_date: "2026-12-01", end_date: "2026-12-01", crew: [], depends_on: [], sheet_ids: [], name: "" });
    const f = toRemote("forms", { id: "f", projectId: "p", templateId: "t1", name: "Rough-in" });
    expect(f.template).toMatchObject({ id: "t1", name: "Rough-in", fields: [] });
    const l = toRemote("sheetLinks", { id: "l", projectId: "p", sheetId: "s1" });
    expect(l).toMatchObject({ x: 0, y: 0, w: 0, h: 0, target: { kind: "sheet", sheetId: "s1" } });
    const log = toRemote("jobLogs", { id: "j", projectId: "p", createdAt: "2026-11-19T23:00:00.000Z" });
    expect(log).toMatchObject({ log_date: "2026-11-19", updated_at: "2026-11-19T23:00:00.000Z" });
  });

  it("keeps the row's own values", () => {
    const s = toRemote("scheduleItems", { id: "s", projectId: "p", name: "Trim", start: "2026-12-01", end: "2026-12-03", crew: ["A"], createdAt: "x", updatedAt: "y" });
    expect(s).toMatchObject({ name: "Trim", start_date: "2026-12-01", end_date: "2026-12-03", crew: ["A"], created_at: "x", updated_at: "y" });
    expect(toRemote("markers", { id: "m", x: 0.25, y: 0.75, label: "CAM-1" })).toMatchObject({ x: 0.25, y: 0.75, label: "CAM-1", mount: "ceiling" });
  });
});
