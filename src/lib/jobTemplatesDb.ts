"use client";
// Job templates and Duplicate job on this device (docs/job-templates.md). The rules are in jobTemplates.ts (pure);
// this file reads and writes Dexie through put/putMany/remove/saveImage, so everything is queued for sync.
import { useEffect, useState } from "react";
import { db, getCatalog, getProducts, loadProject, newId, nowIso, put, putMany, remove, saveImage, type SyncTable } from "./db";
import {
  applyTemplateParts,
  captureTemplate,
  chunked,
  DUPLICATE_ORDER,
  duplicateImageIds,
  duplicateJob,
  parseTemplatesFile,
  sortTemplates,
  type CaptureOptions,
  type DuplicateOptions,
} from "./jobTemplates";
import { getSupabase, PLANS_BUCKET } from "./supabase";
import type { JobTemplate, Project } from "./types";

export const TEMPLATES_EVENT = "pinplan:job-templates";
const changed = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TEMPLATES_EVENT));
};

/** Live templates on this device, by name. */
export async function listTemplates(): Promise<JobTemplate[]> {
  return sortTemplates(await db().jobTemplates.toArray());
}

/** The company's job templates (reloads when one is saved or deleted here, or arrives by sync). */
export function useJobTemplates(): { templates: JobTemplate[]; loaded: boolean } {
  const [state, setState] = useState<{ templates: JobTemplate[]; loaded: boolean }>({ templates: [], loaded: false });
  useEffect(() => {
    let alive = true;
    const load = () =>
      void listTemplates()
        .then((templates) => alive && setState({ templates, loaded: true }))
        .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    load();
    window.addEventListener(TEMPLATES_EVENT, load);
    window.addEventListener("pinplan:synced", load);
    return () => {
      alive = false;
      window.removeEventListener(TEMPLATES_EVENT, load);
      window.removeEventListener("pinplan:synced", load);
    };
  }, []);
  return state;
}

/** Save a job's setup as a new template. */
export async function saveJobAsTemplate(projectId: string, opts: CaptureOptions): Promise<JobTemplate> {
  const bundle = await loadProject(projectId);
  if (!bundle) throw new Error("Job not found");
  const t = await put("jobTemplates", captureTemplate(bundle, opts, { id: newId(), now: nowIso() }));
  changed();
  return t;
}

export async function updateTemplate(id: string, patch: Partial<Pick<JobTemplate, "name" | "description">>): Promise<void> {
  const t = await db().jobTemplates.get(id);
  if (!t || t.deleted) return;
  await put("jobTemplates", { ...t, ...patch });
  changed();
}

export async function deleteTemplate(id: string): Promise<void> {
  await remove("jobTemplates", id);
  changed();
}

/** Add templates from an exported file. Returns how many were added and anything skipped. */
export async function importTemplates(text: string): Promise<{ added: number; warnings: string[] }> {
  const { templates, warnings } = parseTemplatesFile(text, nowIso(), newId);
  if (templates.length) await putMany("jobTemplates", templates);
  changed();
  return { added: templates.length, warnings };
}

async function writeChunks(table: SyncTable, rows: { id: string }[], onRows?: (n: number) => void) {
  for (const part of chunked(rows)) {
    await putMany(table, part);
    onRows?.(part.length);
  }
}

/**
 * Apply a template to a job that was just created. Product choices and device types that no longer exist are
 * skipped; the returned warnings say what was. Technicians (includePrices false) never get prices or estimate lines.
 */
export async function applyTemplateToJob(template: JobTemplate, project: Project, includePrices: boolean): Promise<string[]> {
  const [catalog, products] = await Promise.all([getCatalog(), getProducts()]);
  let current = project;
  return applyTemplateParts(
    template,
    {
      project,
      now: nowIso(),
      newId,
      includePrices,
      deviceTypeIds: new Set(catalog.filter((d) => !d.archived).map((d) => d.id)),
      productIds: new Set(products.filter((p) => !p.archived).map((p) => p.id)),
      warnings: [],
      write: (table, rows) => writeChunks(table, rows),
    },
    async (patch) => {
      current = await put("projects", { ...current, ...patch });
    },
  );
}

export interface DuplicateProgress {
  done: number;
  total: number;
  step: string;
}

/**
 * Duplicate a job on this device. Plan images are copied under new ids (cloud storage keeps files per job, so a
 * shared image would vanish for the copy if the original job were deleted). Rows go in chunks of 200.
 */
export async function duplicateJobInDb(projectId: string, opts: Omit<DuplicateOptions, "imageMap">, onProgress?: (p: DuplicateProgress) => void): Promise<Project> {
  const bundle = await loadProject(projectId);
  if (!bundle) throw new Error("Job not found");
  const imageIds = duplicateImageIds(bundle);
  // Sizes are known before anything is written, so the progress bar doesn't jump.
  const preview = duplicateJob(bundle, opts, () => "x", "");
  const rowTotal = DUPLICATE_ORDER.reduce((n, t) => n + preview[t].length, 0);
  const total = imageIds.length + rowTotal + 1;
  let done = 0;
  const tick = (n: number, step: string) => {
    done += n;
    onProgress?.({ done, total, step });
  };
  tick(0, "Copying plans…");

  const imageMap: Record<string, string> = {};
  for (const id of imageIds) {
    const img = await db().images.get(id);
    if (img) imageMap[id] = await saveImage(img.blob, img.width, img.height);
    else {
      // Not on this device yet (never downloaded): fetch it from the original job's cloud folder so the copy owns it.
      // Offline or not uploaded: the copy points at the original image id (this device still shows it once it arrives).
      const sheet = bundle.sheets.find((s) => s.imageId === id);
      const blob = await getSupabase()
        ?.storage.from(PLANS_BUCKET)
        .download(`${projectId}/${id}`)
        .then((r) => r.data)
        .catch(() => null);
      if (blob && sheet) imageMap[id] = await saveImage(blob, sheet.width, sheet.height);
    }
    tick(1, "Copying plans…");
  }

  const out = duplicateJob(bundle, { ...opts, imageMap }, newId, nowIso());
  await put("projects", out.project);
  tick(1, "Copying devices…");
  for (const table of DUPLICATE_ORDER) await writeChunks(table, out[table], (n) => tick(n, table === "checklists" ? "Copying checklists…" : "Copying devices…"));
  return out.project;
}
