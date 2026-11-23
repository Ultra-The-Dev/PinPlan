import { describe, expect, it } from "vitest";
import { latestBuild, pinnedBuild } from "@/lib/iosRelease";

const now = new Date("2026-11-23T12:00:00Z");
const run = (n: number, at: string, conclusion: string | null = "success", status = "completed") => ({ run_number: n, status, conclusion, updated_at: at });

describe("latestBuild", () => {
  it("is the newest successful run that finished long enough ago", () => {
    const runs = [run(7, "2026-11-23T11:50:00Z"), run(6, "2026-11-23T10:00:00Z"), run(5, "2026-11-22T10:00:00Z"), run(8, "2026-11-23T09:00:00Z", "failure")];
    expect(latestBuild(runs, now)).toBe(6);
    expect(latestBuild(runs, now, 5)).toBe(7);
  });
  it("is null with no usable run", () => {
    expect(latestBuild([], now)).toBeNull();
    expect(latestBuild([run(3, "2026-11-23T08:00:00Z", null, "in_progress"), run(4, "not a date")], now)).toBeNull();
  });
});

describe("pinnedBuild", () => {
  it("reads a positive whole number only", () => {
    expect(pinnedBuild("42")).toBe(42);
    expect(pinnedBuild(" 7 ")).toBe(7);
    for (const v of [undefined, "", "0", "-3", "1.5", "abc"]) expect(pinnedBuild(v)).toBeNull();
  });
});
