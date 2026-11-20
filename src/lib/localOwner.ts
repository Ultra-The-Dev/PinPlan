"use client";
// Which account the jobs on this device belong to. A different person signing in on the same browser must never
// inherit (or upload into their own company) the previous account's jobs: sync pauses and asks first.
import { db } from "./db";

const KEY = "pinplan.localOwner";

export interface LocalOwner {
  userId: string;
  email: string | null;
}

export function readLocalOwner(): LocalOwner | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<LocalOwner>) : null;
    return v?.userId ? { userId: v.userId, email: v.email ?? null } : null;
  } catch {
    return null;
  }
}

export function writeLocalOwner(o: LocalOwner): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage unavailable */
  }
}

export function forgetLocalOwner(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * What to do when `userId` signs in. "same": the jobs here are theirs. "claim": nothing here belongs to anyone else
 * (first sign-in on this device, or nothing left from the previous account), so they become this account's.
 * "ask": another account's jobs are here; don't sync until the person decides.
 */
export type OwnerDecision = "same" | "claim" | "ask";

export function ownerDecision(stored: LocalOwner | null, userId: string, hasLocalData: boolean): OwnerDecision {
  if (stored?.userId === userId) return "same";
  if (!stored || !hasLocalData) return "claim";
  return "ask";
}

/** Jobs or unsynced changes on this device (the catalog and settings alone don't count). */
export async function hasLocalData(): Promise<boolean> {
  try {
    const [jobs, queued] = await Promise.all([db().projects.filter((p) => !p.deleted).count(), db().syncQueue.count()]);
    return jobs > 0 || queued > 0;
  } catch {
    return false;
  }
}

/**
 * Installs from before the owner was recorded: the account that last synced here, found from its per-user keys (pull
 * watermarks `pinplan.sync.pull.<user>.<table>` and the team cache). Null when `userId` itself synced here (the jobs
 * may be theirs) or nothing says who it was.
 */
export function inferLocalOwner(userId: string): LocalOwner | null {
  const others = new Set<string>();
  let mine = false;
  try {
    const note = (id: string | null | undefined) => {
      if (!id) return;
      if (id === userId) mine = true;
      else others.add(id);
    };
    for (const k of Object.keys(localStorage)) {
      const m = /^pinplan\.sync\.pull\.([^.]+)\./.exec(k);
      if (m) note(m[1]);
    }
    const team = localStorage.getItem("pinplan.team");
    if (team) note((JSON.parse(team) as { userId?: string | null }).userId);
  } catch {
    return null;
  }
  if (mine || !others.size) return null;
  return { userId: [...others][0], email: null };
}

/** The account the data on this device belongs to, recorded or inferred, whoever is signed in now (null: nobody's). */
export function recordedOwner(): LocalOwner | null {
  return readLocalOwner() ?? inferLocalOwner("");
}

/**
 * `userId`'s sign-in is still stored in this browser (Supabase's `sb-…-auth-token`, with its refresh token) although
 * the client reports nobody signed in. That happens offline once the access token has expired: the refresh can't reach
 * the server, so getSession() answers null but keeps the session, and it signs back in by itself when the network
 * returns. Signing out removes it (as does a refresh the server refuses). Whoever holds the device holds that refresh
 * token anyway, so sending them to /login would only lock a field worker out of their jobs offline.
 */
export function heldSignIn(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    for (const k of Object.keys(localStorage)) {
      if (!/^sb-.+-auth-token$/.test(k)) continue;
      const v = JSON.parse(localStorage.getItem(k) ?? "null") as { refresh_token?: unknown; user?: { id?: unknown } | null } | null;
      if (typeof v?.refresh_token === "string" && v.refresh_token && v.user?.id === userId) return true;
    }
  } catch {
    /* storage unavailable */
  }
  return false;
}

/** Decide for a sign-in and remember the owner when the jobs here are (now) theirs. */
export async function checkLocalOwner(userId: string, email: string | null): Promise<OwnerDecision> {
  // Read before awaiting: loading the new account's team rewrites the team cache.
  const stored = readLocalOwner() ?? inferLocalOwner(userId);
  const decision = ownerDecision(stored, userId, await hasLocalData());
  if (decision !== "ask") writeLocalOwner({ userId, email });
  return decision;
}

/** Keep the previous account's jobs and let this account sync them (only when the person chose to). */
export function adoptLocalData(userId: string, email: string | null): void {
  writeLocalOwner({ userId, email });
}

/**
 * Remove every job, photo, setting and Northpin key from this device but keep the current sign-in (Supabase's own
 * `sb-*` keys), then make `next` the owner. The caller reloads the page so nothing holds the old database open.
 */
export async function removeLocalData(next: LocalOwner | null): Promise<void> {
  try {
    const d = db();
    d.close();
    await d.delete();
  } catch {
    /* IndexedDB unavailable */
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("pinplan")) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
  if (next) writeLocalOwner(next);
}
