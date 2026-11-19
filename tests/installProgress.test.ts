import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog";
import { db, put } from "@/lib/db";
import {
  STATUS_COLORS,
  STATUS_ORDER,
  applyInstall,
  canResetInstall,
  canSetInstall,
  countAtLeast,
  installedQuantities,
  issues,
  nearestWithin,
  nextStatus,
  progress,
  progressTotals,
  requiresPhoto,
  statusOf,
  testText,
  workflowFor,
} from "@/lib/installProgress";
import { useEditor } from "@/lib/store";
import { useTeam } from "@/lib/team";
import { TABLES, toLocal, toRemote } from "@/lib/syncMap";
import { computeTakeoff } from "@/lib/takeoff";
import type { DeviceType, InstallStatus, Marker, Project, Run, Sheet } from "@/lib/types";
import { buildSampleJob } from "./fixtures/sampleJob";

const ts = "2026-11-19T10:00:00.000Z";
const later = "2026-11-19T11:00:00.000Z";

const catalog: DeviceType[] = [
  { id: "cam", name: "Camera", category: "security", symbol: "C", abbrev: "CAM", shape: "circle", color: "#000", unit: "each", unitPrice: 1, laborPrice: 1, defaultWire: "Cat6", defaultMount: "ceiling", kind: "device", sort: 0, updatedAt: ts },
  { id: "wap", name: "WAP", category: "network", symbol: "W", abbrev: "WAP", shape: "circle", color: "#000", unit: "each", unitPrice: 1, laborPrice: 1, defaultWire: "Cat6", defaultMount: "ceiling", kind: "device", sort: 1, updatedAt: ts },
  { id: "led", name: "LED tape", category: "lighting", symbol: "L", abbrev: "LED", shape: "circle", color: "#000", unit: "LF", unitPrice: 1, laborPrice: 1, defaultWire: "", defaultMount: "ceiling", kind: "led", sort: 2, updatedAt: ts },
];
const sheets: Sheet[] = [
  { id: "s1", projectId: "p", name: "1st Fl", pageNumber: 1, order: 0, imageId: "i1", width: 100, height: 100, createdAt: ts, updatedAt: ts },
  { id: "s2", projectId: "p", name: "2nd Fl", pageNumber: 2, order: 1, imageId: "i2", width: 100, height: 100, createdAt: ts, updatedAt: ts },
  { id: "s3", projectId: "p", name: "Roof", pageNumber: 3, order: 2, imageId: "i3", width: 100, height: 100, createdAt: ts, updatedAt: ts },
];
const mk = (id: string, sheetId: string, deviceTypeId: string, status?: InstallStatus, extra: Partial<Marker> = {}): Marker => ({
  id, projectId: "p", sheetId, deviceTypeId, x: 0.5, y: 0.5, label: id, room: "", mount: "ceiling", wireType: "Cat6", tentative: false, notes: "",
  createdAt: ts, updatedAt: ts, install: status ? { status, at: ts } : undefined, ...extra,
});

describe("workflows", () => {
  it("low voltage devices go pre-wire → installed → tested", () => {
    const w = workflowFor({ category: "security", kind: "device" }, ["lowvoltage"]);
    expect(w.steps).toEqual(["roughed", "installed", "tested"]);
    expect(w.labels.roughed).toBe("Pre-wired");
  });
  it("electrical devices: rough-in → trimmed out → tested", () => {
    const w = workflowFor({ category: "power" }, ["electrical"]);
    expect(w.steps).toEqual(["roughed", "installed", "tested"]);
    expect(w.labels.installed).toBe("Trimmed out");
    expect(workflowFor({ category: "lighting" }, ["electrical"]).id).toBe("electrical");
    expect(workflowFor({ category: "lighting" }, ["lowvoltage"]).id).toBe("lowvoltage");
    expect(workflowFor({ category: "panels" }, ["electrical"]).steps).toEqual(["installed", "tested"]);
  });
  it("cable runs: pulled → terminated → certified; LED runs skip rough-in", () => {
    const w = workflowFor({ run: "wire" }, ["lowvoltage"]);
    expect(w.steps).toEqual(["roughed", "installed", "tested"]);
    expect([w.labels.roughed, w.labels.installed, w.labels.tested]).toEqual(["Pulled", "Terminated", "Certified"]);
    expect(workflowFor({ run: "wire" }, ["plumbing"]).labels.tested).toBe("Pressure tested");
    expect(workflowFor({ run: "led" }).steps).toEqual(["installed", "tested"]);
  });
  it("other trades have their own words", () => {
    expect(workflowFor({ category: "hvac" }, ["hvac"]).labels.tested).toBe("Started up");
    expect(workflowFor({ category: "fire" }, ["fire"]).id).toBe("fire");
    expect(workflowFor({ category: "solar" }, ["solar"]).labels.tested).toBe("Commissioned");
    expect(workflowFor({ category: "infrastructure" }).steps).toEqual(["installed", "tested"]);
  });
  it("nextStatus walks the steps and stops at the end", () => {
    const w = workflowFor({ category: "security" });
    expect(nextStatus(null, w)).toBe("roughed");
    expect(nextStatus("planned", w)).toBe("roughed");
    expect(nextStatus("roughed", w)).toBe("installed");
    expect(nextStatus("installed", w)).toBe("tested");
    expect(nextStatus("tested", w)).toBeNull();
    expect(nextStatus("verified", w)).toBeNull();
    expect(nextStatus("issue", w)).toBe("roughed");
    const rack = workflowFor({ category: "infrastructure" });
    expect(nextStatus("planned", rack)).toBe("installed");
  });
  it("every status has an order slot and a colour", () => {
    for (const s of STATUS_ORDER) expect(STATUS_COLORS[s]).toMatch(/^#/);
    expect(STATUS_ORDER).toHaveLength(6);
  });
});

describe("applyInstall", () => {
  it("records who/when, appends history, keeps photos and the test result", () => {
    const a = applyInstall(null, "roughed", "Sam", ts);
    expect(a).toMatchObject({ status: "roughed", by: "Sam", at: ts, photoIds: [], test: null });
    expect(a.history).toEqual([{ status: "roughed", by: "Sam", at: ts }]);
    const b = applyInstall(a, "installed", "Ana", later, { photoId: "ph1", note: " box set " });
    expect(b.history).toHaveLength(2);
    expect(b.history![1]).toEqual({ status: "installed", by: "Ana", at: later, note: "box set" });
    expect(b.photoIds).toEqual(["ph1"]);
    const c = applyInstall(b, "tested", "Ana", later, { photoId: "ph1", test: { pass: true, value: "0.4 dB" } });
    expect(c.photoIds).toEqual(["ph1"]);
    expect(c.test).toEqual({ pass: true, value: "0.4 dB" });
    expect(applyInstall(c, "verified", "Office", later).test).toEqual({ pass: true, value: "0.4 dB" });
    expect(applyInstall(c, "issue", "Office", later, { test: null }).test).toBeNull();
    // The input isn't changed.
    expect(a.history).toHaveLength(1);
    expect(testText(c.test)).toBe("Pass · 0.4 dB");
    expect(testText({ pass: false })).toBe("Fail");
  });
});

describe("permissions", () => {
  it("techs set everything but verified; office does everything", () => {
    for (const s of ["planned", "roughed", "installed", "tested", "issue"] as InstallStatus[]) expect(canSetInstall("tech", s)).toBe(true);
    expect(canSetInstall("tech", "verified")).toBe(false);
    expect(canSetInstall("tech", "issue", "verified")).toBe(false);
    for (const r of ["owner", "admin", null]) expect(canSetInstall(r, "verified")).toBe(true);
    expect(canResetInstall("tech")).toBe(false);
    expect(canResetInstall("admin")).toBe(true);
  });
});

describe("requiresPhoto", () => {
  it("defaults to installed and follows the company setting", () => {
    expect(requiresPhoto(null, "installed")).toBe(true);
    expect(requiresPhoto({}, "tested")).toBe(false);
    expect(requiresPhoto({ installPhotoRequired: [] }, "installed")).toBe(false);
    expect(requiresPhoto({ installPhotoRequired: ["roughed", "tested"] }, "tested")).toBe(true);
  });
});

describe("progress", () => {
  const markers = [
    mk("a", "s1", "cam", "tested"),
    mk("b", "s1", "cam", "verified"),
    mk("c", "s1", "wap", "installed"),
    mk("d", "s1", "wap"),
    mk("t", "s1", "cam", "tested", { tentative: true }),
    mk("x", "s2", "wap", "issue"),
    mk("gone", "s2", "wap", "tested", { deleted: true }),
    mk("ledm", "s2", "led", "tested"),
  ];
  const runs: Run[] = [
    { id: "r1", projectId: "p", sheetId: "s1", kind: "wire", points: [0, 0, 1, 1], markerId: "a", closetId: "eq", wireType: "Cat6", install: { status: "tested" }, createdAt: ts, updatedAt: ts },
    { id: "r2", projectId: "p", sheetId: "s1", kind: "wire", points: [0, 0, 1, 1], markerId: "c", closetId: "eq", wireType: "Cat6", createdAt: ts, updatedAt: ts },
  ];
  const closets = [{ id: "eq", projectId: "p", sheetId: "s1", kind: "equipment" as const, x: 0, y: 0, name: "Equipment", createdAt: ts, updatedAt: ts }];

  it("groups by sheet (sheets without devices hidden), tentative/deleted excluded", () => {
    const rows = progress(markers, runs, sheets, catalog, { by: "sheet" });
    expect(rows.map((r) => r.name)).toEqual(["1st Fl", "2nd Fl"]);
    const s1 = rows[0];
    expect(s1.total).toBe(4);
    expect(s1.done).toBe(2);
    expect(s1.pct).toBe(50);
    expect(s1.counts).toMatchObject({ planned: 1, installed: 1, tested: 1, verified: 1 });
    expect(s1.runs).toMatchObject({ total: 2, done: 1, pct: 50 });
    expect(rows[1]).toMatchObject({ total: 1, done: 0, pct: 0 });
    expect(rows[1].counts.issue).toBe(1);
  });
  it("groups by category and closet", () => {
    const byCat = progress(markers, runs, sheets, catalog, { by: "category" });
    expect(byCat.find((r) => r.key === "security")).toMatchObject({ total: 2, done: 2, pct: 100 });
    expect(byCat.find((r) => r.key === "network")).toMatchObject({ total: 3, done: 0 });
    expect(byCat.find((r) => r.key === "wiring")?.runs.total).toBe(2);
    const byCloset = progress([mk("a", "s1", "cam", "tested", { closetId: "eq" }), mk("b", "s1", "cam")], runs, sheets, catalog, { by: "closet", closets });
    expect(byCloset.map((r) => [r.name, r.total, r.runs.total])).toEqual([
      ["Equipment", 1, 2],
      ["No closet", 1, 0],
    ]);
  });
  it("totals and installed quantities", () => {
    expect(progressTotals(markers, catalog)).toMatchObject({ total: 5, done: 2, pct: 40 });
    expect(installedQuantities(markers, catalog)).toEqual({ cam: 2, wap: 1 });
    expect(countAtLeast(markers, catalog, "installed")).toEqual({ n: 3, total: 5 });
    expect(countAtLeast(markers, catalog, "issue")).toEqual({ n: 1, total: 5 });
  });
  it("issues lists flagged devices and runs, newest first, with the note", () => {
    const m = { ...mk("i1", "s1", "cam"), install: applyInstall(null, "issue", "Sam", ts, { note: "Box missing" }) };
    const r = { ...runs[1], install: applyInstall(null, "issue", "Ana", later) };
    const list = issues([m, mk("ok", "s1", "cam", "tested")], [r]);
    expect(list.map((i) => [i.table, i.id, i.note])).toEqual([
      ["runs", "r2", null],
      ["markers", "i1", "Box missing"],
    ]);
  });
  it("statusOf defaults to planned and nearestWithin finds the closest point in range", () => {
    expect(statusOf(mk("z", "s1", "cam"))).toBe("planned");
    expect(statusOf({ install: { status: "bogus" as InstallStatus } })).toBe("planned");
    expect(nearestWithin([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }], { x: 8, y: 0 }, 24)).toBe(1);
    expect(nearestWithin([{ x: 100, y: 0 }], { x: 0, y: 0 }, 24)).toBe(-1);
  });
});

describe("counts are unaffected", () => {
  it("computeTakeoff is identical with and without install data (sample job)", () => {
    const data = buildSampleJob();
    const before = computeTakeoff(data);
    const statuses: InstallStatus[] = ["roughed", "installed", "tested", "verified", "issue", "planned"];
    const withInstall = {
      ...data,
      markers: data.markers.map((m, i) => ({ ...m, install: applyInstall(null, statuses[i % statuses.length], "Sam", ts, { test: { pass: true, value: "1" } }) })),
      runs: data.runs.map((r, i) => ({ ...r, install: { status: statuses[i % statuses.length] } })),
    };
    expect(computeTakeoff(withInstall)).toEqual(before);
    expect(seedCatalog().length).toBeGreaterThan(0);
  });
});

describe("sync", () => {
  it("markers and runs carry install", () => {
    expect(TABLES.markers.columns.install).toBe("install");
    expect(TABLES.runs.columns.install).toBe("install");
    const install = applyInstall(null, "tested", "Sam", ts, { test: { pass: true, value: "0.3 dB" } });
    const remote = toRemote("markers", mk("a", "s1", "cam", undefined, { install }) as unknown as Record<string, unknown>);
    expect(remote.install).toEqual(install);
    expect((toLocal("markers", remote) as unknown as Marker).install).toEqual(install);
  });
});

describe("editor store", () => {
  const project: Project = { id: "p1", clientName: "T", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
  const sheet: Sheet = { ...sheets[0], id: "s1", projectId: "p1" };
  beforeEach(async () => {
    await db().delete();
    await db().open();
    await put("projects", project);
    await put("sheets", sheet);
    await put("markers", { ...mk("m1", "s1", "cam"), projectId: "p1" });
    useEditor.setState({ project: null, past: [], future: [], loaded: false });
    await useEditor.getState().load("p1");
  });

  it("a status change persists, survives a move and undoes", async () => {
    const s = useEditor.getState();
    await s.updateMarker("m1", { install: applyInstall(null, "installed", "Sam", ts) });
    expect(statusOf(useEditor.getState().markers[0])).toBe("installed");
    expect((await db().markers.get("m1"))?.install?.status).toBe("installed");
    await useEditor.getState().updateMarker("m1", { x: 0.2 });
    expect(statusOf(useEditor.getState().markers[0])).toBe("installed");
    await useEditor.getState().undo();
    await useEditor.getState().undo();
    expect(statusOf(useEditor.getState().markers[0])).toBe("planned");
  });
});

describe("progress actions", () => {
  const project: Project = { id: "p2", clientName: "T", address: "2 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
  const sheet: Sheet = { ...sheets[0], id: "s2", projectId: "p2" };
  beforeEach(async () => {
    await db().delete();
    await db().open();
    await put("projects", project);
    await put("sheets", sheet);
    for (const id of ["v1", "v2"]) await put("markers", { ...mk(id, "s2", "cam", undefined, { install: applyInstall(null, "tested", "Sam", ts) }), projectId: "p2" });
    useEditor.setState({ project: null, past: [], future: [], loaded: false });
    await useEditor.getState().load("p2");
    useTeam.setState({ role: null });
  });

  it("bulk verify in the open job is one undo step", async () => {
    const { bulkVerify } = await import("@/components/progress/actions");
    expect(await bulkVerify(useEditor.getState().markers)).toBe(2);
    expect(useEditor.getState().markers.map(statusOf)).toEqual(["verified", "verified"]);
    expect((await db().markers.get("v1"))?.install?.status).toBe("verified");
    await useEditor.getState().undo();
    expect(useEditor.getState().markers.map(statusOf)).toEqual(["tested", "tested"]);
  });

  it("techs can't bulk verify; a saved test sets tested, issue or keeps verified", async () => {
    const { bulkVerify, testTarget } = await import("@/components/progress/actions");
    useTeam.setState({ role: "tech" });
    expect(await bulkVerify(useEditor.getState().markers)).toBe(0);
    expect(useEditor.getState().markers.map(statusOf)).toEqual(["tested", "tested"]);
    expect(testTarget("installed", true)).toBe("tested");
    expect(testTarget("verified", true)).toBe("verified");
    expect(testTarget("tested", false)).toBe("issue");
  });
});
