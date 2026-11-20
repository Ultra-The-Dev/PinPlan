import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS_BUCKET_TYPES, plansUploadBody, plansUploadType } from "@/lib/storageTypes";

const root = join(__dirname, "..");

/** The plans bucket's allowed_mime_types as the migration sets them. */
function migrationTypes(): string[] {
  const sql = readFileSync(join(root, "supabase/migrations/20261125001000_access_guards.sql"), "utf8");
  const m = sql.match(/update storage\.buckets set file_size_limit = 52428800, allowed_mime_types = array\[([\s\S]*?)\]\s*where id = 'plans'/);
  if (!m) throw new Error("plans bucket list not found");
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function swiftTypes(): string[] {
  const src = readFileSync(join(root, "ios/PinPlanCore/Sources/PinPlanCore/StorageTypes.swift"), "utf8");
  const m = src.match(/plansBucketTypes: \[String\] = \[([\s\S]*?)\]/);
  if (!m) throw new Error("Swift list not found");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("plans bucket file types", () => {
  it("match the bucket's list in the migration and in PinPlanCore", () => {
    expect([...PLANS_BUCKET_TYPES].sort()).toEqual(migrationTypes().sort());
    expect([...PLANS_BUCKET_TYPES].sort()).toEqual(swiftTypes().sort());
  });

  it("never lets a type a browser would run in (SVG, HTML, XML)", () => {
    for (const t of PLANS_BUCKET_TYPES) expect(t).not.toMatch(/svg|html|[/+]xml$|javascript/i);
  });

  it("keeps a type the bucket takes and sends anything else as octet-stream", () => {
    expect(plansUploadType("image/jpeg")).toBe("image/jpeg");
    expect(plansUploadType("Application/PDF")).toBe("application/pdf");
    expect(plansUploadType("application/vnd.ms-excel.sheet.macroEnabled.12")).toBe("application/vnd.ms-excel.sheet.macroenabled.12");
    expect(plansUploadType("image/svg+xml")).toBe("application/octet-stream");
    expect(plansUploadType("text/html; charset=utf-8")).toBe("application/octet-stream");
    expect(plansUploadType("video/webm")).toBe("application/octet-stream");
    expect(plansUploadType("")).toBe("application/octet-stream");
    expect(plansUploadType(undefined)).toBe("application/octet-stream");
  });

  it("re-wraps a blob only when the bucket would refuse its type", () => {
    const jpg = new Blob(["x"], { type: "image/jpeg" });
    expect(plansUploadBody(jpg)).toBe(jpg);
    const svg = plansUploadBody(new Blob(["<svg/>"], { type: "image/svg+xml" }));
    expect(svg.type).toBe("application/octet-stream");
    expect(svg.size).toBe(6);
    expect(plansUploadBody(new Blob(["x"]), "application/pdf").type).toBe("application/pdf");
  });
});
