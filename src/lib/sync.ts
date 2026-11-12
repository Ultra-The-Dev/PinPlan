"use client";
// Offline-first sync between the local Dexie database and Supabase.
// Push: drain the sync queue (parents before children), upserting the current local row.
// Pull: fetch rows changed on the server since the last pull (server `synced_at` watermark),
// last-write-wins by `updatedAt`, written straight into Dexie without re-queuing.
import { create } from "zustand";
import { db, type SyncItem, type SyncTable } from "./db";
import { getSupabase, PLANS_BUCKET, supabaseConfigured } from "./supabase";
import { dedupeQueue, PUSH_ORDER, remoteWins, TABLES, toLocal, toRemote } from "./syncMap";
import type { Sheet } from "./types";

export interface SyncStatus {
  configured: boolean;
  signedIn: boolean;
  email: string | null;
  userId: string | null;
  online: boolean;
  syncing: boolean;
  /** Distinct rows waiting to be pushed. */
  pending: number;
  lastSyncAt: string | null;
  error: string | null;
  syncNow(): Promise<void>;
}

export const useSyncStatus = create<SyncStatus>(() => ({
  configured: supabaseConfigured,
  signedIn: false,
  email: null,
  userId: null,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  error: null,
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

async function push(): Promise<void> {
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
        await pushImage(it.rowId);
        await db().syncQueue.bulkDelete(snapshot.filter((s) => s.table === "images" && s.rowId === it.rowId).map((s) => s.seq!));
      }
      continue;
    }
    const spec = TABLES[table];
    const rows = (await db().table(table).bulkGet(items.map((i) => i.rowId))).filter(Boolean) as Record<string, unknown>[];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const payload = rows.slice(i, i + CHUNK).map((r) => toRemote(table, r));
      const { error } = await sb.from(spec.remote).upsert(payload, { onConflict: spec.conflict });
      if (error) throw new Error(`${spec.remote}: ${error.message}`);
    }
    await db().syncQueue.bulkDelete(seqsFor(table));
  }
}

async function projectIdForImage(imageId: string): Promise<string | null> {
  const sheet = await db().sheets.filter((s) => s.imageId === imageId).first();
  if (sheet) return sheet.projectId;
  const marker = await db().markers.filter((m) => m.photoId === imageId).first();
  return marker?.projectId ?? null;
}

async function pushImage(imageId: string) {
  const sb = getSupabase()!;
  const img = await db().images.get(imageId);
  if (!img) return; // deleted locally
  const projectId = await projectIdForImage(imageId);
  if (!projectId) return; // orphan image, nothing references it
  const path = `${projectId}/${imageId}`;
  const { error } = await sb.storage.from(PLANS_BUCKET).upload(path, img.blob, { upsert: true, contentType: img.mime || "image/jpeg" });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  const { error: e2 } = await sb.from("sheets").update({ image_path: path }).eq("image_id", imageId);
  if (e2) throw new Error(`sheets.image_path: ${e2.message}`);
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

async function pull(userId: string): Promise<{ tables: SyncTable[]; projectIds: string[] }> {
  const sb = getSupabase()!;
  const changedTables = new Set<SyncTable>();
  const projectIds = new Set<string>();
  const sheetsNeedingImages: { sheet: Sheet; path: string }[] = [];

  for (const table of PUSH_ORDER) {
    const spec = TABLES[table];
    let wm = getWatermark(userId, table);
    for (;;) {
      const { data, error } = await sb.from(spec.remote).select("*").gt("synced_at", wm).order("synced_at", { ascending: true }).limit(PAGE);
      if (error) throw new Error(`pull ${spec.remote}: ${error.message}`);
      const rows = (data ?? []) as Record<string, unknown>[];
      if (!rows.length) break;
      const tbl = db().table(table);
      const existing = (await tbl.bulkGet(rows.map((r) => r.id as string))) as (Record<string, unknown> | undefined)[];
      const writes: Record<string, unknown>[] = [];
      rows.forEach((raw, i) => {
        const local = toLocal(table, raw);
        const cur = existing[i];
        if (!remoteWins(cur as { updatedAt?: string } | undefined, local as { updatedAt?: string })) return;
        // Keep local-only fields.
        if (table === "sheets" && cur?.imageUrl) local.imageUrl = cur.imageUrl;
        writes.push(local);
        if (typeof local.projectId === "string") projectIds.add(local.projectId);
        if (table === "projects") projectIds.add(local.id as string);
        if (table === "sheets" && typeof raw.image_path === "string" && !local.deleted)
          sheetsNeedingImages.push({ sheet: local as unknown as Sheet, path: raw.image_path });
      });
      if (writes.length) {
        await tbl.bulkPut(writes);
        changedTables.add(table);
      }
      wm = String(rows[rows.length - 1].synced_at);
      setWatermark(userId, table, wm);
      if (rows.length < PAGE) break;
    }
  }

  for (const { sheet, path } of sheetsNeedingImages) {
    if (await db().images.get(sheet.imageId)) continue;
    const { data, error } = await sb.storage.from(PLANS_BUCKET).download(path);
    if (error || !data) continue; // retried on the next pull of this sheet; image may still be uploading
    await db().images.put({ id: sheet.imageId, blob: data, width: sheet.width, height: sheet.height, mime: data.type || "image/jpeg" });
  }

  return { tables: [...changedTables], projectIds: [...projectIds] };
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
    try {
      await push();
      const changed = await pull(st.userId);
      failures = 0;
      nextAttemptAt = 0;
      setStatus({ lastSyncAt: new Date().toISOString(), error: null });
      if (changed.tables.length && typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: changed }));
    } catch (e) {
      failures += 1;
      nextAttemptAt = Date.now() + Math.min(5 * 60_000, 5_000 * 2 ** failures);
      setStatus({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setStatus({ syncing: false });
      await refreshPending();
    }
  })().finally(() => {
    running = null;
  });
  return running;
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
      setStatus({ signedIn: !!u, email: u?.email ?? null, userId: u?.id ?? null });
      void runSync(true);
    });
    const { data } = sb.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user;
      const prev = useSyncStatus.getState().userId;
      setStatus({ signedIn: !!u, email: u?.email ?? null, userId: u?.id ?? null });
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
