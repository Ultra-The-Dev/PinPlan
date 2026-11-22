"use client";
// The sync status store on its own, with no dependencies beyond zustand, so the public pages (the header's
// "Open the app") can read it without loading the sync engine, Supabase or the local database. sync.ts fills it in
// (and re-exports it); until sync has started on this page `authReady` stays false when accounts are configured,
// and `useSignedIn` falls back to the saved sign-in Supabase keeps in localStorage.
import { useSyncExternalStore } from "react";
import { create } from "zustand";

/** True when Supabase env vars are set (the same rule as supabase.ts, without loading the client). */
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
  /** Sync now (replaced by sync.ts when it loads; before that there is nothing to sync). */
  syncNow(): Promise<void>;
}

export const useSyncStatus = create<SyncStatus>(() => ({
  configured,
  signedIn: false,
  authReady: !configured,
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
  syncNow: () => Promise.resolve(),
}));

/** supabase-js's default storage key for the session: `sb-<first label of the project host>-auth-token`. */
function sessionKey(): string | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? `sb-${new URL(url).hostname.split(".")[0]}-auth-token` : null;
  } catch {
    return null;
  }
}

/** A sign-in saved on this device (supabase-js removes the key on sign-out). Read without loading Supabase. */
export function hasSavedSession(): boolean {
  const key = configured ? sessionKey() : null;
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const s = JSON.parse(raw) as { refresh_token?: unknown } | null;
    return !!s && typeof s.refresh_token === "string" && s.refresh_token !== "";
  } catch {
    return false;
  }
}

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

/**
 * Signed in on this device, for the public pages: the sync engine's answer once it has read the session, else the
 * saved session. `ready` is false on the server and during hydration, so prerendered HTML matches the first render.
 */
export function useSignedIn(): { ready: boolean; signedIn: boolean } {
  const s = useSyncStatus();
  const saved = useSyncExternalStore(
    subscribeStorage,
    () => (hasSavedSession() ? 1 : 0),
    () => -1,
  );
  if (s.authReady) return { ready: true, signedIn: s.signedIn };
  return { ready: saved >= 0, signedIn: saved === 1 };
}
