"use client";
// Cheap "N files waiting to upload" count for a job: one indexed Dexie query over the image rows of the sync queue,
// refreshed on an interval while the page is visible, when it becomes visible, and whenever the sync status changes.
import { useEffect, useMemo, useState } from "react";
import { db } from "./db";
import { useSyncStatus } from "./sync";
import { pendingUploadCount } from "./syncMap";

const POLL_MS = 5_000;

export function usePendingUploads(fileIds: string[]): number {
  const [count, setCount] = useState(0);
  const pending = useSyncStatus((s) => s.pending);
  const syncing = useSyncStatus((s) => s.syncing);
  const configured = useSyncStatus((s) => s.configured);
  const key = useMemo(() => [...fileIds].sort().join("|"), [fileIds]);

  useEffect(() => {
    let alive = true;
    const ids = key ? key.split("|") : [];
    const refresh = async () => {
      if (!ids.length || !configured) return alive && setCount(0);
      try {
        const items = await db().syncQueue.where("table").equals("images").toArray();
        if (alive) setCount(pendingUploadCount(items, ids));
      } catch {
        /* IndexedDB unavailable */
      }
    };
    void refresh();
    // Without cloud sync nothing ever uploads (and the banner is hidden), so don't poll IndexedDB for nothing.
    if (!configured) return () => {
      alive = false;
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, pending, syncing, configured]);

  return count;
}
