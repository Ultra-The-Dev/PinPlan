"use client";
// Offline-first sync between the local Dexie database and Supabase.
// Push: drain the sync queue (parents before children), upserting the current local row.
// Pull: fetch rows changed on the server since the last pull (server `synced_at` watermark),
// last-write-wins by `updatedAt`, written straight into Dexie without re-queuing.
import { create } from "zustand";
import { billingAllowsWork, isSubscriptionInactive } from "./billingLogic";
import { db, type SyncItem, type SyncTable } from "./db";
import { getSupabase, PLANS_BUCKET, supabaseConfigured } from "./supabase";
import { dedupeQueue, mergeServerNumber, nextPullPage, pullStart, PUSH_ORDER, remoteWins, schemaGap, TABLES, toLocal, toRemote, withoutColumns } from "./syncMap";
import { markupsToPush } from "./markups";
import type { JobForm, JobLog, PlanMarkup, Sheet } from "./types";
import { pullDocSettings } from "./docSettings";
import { finishPendingCompany } from "./onboarding";
import { finishPendingInvite, loadTeam, useTeam } from "./team";
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
  lastSyncAt: string | null;
  error: string | null;
  /** The team's subscription has lapsed: the cloud refuses edits, so they stay queued on this device (pulls go on). */
  readOnly: boolean;
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
  lastSyncAt: null,
  error: null,
  readOnly: false,
  syncNow: () => runSync(true),
}));

/** Fired on window after a pull wrote remote changes into Dexie. detail: { tables, projectIds }. */
export const SYNCED_EVENT = "pinplan:synced";

const CHUNK = 200;
const PAGE = 1000;
const TICK_MS = 15_000;
let running: Promise<void> | null = null;
let failures = 0;
let nextAttemptAt = 0;
/** The database refused a write as "PinPlan subscription inactive": don't push again before this (pulls go on). */
let readOnlyUntil = 0;
const READ_ONLY_RETRY_MS = 10 * 60_000;
/** Cloud tables/columns found missing during this sync (the latest migration hasn't been run on the project yet). */
const schemaGaps = { tables: new Set<string>(), columns: new Map<string, Set<string>>() };

function setStatus(p: Partial<SyncStatus>) {
  useSyncStatus.setState(p);
}

async function refreshPending() {
  try {
    const items = await db().syncQueue.toArray();
    setStatus({ pending: dedupeQueue(items).length });
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

// ---------------- push ----------------

async function push(changed?: PullResult): Promise<void> {
  const sb = getSupabase()!;
  const snapshot = await db().syncQueue.orderBy("seq").toArray();
  if (!snapshot.length) return;
  const latest = dedupeQueue(snapshot);
  const groups = new Map<string, SyncItem[]>();
  for (const it of latest) groups.set(it.table, [...(groups.get(it.table) ?? []), it]);
  const seqsFor = (table: string) => snapshot.filter((s) => s.table === table).map((s) => s.seq!);

  // Rows, in parent-before-child order; images right after their sheets.
  const order: (SyncTable | "images")[] = [];
  for (const t of PUSH_ORDER) {
    order.push(t);
    if (t === "sheets") order.push("images");
  }

  for (const table of order) {
    const items = groups.get(table);
    if (!items?.length) continue;
    if (table === "images") {
      for (const it of items) {
        // Not referenced yet (e.g. a photo whose row is still being written): keep it queued for the next sync,
        // unless it has been orphaned for a day.
        const done = await pushImage(it.rowId);
        const stale = Date.now() - new Date(it.queuedAt).getTime() > 86_400_000;
        if (done || stale) await db().syncQueue.bulkDelete(snapshot.filter((s) => s.table === "images" && s.rowId === it.rowId).map((s) => s.seq!));
      }
      continue;
    }
    // Technicians can't write prices (the database refuses): drop those edits instead of blocking every sync.
    // Job templates are the office's too (technicians only start jobs from them).
    // Technicians can't write prices or plan links (the database refuses): drop those edits instead of blocking every sync.
    if ((table === "estimateLines" || table === "salesDocs" || table === "salesPayments" || table === "jobTemplates" || table === "changeOrders" || table === "sheetLinks") && useTeam.getState().role === "tech") {
      await db().syncQueue.bulkDelete(seqsFor(table));
      continue;
    }
    const spec = TABLES[table];
    let rows = (await db().table(table).bulkGet(items.map((i) => i.rowId))).filter(Boolean) as Record<string, unknown>[];
    if (table === "planMarkups") {
      // Claim markups drawn signed out; leave out ones the database would refuse (see markupsToPush).
      const { send, claimed } = markupsToPush(rows as unknown as PlanMarkup[], useTeam.getState().role, useSyncStatus.getState().userId);
      if (claimed.length) await db().planMarkups.bulkPut(claimed);
      rows = send as unknown as Record<string, unknown>[];
    }
    let skipped = false;
    for (let i = 0; i < rows.length && !skipped; i += CHUNK) {
      const payload = rows.slice(i, i + CHUNK).map((r) => toRemote(table, r));
      // The cloud database may be a migration behind: send what it has, and keep a missing table's rows queued.
      for (;;) {
        const { error } = await sb.from(spec.remote).upsert(withoutColumns(payload, schemaGaps.columns.get(spec.remote)), { onConflict: spec.conflict });
        if (!error) break;
        const gap = schemaGap(error);
        const cols = schemaGaps.columns.get(spec.remote) ?? new Set<string>();
        if (gap?.kind === "column" && !cols.has(gap.column) && gap.column in payload[0]) {
          schemaGaps.columns.set(spec.remote, cols.add(gap.column));
          continue;
        }
        if (gap?.kind === "table") {
          schemaGaps.tables.add(spec.remote);
          skipped = true;
          break;
        }
        // A technician can't change a form the office has locked (submitted): take the server's copy for those rows
        // instead of retrying forever (which would also stop every later pull).
        if (table === "forms" && error.code === "42501" && useTeam.getState().role === "tech") {
          await pushFormsOneByOne(sb, payload, changed);
          break;
        }
        throw new Error(`${spec.remote}: ${error.message}`);
      }
    }
    if (!skipped) await db().syncQueue.bulkDelete(seqsFor(table));
  }
}

/** Send forms one at a time; a row the database refuses (a submitted form, for a technician) is replaced here by the server's copy. */
async function pushFormsOneByOne(sb: NonNullable<ReturnType<typeof getSupabase>>, payload: Record<string, unknown>[], changed?: PullResult): Promise<void> {
  const remote = TABLES.forms.remote;
  for (const row of payload) {
    const { error } = await sb.from(remote).upsert(withoutColumns([row], schemaGaps.columns.get(remote)), { onConflict: TABLES.forms.conflict });
    if (!error) continue;
    if (error.code !== "42501") throw new Error(`${remote}: ${error.message}`);
    const { data, error: readError } = await sb.from(remote).select("*").eq("id", String(row.id)).maybeSingle();
    if (readError) throw new Error(`${remote}: ${readError.message}`);
    if (!data) continue; // not on the server for this user: nothing to restore, the refused edit is dropped
    const local = toLocal("forms", data as Record<string, unknown>);
    await db().forms.put(local as unknown as JobForm);
    changed?.tables.add("forms");
    if (typeof local.projectId === "string") changed?.projectIds.add(local.projectId);
  }
}

async function projectIdForImage(imageId: string): Promise<string | null> {
  const sheet = await db().sheets.filter((s) => s.imageId === imageId).first();
  if (sheet) return sheet.projectId;
  const marker = await db().markers.filter((m) => m.photoId === imageId).first();
  if (marker) return marker.projectId;
  const photo = await db().photos.filter((p) => p.imageId === imageId).first();
  if (photo) return photo.projectId;
  const doc = await db().documents.filter((d) => d.fileId === imageId).first();
  if (doc) return doc.projectId;
  // A daily report's signature.
  const log = await db().jobLogs.filter((l) => l.report?.signature?.imageId === imageId).first();
  if (log?.projectId) return log.projectId;
  // A signature taken on this device (change order approved in person).
  const co = await db().changeOrders.filter((c) => c.signatureImageId === imageId).first();
  if (co?.projectId) return co.projectId;
  // Signatures on forms.
  const form = await db().forms.filter((f) => !!f.signatures?.some((s) => s.imageId === imageId)).first();
  return form?.projectId ?? null;
}

/** Upload one image/file. Returns false when nothing references it yet, so it stays queued. */
async function pushImage(imageId: string): Promise<boolean> {
  const sb = getSupabase()!;
  const img = await db().images.get(imageId);
  if (!img) return true; // deleted locally
  const projectId = await projectIdForImage(imageId);
  if (!projectId) return false;
  const path = `${projectId}/${imageId}`;
  const { error } = await sb.storage.from(PLANS_BUCKET).upload(path, img.blob, { upsert: true, contentType: img.mime || "image/jpeg" });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  const { error: e2 } = await sb.from("sheets").update({ image_path: path }).eq("image_id", imageId);
  if (e2) throw new Error(`sheets.image_path: ${e2.message}`);
  return true;
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

interface PullResult {
  tables: Set<SyncTable>;
  projectIds: Set<string>;
}

async function pull(userId: string, changed: PullResult): Promise<void> {
  const sb = getSupabase()!;
  const changedTables = changed.tables;
  const projectIds = changed.projectIds;
  const sheetsNeedingImages: { sheet: Sheet; path: string }[] = [];
  const filesNeeded: { id: string; path: string; width: number; height: number; mime: string }[] = [];

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
          if (typeof raw.image_path === "string" && !raw.deleted) sheetsNeedingImages.push({ sheet: toLocal("sheets", raw) as unknown as Sheet, path: raw.image_path });
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

  for (const { sheet, path } of sheetsNeedingImages) {
    if (await db().images.get(sheet.imageId)) continue;
    const { data, error } = await sb.storage.from(PLANS_BUCKET).download(path);
    if (error || !data) continue; // retried on the next pull of this sheet; image may still be uploading
    await db().images.put({ id: sheet.imageId, blob: data, width: sheet.width, height: sheet.height, mime: data.type || "image/jpeg" });
    changedTables.add("sheets");
    projectIds.add(sheet.projectId);
  }

  // Also retry files that weren't uploaded yet the last time (a few per sync).
  const known = new Set(filesNeeded.map((f) => f.id));
  for (const p of await db().photos.filter((x) => !x.deleted).toArray())
    if (!known.has(p.imageId)) filesNeeded.push({ id: p.imageId, path: `${p.projectId}/${p.imageId}`, width: p.width, height: p.height, mime: "image/jpeg" });
  for (const d of await db().documents.filter((x) => !x.deleted).toArray())
    if (!known.has(d.fileId)) filesNeeded.push({ id: d.fileId, path: `${d.projectId}/${d.fileId}`, width: 0, height: 0, mime: d.mime });
  // Plan images whose download failed earlier (a pulled sheet is only looked at again when its row changes).
  const sheetImages = new Map<string, string>();
  const tried = new Set(sheetsNeedingImages.map((x) => x.sheet.imageId));
  for (const sh of await db().sheets.filter((x) => !x.deleted && !!x.imageId).toArray())
    if (!known.has(sh.imageId) && !tried.has(sh.imageId)) {
      sheetImages.set(sh.imageId, sh.projectId);
      filesNeeded.push({ id: sh.imageId, path: `${sh.projectId}/${sh.imageId}`, width: sh.width, height: sh.height, mime: "image/jpeg" });
    }
  // Device photos (marker.photoId) are uploaded to <project>/<image id> too, but were never fetched on other devices.
  for (const m of await db().markers.filter((x) => !x.deleted && !!x.photoId).toArray())
    if (!known.has(m.photoId!)) filesNeeded.push({ id: m.photoId!, path: `${m.projectId}/${m.photoId}`, width: 0, height: 0, mime: "image/jpeg" });
  // Daily report signatures whose download failed earlier (still uploading from the other device).
  for (const l of await db().jobLogs.filter((x) => !x.deleted && !!x.report?.signature?.imageId).toArray()) {
    const sig = l.report!.signature!.imageId;
    if (!known.has(sig)) filesNeeded.push({ id: sig, path: `${l.projectId}/${sig}`, width: 0, height: 0, mime: "image/jpeg" });
  }
  // Change order signatures (uploaded by the client link's server route, or by the device that took them).
  for (const c of await db().changeOrders.filter((x) => !x.deleted && !!x.signatureImageId).toArray())
    if (!known.has(c.signatureImageId!)) filesNeeded.push({ id: c.signatureImageId!, path: `${c.projectId}/${c.signatureImageId}`, width: 0, height: 0, mime: "image/png" });
  // Form signatures (PNG) are stored at <project>/<image id> as well.
  for (const f of await db().forms.filter((x) => !x.deleted && !!x.signatures?.length).toArray())
    for (const sg of f.signatures ?? []) if (sg.imageId && !known.has(sg.imageId)) filesNeeded.push({ id: sg.imageId, path: `${f.projectId}/${sg.imageId}`, width: 0, height: 0, mime: "image/png" });
  let tries = 0;
  for (const f of filesNeeded) {
    if (await db().images.get(f.id)) continue;
    if (++tries > 40) break;
    const { data, error } = await sb.storage.from(PLANS_BUCKET).download(f.path);
    if (error || !data) continue; // may still be uploading from the other device; retried on its next change
    await db().images.put({ id: f.id, blob: data, width: f.width, height: f.height, mime: data.type || f.mime });
    const sheetProject = sheetImages.get(f.id);
    if (sheetProject) {
      changedTables.add("sheets");
      projectIds.add(sheetProject);
    }
  }
}

/** A note for the sync badge when the cloud database is behind the app (its rows stay queued, nothing is lost). */
function schemaWarning(): string | null {
  const parts = [...schemaGaps.tables, ...[...schemaGaps.columns].flatMap(([t, cols]) => [...cols].map((c) => `${t}.${c}`))];
  if (!parts.length) return null;
  return `Cloud database needs the latest migration (supabase/migrations) — not synced yet: ${parts.join(", ")}`;
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
    if (!force && Date.now() < nextAttemptAt) return;
    setStatus({ syncing: true });
    schemaGaps.tables.clear();
    schemaGaps.columns.clear();
    const changed: PullResult = { tables: new Set(), projectIds: new Set() };
    try {
      // Know the role before pushing, so a technician's device never sends what the database would refuse.
      await loadTeam(st.userId).catch(() => undefined);
      // A lapsed subscription makes the team read-only: keep local edits queued (nothing is lost) and don't keep
      // sending what the database refuses. Billing is re-read on every sync, so pushing resumes once it's active.
      if (force) readOnlyUntil = 0;
      let readOnly = !billingAllowsWork(useTeam.getState().billing) || Date.now() < readOnlyUntil;
      if (!readOnly) {
        try {
          await push(changed);
        } catch (e) {
          if (!isSubscriptionInactive(e instanceof Error ? e.message : String(e))) throw e;
          readOnly = true;
          readOnlyUntil = Date.now() + READ_ONLY_RETRY_MS;
        }
      }
      if (!readOnly) readOnlyUntil = 0;
      await pull(st.userId, changed);
      // Company invoicing settings (numbering, terms, taxes…) are shared by the office: keep this device's copy current.
      if (useTeam.getState().role !== "tech") await pullDocSettings().catch(() => undefined);
      failures = 0;
      nextAttemptAt = 0;
      setStatus({ lastSyncAt: new Date().toISOString(), error: schemaWarning(), readOnly });
    } catch (e) {
      failures += 1;
      nextAttemptAt = Date.now() + Math.min(5 * 60_000, 5_000 * 2 ** failures);
      setStatus({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      // Tell open pages about whatever was written, even when a later table failed.
      if (changed.tables.size && typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: { tables: [...changed.tables], projectIds: [...changed.projectIds] } }));
      setStatus({ syncing: false });
      await refreshPending();
    }
  })().finally(() => {
    running = null;
  });
  return running;
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
    if (document.visibilityState === "visible") void runSync();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  setStatus({ online: navigator.onLine });

  let unsubAuth: (() => void) | null = null;
  const sb = getSupabase();
  if (sb) {
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setStatus({ signedIn: !!u, email: u?.email ?? null, userId: u?.id ?? null, authReady: true });
      void loadTeam(u?.id ?? null).then(() => (u ? finishPendingInvite() : null)).then(joined).then(() => (u ? finishPendingCompany(u.email ?? null) : null)).then(companyReady).catch(() => undefined);
      void runSync(true);
    });
    const { data } = sb.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user;
      const prev = useSyncStatus.getState().userId;
      setStatus({ signedIn: !!u, email: u?.email ?? null, userId: u?.id ?? null, authReady: true });
      if (u?.id !== prev) void loadTeam(u?.id ?? null).then(() => (u ? finishPendingInvite() : null)).then(joined).then(() => (u ? finishPendingCompany(u.email ?? null) : null)).then(companyReady).catch(() => undefined);
      if (u && u.id !== prev) void runSync(true);
    });
    unsubAuth = () => data.subscription.unsubscribe();
  } else {
    void runSync();
  }

  const timer = window.setInterval(() => void runSync(), TICK_MS);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
    unsubAuth?.();
  };
}
