"use client";
// May the signed-in person change jobs on this device right now? The same rule the database applies on sync
// (team_can_write): the company's plan decides; on no company team, the personal free trial does. When it says no,
// jobs are read-only here too (viewing, exports and PDFs keep working), instead of edits that the cloud refuses later.
// Never locks while loading, when signed out / this device only, or when the database has no billing.
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { canWork, parseSoloBilling, type SoloBilling } from "./billingLogic";
import { getSupabase } from "./supabase";
import { useTeam, type TeamState } from "./team";
import { setToastAction, type ToastAction } from "./toast";

/** The personal trial of a person on no team (`solo_billing()`), for `userId`. */
interface SoloState {
  userId: string | null;
  solo: SoloBilling | null;
}
export const useSoloBilling = create<SoloState>(() => ({ userId: null, solo: null }));

const CACHE_KEY = "pinplan.soloBilling";
function readCache(userId: string): SoloBilling | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as SoloState | null;
    return raw?.userId === userId ? raw.solo : null;
  } catch {
    return null;
  }
}
function writeCache(s: SoloState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

let loading: string | null = null;
/** The person whose personal trial was read from the database (not just the cached copy). Anyone else is looked up
 *  again: after a failed lookup (offline, a server hiccup) the next team change, reconnect or sync tries again. */
let loadedFor: string | null = null;
let lastTryAt = 0;
/** A failed lookup is retried at most this often (reconnecting retries straight away). */
export const SOLO_RETRY_MS = 30_000;

/** Reads `solo_billing()` for `userId` (keeps the cached answer offline; no billing in the database: never locks). */
export async function loadSoloBilling(userId: string): Promise<SoloBilling | null> {
  if (useSoloBilling.getState().userId !== userId) useSoloBilling.setState({ userId, solo: readCache(userId) });
  const sb = getSupabase();
  if (!sb || loading === userId) return useSoloBilling.getState().solo;
  loading = userId;
  lastTryAt = Date.now();
  try {
    const r = await sb.rpc("solo_billing");
    if (r.error) {
      // The function isn't in the database yet: nobody on their own is locked.
      if (r.error.code === "PGRST202" || /Could not find the function/i.test(r.error.message ?? "")) {
        useSoloBilling.setState({ userId, solo: null });
        loadedFor = userId;
      }
      return useSoloBilling.getState().solo;
    }
    const s = { userId, solo: parseSoloBilling(r.data) };
    useSoloBilling.setState(s);
    writeCache(s);
    loadedFor = userId;
    return s.solo;
  } catch {
    return useSoloBilling.getState().solo;
  } finally {
    loading = null;
  }
}

/** Look the personal trial up when the person is on no team and it hasn't been read yet (or the last try failed). */
export function checkSoloBilling(t: TeamState = useTeam.getState(), opts: { now?: number; force?: boolean } = {}): void {
  if (!t.ready || !t.userId || t.team || t.needsMigration || loadedFor === t.userId) return;
  // A new person is looked up straight away; a failed lookup for the same person waits a little (or a reconnect).
  const sameAsLast = useSoloBilling.getState().userId === t.userId;
  if (sameAsLast && !opts.force && (opts.now ?? Date.now()) - lastTryAt < SOLO_RETRY_MS) return;
  void loadSoloBilling(t.userId);
}

/** Test hook: forget what was loaded. */
export function __resetSoloBillingForTests(): void {
  loading = null;
  loadedFor = null;
  lastTryAt = 0;
  useSoloBilling.setState({ userId: null, solo: null });
}

/** Sent by sync.ts after each sync that wrote something (a string here: sync.ts pulls in far more than this needs). */
const SYNCED_EVENT = "pinplan:synced";

/** Keeps the personal trial loaded whenever the team store says the person is on no team, and tries again after a
 *  failed lookup: on reconnect, after a sync, when the tab comes back, or on the next team change. */
let watching = false;
function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  useTeam.subscribe((t) => checkSoloBilling(t));
  window.addEventListener("online", () => checkSoloBilling(useTeam.getState(), { force: true }));
  window.addEventListener(SYNCED_EVENT, () => checkSoloBilling());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkSoloBilling();
  });
  checkSoloBilling();
}

/** Can jobs be changed right now? */
export function canEditJob(now = new Date()): boolean {
  watch();
  const t = useTeam.getState();
  const solo = useSoloBilling.getState();
  return canWork(
    { ready: t.ready, userId: t.userId, onTeam: !!t.team, billing: t.billing, solo: solo.userId === t.userId ? solo.solo : null },
    now,
  );
}

/** Shown when an edit is refused. */
export const READ_ONLY_MESSAGE = "Jobs are read-only: the free trial or subscription has ended. You can still view and export. See Settings → Plan & billing.";
/** The read-only toast's button: straight to Settings › Plan & billing. */
export const READ_ONLY_ACTION: ToastAction = { label: "Plan & billing", href: "/settings#billing" };
// Every read-only toast carries the button, whoever shows it (the editor's commit() toasts the message).
setToastAction(READ_ONLY_MESSAGE, READ_ONLY_ACTION);

/** The error a refused edit throws (the toast has already been shown). */
export class ReadOnlyError extends Error {
  constructor() {
    super(READ_ONLY_MESSAGE);
    this.name = "ReadOnlyError";
  }
}

// React: re-render when the team, the personal trial or the minute changes.
const subscribe = (cb: () => void) => {
  watch();
  const a = useTeam.subscribe(cb);
  const b = useSoloBilling.subscribe(cb);
  const id = window.setInterval(() => {
    checkSoloBilling(); // a lookup that failed earlier is tried again while a page shows the lock
    cb();
  }, 30_000);
  return () => {
    a();
    b();
    window.clearInterval(id);
  };
};

/** Can jobs be changed right now? (true while prerendering). */
export function useCanEdit(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => canEditJob(),
    () => true,
  );
}
