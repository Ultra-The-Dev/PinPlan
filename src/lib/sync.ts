"use client";
// Offline-first sync between the local Dexie database and Supabase.
// Push: drain the sync queue (parents before children), upserting the current local row. A row the database refuses
// (permission, constraint, bad value) is set aside in `syncRefused` so the rest keeps syncing.
// Pull: fetch rows changed on the server since the last pull (server `synced_at` watermark),
// last-write-wins by `updatedAt`, written straight into Dexie without re-queuing. Pull runs even when push failed.
// Cost: only visible tabs tick, one tab syncs at a time, the team/billing is re-read every few minutes, and the sweep
// for files that never arrived runs only after a pull changed something.
import { create } from "zustand";
import { billingAllowsWork, isSubscriptionInactive } from "./billingLogic";
import { db, type RefusedChange, type SyncItem, type SyncTable } from "./db";
import { reportError } from "./errorReporting";
import { adoptLocalData, checkLocalOwner, readLocalOwner, removeLocalData } from "./localOwner";
import { getSupabase, PLANS_BUCKET, supabaseConfigured } from "./supabase";
import { plansUploadBody, plansUploadType } from "./storageTypes";
import {
  dedupeQueue,
  gapTag,
  isRowRefusal,
  mergeServerNumber,
  nextPullPage,
  pullStart,
  PUSH_ORDER,
  refusedKey,
  remoteWins,
  schemaGap,
  TABLES,
  TECH_SKIPPED_TABLES,
  toLocal,
  toRemote,
  withoutColumns,
  type TableSpec,
} from "./syncMap";
import { markupsToPush } from "./markups";
import type { JobLog, PlanMarkup, Sheet } from "./types";
import { pullCompanySettings } from "./companySettings";
import { pullDocSettings } from "./docSettings";
import { clearLocalData, finishPendingCompany } from "./onboarding";
import { finishPendingInvite, loadTeam, loadTeamIfStale, TEAM_MAX_AGE_MS, useTeam } from "./team";
import { toast } from "./toast";

export interface SyncStatus {
  configured: boolean;
  signedIn: boolean;
  /** False until the saved sign-in has been read on this page load (avoid flashing "signed out"). */
  authReady: boolean;
  email: string | null;
  userId: string | null;
  online: boolean;
  syncing: boolean;
  /** Distinct rows waiting to be pushed. */
  pending: number;
  /** Changes the cloud didn't accept (set aside; see discardRefused / retryRefused). */
  refused: number;
  lastSyncAt: string | null;
  error: string | null;
  /** The team's subscription has lapsed: the cloud refuses edits, so they stay queued on this device (pulls go on). */
  readOnly: boolean;
  /** Another account's jobs are on this device: sync is paused until the person decides (see AccountPanel). */
  ownerMismatch: { email: string | null } | null;
  syncNow(): Promise<void>;
}

export const useSyncStatus = create<SyncStatus>(() => ({
  configured: supabaseConfigured,
  signedIn: false,
  authReady: !supabaseConfigured,
  email: null,
  userId: null,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  refused: 0,
  lastSyncAt: null,
  error: null,
  readOnly: false,
  ownerMismatch: null,
  syncNow: () => runSync(true),
}));

/** Fired on window after a pull wrote remote changes into Dexie. detail: { tables, projectIds }. */
export const SYNCED_EVENT = "pinplan:synced";

const CHUNK = 200;
const PAGE = 1000;
const TICK_MS = 15_000;
/** A column/table found missing is assumed still missing for this long (a forced sync checks again). */
const GAP_RECHECK_MS = 30 * 60_000;
/** The sweep for files that never arrived runs at most this often, and only after a pull changed rows. */
const SWEEP_MS = 3 * 60_000;
/** Consecutive failed syncs (while online) before the error is reported. */
const REPORT_AFTER_FAILURES = 3;
const LOCK_NAME = "pinplan-sync";
const CHANNEL_NAME = "pinplan-sync";
const LAST_RUN_KEY = "pinplan.sync.lastRun";

let running: Promise<void> | null = null;
let failures = 0;
let nextAttemptAt = 0;
/** The database refused a write as "PinPlan subscription inactive": don't push again before this (pulls go on). */
let readOnlyUntil = 0;
const READ_ONLY_RETRY_MS = 10 * 60_000;
/** Cloud tables/columns found missing (the latest migration hasn't been run on the project yet). Kept between syncs. */
const schemaGaps = { tables: new Set<string>(), columns: new Map<string, Set<string>>(), checkedAt: 0 };
let schemaReported = false;
/** Image uploads that failed: retried with backoff, never blocking the rows. */
const imageBackoff = new Map<string, { fails: number; nextAt: number }>();
let lastSweepAt = 0;
/** The user whose ownership of this device's jobs has been checked (sync waits for it). */
let ownerCheckedFor: string | null = null;
let channel: BroadcastChannel | null = null;

function setStatus(p: Partial<SyncStatus>) {
  useSyncStatus.setState(p);
}

async function refreshPending() {
  try {
    const [items, refused] = await Promise.all([db().syncQueue.toArray(), db().syncRefused.count()]);
    setStatus({ pending: dedupeQueue(items).length, refused });
  } catch {
    /* IndexedDB unavailable (SSR / private mode) */
  }
}

/** Without Supabase the queue is never drained; keep only the latest item per row so it stays small. */
async function compactQueue() {
  const items = await db().syncQueue.toArray();
  const keep = new Set(dedupeQueue(items).map((i) => i.seq));
  const drop = items.filter((i) => !keep.has(i.seq)).map((i) => i.seq!);
  if (drop.length) await db().syncQueue.bulkDelete(drop);
}

type Client = NonNullable<ReturnType<typeof getSupabase>>;
type DbError = { code?: string | null; message: string };

interface PullResult {
  tables: Set<SyncTable>;
  projectIds: Set<string>;
}

// ---------------- push ----------------

async function push(changed: PullResult): Promise<void> {
  const sb = getSupabase()!;
  const snapshot = await db().syncQueue.orderBy("seq").toArray();
  if (!snapshot.length) return;
  const latest = dedupeQueue(snapshot);
  const groups = new Map<string, SyncItem[]>();
  for (const it of latest) groups.set(it.table, [...(groups.get(it.table) ?? []), it]);
  const seqsFor = (table: string, rowIds?: Set<string>) => snapshot.filter((s) => s.table === table && (!rowIds || rowIds.has(s.rowId))).map((s) => s.seq!);
  const tech = useTeam.getState().role === "tech";

  // Rows, in parent-before-child order; images right after their sheets.
  const order: (SyncTable | "images")[] = [];
  for (const t of PUSH_ORDER) {
    order.push(t);
    if (t === "sheets") order.push("images");
  }

  let owners: Map<string, ImageOwner> | null = null;
  for (const table of order) {
    const items = groups.get(table);
    if (!items?.length) continue;
    if (table === "images") {
      owners ??= await imageOwners();
      for (const it of items) {
        const wait = imageBackoff.get(it.rowId);
        if (wait && Date.now() < wait.nextAt) continue;
        const r = await pushImage(sb, it.rowId, owners);
        // Not referenced yet (e.g. a photo whose row is still being written): keep it queued for the next sync,
        // unless it has been orphaned for a day.
        const stale = r === "waiting" && Date.now() - new Date(it.queuedAt).getTime() > 86_400_000;
        if (r === "done" || stale) {
          imageBackoff.delete(it.rowId);
          await db().syncQueue.bulkDelete(snapshot.filter((s) => s.table === "images" && s.rowId === it.rowId).map((s) => s.seq!));
        } else if (r === "failed") {
          const fails = (wait?.fails ?? 0) + 1;
          imageBackoff.set(it.rowId, { fails, nextAt: Date.now() + Math.min(30 * 60_000, 15_000 * 2 ** fails) });
        }
      }
      continue;
    }
    // Technicians can't write prices, the catalog, office documents, job templates or plan links (the database
    // refuses): drop those edits instead of blocking every sync.
    if (tech && TECH_SKIPPED_TABLES.has(table)) {
      await db().syncQueue.bulkDelete(seqsFor(table));
      continue;
    }
    const spec = TABLES[table];
    // The cloud database is a migration behind: keep the table's rows queued.
    if (schemaGaps.tables.has(spec.remote)) continue;
    // Rows already sent without a column that's still missing wait for it (no need to resend them every tick).
    const missing = schemaGaps.columns.get(spec.remote);
    const waiting = (it: SyncItem) => !!it.retryWhenColumn && !!missing && it.retryWhenColumn.split(",").some((tag) => missing.has(tag.slice(spec.remote.length + 1)));
    const ready = items.filter((it) => !waiting(it));
    if (!ready.length) continue;
    const handled = new Set(ready.map((i) => i.rowId));
    let rows = (await db().table(table).bulkGet(ready.map((i) => i.rowId))).filter(Boolean) as Record<string, unknown>[];
    if (table === "planMarkups") {
      // Claim markups drawn signed out; leave out ones the database would refuse (see markupsToPush).
      const { send, claimed } = markupsToPush(rows as unknown as PlanMarkup[], useTeam.getState().role, useSyncStatus.getState().userId);
      if (claimed.length) await db().planMarkups.bulkPut(claimed);
      rows = send as unknown as Record<string, unknown>[];
    }
    const setAside = new Set<string>();
    let skipped = false;
    for (let i = 0; i < rows.length && !skipped; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const payload = chunk.map((r) => toRemote(table, r));
      const res = await upsertRows(sb, spec, payload);
      if (res.tableGap) {
        skipped = true;
        break;
      }
      if (!res.error) {
        await clearRefused(table, chunk);
        continue;
      }
      // One bad row must not stop the rest: send them one at a time and set aside the ones refused.
      if (!isRowRefusal(res.error, res.status)) throw new Error(`${spec.remote}: ${res.error.message}`);
      const r = await pushOneByOne(sb, table, chunk, changed, tech);
      for (const id of r.setAside) setAside.add(id);
      if (r.tableGap) skipped = true;
    }
    if (skipped) continue;
    const gaps = [...(schemaGaps.columns.get(spec.remote) ?? [])];
    if (!gaps.length) {
      await db().syncQueue.bulkDelete(seqsFor(table, handled));
      continue;
    }
    // Sent without columns the cloud doesn't have yet: keep one item per row, tagged, so the column's data is sent
    // once the migration has been run.
    await db().syncQueue.bulkDelete(seqsFor(table, setAside));
    const keep = new Map<string, number>();
    for (const s of snapshot) if (s.table === table && handled.has(s.rowId) && !setAside.has(s.rowId)) keep.set(s.rowId, Math.max(keep.get(s.rowId) ?? 0, s.seq!));
    const latestSeqs = new Set(keep.values());
    await db().syncQueue.bulkDelete(seqsFor(table, handled).filter((s) => !latestSeqs.has(s)));
    const tag = gaps.map((c) => gapTag(spec.remote, c)).join(",");
    await db().syncQueue.where("seq").anyOf([...latestSeqs]).modify({ retryWhenColumn: tag });
  }
}

/** Upsert rows, leaving out columns the cloud database doesn't have yet. `tableGap`: the table itself is missing. */
async function upsertRows(sb: Client, spec: TableSpec, payload: Record<string, unknown>[]): Promise<{ error: DbError | null; status?: number; tableGap?: boolean }> {
  for (;;) {
    const { error, status } = await sb.from(spec.remote).upsert(withoutColumns(payload, schemaGaps.columns.get(spec.remote)), { onConflict: spec.conflict });
    if (!error) return { error: null };
    const gap = schemaGap(error);
    const cols = schemaGaps.columns.get(spec.remote) ?? new Set<string>();
    if (gap?.kind === "column" && !cols.has(gap.column) && gap.column in payload[0]) {
      schemaGaps.columns.set(spec.remote, cols.add(gap.column));
      continue;
    }
    if (gap?.kind === "table") {
      schemaGaps.tables.add(spec.remote);
      return { error: null, tableGap: true };
    }
    return { error, status };
  }
}

/**
 * Send rows one at a time after their chunk was refused. A technician's edit the database refuses (42501: e.g. a form
 * the office has submitted) is dropped and the server's copy taken; any other refused row is set aside in
 * `syncRefused` with the reason, and the rest carry on.
 */
async function pushOneByOne(sb: Client, table: SyncTable, rows: Record<string, unknown>[], changed: PullResult, tech: boolean): Promise<{ setAside: string[]; tableGap: boolean }> {
  const spec = TABLES[table];
  const setAside: string[] = [];
  for (const row of rows) {
    const res = await upsertRows(sb, spec, [toRemote(table, row)]);
    if (res.tableGap) return { setAside, tableGap: true };
    if (!res.error) {
      await clearRefused(table, [row]);
      continue;
    }
    if (!isRowRefusal(res.error, res.status)) throw new Error(`${spec.remote}: ${res.error.message}`);
    const id = String(row.id);
    setAside.push(id);
    if (tech && res.error.code === "42501") {
      await restoreFromServer(sb, table, id, changed, false);
      continue;
    }
    const rec: RefusedChange = { id: refusedKey(table, id), table, rowId: id, error: res.error.message, at: new Date().toISOString() };
    if (res.error.code) rec.code = res.error.code;
    if (typeof row.projectId === "string") rec.projectId = row.projectId;
    await db().syncRefused.put(rec);
  }
  return { setAside, tableGap: false };
}

/** A row that went through: forget an earlier refusal of it. */
async function clearRefused(table: SyncTable, rows: Record<string, unknown>[]) {
  const keys = rows.map((r) => refusedKey(table, String(r.id)));
  if (keys.length && (await db().syncRefused.count())) await db().syncRefused.bulkDelete(keys);
}

/** Replace the local row with the server's copy. Without one: drop the local row when `removeIfMissing`, else keep it. */
async function restoreFromServer(sb: Client, table: SyncTable, id: string, changed: PullResult, removeIfMissing: boolean): Promise<void> {
  const spec = TABLES[table];
  const { data, error } = await sb.from(spec.remote).select("*").eq("id", id).limit(1);
  if (error) throw new Error(`${spec.remote}: ${error.message}`);
  const raw = (data as Record<string, unknown>[] | null)?.[0];
  const tbl = db().table(table);
  const have = (await tbl.get(id)) as Record<string, unknown> | undefined;
  if (raw) {
    const local = toLocal(table, raw);
    if (table === "sheets" && have?.imageUrl) local.imageUrl = have.imageUrl;
    await tbl.put(local);
  } else if (removeIfMissing && have) {
    await tbl.delete(id);
  } else return;
  changed.tables.add(table);
  const pid = (raw ? raw.project_id : have?.projectId) ?? (table === "projects" ? id : null);
  if (typeof pid === "string") changed.projectIds.add(pid);
}

interface ImageOwner {
  projectId: string;
  /** The current image of a sheet (its row's image_path is set after the upload). */
  sheet: boolean;
}

/** Every image this device knows, with the job it's stored under (<project>/<image id>). Built once per push. */
async function imageOwners(): Promise<Map<string, ImageOwner>> {
  const d = db();
  const out = new Map<string, ImageOwner>();
  const add = (id: string | null | undefined, projectId: string | undefined, sheet = false) => {
    if (id && projectId && (!out.has(id) || (sheet && !out.get(id)!.sheet))) out.set(id, { projectId, sheet });
  };
  const [sheets, markers, photos, documents, logs, cos, forms] = await Promise.all([
    d.sheets.toArray(),
    d.markers.filter((m) => !!m.photoId).toArray(),
    d.photos.toArray(),
    d.documents.toArray(),
    d.jobLogs.filter((l) => !!l.report?.signature?.imageId).toArray(),
    d.changeOrders.filter((c) => !!c.signatureImageId).toArray(),
    d.forms.filter((f) => !!f.signatures?.length).toArray(),
  ]);
  for (const s of sheets) add(s.imageId, s.projectId, true);
  for (const m of markers) add(m.photoId, m.projectId);
  for (const p of photos) add(p.imageId, p.projectId);
  for (const doc of documents) add(doc.fileId, doc.projectId);
  // Daily report signatures, change orders signed in person and form signatures.
  for (const l of logs) add(l.report?.signature?.imageId, l.projectId);
  for (const c of cos) add(c.signatureImageId, c.projectId);
  for (const f of forms) for (const sg of f.signatures ?? []) add(sg.imageId, f.projectId);
  // Earlier drawings of a re-issued sheet (sheet.revisions) are uploaded like current ones.
  for (const s of sheets) for (const r of Array.isArray(s.revisions) ? s.revisions : []) add(r?.imageId, s.projectId);
  return out;
}

/** Download one stored image (e.g. an earlier sheet revision) at <project>/<image id>. False when offline or not uploaded. */
export async function fetchProjectImage(projectId: string, imageId: string, width: number, height: number): Promise<boolean> {
  if (await db().images.get(imageId)) return true;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.storage.from(PLANS_BUCKET).download(`${projectId}/${imageId}`);
    if (error || !data) return false;
    await db().images.put({ id: imageId, blob: data, width, height, mime: data.type || "image/jpeg" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload one image/file. "waiting": nothing references it yet, so it stays queued. "failed": the upload didn't work
 * (retried later with backoff). Never throws: an image must not stop the rows from syncing.
 */
async function pushImage(sb: Client, imageId: string, owners: Map<string, ImageOwner>): Promise<"done" | "waiting" | "failed"> {
  try {
    const img = await db().images.get(imageId);
    if (!img) return "done"; // deleted locally
    const owner = owners.get(imageId);
    if (!owner) return "waiting";
    const path = `${owner.projectId}/${imageId}`;
    const { error } = await sb.storage.from(PLANS_BUCKET).upload(path, plansUploadBody(img.blob, img.mime), { upsert: true, contentType: plansUploadType(img.blob.type || img.mime) });
    if (error) return "failed";
    // Only a sheet's current image is named on its row.
    if (owner.sheet) {
      const { error: e2 } = await sb.from("sheets").update({ image_path: path }).eq("image_id", imageId);
      if (e2) return "failed";
    }
    return "done";
  } catch {
    return "failed";
  }
}

// ---------------- pull ----------------

const wmKey = (userId: string, table: string) => `pinplan.sync.pull.${userId}.${table}`;

function getWatermark(userId: string, table: string): string {
  try {
    return localStorage.getItem(wmKey(userId, table)) ?? "1970-01-01T00:00:00Z";
  } catch {
    return "1970-01-01T00:00:00Z";
  }
}
function setWatermark(userId: string, table: string, v: string) {
  try {
    localStorage.setItem(wmKey(userId, table), v);
  } catch {
    /* ignore */
  }
}

interface FileNeeded {
  id: string;
  path: string;
  width: number;
  height: number;
  mime: string;
  /** A sheet's plan image (the page showing it refreshes when it arrives). */
  sheetProject?: string;
}

async function pull(userId: string, changed: PullResult): Promise<void> {
  const sb = getSupabase()!;
  const changedTables = changed.tables;
  const projectIds = changed.projectIds;
  const filesNeeded: FileNeeded[] = [];

  for (const table of PUSH_ORDER) {
    const spec = TABLES[table];
    if (schemaGaps.tables.has(spec.remote)) continue;
    let cur = { since: pullStart(getWatermark(userId, table)), skip: 0 };
    for (;;) {
      const { data, error } = await sb
        .from(spec.remote)
        .select("*")
        .gte("synced_at", cur.since)
        .order("synced_at", { ascending: true })
        .order("id", { ascending: true })
        .range(cur.skip, cur.skip + PAGE - 1);
      if (error && schemaGap(error)?.kind === "table") {
        schemaGaps.tables.add(spec.remote);
        break;
      }
      if (error) throw new Error(`pull ${spec.remote}: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      if (!rows.length) break;
      const tbl = db().table(table);
      const writes: Record<string, unknown>[] = [];
      // Read and write in one transaction so a local edit made meanwhile isn't overwritten by an older remote row.
      await db().transaction("rw", tbl, async () => {
        const existing = (await tbl.bulkGet(rows.map((r) => r.id as string))) as (Record<string, unknown> | undefined)[];
        rows.forEach((raw, i) => {
          const local = toLocal(table, raw);
          const have = existing[i];
          if (!remoteWins(have as { updatedAt?: string } | undefined, local as { updatedAt?: string })) {
            // The server numbered a document this device issued: take the number even if the device's copy looks newer.
            const merged = table === "salesDocs" ? mergeServerNumber(have, local) : null;
            if (merged) writes.push(merged);
            return;
          }
          // Keep local-only fields.
          if (table === "sheets" && have?.imageUrl) local.imageUrl = have.imageUrl;
          writes.push(local);
        });
        if (writes.length) await tbl.bulkPut(writes);
      });
      // A sheet's image_path is set after its row was pushed (that bumps synced_at but not updated_at), so look at every
      // pulled sheet, not only the rows that won: otherwise a plan image that finished uploading later is never fetched.
      if (table === "sheets")
        for (const raw of rows)
          // A new revision's row can arrive before its image_path moves on: only take a path that names this image.
          if (typeof raw.image_path === "string" && !raw.deleted && raw.image_path.endsWith(`/${raw.image_id}`)) {
            const sheet = toLocal("sheets", raw) as unknown as Sheet;
            filesNeeded.push({ id: sheet.imageId, path: raw.image_path, width: sheet.width, height: sheet.height, mime: "image/jpeg", sheetProject: sheet.projectId });
          }
      for (const local of writes) {
        if (typeof local.projectId === "string") projectIds.add(local.projectId);
        if (table === "projects") projectIds.add(local.id as string);
        // Job photos and documents are stored at <project>/<file id>.
        if (table === "photos" && !local.deleted)
          filesNeeded.push({ id: String(local.imageId), path: `${local.projectId}/${local.imageId}`, width: Number(local.width) || 0, height: Number(local.height) || 0, mime: "image/jpeg" });
        if (table === "documents" && !local.deleted)
          filesNeeded.push({ id: String(local.fileId), path: `${local.projectId}/${local.fileId}`, width: 0, height: 0, mime: String(local.mime || "application/octet-stream") });
        // Daily report signatures are stored at <project>/<image id> too.
        const sig = table === "jobLogs" && !local.deleted ? (local as unknown as JobLog).report?.signature?.imageId : null;
        if (sig) filesNeeded.push({ id: sig, path: `${local.projectId}/${sig}`, width: 0, height: 0, mime: "image/jpeg" });
      }
      if (writes.length) changedTables.add(table);
      const next = nextPullPage(cur, rows, PAGE);
      cur = { since: next.since, skip: next.skip };
      // Never move the saved watermark back (the lookback re-reads rows older than it).
      if (!(Date.parse(cur.since) < Date.parse(getWatermark(userId, table)))) setWatermark(userId, table, cur.since);
      if (next.done) break;
    }
  }

  // Files that weren't uploaded yet the last time they were looked at: swept on the first sync of the page and then
  // only after a pull changed rows, at most every few minutes (reading every job's rows each tick costs too much).
  if (lastSweepAt === 0 || (changedTables.size > 0 && Date.now() - lastSweepAt > SWEEP_MS)) {
    lastSweepAt = Date.now();
    filesNeeded.push(...(await missingFileCandidates()));
  }
  await downloadFiles(sb, filesNeeded, changed);
}

/** Every file a live row on this device points at (the download step skips the ones already here). */
async function missingFileCandidates(): Promise<FileNeeded[]> {
  const d = db();
  const out: FileNeeded[] = [];
  for (const p of await d.photos.filter((x) => !x.deleted).toArray()) out.push({ id: p.imageId, path: `${p.projectId}/${p.imageId}`, width: p.width, height: p.height, mime: "image/jpeg" });
  for (const doc of await d.documents.filter((x) => !x.deleted).toArray()) out.push({ id: doc.fileId, path: `${doc.projectId}/${doc.fileId}`, width: 0, height: 0, mime: doc.mime });
  // Plan images whose download failed earlier (a pulled sheet is only looked at again when its row changes).
  for (const sh of await d.sheets.filter((x) => !x.deleted && !!x.imageId).toArray())
    out.push({ id: sh.imageId, path: `${sh.projectId}/${sh.imageId}`, width: sh.width, height: sh.height, mime: "image/jpeg", sheetProject: sh.projectId });
  // Device photos (marker.photoId) are uploaded to <project>/<image id> too.
  for (const m of await d.markers.filter((x) => !x.deleted && !!x.photoId).toArray()) out.push({ id: m.photoId!, path: `${m.projectId}/${m.photoId}`, width: 0, height: 0, mime: "image/jpeg" });
  // Daily report signatures.
  for (const l of await d.jobLogs.filter((x) => !x.deleted && !!x.report?.signature?.imageId).toArray()) {
    const sig = l.report!.signature!.imageId;
    out.push({ id: sig, path: `${l.projectId}/${sig}`, width: 0, height: 0, mime: "image/jpeg" });
  }
  // Change order signatures (uploaded by the client link's server route, or by the device that took them).
  for (const c of await d.changeOrders.filter((x) => !x.deleted && !!x.signatureImageId).toArray())
    out.push({ id: c.signatureImageId!, path: `${c.projectId}/${c.signatureImageId}`, width: 0, height: 0, mime: "image/png" });
  // Form signatures (PNG).
  for (const f of await d.forms.filter((x) => !x.deleted && !!x.signatures?.length).toArray())
    for (const sg of f.signatures ?? []) if (sg.imageId) out.push({ id: sg.imageId, path: `${f.projectId}/${sg.imageId}`, width: 0, height: 0, mime: "image/png" });
  return out;
}

/** Download the files not on this device yet (a few per sync; the rest wait for a later one). */
async function downloadFiles(sb: Client, files: FileNeeded[], changed: PullResult): Promise<void> {
  const byId = new Map<string, FileNeeded>();
  for (const f of files) if (f.id && !byId.has(f.id)) byId.set(f.id, f);
  if (!byId.size) return;
  const have = new Set((await db().images.where(":id").anyOf([...byId.keys()]).primaryKeys()) as string[]);
  let tries = 0;
  for (const f of byId.values()) {
    if (have.has(f.id)) continue;
    if (++tries > 40) break;
    const { data, error } = await sb.storage.from(PLANS_BUCKET).download(f.path);
    if (error || !data) continue; // may still be uploading from the other device; retried later
    await db().images.put({ id: f.id, blob: data, width: f.width, height: f.height, mime: data.type || f.mime });
    if (f.sheetProject) {
      changed.tables.add("sheets");
      changed.projectIds.add(f.sheetProject);
    }
  }
}

/** A note for the sync badge when the cloud database is behind the app (its rows stay queued, nothing is lost). */
function schemaWarning(): string | null {
  const parts = [...schemaGaps.tables, ...[...schemaGaps.columns].flatMap(([t, cols]) => [...cols].map((c) => gapTag(t, c)))];
  if (!parts.length) return null;
  return `Cloud database needs the latest migration (supabase/migrations) — not synced yet: ${parts.join(", ")}`;
}

// ---------------- refused changes ----------------

/** The changes the cloud didn't accept, newest first. */
export async function listRefused(): Promise<RefusedChange[]> {
  return (await db().syncRefused.toArray()).sort((a, b) => b.at.localeCompare(a.at));
}

/** Throw away the refused changes: each row goes back to the cloud's copy (or is removed when the cloud has none). */
export async function discardRefused(): Promise<void> {
  const sb = getSupabase();
  if (!sb || !useSyncStatus.getState().signedIn) throw new Error("Sign in to discard these changes.");
  const changed: PullResult = { tables: new Set(), projectIds: new Set() };
  try {
    for (const r of await db().syncRefused.toArray()) {
      await restoreFromServer(sb, r.table, r.rowId, changed, true);
      const seqs = (await db().syncQueue.where("rowId").equals(r.rowId).toArray()).filter((s) => s.table === r.table).map((s) => s.seq!);
      await db().syncQueue.bulkDelete(seqs);
      await db().syncRefused.delete(r.id);
    }
  } finally {
    announce(changed);
    await refreshPending();
  }
}

/** Send the refused changes again (e.g. after the office fixed a permission). */
export async function retryRefused(): Promise<void> {
  const d = db();
  await d.transaction("rw", d.syncRefused, d.syncQueue, async () => {
    const all = await d.syncRefused.toArray();
    const now = new Date().toISOString();
    await d.syncQueue.bulkAdd(all.map((r) => ({ table: r.table, rowId: r.rowId, queuedAt: now })));
    await d.syncRefused.clear();
  });
  await runSync(true);
}

// ---------------- this device's owner ----------------

/** Remove the previous account's jobs from this device, keep this sign-in, and start over (reloads the page). */
export async function removePreviousAccountData(): Promise<void> {
  const { userId, email } = useSyncStatus.getState();
  await removeLocalData(userId ? { userId, email } : null);
  window.location.reload();
}

/** Keep the previous account's jobs and sync them to this account (the person chose to). */
export function keepPreviousAccountData(): void {
  const { userId, email } = useSyncStatus.getState();
  if (!userId) return;
  adoptLocalData(userId, email);
  ownerCheckedFor = userId;
  setStatus({ ownerMismatch: null });
  void runSync(true);
}

/** Sign out; optionally also remove this device's jobs, photos and settings (then the page reloads). */
export async function signOut(opts: { removeData?: boolean } = {}): Promise<void> {
  await getSupabase()?.auth.signOut();
  if (!opts.removeData) return;
  await clearLocalData();
  window.location.reload();
}

async function checkOwner(userId: string, email: string | null): Promise<boolean> {
  const decision = await checkLocalOwner(userId, email);
  if (useSyncStatus.getState().userId !== userId) return false; // signed out meanwhile
  ownerCheckedFor = userId;
  setStatus({ ownerMismatch: decision === "ask" ? { email: readLocalOwner()?.email ?? null } : null });
  return decision !== "ask";
}

// ---------------- orchestration ----------------

async function runSync(force = false): Promise<void> {
  if (running) return running;
  running = (async () => {
    await refreshPending();
    const sb = getSupabase();
    if (!sb) {
      await compactQueue().catch(() => {});
      await refreshPending();
      return;
    }
    const st = useSyncStatus.getState();
    if (!st.online || !st.signedIn || !st.userId) return;
    // Another account's jobs are here (or not checked yet): nothing is sent or fetched until the person decides.
    if (ownerCheckedFor !== st.userId || st.ownerMismatch) return;
    if (!force && Date.now() < nextAttemptAt) return;
    const userId = st.userId;
    await withSyncLock(force, () => syncOnce(userId, force));
  })().finally(() => {
    running = null;
  });
  return running;
}

/** One tab syncs at a time (Web Locks). A tick gives way when another tab holds the lock; "Sync now" waits for it. */
async function withSyncLock(wait: boolean, fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return fn();
  await locks.request(LOCK_NAME, { ifAvailable: !wait }, async (lock) => {
    if (lock) await fn();
  });
}

async function syncOnce(userId: string, force: boolean): Promise<void> {
  setStatus({ syncing: true });
  markRun();
  // Missing columns/tables are remembered for a while (no failing request every tick); a forced sync looks again.
  if (force || Date.now() - schemaGaps.checkedAt > GAP_RECHECK_MS) {
    schemaGaps.tables.clear();
    schemaGaps.columns.clear();
    schemaGaps.checkedAt = Date.now();
  }
  const changed: PullResult = { tables: new Set(), projectIds: new Set() };
  let readOnly = false;
  try {
    // Know the role before pushing, so a technician's device never sends what the database would refuse.
    await loadTeamIfStale(userId, force ? 0 : TEAM_MAX_AGE_MS).catch(() => undefined);
    // A lapsed subscription makes the team read-only: keep local edits queued (nothing is lost) and don't keep
    // sending what the database refuses. Pushing resumes once billing is active again.
    if (force) readOnlyUntil = 0;
    readOnly = !billingAllowsWork(useTeam.getState().billing) || Date.now() < readOnlyUntil;
    let pushError: unknown = null;
    if (!readOnly) {
      try {
        await push(changed);
      } catch (e) {
        if (isSubscriptionInactive(e instanceof Error ? e.message : String(e))) {
          readOnly = true;
          readOnlyUntil = Date.now() + READ_ONLY_RETRY_MS;
        } else pushError = e;
      }
    }
    if (!readOnly) readOnlyUntil = 0;
    // Always fetch what others changed, even when sending failed.
    await pull(userId, changed);
    // Company invoicing settings (numbering, terms, taxes…) are shared by the office: keep this device's copy current.
    if (useTeam.getState().role !== "tech") await pullDocSettings().catch(() => undefined);
    // The company's name, phone, logo and quote terms (every member reads them; the office's edits go up from here too).
    await pullCompanySettings().catch(() => undefined);
    if (pushError) throw pushError;
    failures = 0;
    nextAttemptAt = 0;
    const warning = schemaWarning();
    if (warning && !schemaReported) {
      schemaReported = true;
      reportError(new Error(warning), "manual", { area: "sync", kind: "schema" });
    }
    setStatus({ lastSyncAt: new Date().toISOString(), error: warning, readOnly });
  } catch (e) {
    failures += 1;
    nextAttemptAt = Date.now() + Math.min(5 * 60_000, 5_000 * 2 ** failures);
    setStatus({ error: e instanceof Error ? e.message : String(e), readOnly });
    if (failures === REPORT_AFTER_FAILURES) reportError(e, "manual", { area: "sync", failures, pending: useSyncStatus.getState().pending });
  } finally {
    // Tell open pages (this tab and the others) about whatever was written, even when a later table failed.
    announce(changed);
    setStatus({ syncing: false });
    await refreshPending();
    const s = useSyncStatus.getState();
    channel?.postMessage({ type: "status", lastSyncAt: s.lastSyncAt, error: s.error, readOnly: s.readOnly });
  }
}

function announce(changed: PullResult) {
  if (!changed.tables.size || typeof window === "undefined") return;
  const detail = { tables: [...changed.tables], projectIds: [...changed.projectIds] };
  window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail }));
  channel?.postMessage({ type: "synced", ...detail });
}

/** When any tab last started a sync (ticks in other tabs skip until the next interval). */
function markRun() {
  try {
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}
function ranRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(LAST_RUN_KEY) || 0) < TICK_MS - 1_000;
  } catch {
    return false;
  }
}

/** A remembered invite was finished on sign-in: say so and fetch the team's jobs. */
function joined(team: string | null) {
  if (!team) return;
  toast(`You joined ${team}`);
  void runSync(true);
}

/** A company sign-up that waited for email confirmation was finished on sign-in. */
function companyReady(company: string | null) {
  if (company) toast(`${company} is set up — welcome to PinPlan`);
}

/** Start background sync. Safe to call without Supabase configured. Returns a cleanup function. */
export function startSync(): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => {
    setStatus({ online: true });
    nextAttemptAt = 0;
    void runSync();
  };
  const onOffline = () => setStatus({ online: false });
  const onVisible = () => {
    // Coming back: catch up. Going away: send what's waiting now (hidden tabs don't tick).
    if (document.visibilityState === "visible" || useSyncStatus.getState().pending > 0) void runSync();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  setStatus({ online: navigator.onLine });

  // Another tab synced: refresh this tab's pages and badge from what it wrote.
  try {
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channel = null;
  }
  const onMessage = (e: MessageEvent) => {
    const m = e.data as { type?: string; tables?: string[]; projectIds?: string[]; lastSyncAt?: string | null; error?: string | null; readOnly?: boolean };
    if (m?.type === "synced") window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: { tables: m.tables ?? [], projectIds: m.projectIds ?? [] } }));
    if (m?.type === "status") setStatus({ lastSyncAt: m.lastSyncAt ?? null, error: m.error ?? null, readOnly: !!m.readOnly });
    void refreshPending();
  };
  channel?.addEventListener("message", onMessage);

  let unsubAuth: (() => void) | null = null;
  const sb = getSupabase();
  if (sb) {
    const afterSignIn = (u: { id: string; email?: string | null } | undefined) => {
      void loadTeam(u?.id ?? null).then(() => (u ? finishPendingInvite() : null)).then(joined).then(() => (u ? finishPendingCompany(u.email ?? null) : null)).then(companyReady).catch(() => undefined);
      if (!u) return;
      void checkOwner(u.id, u.email ?? null)
        .then((ok) => (ok ? runSync(true) : undefined))
        .catch(() => undefined);
    };
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setStatus({ signedIn: !!u, email: u?.email ?? null, userId: u?.id ?? null, authReady: true });
      afterSignIn(u);
      if (!u) void runSync(true);
    });
    const { data } = sb.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user;
      const prev = useSyncStatus.getState().userId;
      setStatus({ signedIn: !!u, email: u?.email ?? null, userId: u?.id ?? null, authReady: true });
      if (u?.id === prev) return;
      ownerCheckedFor = null;
      if (!u) setStatus({ ownerMismatch: null });
      afterSignIn(u);
    });
    unsubAuth = () => data.subscription.unsubscribe();
  } else {
    void runSync();
  }

  // Hidden tabs don't tick, and a tick gives way when another tab synced moments ago.
  const timer = window.setInterval(() => {
    if (document.hidden || ranRecently()) return;
    void runSync();
  }, TICK_MS);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
    channel?.removeEventListener("message", onMessage);
    channel?.close();
    channel = null;
    unsubAuth?.();
  };
}

/** Test hook: run one sync now as if signed in as `userId` (owner already checked). Not used by the app. */
export async function __syncForTests(userId: string, email: string | null = null, force = true): Promise<void> {
  setStatus({ signedIn: true, userId, email, online: true, ownerMismatch: null });
  ownerCheckedFor = userId;
  nextAttemptAt = 0;
  await runSync(force);
}

/** Test hook: forget module state between tests. */
export function __resetSyncForTests(): void {
  failures = 0;
  nextAttemptAt = 0;
  readOnlyUntil = 0;
  schemaGaps.tables.clear();
  schemaGaps.columns.clear();
  schemaGaps.checkedAt = 0;
  schemaReported = false;
  imageBackoff.clear();
  lastSweepAt = 0;
  ownerCheckedFor = null;
}
