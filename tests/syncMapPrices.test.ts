import { describe, expect, it } from "vitest";
import {
  isCompanyCatalogRow,
  keepLocalPrices,
  mergePriceRow,
  PRICE_TABLES,
  priceRowFromLocal,
  priceSelectColumns,
  priceSpecFor,
  safeUploadType,
  schemaGap,
  selectColumns,
  TABLES,
  withoutPriceColumns,
} from "@/lib/syncMap";
import type { SyncTable } from "@/lib/db";

const ts = "2026-11-19T09:00:00.000Z";

describe("selectColumns: pulls name their columns", () => {
  it.each(Object.keys(TABLES) as SyncTable[])("%s: never '*', always synced_at and id", (table) => {
    const cols = selectColumns(table).split(",");
    expect(cols).not.toContain("*");
    expect(cols).toContain("synced_at");
    expect(cols).toContain("id");
    expect(new Set(cols).size).toBe(cols.length);
  });

  it("leaves out the price columns of the catalog, products and jobs", () => {
    for (const t of ["deviceTypes", "products", "projects"] as SyncTable[]) {
      const cols = selectColumns(t).split(",");
      for (const p of TABLES[t].priceColumns ?? []) expect(cols, `${t}.${p}`).not.toContain(p);
    }
    expect(TABLES.deviceTypes.priceColumns).toEqual(["unit_price", "labor_price", "billdu_product_id"]);
    expect(TABLES.products.priceColumns).toEqual(["unit_price", "labor_price"]);
    expect(TABLES.projects.priceColumns).toEqual(["pricing", "billdu_docs", "billdu_client_id"]);
  });

  it("reads the catalog's owner and the sheet's image path", () => {
    expect(selectColumns("deviceTypes").split(",")).toContain("owner_id");
    expect(selectColumns("products").split(",")).toContain("owner_id");
    expect(selectColumns("sheets").split(",")).toContain("image_path");
  });

  it("leaves out columns the cloud database doesn't have yet", () => {
    expect(selectColumns("projects", new Set(["labels"])).split(",")).not.toContain("labels");
  });

  it("price tables name their columns too", () => {
    for (const ps of PRICE_TABLES) expect(priceSelectColumns(ps)).not.toContain("*");
    expect(priceSelectColumns(priceSpecFor("deviceTypes")!).split(",")).toEqual(["owner_id", "device_type_id", "unit_price", "labor_price", "billdu_product_id", "updated_at", "synced_at"]);
  });
});

describe("schemaGap reads a missing column from a select", () => {
  it("Postgres 42703", () => {
    expect(schemaGap({ code: "42703", message: "column projects.labels does not exist" })).toEqual({ kind: "column", column: "labels" });
    expect(schemaGap({ code: "42703", message: 'column "image_path" does not exist' })).toEqual({ kind: "column", column: "image_path" });
  });
});

describe("technicians never send prices", () => {
  it("drops the price columns of a job", () => {
    const row = { id: "p1", client_name: "A", pricing: { markupPct: 0 }, billdu_docs: [], billdu_client_id: 3 };
    expect(withoutPriceColumns("projects", row)).toEqual({ id: "p1", client_name: "A" });
    expect(withoutPriceColumns("markers", { id: "m1", x: 1 })).toEqual({ id: "m1", x: 1 });
  });
});

describe("price rows", () => {
  const dt = priceSpecFor("deviceTypes")!;
  const tpl = priceSpecFor("jobTemplates")!;
  const proj = priceSpecFor("projects")!;

  it("from a local row", () => {
    expect(priceRowFromLocal(dt, { id: "cam", unitPrice: 250, laborPrice: 80, updatedAt: ts })).toEqual({ device_type_id: "cam", unit_price: 250, labor_price: 80, billdu_product_id: null, updated_at: ts });
    expect(priceRowFromLocal(proj, { id: "p1", pricing: { markupPct: 30 }, billduDocs: [{ id: 1 }], updatedAt: ts })).toEqual({ project_id: "p1", pricing: { markupPct: 30 }, billdu_docs: [{ id: 1 }], billdu_client_id: null, updated_at: ts });
    const payload = { version: 1, project: { pricing: { markupPct: 10 }, labels: ["x"] }, checklists: [], estimateLines: [{ key: "custom:a" }] };
    expect(priceRowFromLocal(tpl, { id: "t1", payload, updatedAt: ts })).toEqual({ template_id: "t1", pricing: { estimateLines: [{ key: "custom:a" }], pricing: { markupPct: 10 } }, updated_at: ts });
  });

  it("merge onto the company's catalog row only (keyed by owner and id)", () => {
    const local = { id: "cam", name: "Camera", unitPrice: 0, laborPrice: 0, updatedAt: ts };
    const raw = { owner_id: "boss", device_type_id: "cam", unit_price: 300, labor_price: 90, billdu_product_id: 5, updated_at: ts };
    expect(mergePriceRow(dt, local, raw, { pending: false, billingOwner: "boss" })).toMatchObject({ name: "Camera", unitPrice: 300, laborPrice: 90, billduProductId: 5 });
    expect(mergePriceRow(dt, local, raw, { pending: false, billingOwner: "someone-else" })).toBeNull();
    expect(mergePriceRow(dt, local, raw, { pending: false, billingOwner: null })).toBeNull();
    expect(mergePriceRow(dt, { ...local, ownerId: "admin" }, raw, { pending: false, billingOwner: "boss" })).toBeNull();
    expect(mergePriceRow(dt, local, raw, { pending: true, billingOwner: "boss" })).toBeNull();
    expect(mergePriceRow(dt, undefined, raw, { pending: false, billingOwner: "boss" })).toBeNull();
  });

  it("merge a template's estimate lines and pricing back into its payload", () => {
    const local = { id: "t1", payload: { version: 1, project: { labels: ["x"] }, checklists: [], estimateLines: [] } };
    const raw = { template_id: "t1", pricing: { estimateLines: [{ key: "custom:a" }], pricing: { markupPct: 10 } }, updated_at: ts };
    expect(mergePriceRow(tpl, local, raw, { pending: false, billingOwner: null })).toEqual({
      id: "t1",
      payload: { version: 1, project: { labels: ["x"], pricing: { markupPct: 10 } }, checklists: [], estimateLines: [{ key: "custom:a" }] },
    });
  });

  it("a pulled row (prices stored blank) keeps the device's prices", () => {
    expect(keepLocalPrices("deviceTypes", { id: "cam", name: "New name" }, { id: "cam", unitPrice: 250, laborPrice: 80, billduProductId: 4 })).toEqual({ id: "cam", name: "New name", unitPrice: 250, laborPrice: 80, billduProductId: 4 });
    expect(keepLocalPrices("deviceTypes", { id: "cam" }, undefined)).toEqual({ id: "cam", unitPrice: 0, laborPrice: 0 });
    expect(keepLocalPrices("projects", { id: "p1", billduDocs: [] }, { id: "p1", pricing: { markupPct: 30 }, billduDocs: [{ id: 1 }], billduClientId: 2 })).toEqual({ id: "p1", pricing: { markupPct: 30 }, billduDocs: [{ id: 1 }], billduClientId: 2 });
    const pulled = { id: "t1", payload: { version: 1, project: { labels: ["y"] }, checklists: [], estimateLines: [] } };
    const have = { id: "t1", payload: { version: 1, project: { pricing: { markupPct: 10 } }, checklists: [], estimateLines: [{ key: "custom:a" }] } };
    expect(keepLocalPrices("jobTemplates", pulled, have)).toEqual({ id: "t1", payload: { version: 1, project: { labels: ["y"], pricing: { markupPct: 10 } }, checklists: [], estimateLines: [{ key: "custom:a" }] } });
  });

  it("another owner's catalog rows aren't the company's", () => {
    expect(isCompanyCatalogRow("deviceTypes", { owner_id: "boss" }, "boss")).toBe(true);
    expect(isCompanyCatalogRow("deviceTypes", { owner_id: "admin" }, "boss")).toBe(false);
    expect(isCompanyCatalogRow("products", { owner_id: "boss" }, null)).toBe(false);
    expect(isCompanyCatalogRow("markers", {}, null)).toBe(true);
  });
});

describe("safeUploadType", () => {
  it("keeps documents and photos, stores everything else as a plain download", () => {
    for (const t of ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) expect(safeUploadType(t)).toBe(t);
    expect(safeUploadType("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
    for (const t of ["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "application/xml", "application/javascript", "", null, undefined])
      expect(safeUploadType(t), String(t)).toBe("application/octet-stream");
  });
});
