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
/** Reads `solo_billing()` for `userId` (keeps the cached answer offline; no billing in the database: never locks). */
export async function loadSoloBilling(userId: string): Promise<SoloBilling | null> {
  if (useSoloBilling.getState().userId !== userId) useSoloBilling.setState({ userId, solo: readCache(userId) });
  const sb = getSupabase();
  if (!sb || loading === userId) return useSoloBilling.getState().solo;
  loading = userId;
  try {
    const r = await sb.rpc("solo_billing");
    if (r.error) {
      // The function isn't in the database yet: nobody on their own is locked.
      if (r.error.code === "PGRST202" || /Could not find the function/i.test(r.error.message ?? "")) useSoloBilling.setState({ userId, solo: null });
      return useSoloBilling.getState().solo;
    }
    const s = { userId, solo: parseSoloBilling(r.data) };
    useSoloBilling.setState(s);
    writeCache(s);
    return s.solo;
  } catch {
    return useSoloBilling.getState().solo;
  } finally {
    loading = null;
  }
}

/** Keeps the personal trial loaded whenever the team store says the person is on no team. */
let watching = false;
function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const check = (t: TeamState) => {
    if (t.ready && t.userId && !t.team && !t.needsMigration && useSoloBilling.getState().userId !== t.userId) void loadSoloBilling(t.userId);
  };
  useTeam.subscribe(check);
  check(useTeam.getState());
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
export const READ_ONLY_MESSAGE = "Jobs are read-only: the free trial or subscription has ended. You can still view and export. See Settings → Billing.";

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
  const id = window.setInterval(cb, 30_000);
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
