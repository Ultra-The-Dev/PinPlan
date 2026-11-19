import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, put } from "@/lib/db";
import { useEditor } from "@/lib/store";
import type { Checklist, JobDocument, Marker, Project, Sheet } from "@/lib/types";

// Lets a test act right after loadProject has read the database (before the store applies what it read).
const hooks = vi.hoisted(() => ({ afterRead: null as null | (() => Promise<void>), failPut: false }));
vi.mock("@/lib/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...mod,
    put: (async (table, row) => {
      if (hooks.failPut) throw new Error("QuotaExceededError");
      return mod.put(table, row);
    }) as typeof mod.put,
    loadProject: async (id: string) => {
      const bundle = await mod.loadProject(id);
      const hook = hooks.afterRead;
      hooks.afterRead = null;
      if (hook) await hook();
      return bundle;
    },
  };
});

const ts = "2026-11-19T10:00:00.000Z";
const project: Project = { id: "p1", clientName: "Test", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
const sheet: Sheet = { id: "s1", projectId: "p1", name: "L1", pageNumber: 1, order: 0, imageId: "img1", width: 100, height: 100, createdAt: ts, updatedAt: ts };
const marker: Marker = {
  id: "m1", projectId: "p1", sheetId: "s1", deviceTypeId: "cam-indoor", x: 0.5, y: 0.5, label: "CAM-1", room: "", mount: "ceiling",
  wireType: "Cat6", tentative: false, notes: "", createdAt: ts, updatedAt: ts,
};

beforeEach(async () => {
  await db().delete();
  await db().open();
  await put("projects", project);
  await put("sheets", sheet);
  await put("markers", marker);
  useEditor.setState({ project: null, past: [], future: [], loaded: false });
  await useEditor.getState().load("p1");
});

describe("editor commits", () => {
  it("two quick edits to one device both stick (no lost write)", async () => {
    const s = useEditor.getState();
    const a = s.updateMarker("m1", { label: "CAM-9" });
    const b = s.updateMarker("m1", { room: "Kitchen" });
    await Promise.all([a, b]);
    expect(useEditor.getState().markers[0]).toMatchObject({ label: "CAM-9", room: "Kitchen" });
    expect(await db().markers.get("m1")).toMatchObject({ label: "CAM-9", room: "Kitchen" });
  });

  it("a reload that read the database before an edit doesn't put the old row back", async () => {
    hooks.afterRead = () => useEditor.getState().updateMarker("m1", { notes: "check height" });
    await useEditor.getState().load("p1");
    expect(useEditor.getState().markers[0].notes).toBe("check height");
  });

  it("an edit that fails to save is taken back off the screen and out of undo history", async () => {
    hooks.failPut = true;
    try {
      await expect(useEditor.getState().updateMarker("m1", { label: "CAM-9" })).rejects.toThrow("QuotaExceededError");
    } finally {
      hooks.failPut = false;
    }
    expect(useEditor.getState().markers[0].label).toBe("CAM-1");
    expect(useEditor.getState().past).toHaveLength(0);
    expect((await db().markers.get("m1"))?.label).toBe("CAM-1");
  });

  it("undo and redo of field-doc rows round-trip", async () => {
    const s = useEditor.getState();
    const c: Checklist = { id: "c1", projectId: "p1", name: "Punch", items: [{ id: "i1", text: "Label rack" }], createdAt: ts, updatedAt: ts };
    await s.saveRow("checklists", c);
    await s.saveRow("checklists", { ...useEditor.getState().checklists[0], items: [{ id: "i1", text: "Label rack", done: true }] });
    await useEditor.getState().undo();
    expect(useEditor.getState().checklists[0].items[0].done).toBeUndefined();
    await useEditor.getState().undo();
    expect(useEditor.getState().checklists).toHaveLength(0);
    expect((await db().checklists.get("c1"))?.deleted).toBe(true);
    await useEditor.getState().redo();
    await useEditor.getState().redo();
    expect(useEditor.getState().checklists[0].items[0].done).toBe(true);
    expect(await db().checklists.get("c1")).toMatchObject({ deleted: false, items: [{ done: true }] });
  });

  it("new documents show in the same order as after a reload (newest first)", async () => {
    const s = useEditor.getState();
    const doc = (id: string, createdAt: string): JobDocument => ({ id, projectId: "p1", name: id, mime: "text/plain", size: 1, fileId: `f${id}`, createdAt, updatedAt: createdAt });
    await s.saveRow("documents", doc("old", "2026-11-18T10:00:00.000Z"));
    await s.saveRow("documents", doc("new", "2026-11-19T10:00:00.000Z"));
    const shown = useEditor.getState().documents.map((d) => d.id);
    await useEditor.getState().load("p1");
    expect(useEditor.getState().documents.map((d) => d.id)).toEqual(shown);
    expect(shown).toEqual(["new", "old"]);
  });
});
