import { describe, expect, it } from "vitest";
import { jobSummary, type JobSummaryInput } from "@/lib/jobSummary";
import type { Checklist, JobLog, Marker, Photo, Project, Run, Sheet } from "@/lib/types";

const ts = "2026-11-19T15:00:00.000Z";
const today = "2026-11-19";
const project = (extra: Partial<Project> = {}): Project => ({ id: "p", clientName: "", address: "", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts, ...extra });
const sheet = (id: string, deleted = false): Sheet => ({ id, projectId: "p", name: id, pageNumber: 1, order: 0, imageId: id, width: 10, height: 10, createdAt: ts, updatedAt: ts, deleted });
const marker = (id: string, extra: Partial<Marker> = {}): Marker => ({ id, projectId: "p", sheetId: "s", deviceTypeId: "cam", x: 0, y: 0, label: id, room: "", mount: "ceiling", wireType: "Cat6", tentative: false, notes: "", createdAt: ts, updatedAt: ts, ...extra });
const run = (id: string, kind: Run["kind"]): Run => ({ id, projectId: "p", sheetId: "s", kind, points: [0, 0, 1, 1], createdAt: ts, updatedAt: ts });
const photo = (id: string, takenAt: string, extra: Partial<Photo> = {}): Photo => ({ id, projectId: "p", imageId: id, width: 4, height: 3, takenAt, createdAt: ts, updatedAt: ts, ...extra });
const log = (id: string, date: string, deleted = false): JobLog => ({ id, projectId: "p", date, body: "", createdAt: ts, updatedAt: ts, deleted });
const list = (id: string, items: Checklist["items"]): Checklist => ({ id, projectId: "p", name: id, items, createdAt: ts, updatedAt: ts });

const base = (extra: Partial<JobSummaryInput> = {}): JobSummaryInput => ({
  project: project(),
  sheets: [sheet("s")],
  markers: [marker("m1"), marker("m2", { tentative: true }), marker("gone", { deleted: true })],
  runs: [run("r1", "led"), run("w1", "wire")],
  photos: [],
  checklists: [],
  jobLogs: [],
  today,
  ...extra,
});

describe("jobSummary counts", () => {
  it("counts live devices, LED runs, photos and logs", () => {
    const s = jobSummary(
      base({
        sheets: [sheet("s"), sheet("old", true)],
        photos: [photo("a", "2026-11-17T10:00:00.000Z"), photo("b", "2026-11-18T10:00:00.000Z"), photo("c", "2026-11-19T10:00:00.000Z", { deleted: true })],
        jobLogs: [log("l1", "2026-11-15"), log("l2", "2026-11-16"), log("l3", "2026-11-18", true)],
      }),
    );
    expect(s).toMatchObject({ sheets: 1, devices: 2, tentative: 1, ledRuns: 1 });
    expect(s.photos).toEqual({ count: 2, lastAt: "2026-11-18T10:00:00.000Z" });
    expect(s.logs).toEqual({ count: 2, lastDate: "2026-11-16" });
  });

  it("totals checklist progress and open tasks, with overdue and due today", () => {
    const s = jobSummary(
      base({
        photos: [photo("p1", ts, { checklistId: "c1", checklistItemId: "1" })],
        checklists: [
          list("c1", [
            { id: "1", text: "Rack", done: true, requiresPhoto: true },
            { id: "2", text: "Patch", done: true, requiresPhoto: true },
            { id: "3", text: "Label", due: "2026-11-18" },
          ]),
          list("c2", [
            { id: "4", text: "Wi-Fi", assignee: "Alex", due: today },
            { id: "5", text: "Plain item" },
            { id: "6", text: "Done task", done: true, due: "2026-11-01" },
          ]),
          { ...list("c3", [{ id: "7", text: "x", due: "2026-11-01" }]), deleted: true },
        ],
      }),
    );
    expect(s.checklists).toEqual({ lists: 2, done: 2, total: 6, pct: 33, missingPhotos: 1 });
    expect(s.tasks).toEqual({ open: 2, overdue: 1, dueToday: 1 });
    expect(s.next).toMatchObject({ kind: "overdueTasks", text: "1 overdue task", tab: "field" });
  });

  it("picks the latest proposal and review, skipping revoked ones", () => {
    const s = jobSummary(
      base({
        proposals: [
          { kind: "review", status: "viewed", createdAt: "2026-11-10T00:00:00Z" },
          { kind: "proposal", status: "declined", createdAt: "2026-11-12T00:00:00Z" },
          { kind: "proposal", status: "revoked", createdAt: "2026-11-14T00:00:00Z" },
        ],
      }),
    );
    expect(s.review?.status).toBe("viewed");
    expect(s.proposal?.status).toBe("declined");
    expect(s.next.kind).toBe("reviseProposal");
  });
});

describe("next step", () => {
  it("starts with plans, then devices", () => {
    expect(jobSummary(base({ sheets: [] })).next).toMatchObject({ kind: "addPlans", tab: "sheets" });
    expect(jobSummary(base({ markers: [], runs: [run("w", "wire")] })).next).toMatchObject({ kind: "placeDevices", tab: "plan" });
    // LED runs alone count as something placed.
    expect(jobSummary(base({ markers: [], runs: [run("r", "stair")] })).next.kind).not.toBe("placeDevices");
  });

  it("estimate jobs: price, review, proposal, waiting", () => {
    const unpriced = { total: 0, unpriced: 3 };
    expect(jobSummary(base({ estimate: unpriced })).next).toMatchObject({ kind: "priceEstimate", text: "Price the estimate (3 lines without a price)" });
    expect(jobSummary(base({ estimate: unpriced, proposals: [] })).next).toMatchObject({ kind: "sendReview", text: "Send plan for review", tab: "takeoff" });
    expect(jobSummary(base({ estimate: unpriced, proposals: [{ kind: "review", status: "sent", createdAt: ts }] })).next.kind).toBe("priceEstimate");
    expect(jobSummary(base({ estimate: { total: 1200, unpriced: 0 } })).next).toMatchObject({ kind: "sendProposal", tab: "estimate" });
    expect(jobSummary(base({ estimate: { total: 1200, unpriced: 0 }, proposals: [] })).next.kind).toBe("sendProposal");
    expect(jobSummary(base({ estimate: { total: 1200, unpriced: 0 }, proposals: [{ kind: "proposal", status: "viewed", createdAt: ts }] })).next).toMatchObject({ kind: "awaitClient", text: "Client viewed the proposal — follow up" });
    expect(jobSummary(base({ proposals: [{ kind: "proposal", status: "accepted", createdAt: ts }] })).next.kind).toBe("markApproved");
    const billed = project({ billduDocs: [{ id: 1, type: "estimate", amount: 1200, createdAt: ts }] });
    expect(jobSummary(base({ project: billed, estimate: { total: 1200, unpriced: 0 } })).next.kind).toBe("awaitClient");
  });

  it("approved jobs: tasks today, checklists, photos, then installed", () => {
    const approved = project({ status: "approved" });
    expect(jobSummary(base({ project: approved })).next).toMatchObject({ kind: "startChecklist", tab: "field" });
    expect(jobSummary(base({ project: approved, checklists: [list("c", [{ id: "1", text: "x", due: today }])] })).next).toMatchObject({ kind: "tasksToday", text: "1 task due today" });
    expect(jobSummary(base({ project: approved, checklists: [list("c", [{ id: "1", text: "x", done: true, requiresPhoto: true }])] })).next).toMatchObject({ kind: "checklistPhotos", text: "1 checklist item needs a photo" });
    expect(jobSummary(base({ project: approved, checklists: [list("c", [{ id: "1", text: "x", done: true }, { id: "2", text: "y" }])] })).next).toMatchObject({ kind: "finishChecklists", text: "Finish checklists (1 of 2 done)" });
    expect(jobSummary(base({ project: approved, checklists: [list("c", [{ id: "1", text: "x", done: true }])] })).next).toMatchObject({ kind: "markInstalled", tab: "info" });
  });

  it("installed jobs: close tasks, invoice, done", () => {
    const installed = project({ status: "installed" });
    expect(jobSummary(base({ project: installed, checklists: [list("c", [{ id: "1", text: "x", assignee: "Sam" }])] })).next).toMatchObject({ kind: "closeTasks", text: "Close out 1 open task" });
    expect(jobSummary(base({ project: installed })).next.kind).toBe("invoice");
    const invoiced = project({ status: "installed", billduDocs: [{ id: 2, type: "invoice", amount: 10, createdAt: ts }] });
    expect(jobSummary(base({ project: invoiced })).next).toMatchObject({ kind: "done", text: "All wrapped up" });
  });

  it("overdue tasks come before everything but plans and devices", () => {
    const s = jobSummary(base({ project: project({ status: "installed" }), checklists: [list("c", [{ id: "1", text: "a", due: "2026-11-01" }, { id: "2", text: "b", due: "2026-11-02" }, { id: "3", text: "c", due: "2026-11-03" }])] }));
    expect(s.next.text).toBe("3 overdue tasks");
  });
});

describe("jobSummary for technicians (no prices)", () => {
  it("never points a tech at the estimate, proposals or invoices", () => {
    const est = jobSummary(base({ prices: false, estimate: { total: 0, unpriced: 3 }, proposals: [{ kind: "proposal", status: "declined", createdAt: ts }] }));
    expect(est.next).toMatchObject({ kind: "officePricing", tab: "plan" });
    const dueToday = jobSummary(base({ prices: false, checklists: [list("c", [{ id: "1", text: "Rough-in", due: today }])] }));
    expect(dueToday.next).toMatchObject({ kind: "tasksToday", tab: "field" });
    const installed = jobSummary(base({ prices: false, project: project({ status: "installed" }) }));
    expect(installed.next.kind).toBe("done");
    const approved = jobSummary(base({ prices: false, project: project({ status: "approved" }) }));
    expect(approved.next.kind).toBe("startChecklist");
  });

  it("office users still get the pricing steps", () => {
    expect(jobSummary(base({ estimate: { total: 0, unpriced: 3 } })).next.kind).toBe("priceEstimate");
    expect(jobSummary(base({ project: project({ status: "installed" }) })).next.kind).toBe("invoice");
  });
});
