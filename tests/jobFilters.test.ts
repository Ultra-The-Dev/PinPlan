import { describe, expect, it } from "vitest";
import { filterJobs, hasLabel, isPlaced, jobLabelList, jobTitle, labelOptions, statusCounts } from "@/lib/jobFilters";
import type { Project } from "@/lib/types";

const ts = "2026-11-19T15:00:00.000Z";
const job = (id: string, extra: Partial<Project> = {}): Project => ({ id, clientName: "", address: "", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts, ...extra });

const jobs = [
  job("a", { address: "1 Main St", labels: ["Pre-wire", "Service"], status: "approved", lat: 40.7, lng: -73.9 }),
  job("b", { clientName: "Acme", labels: [" service ", "Pre-wire", "pre-wire"], status: "installed" }),
  job("c", { labels: null }),
  job("d", { labels: ["Waiting on GC"], deleted: true }),
];

describe("job filters", () => {
  it("titles fall back from address to client to a placeholder", () => {
    expect(jobTitle(jobs[0])).toBe("1 Main St");
    expect(jobTitle(jobs[1])).toBe("Acme");
    expect(jobTitle(jobs[2])).toBe("Untitled job");
    expect(jobTitle({ address: "  ", clientName: "" }, "Job")).toBe("Job");
  });

  it("labels are trimmed and de-duplicated case-insensitively", () => {
    expect(jobLabelList(jobs[1])).toEqual(["service", "Pre-wire"]);
    expect(jobLabelList(jobs[2])).toEqual([]);
    expect(hasLabel(jobs[1], "SERVICE")).toBe(true);
    expect(hasLabel(jobs[2], "Service")).toBe(false);
  });

  it("label options skip deleted jobs and sort by use, then name", () => {
    expect(labelOptions(jobs)).toEqual(["Pre-wire", "Service"]);
  });

  it("filters by status set and label, and always drops deleted jobs", () => {
    expect(filterJobs(jobs, {}).map((j) => j.id)).toEqual(["a", "b", "c"]);
    expect(filterJobs(jobs, { statuses: [] }).map((j) => j.id)).toEqual(["a", "b", "c"]);
    expect(filterJobs(jobs, { statuses: ["approved", "installed"] }).map((j) => j.id)).toEqual(["a", "b"]);
    expect(filterJobs(jobs, { label: "service" }).map((j) => j.id)).toEqual(["a", "b"]);
    expect(filterJobs(jobs, { label: "Service", statuses: ["installed"] }).map((j) => j.id)).toEqual(["b"]);
    expect(filterJobs(jobs, { label: "Waiting on GC" })).toEqual([]);
    expect(filterJobs(jobs, { label: "  " }).length).toBe(3);
  });

  it("only real coordinates count as placed", () => {
    expect(isPlaced(jobs[0])).toBe(true);
    expect(isPlaced(jobs[1])).toBe(false);
    expect(isPlaced({ lat: 0, lng: 0 })).toBe(true);
    expect(isPlaced({ lat: NaN, lng: 1 })).toBe(false);
    expect(isPlaced({ lat: 95, lng: 1 })).toBe(false);
    expect(isPlaced({ lat: 1, lng: null })).toBe(false);
  });

  it("counts jobs per status", () => {
    expect(statusCounts(jobs)).toEqual({ estimate: 1, approved: 1, installed: 1 });
  });
});
