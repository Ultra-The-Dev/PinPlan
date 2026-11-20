"use client";
// Project backup / restore as a single JSON file (plans, markup, estimate overrides and images).
// Useful when running local-only (no Supabase) or to move a job between devices.
import { db, loadProject, newId, nowIso, putMany, type SyncTable } from "./db";
import { downloadBlob, slug } from "./download";
import { t } from "./i18n";
import { readLocalOwner } from "./localOwner";
import { useTeam } from "./team";
import type { DeviceType, DocPayment, JobTemplate, Product, SalesDoc, StoredImage } from "./types";

const FORMAT = "pinplan-backup";

/** Who made a backup: a file from another account (and another company) is restored as a copy with new ids. */
function backupOwner(): { ownerId: string | null; teamId: string | null } {
  return { ownerId: readLocalOwner()?.userId ?? null, teamId: useTeam.getState().team?.id ?? null };
}

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
  if (!bundle) throw new Error(t("Project not found"));
  const { project, products } = await projectWithImages(bundle);
  const catalog = await db().deviceTypes.toArray();
  const payload = { format: FORMAT, version: 1, exportedAt: nowIso(), ...backupOwner(), catalog, products, projects: [project] };
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
  // Company job templates go with a full export (docs/job-templates.md).
  const jobTemplates = (await db().jobTemplates.toArray()).filter((t) => !t.deleted);
  const payload = { format: FORMAT, version: 1, exportedAt: nowIso(), ...backupOwner(), catalog, products: [...products.values()], projects, jobTemplates };
  downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), `pinplan-all-jobs-${nowIso().slice(0, 10)}.pinplan.json`);
  return projects.length;
}

export async function projectWithImages(bundle: NonNullable<Awaited<ReturnType<typeof loadProject>>>) {
  const imageIds = new Set<string>([
    ...bundle.sheets.map((s) => s.imageId),
    ...bundle.sheets.flatMap((s) => (s.revisions ?? []).map((r) => r.imageId)),
    ...bundle.markers.map((m) => m.photoId).filter((x): x is string => !!x),
    ...bundle.photos.map((p) => p.imageId),
    ...bundle.documents.map((d) => d.fileId),
    ...(bundle.changeOrders ?? []).map((c) => c.signatureImageId).filter((x): x is string => !!x),
    ...(bundle.forms ?? []).flatMap((f) => (f.signatures ?? []).map((sg) => sg.imageId)),
    // Daily report signatures.
    ...bundle.jobLogs.map((l) => l.report?.signature?.imageId).filter((x): x is string => !!x),
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

type BackupProject = NonNullable<Awaited<ReturnType<typeof loadProject>>> & { images: ImageRecord[]; salesDocs?: SalesDoc[]; salesPayments?: DocPayment[] };

/** Row lists in a backed-up job, in the order they are written (parents first). */
const PROJECT_TABLES = [
  "sheets",
  "markers",
  "runs",
  "closets",
  "estimateLines",
  "photos",
  "photoComments",
  "checklists",
  "jobLogs",
  "documents",
  "salesDocs",
  "salesPayments",
  "changeOrders",
  "rfis",
  "scheduleItems",
  "forms",
  "measurements",
  "sheetLinks",
  "tasks",
  "planMarkups",
] as const satisfies readonly (SyncTable & keyof BackupProject)[];

/**
 * A backup made by another account (and not by someone on this company's team) is restored as a copy: its ids belong
 * to that account in the cloud, so writing them here would be refused (or, worse, collide). Older files say nothing
 * about who made them and are restored in place, as before.
 */
export function restoreAsCopy(file: { ownerId?: string | null; teamId?: string | null }, me: { userId: string | null; teamId: string | null }): boolean {
  if (!file.ownerId || !me.userId || file.ownerId === me.userId) return false;
  return !(file.teamId && me.teamId && file.teamId === me.teamId);
}

/**
 * The same job under new ids. Like duplicateJob (jobTemplates.ts) every reference between rows is remapped, but
 * nothing is left out: a restore keeps photos, logs, documents, quotes and forms. Any string equal to one of the job's
 * row ids (projectId, sheetId, markerId, photoIds, link targets…) is replaced. Client share links and Billdu links
 * belong to the other account and are dropped. Image ids are kept: files are stored per job (<project>/<image id>).
 */
export function remapBackupProject(p: BackupProject, nextId: () => string): BackupProject {
  const ids = new Map<string, string>();
  const note = (id: unknown) => {
    if (typeof id === "string" && id && !ids.has(id)) ids.set(id, nextId());
  };
  note(p.project.id);
  for (const t of PROJECT_TABLES) for (const r of (p[t] ?? []) as { id?: string }[]) note(r?.id);
  const remap = (v: unknown): unknown => {
    if (typeof v === "string") return ids.get(v) ?? v;
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === "object" && !(v instanceof Blob)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]));
    return v;
  };
  const SHARED = ["shareToken", "shareHash", "publicView"];
  const strip = <T>(row: T): T => {
    const out = remap(row) as Record<string, unknown>;
    for (const k of SHARED) delete out[k];
    return out as T;
  };
  const out = { ...p, images: p.images ?? [] } as BackupProject;
  out.project = { ...strip(p.project), billduDocs: [], billduClientId: undefined };
  for (const t of PROJECT_TABLES) (out as unknown as Record<string, unknown>)[t] = ((p[t] ?? []) as unknown[]).map(strip);
  return out;
}

/** Restore projects from a backup file. Existing rows with the same ids are replaced (a file from another account is
 *  restored as a copy; see restoreAsCopy). Returns the number of projects. */
export async function importBackup(file: File): Promise<number> {
  let data: {
    format?: string;
    ownerId?: string | null;
    teamId?: string | null;
    catalog?: DeviceType[];
    products?: Product[];
    jobTemplates?: JobTemplate[];
    projects?: BackupProject[];
  };
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(t("That file isn't a PinPlan backup (invalid JSON)."));
  }
  if (data.format !== FORMAT || !Array.isArray(data.projects)) throw new Error(t("That file isn't a PinPlan backup."));
  const me = backupOwner();
  const asCopy = restoreAsCopy(data, { userId: me.ownerId, teamId: me.teamId });
  // Technicians can't change the price list or job templates (the database refuses): only the jobs are restored.
  const tech = useTeam.getState().role === "tech";
  if (tech) {
    data.catalog = [];
    data.products = [];
    data.jobTemplates = [];
  }

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

  // Job templates: add ones this device doesn't have.
  if (data.jobTemplates?.length) {
    const have = new Set((await db().jobTemplates.toArray()).filter((t) => !t.deleted).map((t) => t.id));
    const missing = data.jobTemplates.filter((t) => t?.id && t.payload && !have.has(t.id)).map((t) => ({ ...t, deleted: false }));
    if (missing.length) await putMany("jobTemplates", missing);
  }

  for (const raw of data.projects) {
    if (!raw?.project?.id) continue;
    const p = asCopy ? remapBackupProject(raw, newId) : raw;
    const d = db();
    await d.transaction("rw", d.images, d.syncQueue, async () => {
      for (const img of p.images ?? []) {
        const rec: StoredImage = { id: img.id, blob: base64ToBlob(img.data, img.mime), width: img.width, height: img.height, mime: img.mime };
        await d.images.put(rec);
        await d.syncQueue.add({ table: "images", rowId: img.id, queuedAt: nowIso() });
      }
    });
    await putMany("projects", [{ ...p.project, deleted: false }]);
    for (const t of PROJECT_TABLES) {
      const rows = (p[t] ?? []) as { id: string }[];
      if (rows.length) await putMany(t, rows);
    }
  }
  return data.projects.length;
}
