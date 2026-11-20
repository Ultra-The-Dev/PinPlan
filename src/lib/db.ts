import Dexie, { type EntityTable } from "dexie";
import { nanoid } from "nanoid";
import { DEFAULT_SETTINGS, FOUNDER_BUSINESS, NEUTRAL_BUSINESS, seedCatalog } from "./catalog";
import { normalizeDocSettings } from "./documents";
import { normalizeTemplates } from "./fieldDocs";
import { builtInAdditions } from "./trades";
import type {
  AppSettings,
  BusinessSettings,
  ChangeOrder,
  ChecklistTemplate,
  Closet,
  DeviceType,
  DocPayment,
  DocumentSettings,
  EstimateLine,
  Checklist,
  JobDocument,
  JobLog,
  JobTemplate,
  Marker,
  Measurement,
  Photo,
  PhotoComment,
  PlanTask,
  PlanMarkup,
  Product,
  Project,
  Rfi,
  Run,
  SalesDoc,
  ScheduleItem,
  Sheet,
  SheetLink,
  StoredImage,
  Suggestion,
  JobForm,
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
  | "documents"
  | "salesDocs"
  | "salesPayments"
  | "jobTemplates"
  | "changeOrders"
  | "rfis"
  | "scheduleItems"
  | "forms"
  | "measurements"
  | "sheetLinks"
  | "tasks"
  | "planMarkups";

export interface SyncItem {
  seq?: number;
  table: SyncTable | "images";
  rowId: string;
  queuedAt: string;
  /** Pushed without a column the cloud database doesn't have yet ("<remote table>.<column>"): kept queued and sent
   *  again once that column exists (src/lib/sync.ts), so the column's data isn't lost. */
  retryWhenColumn?: string;
}

/** A change the cloud database wouldn't accept (bad value, permission, constraint). Set aside so the rest keeps syncing;
 *  the person can discard it (take the cloud copy) or try again. Keyed `<table>:<rowId>`. */
export interface RefusedChange {
  id: string;
  table: SyncTable;
  rowId: string;
  projectId?: string;
  error: string;
  code?: string;
  at: string;
}

/** A small JPEG preview of a stored image (src/lib/thumbs.ts). Local only: never synced, rebuilt on demand. */
export interface StoredThumb {
  /** `${imageId}@${maxSide}` */
  id: string;
  imageId: string;
  blob: Blob;
  width: number;
  height: number;
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
  /** Quotes, invoices and credit notes (not to be confused with `documents`, the job's attached files). */
  salesDocs!: EntityTable<SalesDoc, "id">;
  salesPayments!: EntityTable<DocPayment, "id">;
  /** Company job templates (docs/job-templates.md). Not part of any job. */
  jobTemplates!: EntityTable<JobTemplate, "id">;
  /** Change orders (docs/change-orders.md). */
  changeOrders!: EntityTable<ChangeOrder, "id">;
  rfis!: EntityTable<Rfi, "id">;
  measurements!: EntityTable<Measurement, "id">;
  /** Hyperlinks on plans (docs/sheet-index-links.md). */
  sheetLinks!: EntityTable<SheetLink, "id">;
  /** Tasks pinned on the plan (punch / issues). */
  tasks!: EntityTable<PlanTask, "id">;
  suggestions!: EntityTable<Suggestion, "id">;
  scheduleItems!: EntityTable<ScheduleItem, "id">;
  /** Plan markups (redlines, clouds, notes): drawn on sheets, never counted. */
  planMarkups!: EntityTable<PlanMarkup, "id">;
  images!: EntityTable<StoredImage, "id">;
  settings!: EntityTable<AppSettings, "id">;
  syncQueue!: EntityTable<SyncItem, "seq">;
  /** Filled forms and inspections (job_forms). */
  forms!: EntityTable<JobForm, "id">;
  /** Local changes the cloud refused (see RefusedChange). Never synced. */
  syncRefused!: EntityTable<RefusedChange, "id">;
  /** Local-only image previews for job cards and photo grids (src/lib/thumbs.ts). */
  thumbs!: EntityTable<StoredThumb, "id">;

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
    // v4: quotes / invoices / credit notes and their payments.
    this.version(4).stores({
      salesDocs: "id, projectId, kind, status, updatedAt",
      salesPayments: "id, projectId, documentId",
    });
    // v30: company job templates (docs/job-templates.md).
    this.version(30).stores({ jobTemplates: "id, updatedAt" });
    // v28: change orders (versions are numbered per feature; gaps are fine).
    this.version(28).stores({ changeOrders: "id, projectId, status, updatedAt" });
    // v27: RFIs (docs/rfis.md). Version numbers are spaced out so features built in parallel don't collide.
    this.version(27).stores({ rfis: "id, projectId, status, updatedAt" });
    // v29: job schedule (phases with dependencies; docs/schedule-lookahead.md).
    this.version(29).stores({ scheduleItems: "id, projectId, start, updatedAt" });
    // v26: typed forms and inspections.
    this.version(26).stores({ forms: "id, projectId, templateId, status, updatedAt" });
    // v24: saved measurements (lengths, runs, areas) on sheets — docs/saved-measurements.md.
    this.version(24).stores({ measurements: "id, projectId, sheetId, updatedAt" });
    // v25: hyperlinks on plans (sheet index; version numbers leave room for parallel features).
    this.version(25).stores({ sheetLinks: "id, projectId, sheetId, updatedAt" });
    // v21: tasks pinned on the plan (version numbers leave room for features built in parallel).
    this.version(21).stores({ tasks: "id, projectId, sheetId, status, assignee, updatedAt" });
    // v22: plan markups (docs/plan-markups.md). Version numbers are spread out between features built in parallel.
    this.version(22).stores({ planMarkups: "id, projectId, sheetId, updatedAt" });
    // v43: changes the cloud refused, set aside so one bad row never stops syncing (src/lib/sync.ts). Local only.
    // v49 is reserved for a local-only thumbnails table (perf); don't reuse it.
    this.version(43).stores({ syncRefused: "id, table, at" });
    // v49: local-only thumbnails of sheet and photo images (src/lib/thumbs.ts; not synced, safe to clear).
    this.version(49).stores({ thumbs: "id, imageId" });
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

// ---------------- recently opened jobs ----------------
// Sync downloads photos, documents and plans only for these (and each job's cover plan for the job list), so a big
// company's files don't fill a phone that has never opened most of its jobs. Per user: cleared at sign-out.

export const RECENT_JOBS_KEY = "pinplan.recentJobs";
/** How long an opened job keeps its files downloading. */
export const RECENT_JOB_MS = 30 * 86_400_000;
const RECENT_JOBS_MAX = 25;

function readRecentJobs(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_JOBS_KEY) ?? "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** A job was opened on this device (its files are wanted here). */
export function noteJobOpened(projectId: string, now = Date.now()): void {
  try {
    const all = { ...readRecentJobs(), [projectId]: now };
    const keep = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, RECENT_JOBS_MAX);
    localStorage.setItem(RECENT_JOBS_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* storage unavailable */
  }
}

/** Jobs opened here lately, and when the latest was opened (0 when none). */
export function recentJobs(now = Date.now()): { ids: Set<string>; lastOpenedAt: number } {
  const ids = new Set<string>();
  let lastOpenedAt = 0;
  for (const [id, at] of Object.entries(readRecentJobs())) {
    if (typeof at !== "number" || now - at > RECENT_JOB_MS) continue;
    ids.add(id);
    lastOpenedAt = Math.max(lastOpenedAt, at);
  }
  return { ids, lastOpenedAt };
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

let builtInsChecked = false;

/** Ensure the catalog and settings exist (first run), and that an older catalog has the items added since (alarm
 *  sensors, Door / Window: `builtInAdditions`). Those are written like the seed: on this device only, not queued for
 *  sync, dated 1970 so the company's own copy on the server always wins. */
export async function ensureSeeded() {
  const d = db();
  if ((await d.deviceTypes.count()) === 0) await d.deviceTypes.bulkPut(seedCatalog());
  if (!builtInsChecked) {
    builtInsChecked = true;
    const missing = builtInAdditions(await d.deviceTypes.toArray());
    if (missing.length) await d.deviceTypes.bulkPut(missing);
  }
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
    documents: normalizeDocSettings(s.documents, s.pricing?.currency),
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
    // Trades are written only by saveTrades (useTrades.ts); invoicing settings: they're only changed by saveDocumentSettings (and sync).
    await d.settings.put({ ...s, checklistTemplates: stored?.checklistTemplates ?? s.checklistTemplates ?? [], trades: stored?.trades ?? s.trades, formTemplates: stored?.formTemplates ?? s.formTemplates, documents: stored?.documents ?? s.documents, updatedAt: nowIso() });
  });
}

/** Store this device's copy of the company invoicing settings (see docSettings.ts). */
export async function saveDocumentSettings(doc: DocumentSettings): Promise<void> {
  await ensureSeeded();
  const d = db();
  await d.transaction("rw", d.settings, async () => {
    const s = (await d.settings.get("app")) ?? DEFAULT_SETTINGS;
    await d.settings.put({ ...s, documents: doc, updatedAt: nowIso() });
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
  /** Change orders (newest number last). Optional so older bundles and backups still type-check. */
  changeOrders?: ChangeOrder[];
  /** RFIs (newest first). Optional so older bundles and backups still type-check. */
  rfis?: Rfi[];
  /** Schedule phases (by start date). Optional so older bundles and backups still type-check. */
  scheduleItems?: ScheduleItem[];
  /** Forms and inspections. Optional so older bundles and backups still type-check. */
  forms?: JobForm[];
  /** Saved measurements. Optional so older bundles and backups still type-check. */
  measurements?: Measurement[];
  /** Sheet index links. Optional so older bundles and backups still type-check. */
  sheetLinks?: SheetLink[];
  /** Tasks pinned on the plan. Optional so older bundles and backups still type-check. */
  tasks?: PlanTask[];
  planMarkups?: PlanMarkup[];
}

export async function loadProject(projectId: string): Promise<ProjectBundle | null> {
  const d = db();
  const project = await d.projects.get(projectId);
  if (!project || project.deleted) return null;
  const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);
  const [sheets, markers, runs, closets, estimateLines, photos, photoComments, checklists, jobLogs, documents, changeOrders, rfis, scheduleItems, forms, sheetLinks, tasks] = await Promise.all([
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
    d.changeOrders.where("projectId").equals(projectId).toArray(),
    d.rfis.where("projectId").equals(projectId).toArray(),
    d.scheduleItems.where("projectId").equals(projectId).toArray(),
    d.forms.where("projectId").equals(projectId).toArray(),
    d.sheetLinks.where("projectId").equals(projectId).toArray(),
    d.tasks.where("projectId").equals(projectId).toArray(),
  ]);
  const measurements = await d.measurements.where("projectId").equals(projectId).toArray();
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
    changeOrders: live(changeOrders).sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt)),
    rfis: live(rfis).sort((a, b) => b.number - a.number),
    scheduleItems: live(scheduleItems).sort((a, b) => a.start.localeCompare(b.start) || (a.sort ?? 0) - (b.sort ?? 0)),
    forms: live(forms).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    measurements: live(measurements).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    sheetLinks: live(sheetLinks),
    tasks: live(tasks).sort((a, b) => a.number - b.number || a.createdAt.localeCompare(b.createdAt)),
    planMarkups: live(await d.planMarkups.where("projectId").equals(projectId).toArray()),
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

/** A job's quotes, invoices and credit notes (live rows), newest first, and their payments. */
export async function getProjectDocs(projectId: string): Promise<{ docs: SalesDoc[]; payments: DocPayment[] }> {
  const [docs, payments] = await Promise.all([
    db().salesDocs.where("projectId").equals(projectId).toArray(),
    db().salesPayments.where("projectId").equals(projectId).toArray(),
  ]);
  return { docs: docs.filter((d) => !d.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), payments: payments.filter((p) => !p.deleted) };
}

/** Every quote, invoice and credit note on this device (all jobs), and their payments. */
export async function getAllDocs(): Promise<{ docs: SalesDoc[]; payments: DocPayment[] }> {
  const [docs, payments] = await Promise.all([db().salesDocs.toArray(), db().salesPayments.toArray()]);
  return { docs: docs.filter((d) => !d.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), payments: payments.filter((p) => !p.deleted) };
}
