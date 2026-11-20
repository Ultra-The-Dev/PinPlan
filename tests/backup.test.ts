import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the file a backup would download.
const saved = vi.hoisted(() => ({ blob: null as Blob | null }));
vi.mock("@/lib/download", () => ({
  downloadBlob: (b: Blob) => {
    saved.blob = b;
  },
  slug: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
}));
const owner = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/localOwner", () => ({ readLocalOwner: () => (owner.userId ? { userId: owner.userId, email: null } : null) }));

import { exportProjectBackup, importBackup, remapBackupProject, restoreAsCopy } from "@/lib/backup";
import { db, put, saveImage } from "@/lib/db";
import { useTeam } from "@/lib/team";
import type { JobLog, Marker, Project, Sheet } from "@/lib/types";

const ts = "2026-11-19T10:00:00.000Z";
const project: Project = { id: "p1", clientName: "Test", address: "1 Test St", status: "estimate", billduDocs: [{ id: "b1" } as never], billduClientId: 7, createdAt: ts, updatedAt: ts } as Project;
const sheet: Sheet = { id: "s1", projectId: "p1", name: "L1", pageNumber: 1, order: 0, imageId: "img-plan", width: 100, height: 100, createdAt: ts, updatedAt: ts };
const marker: Marker = {
  id: "m1", projectId: "p1", sheetId: "s1", deviceTypeId: "cam-indoor", x: 0.5, y: 0.5, label: "CAM-1", room: "", mount: "ceiling", wireType: "Cat6", tentative: false, notes: "", createdAt: ts, updatedAt: ts,
};

beforeEach(async () => {
  owner.userId = null;
  saved.blob = null;
  useTeam.setState({ role: null, team: null });
  await db().delete();
  await db().open();
});

describe("restoreAsCopy", () => {
  it("copies files from another account, unless it's the same person or the same company", () => {
    expect(restoreAsCopy({ ownerId: "a" }, { userId: "b", teamId: null })).toBe(true);
    expect(restoreAsCopy({ ownerId: "a" }, { userId: "a", teamId: null })).toBe(false);
    expect(restoreAsCopy({ ownerId: "a", teamId: "t" }, { userId: "b", teamId: "t" })).toBe(false);
    expect(restoreAsCopy({ ownerId: "a", teamId: "t" }, { userId: "b", teamId: "u" })).toBe(true);
    // Older files (no owner) and devices nobody signed in on restore in place.
    expect(restoreAsCopy({}, { userId: "b", teamId: null })).toBe(false);
    expect(restoreAsCopy({ ownerId: "a" }, { userId: null, teamId: null })).toBe(false);
  });
});

describe("remapBackupProject", () => {
  it("gives every row a new id and follows every reference", () => {
    let n = 0;
    const p = {
      project,
      sheets: [sheet],
      markers: [marker],
      runs: [{ id: "r1", projectId: "p1", sheetId: "s1", markerId: "m1", kind: "wire", points: [] }],
      closets: [],
      estimateLines: [],
      photos: [{ id: "ph1", projectId: "p1", imageId: "img-photo", markerId: "m1", sheetId: "s1" }],
      photoComments: [{ id: "c1", projectId: "p1", photoId: "ph1", text: "m1 looks fine" }],
      checklists: [],
      jobLogs: [],
      documents: [],
      salesDocs: [{ id: "d1", projectId: "p1", shareToken: "secret", shareHash: "h" }],
      sheetLinks: [{ id: "l1", projectId: "p1", sheetId: "s1", target: { kind: "sheet", sheetId: "s1" } }],
      tasks: [{ id: "t1", projectId: "p1", photoIds: ["ph1"] }],
      images: [],
    } as never;
    const out = remapBackupProject(p, () => `new${++n}`);
    expect(out.project.id).not.toBe("p1");
    expect(out.project).toMatchObject({ billduDocs: [], billduClientId: undefined, address: "1 Test St" });
    const pid = out.project.id;
    const sid = out.sheets[0].id;
    expect(out.sheets[0]).toMatchObject({ projectId: pid, imageId: "img-plan" });
    expect(out.markers[0]).toMatchObject({ projectId: pid, sheetId: sid, deviceTypeId: "cam-indoor" });
    expect(out.runs[0]).toMatchObject({ sheetId: sid, markerId: out.markers[0].id });
    expect(out.photos[0]).toMatchObject({ imageId: "img-photo", markerId: out.markers[0].id });
    expect(out.photoComments[0]).toMatchObject({ photoId: out.photos[0].id, text: "m1 looks fine" });
    expect(out.salesDocs?.[0]).not.toHaveProperty("shareToken");
    expect(out.salesDocs?.[0]).not.toHaveProperty("shareHash");
    expect(out.sheetLinks?.[0].target).toEqual({ kind: "sheet", sheetId: sid });
    expect(out.tasks?.[0].photoIds).toEqual([out.photos[0].id]);
    // The original is untouched.
    expect(marker.sheetId).toBe("s1");
  });
});

describe("backup files", () => {
  async function seedJob() {
    const plan = await saveImage(new Blob(["plan"], { type: "image/png" }), 100, 100);
    const sig = await saveImage(new Blob(["sig"], { type: "image/png" }), 10, 10);
    await put("projects", project);
    await put("sheets", { ...sheet, imageId: plan });
    await put("markers", marker);
    const log: JobLog = { id: "j1", projectId: "p1", date: "2026-11-19", body: "", createdAt: ts, updatedAt: ts, report: { signature: { name: "Lead", imageId: sig, signedAt: ts } } as never };
    await put("jobLogs", log);
    return { plan, sig };
  }
  const file = async () => new File([await saved.blob!.text()], "job.pinplan.json", { type: "application/json" });

  it("includes daily report signatures and who made it", async () => {
    owner.userId = "user-a";
    const { plan, sig } = await seedJob();
    await exportProjectBackup("p1");
    const data = JSON.parse(await saved.blob!.text());
    expect(data.ownerId).toBe("user-a");
    expect(data.projects[0].images.map((i: { id: string }) => i.id).sort()).toEqual([plan, sig].sort());
  });

  it("restores another account's file as a copy", async () => {
    owner.userId = "user-a";
    await seedJob();
    await exportProjectBackup("p1");
    owner.userId = "user-b";
    const n = await importBackup(await file());
    expect(n).toBe(1);
    const jobs = (await db().projects.toArray()).filter((p) => !p.deleted);
    expect(jobs).toHaveLength(2);
    const copy = jobs.find((p) => p.id !== "p1")!;
    const markers = await db().markers.where("projectId").equals(copy.id).toArray();
    expect(markers).toHaveLength(1);
    expect(markers[0].id).not.toBe("m1");
    const sheets = await db().sheets.where("projectId").equals(copy.id).toArray();
    expect(markers[0].sheetId).toBe(sheets[0].id);
    // The original rows are untouched.
    expect(await db().markers.get("m1")).toMatchObject({ projectId: "p1", sheetId: "s1" });
  });

  it("restores your own file in place", async () => {
    owner.userId = "user-a";
    await seedJob();
    await exportProjectBackup("p1");
    await importBackup(await file());
    expect((await db().projects.toArray()).filter((p) => !p.deleted)).toHaveLength(1);
  });

  it("a technician's restore leaves the price list alone", async () => {
    await seedJob();
    await put("deviceTypes", { id: "dt-x", name: "Extra" } as never);
    await exportProjectBackup("p1");
    await db().deviceTypes.clear();
    await db().syncQueue.clear();
    useTeam.setState({ role: "tech" });
    await importBackup(await file());
    expect(await db().deviceTypes.count()).toBe(0);
    expect((await db().syncQueue.toArray()).some((q) => q.table === "deviceTypes")).toBe(false);
    expect(await db().markers.get("m1")).toBeTruthy();
  });
});
