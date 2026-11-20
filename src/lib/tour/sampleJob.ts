"use client";
// The sample job the tours use: one floor plan with doors and windows (public/samples/sample-plan.pdf, a copy of
// samples/doors-windows-demo.pdf), made through the normal writes (put / saveImage), so it behaves like any job.
// Signed in to a team it syncs like any job: its name says it's a sample, and Help offers to delete it.
import { saveImportedSheetText } from "../findSimilar/sheetText";
import { db, newId, nowIso, put, remove, saveImage } from "../db";
import { findScale } from "../geometry";
import { t } from "../i18n";
import { guessFloorName, renderPdf } from "../importPlans";
import type { Project, Sheet } from "../types";

export const SAMPLE_PLAN_URL = "/samples/sample-plan.pdf";
/** The label that marks the sample job (data, shown as typed). */
export const SAMPLE_LABEL = "Sample";

/** The sample job made on this device, if it's still there. */
export async function existingSampleJob(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  try {
    const p = await db().projects.get(id);
    return p && !p.deleted ? p.id : null;
  } catch {
    return null;
  }
}

/** Make the sample job: a job, and the sample plan rendered into its first sheet. Returns its id. */
export async function createSampleJob(): Promise<string> {
  const now = nowIso();
  const p: Project = {
    id: newId(),
    // Typed data, shown as written: the address line says it's a sample in the person's language at creation time.
    address: t("Sample job · 12 Example St"),
    clientName: t("Sample client"),
    clientEmail: "",
    clientPhone: "",
    status: "estimate",
    billduDocs: [],
    labels: [SAMPLE_LABEL],
    createdAt: now,
    updatedAt: now,
  };
  await put("projects", p);
  try {
    const res = await fetch(SAMPLE_PLAN_URL);
    if (!res.ok) throw new Error(String(res.status));
    const pages = await renderPdf(await res.blob());
    let order = 0;
    for (const page of pages) {
      const imageId = await saveImage(page.blob, page.width, page.height);
      const found = findScale(page.text);
      const sheet: Sheet = {
        id: newId(),
        projectId: p.id,
        name: guessFloorName(page.text, "1st Fl"),
        pageNumber: page.pageNumber,
        order: order++,
        imageId,
        width: page.width,
        height: page.height,
        pxPerFt: found ? found.inchesPerFoot * page.pxPerInch : null,
        scaleLabel: found?.label ?? null,
        pxPerInch: page.pxPerInch,
        createdAt: now,
        updatedAt: now,
      };
      await put("sheets", sheet);
      // Find similar → Read tags works on the sample too.
      void saveImportedSheetText(sheet.id, page.items ?? []);
    }
  } catch (e) {
    // No plan (offline before the first visit, an old browser): the job is still there and the tour goes on;
    // the Plan tab then shows its own "Upload plans".
    console.warn("[tour] sample plan not loaded", e);
  }
  return p.id;
}

/** Delete the sample job (soft delete, like any job). */
export async function deleteSampleJob(id: string): Promise<void> {
  await remove("projects", id);
}
