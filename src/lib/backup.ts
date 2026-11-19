"use client";
// Project backup / restore as a single JSON file (plans, markup, estimate overrides and images).
// Useful when running local-only (no Supabase) or to move a job between devices.
import { db, loadProject, nowIso, putMany, type SyncTable } from "./db";
import { downloadBlob, slug } from "./download";
import type { DeviceType, DocPayment, Product, SalesDoc, StoredImage } from "./types";

const FORMAT = "pinplan-backup";

interface ImageRecord {
  id: string;
  mime: string;
  width: number;
  height: number;
  data: string; // base64
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: mime });
}

export async function exportProjectBackup(projectId: string) {
  const bundle = await loadProject(projectId);
  if (!bundle) throw new Error("Project not found");
  const { project, products } = await projectWithImages(bundle);
  const catalog = await db().deviceTypes.toArray();
  const payload = { format: FORMAT, version: 1, exportedAt: nowIso(), catalog, products, projects: [project] };
  downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), `${slug(bundle.project.address || "project")}.pinplan.json`);
}

/** Every job on this device in one backup file (Settings › Account › Export my data). Restores with "Restore backup". */
export async function exportAllBackup(): Promise<number> {
  const ids = (await db().projects.toArray()).filter((p) => !p.deleted).map((p) => p.id);
  const projects = [];
  const products = new Map<string, Product>();
  for (const id of ids) {
    const bundle = await loadProject(id);
    if (!bundle) continue;
    const r = await projectWithImages(bundle);
    projects.push(r.project);
    for (const p of r.products) products.set(p.id, p);
  }
  const catalog = await db().deviceTypes.toArray();
  const payload = { format: FORMAT, version: 1, exportedAt: nowIso(), catalog, products: [...products.values()], projects };
  downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), `pinplan-all-jobs-${nowIso().slice(0, 10)}.pinplan.json`);
  return projects.length;
}

async function projectWithImages(bundle: NonNullable<Awaited<ReturnType<typeof loadProject>>>) {
  const imageIds = new Set<string>([
    ...bundle.sheets.map((s) => s.imageId),
    ...bundle.markers.map((m) => m.photoId).filter((x): x is string => !!x),
    ...bundle.photos.map((p) => p.imageId),
    ...bundle.documents.map((d) => d.fileId),
  ]);
  const images: ImageRecord[] = [];
  for (const id of imageIds) {
    const rec = await db().images.get(id);
    if (rec) images.push({ id, mime: rec.mime || rec.blob.type, width: rec.width, height: rec.height, data: await blobToBase64(rec.blob) });
  }
  // Products the job uses (job choices + per-device picks), so prices survive the move.
  const used = new Set<string>([...Object.values(bundle.project.productChoices ?? {}), ...bundle.markers.map((m) => m.productId).filter((x): x is string => !!x)]);
  const products = (await db().products.toArray()).filter((p) => !p.deleted && used.has(p.id));
  // Quotes, invoices, credit notes and payments go with the job.
  const pid = bundle.project.id;
  const [salesDocs, salesPayments] = await Promise.all([
    db().salesDocs.where("projectId").equals(pid).filter((d) => !d.deleted).toArray(),
    db().salesPayments.where("projectId").equals(pid).filter((p) => !p.deleted).toArray(),
  ]);
  return { project: { ...bundle, images, salesDocs, salesPayments }, products };
}

/** Restore projects from a backup file. Existing rows with the same ids are replaced. Returns the number of projects. */
export async function importBackup(file: File): Promise<number> {
  let data: {
    format?: string;
    catalog?: DeviceType[];
    products?: Product[];
    projects?: (Awaited<ReturnType<typeof loadProject>> & { images: ImageRecord[]; salesDocs?: SalesDoc[]; salesPayments?: DocPayment[] })[];
  };
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a PinPlan backup (invalid JSON).");
  }
  if (data.format !== FORMAT || !Array.isArray(data.projects)) throw new Error("That file isn't a PinPlan backup.");

  // Catalog: add device types this device doesn't have yet (keeps local prices for existing ones).
  if (data.catalog?.length) {
    const have = new Set((await db().deviceTypes.toArray()).map((d) => d.id));
    const missing = data.catalog.filter((d) => !have.has(d.id));
    if (missing.length) await putMany("deviceTypes", missing);
  }

  // Products: add ones this device doesn't have (keeps local prices for existing ones).
  if (data.products?.length) {
    const have = new Set((await db().products.toArray()).filter((p) => !p.deleted).map((p) => p.id));
    const missing = data.products.filter((p) => p?.id && !have.has(p.id)).map((p) => ({ ...p, deleted: false }));
    if (missing.length) await putMany("products", missing);
  }

  for (const p of data.projects) {
    if (!p?.project?.id) continue;
    const d = db();
    await d.transaction("rw", d.images, d.syncQueue, async () => {
      for (const img of p.images ?? []) {
        const rec: StoredImage = { id: img.id, blob: base64ToBlob(img.data, img.mime), width: img.width, height: img.height, mime: img.mime };
        await d.images.put(rec);
        await d.syncQueue.add({ table: "images", rowId: img.id, queuedAt: nowIso() });
      }
    });
    await putMany("projects", [{ ...p.project, deleted: false }]);
    const tables: [SyncTable, { id: string }[]][] = [
      ["sheets", p.sheets],
      ["markers", p.markers],
      ["runs", p.runs],
      ["closets", p.closets],
      ["estimateLines", p.estimateLines],
      ["photos", p.photos],
      ["photoComments", p.photoComments],
      ["checklists", p.checklists],
      ["jobLogs", p.jobLogs],
      ["documents", p.documents],
      ["salesDocs", p.salesDocs ?? []],
      ["salesPayments", p.salesPayments ?? []],
      ["sheetLinks", p.sheetLinks ?? []],
    ];
    for (const [t, rows] of tables) if (rows?.length) await putMany(t, rows);
  }
  return data.projects.length;
}
