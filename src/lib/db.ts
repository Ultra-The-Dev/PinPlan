import Dexie, { type EntityTable } from "dexie";
import { nanoid } from "nanoid";
import { DEFAULT_SETTINGS, FOUNDER_BUSINESS, NEUTRAL_BUSINESS, seedCatalog } from "./catalog";
import { normalizeTemplates } from "./fieldDocs";
import type {
  AppSettings,
  BusinessSettings,
  ChecklistTemplate,
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

/** The founder's company details on the founder's own installs and team (comped); nothing for everyone else. */
export function businessDefaults(s: Pick<AppSettings, "brandDefaults">, founderTeam = isFounderTeam()): BusinessSettings {
  return s.brandDefaults !== "neutral" || founderTeam ? FOUNDER_BUSINESS : NEUTRAL_BUSINESS;
}

function isFounderTeam(): boolean {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem("pinplan.team");
    return !!raw && (JSON.parse(raw) as { billing?: { status?: string } | null }).billing?.status === "comped";
  } catch {
    return false;
  }
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
  const base = businessDefaults(s);
  // Merge in defaults added in later versions.
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    // Fields left blank fall back to the defaults (the founder's devices are already branded; customers start blank).
    business: Object.fromEntries(
      Object.entries({ ...base, ...s.business }).map(([k, v]) => [k, v === "" ? (base[k as keyof BusinessSettings] ?? "") : v]),
    ) as unknown as BusinessSettings,
    pricing: {
      ...DEFAULT_SETTINGS.pricing,
      ...s.pricing,
      wirePrices: { ...DEFAULT_SETTINGS.pricing.wirePrices, ...s.pricing?.wirePrices },
    },
    checklistTemplates: normalizeTemplates(s.checklistTemplates),
    // Older installs have no marker: keep them on the founder's defaults when they're saved again.
    brandDefaults: s.brandDefaults ?? "founder",
  };
}

/**
 * Save settings forms. Checklist templates are kept as stored (they are only changed by `saveChecklistTemplates`),
 * so a settings form opened earlier can't bring back a deleted template or drop a newly saved one.
 */
export async function saveSettings(s: AppSettings) {
  const d = db();
  await d.transaction("rw", d.settings, async () => {
    const stored = await d.settings.get("app");
    await d.settings.put({ ...s, checklistTemplates: stored?.checklistTemplates ?? s.checklistTemplates ?? [], updatedAt: nowIso() });
  });
}

/** Company checklist templates (saved from jobs, managed in Settings). */
export async function getChecklistTemplates(): Promise<ChecklistTemplate[]> {
  return (await getSettings()).checklistTemplates ?? [];
}

/** Replace the saved checklist templates with `update(current)` (read-modify-write on the latest stored copy). */
export async function saveChecklistTemplates(update: (cur: ChecklistTemplate[]) => ChecklistTemplate[]): Promise<ChecklistTemplate[]> {
  await ensureSeeded();
  const d = db();
  // One transaction, so two quick saves (or a save racing a settings-form save) can't drop each other's change.
  const next = await d.transaction("rw", d.settings, async () => {
    const s = (await d.settings.get("app")) ?? DEFAULT_SETTINGS;
    const list = normalizeTemplates(update(normalizeTemplates(s.checklistTemplates)));
    await d.settings.put({ ...s, checklistTemplates: list, updatedAt: nowIso() });
    return list;
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("pinplan:checklist-templates"));
  return next;
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
