import { describe, expect, it } from "vitest";
import { gapTag, isRowRefusal, refusedKey, TECH_SKIPPED_TABLES } from "@/lib/syncMap";

describe("isRowRefusal: which push errors set rows aside", () => {
  it("permissions, constraints and bad values are the rows' fault", () => {
    expect(isRowRefusal({ code: "42501", message: "new row violates row-level security policy" }, 403)).toBe(true);
    expect(isRowRefusal({ code: "23505", message: "duplicate key value" }, 409)).toBe(true);
    expect(isRowRefusal({ code: "23502", message: 'null value in column "name" violates not-null constraint' }, 400)).toBe(true);
    expect(isRowRefusal({ code: "22P02", message: "invalid input syntax for type uuid" }, 400)).toBe(true);
    expect(isRowRefusal({ code: "P0001", message: "Only the office can change prices" }, 400)).toBe(true);
    expect(isRowRefusal({ code: "23514", message: "check constraint" })).toBe(true);
  });

  it("network trouble, sign-in, rate limits and server errors are retried, not set aside", () => {
    expect(isRowRefusal({ message: "TypeError: Failed to fetch" }, 0)).toBe(false);
    expect(isRowRefusal({ message: "Load failed" })).toBe(false);
    expect(isRowRefusal({ code: "PGRST301", message: "JWT expired" }, 401)).toBe(false);
    expect(isRowRefusal({ message: "Unauthorized" }, 401)).toBe(false);
    expect(isRowRefusal({ message: "Too many requests" }, 429)).toBe(false);
    expect(isRowRefusal({ code: "57014", message: "canceling statement due to statement timeout" }, 500)).toBe(false);
    expect(isRowRefusal({ message: "Bad gateway" }, 502)).toBe(false);
    expect(isRowRefusal(null, 400)).toBe(false);
  });

  it("a lapsed subscription keeps edits queued (read-only), not refused", () => {
    expect(isRowRefusal({ code: "P0001", message: "PinPlan subscription inactive" }, 400)).toBe(false);
  });

  it("a migration that hasn't been run is a schema gap, not a refusal", () => {
    expect(isRowRefusal({ code: "PGRST204", message: "Could not find the 'labels' column of 'projects' in the schema cache" }, 400)).toBe(false);
    expect(isRowRefusal({ code: "PGRST205", message: "Could not find the table 'public.tasks' in the schema cache" }, 404)).toBe(false);
  });
});

describe("refused change helpers", () => {
  it("keys and tags", () => {
    expect(refusedKey("markers", "m1")).toBe("markers:m1");
    expect(gapTag("projects", "labels")).toBe("projects.labels");
  });

  it("technicians never push the catalog, products or prices", () => {
    for (const t of ["deviceTypes", "products", "estimateLines", "salesDocs", "salesPayments", "jobTemplates", "changeOrders", "sheetLinks"] as const) expect(TECH_SKIPPED_TABLES.has(t)).toBe(true);
    for (const t of ["markers", "photos", "forms", "tasks", "planMarkups"] as const) expect(TECH_SKIPPED_TABLES.has(t)).toBe(false);
  });
});
