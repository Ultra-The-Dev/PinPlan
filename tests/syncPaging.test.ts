import { describe, expect, it } from "vitest";
import { nextPullPage, pullStart, schemaGap, withoutColumns } from "@/lib/syncMap";

describe("pull paging", () => {
  const t1 = "2026-11-19T10:00:00.123456+00:00";
  const t2 = "2026-11-19T10:00:05.000001+00:00";
  const rows = (...ts: string[]) => ts.map((synced_at) => ({ synced_at }));

  it("a short page finishes at its last timestamp", () => {
    expect(nextPullPage({ since: "1970-01-01T00:00:00Z", skip: 0 }, rows(t1, t2), 5)).toEqual({ since: t2, skip: 0, done: true });
    expect(nextPullPage({ since: t1, skip: 3 }, [], 5)).toEqual({ since: t1, skip: 3, done: true });
  });

  it("a full page ending part-way through a timestamp restarts there, skipping the rows already seen", () => {
    // 2 rows at t1, then 3 of (say) 5 rows at t2: the other 2 at t2 must come on the next page, not be skipped by `> t2`.
    expect(nextPullPage({ since: "1970-01-01T00:00:00Z", skip: 0 }, rows(t1, t1, t2, t2, t2), 5)).toEqual({ since: t2, skip: 3, done: false });
  });

  it("keeps counting when a whole page shares the cursor's timestamp (one big bulk upsert)", () => {
    const first = nextPullPage({ since: "1970-01-01T00:00:00Z", skip: 0 }, rows(t1, t1, t1), 3);
    expect(first).toEqual({ since: t1, skip: 3, done: false });
    const second = nextPullPage(first, rows(t1, t1, t1), 3);
    expect(second).toEqual({ since: t1, skip: 6, done: false });
    expect(nextPullPage(second, rows(t1, t2), 3)).toEqual({ since: t2, skip: 0, done: true });
  });

  it("starts a little before the saved watermark", () => {
    expect(pullStart("2026-11-19T10:00:30.000Z", 30_000)).toBe("2026-11-19T10:00:00.000Z");
    expect(pullStart("1970-01-01T00:00:00Z")).toBe("1970-01-01T00:00:00Z");
    expect(pullStart("garbage")).toBe("garbage");
  });
});

describe("cloud schema behind the app", () => {
  it("recognises a missing column and a missing table", () => {
    expect(schemaGap({ code: "PGRST204", message: "Could not find the 'labels' column of 'projects' in the schema cache" })).toEqual({ kind: "column", column: "labels" });
    expect(schemaGap({ code: "PGRST205", message: "Could not find the table 'public.photos' in the schema cache" })).toEqual({ kind: "table" });
    expect(schemaGap({ code: "42P01", message: 'relation "public.job_logs" does not exist' })).toEqual({ kind: "table" });
    expect(schemaGap({ code: "23505", message: "duplicate key value violates unique constraint" })).toBeNull();
    expect(schemaGap({ code: "42501", message: "new row violates row-level security policy" })).toBeNull();
    expect(schemaGap(null)).toBeNull();
  });

  it("drops missing columns from a payload", () => {
    const rows = [{ id: "p", labels: ["x"], lat: 1, address: "a" }];
    expect(withoutColumns(rows, new Set(["labels", "lat"]))).toEqual([{ id: "p", address: "a" }]);
    expect(withoutColumns(rows, undefined)).toBe(rows);
  });
});
