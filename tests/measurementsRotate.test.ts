import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, put } from "@/lib/db";
import { useMeasurements } from "@/lib/measurements";
import { useEditor } from "@/lib/store";
import type { Measurement, Project, Sheet } from "@/lib/types";

const ts = "2026-11-19T10:00:00.000Z";
const project: Project = { id: "p1", clientName: "Test", address: "1 Test St", status: "estimate", billduDocs: [], createdAt: ts, updatedAt: ts };
const sheet: Sheet = { id: "s1", projectId: "p1", name: "L1", pageNumber: 1, order: 0, imageId: "img1", width: 200, height: 100, pxPerFt: 10, createdAt: ts, updatedAt: ts };
const run: Measurement = { id: "ms1", projectId: "p1", sheetId: "s1", kind: "polyline", points: [0.1, 0.2, 0.5, 0.2], label: "Cat6", createdAt: ts, updatedAt: ts };

const points = async () => (await db().measurements.get("ms1"))!.points.map((v) => Math.round(v * 1000) / 1000);
const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(async () => {
  await db().delete();
  await db().open();
  await put("projects", project);
  await put("sheets", sheet);
  await put("measurements", run);
  useEditor.setState({ project: null, past: [], future: [], loaded: false });
  await useEditor.getState().load("p1");
  await useMeasurements.getState().load("p1", true);
});

describe("saved measurements follow sheet rotation", () => {
  it("turn with the sheet, and back again on undo / forward on redo", async () => {
    await useEditor.getState().rotateSheetCW("s1", "img2", 100, 200);
    expect(await points()).toEqual([0.8, 0.1, 0.8, 0.5]);
    expect(useMeasurements.getState().rows[0].points.map((v) => Math.round(v * 1000) / 1000)).toEqual([0.8, 0.1, 0.8, 0.5]);

    await useEditor.getState().undo();
    await settle();
    expect(useEditor.getState().sheets[0].imageId).toBe("img1");
    expect(await points()).toEqual([0.1, 0.2, 0.5, 0.2]);

    await useEditor.getState().redo();
    await settle();
    expect(useEditor.getState().sheets[0].imageId).toBe("img2");
    expect(await points()).toEqual([0.8, 0.1, 0.8, 0.5]);
  });

  it("a sheet image changed some other way (sync, new revision) leaves them alone", async () => {
    await useEditor.getState().rotateSheetCW("s1", "img2", 100, 200);
    await useEditor.getState().updateSheet("s1", { imageId: "img3" });
    await settle();
    expect(await points()).toEqual([0.8, 0.1, 0.8, 0.5]);
  });
});
