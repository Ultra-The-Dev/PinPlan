import Dexie, { type EntityTable } from "dexie";
import { nanoid } from "nanoid";
import { DEFAULT_SETTINGS, seedCatalog } from "./catalog";
import type {
  AppSettings,
  BusinessSettings,
  Closet,
  DeviceType,
  EstimateLine,
  Checklist,
  JobDocument,
  JobLog,
  Marker,
  Photo,
  PhotoComment,
  Product,
  Project,
  Run,
  Sheet,
  StoredImage,
  Suggestion,
} from "./types";

/** Tables that are synced to Supabase when it is configured. */
export type SyncTable =
  | "projects"
  | "sheets"
  | "deviceTypes"
  | "products"
  | "markers"
  | "runs"
  | "closets"
  | "estimateLines"
  | "photos"
  | "photoComments"
  | "checklists"
  | "jobLogs"
  | "documents";

export interface SyncItem {
  seq?: number;
  table: SyncTable | "images";
  rowId: string;
  queuedAt: string;
}

class PinPlanDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  sheets!: EntityTable<Sheet, "id">;
  deviceTypes!: EntityTable<DeviceType, "id">;
  products!: EntityTable<Product, "id">;
  markers!: EntityTable<Marker, "id">;
  runs!: EntityTable<Run, "id">;
  closets!: EntityTable<Closet, "id">;
  estimateLines!: EntityTable<EstimateLine, "id">;
  photos!: EntityTable<Photo, "id">;
  photoComments!: EntityTable<PhotoComment, "id">;
  checklists!: EntityTable<Checklist, "id">;
  jobLogs!: EntityTable<JobLog, "id">;
  documents!: EntityTable<JobDocument, "id">;
  suggestions!: EntityTable<Suggestion, "id">;
  images!: EntityTable<StoredImage, "id">;
  settings!: EntityTable<AppSettings, "id">;
  syncQueue!: EntityTable<SyncItem, "seq">;

  constructor() {
    super("pinplan");
    this.version(1).stores({
      projects: "id, updatedAt",
      sheets: "id, projectId, order",
      deviceTypes: "id, category, sort",
      markers: "id, projectId, sheetId, deviceTypeId",
      runs: "id, projectId, sheetId, kind",
      closets: "id, projectId, sheetId",
      estimateLines: "id, projectId, key",
      suggestions: "id, projectId, sheetId",
      images: "id",
      settings: "id",
      syncQueue: "++seq, table, rowId",
    });
    // v2: brand/model product library.
    this.version(2).stores({ products: "id, deviceTypeId" });
    // v3: field documentation — photos, comments, checklists, daily logs, documents.
    this.version(3).stores({
      photos: "id, projectId, takenAt, markerId",
      photoComments: "id, projectId, photoId",
      checklists: "id, projectId",
      jobLogs: "id, projectId, date",
      documents: "id, projectId",
    });
  }
}

let _db: PinPlanDB | null = null;
export function db(): PinPlanDB {
  if (!_db) _db = new PinPlanDB();
  return _db;
}

export const newId = () => nanoid(12);
export const nowIso = () => new Date().toISOString();

type Row = { id: string; updatedAt?: string };

/** Write a row locally and queue it for sync. All app writes go through here. */
export async function put<T extends Row>(table: SyncTable, row: T): Promise<T> {
  const r = { ...row, updatedAt: nowIso() };
  const d = db();
  await d.transaction("rw", d.table(table), d.syncQueue, async () => {
    await d.table(table).put(r);
    await d.syncQueue.add({ table, rowId: r.id, queuedAt: r.updatedAt });
  });
  return r;
}

export async function putMany<T extends Row>(table: SyncTable, rows: T[]): Promise<T[]> {
  const ts = nowIso();
  const rs = rows.map((r) => ({ ...r, updatedAt: ts }));
  const d = db();
  await d.transaction("rw", d.table(table), d.syncQueue, async () => {
    await d.table(table).bulkPut(rs);
    await d.syncQueue.bulkAdd(rs.map((r) => ({ table, rowId: r.id, queuedAt: ts })));
  });
  return rs;
}

/** Soft delete (tombstone) so the deletion syncs to other devices. */
export async function remove(table: SyncTable, id: string) {
  const row = await db().table(table).get(id);
  if (row) await put(table, { ...row, deleted: true });
}

export async function saveImage(blob: Blob, width: number, height: number): Promise<string> {
  const id = newId();
  const d = db();
  await d.transaction("rw", d.images, d.syncQueue, async () => {
    await d.images.put({ id, blob, width, height, mime: blob.type });
    await d.syncQueue.add({ table: "images", rowId: id, queuedAt: nowIso() });
  });
  return id;
}

/** Ensure the catalog and settings exist (first run). */
export async function ensureSeeded() {
  const d = db();
  if ((await d.deviceTypes.count()) === 0) await d.deviceTypes.bulkPut(seedCatalog());
  if (!(await d.settings.get("app"))) await d.settings.put(DEFAULT_SETTINGS);
}

export async function getSettings(): Promise<AppSettings> {
  await ensureSeeded();
  const s = (await db().settings.get("app")) ?? DEFAULT_SETTINGS;
  // Merge in defaults added in later versions.
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    // Fields left blank fall back to the company defaults (so a fresh device is already branded).
    business: Object.fromEntries(
      Object.entries({ ...DEFAULT_SETTINGS.business, ...s.business }).map(([k, v]) => [k, v === "" ? (DEFAULT_SETTINGS.business[k as keyof BusinessSettings] ?? "") : v]),
    ) as unknown as BusinessSettings,
    pricing: {
      ...DEFAULT_SETTINGS.pricing,
      ...s.pricing,
      wirePrices: { ...DEFAULT_SETTINGS.pricing.wirePrices, ...s.pricing?.wirePrices },
    },
  };
}

export async function saveSettings(s: AppSettings) {
  await db().settings.put({ ...s, updatedAt: nowIso() });
}

export interface ProjectBundle {
  project: Project;
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
  estimateLines: EstimateLine[];
  photos: Photo[];
  photoComments: PhotoComment[];
  checklists: Checklist[];
  jobLogs: JobLog[];
  documents: JobDocument[];
}

export async function loadProject(projectId: string): Promise<ProjectBundle | null> {
  const d = db();
  const project = await d.projects.get(projectId);
  if (!project || project.deleted) return null;
  const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);
  const [sheets, markers, runs, closets, estimateLines, photos, photoComments, checklists, jobLogs, documents] = await Promise.all([
    d.sheets.where("projectId").equals(projectId).toArray(),
    d.markers.where("projectId").equals(projectId).toArray(),
    d.runs.where("projectId").equals(projectId).toArray(),
    d.closets.where("projectId").equals(projectId).toArray(),
    d.estimateLines.where("projectId").equals(projectId).toArray(),
    d.photos.where("projectId").equals(projectId).toArray(),
    d.photoComments.where("projectId").equals(projectId).toArray(),
    d.checklists.where("projectId").equals(projectId).toArray(),
    d.jobLogs.where("projectId").equals(projectId).toArray(),
    d.documents.where("projectId").equals(projectId).toArray(),
  ]);
  return {
    project: { ...project, billduDocs: project.billduDocs ?? [] },
    sheets: live(sheets).sort((a, b) => a.order - b.order),
    markers: live(markers),
    runs: live(runs),
    closets: live(closets),
    estimateLines: live(estimateLines),
    photos: live(photos).sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
    photoComments: live(photoComments).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    checklists: live(checklists).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    jobLogs: live(jobLogs).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    documents: live(documents).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/** The product library (live rows), sorted by brand then model. */
export async function getProducts(): Promise<Product[]> {
  return (await db().products.toArray())
    .filter((p) => !p.deleted)
    .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
}

export async function getCatalog(): Promise<DeviceType[]> {
  await ensureSeeded();
  return (await db().deviceTypes.toArray()).sort((a, b) => a.sort - b.sort);
}
