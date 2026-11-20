import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, put } from "@/lib/db";
import { useEditor } from "@/lib/store";
import { computeTakeoff } from "@/lib/takeoff";
import type { Marker, Project, Run, Sheet } from "@/lib/types";

// Deleting sheets (plan sheet menu, Manage sheets' "Delete selected"): one soft-delete step that syncs, Undo brings
// everything back, and the takeoff never counts a deleted sheet's devices.
const ts = "2026-11-20T10:00:00.000Z";
const project: Project = { id: "p1", clientName: "Test", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
const sheet = (id: string, order: number, name: string): Sheet => ({ id, projectId: "p1", name, pageNumber: order + 1, order, imageId: `img-${id}`, width: 100, height: 100, createdAt: ts, updatedAt: ts });
const marker = (id: string, sheetId: string): Marker => ({
  id, projectId: "p1", sheetId, deviceTypeId: "cam-indoor", x: 0.5, y: 0.5, label: id, room: "", mount: "ceiling", wireType: "Cat6", tentative: false, notes: "", createdAt: ts, updatedAt: ts,
});
const run: Run = { id: "r1", projectId: "p1", sheetId: "s2", kind: "led", points: [0.1, 0.1, 0.5, 0.1], measuredFt: 12, createdAt: ts, updatedAt: ts } as Run;

beforeEach(async () => {
  await db().delete();
  await db().open();
  await put("projects", project);
  for (const s of [sheet("s1", 0, "Attic"), sheet("s2", 1, "1st Fl"), sheet("s3", 2, "2nd Fl")]) await put("sheets", s);
  for (const m of [marker("m1", "s1"), marker("m2", "s2"), marker("m3", "s2"), marker("m4", "s3")]) await put("markers", m);
  await put("runs", run);
  useEditor.setState({ project: null, past: [], future: [], loaded: false });
  await useEditor.getState().load("p1");
});

const total = () => {
  const s = useEditor.getState();
  return computeTakeoff({ sheets: s.sheets, markers: s.markers, runs: s.runs, closets: s.closets }).total.counts["cam-indoor"] ?? 0;
};

describe("deleting sheets", () => {
  it("deletes several sheets as one undo step; the takeoff drops their devices; Undo brings them back", async () => {
    expect(total()).toBe(4);
    const step = await useEditor.getState().deleteSheets(["s2", "s3"]);
    expect(step).toHaveLength(2);
    expect(useEditor.getState().sheets.map((s) => s.name)).toEqual(["Attic"]);
    expect(total()).toBe(1);
    // Soft delete, stored (and queued for sync like every write); the devices stay stored as they were.
    expect(await db().sheets.get("s2")).toMatchObject({ deleted: true });
    expect((await db().markers.get("m2"))?.deleted).toBeFalsy();
    expect((await db().syncQueue.toArray()).some((q) => q.table === "sheets" && q.rowId === "s3")).toBe(true);

    expect(await useEditor.getState().undoStep(step!)).toBe(true);
    expect(useEditor.getState().sheets.map((s) => s.name)).toEqual(["Attic", "1st Fl", "2nd Fl"]);
    expect(total()).toBe(4);
    expect(await db().sheets.get("s2")).toMatchObject({ deleted: false });
  });

  it("computeTakeoff never counts devices or runs on a deleted sheet", () => {
    const s = useEditor.getState();
    const sheets = s.sheets.map((sh) => (sh.id === "s2" ? { ...sh, deleted: true } : sh));
    const t = computeTakeoff({ sheets, markers: s.markers, runs: s.runs, closets: s.closets });
    expect(t.floors.map((f) => f.name)).toEqual(["Attic", "2nd Fl"]);
    expect(t.total.counts["cam-indoor"]).toBe(2);
    expect(t.total.ledTotalFt).toBe(0);
  });

  it("a toast's Undo only undoes its own step", async () => {
    const step = await useEditor.getState().deleteSheets(["s1"]);
    await useEditor.getState().updateSheet("s2", { name: "Main" });
    expect(await useEditor.getState().undoStep(step!)).toBe(false);
    expect(useEditor.getState().sheets.map((s) => s.name)).toEqual(["Main", "2nd Fl"]);
  });

  it("moves a sheet as one step", async () => {
    await useEditor.getState().moveSheet("s3", -1);
    expect(useEditor.getState().sheets.map((s) => s.name)).toEqual(["Attic", "2nd Fl", "1st Fl"]);
    expect(useEditor.getState().past).toHaveLength(1);
    await useEditor.getState().undo();
    expect(useEditor.getState().sheets.map((s) => s.name)).toEqual(["Attic", "1st Fl", "2nd Fl"]);
  });
});
