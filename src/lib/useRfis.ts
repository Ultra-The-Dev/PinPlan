"use client";
// A job's RFIs straight from Dexie (they aren't in the editor store), kept fresh after local saves and sync pulls.
import { useCallback, useEffect, useState } from "react";
import { db, put } from "./db";
import { SYNCED_EVENT } from "./sync";
import type { Rfi } from "./types";

const CHANGED = "pinplan:rfis";

/** Save an RFI (queues it for sync) and tell open lists. */
export async function saveRfi(rfi: Rfi): Promise<Rfi> {
  const saved = await put("rfis", rfi);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
  return saved;
}

/** Every RFI row of the job, deleted ones included (numbering never reuses a number). */
export function useRfis(projectId: string | null | undefined): { rfis: Rfi[] | null; all: Rfi[]; reload: () => void } {
  const [all, setAll] = useState<Rfi[] | null>(null);
  const reload = useCallback(() => {
    if (!projectId) return;
    db()
      .rfis.where("projectId")
      .equals(projectId)
      .toArray()
      .then(setAll, () => setAll([]));
  }, [projectId]);
  useEffect(() => {
    reload();
    const on = () => reload();
    window.addEventListener(CHANGED, on);
    window.addEventListener(SYNCED_EVENT, on);
    return () => {
      window.removeEventListener(CHANGED, on);
      window.removeEventListener(SYNCED_EVENT, on);
    };
  }, [reload]);
  return { rfis: all ? all.filter((r) => !r.deleted) : null, all: all ?? [], reload };
}

/** True while this RFI still has an unsent change in the sync queue (its link isn't live yet). */
export function useRfiQueued(id: string | null | undefined, updatedAt?: string): boolean {
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const check = () =>
      db()
        .syncQueue.where("rowId")
        .equals(id)
        .filter((i) => i.table === "rfis")
        .count()
        .then((n) => !cancelled && setQueued(n > 0), () => undefined);
    void check();
    const t = window.setInterval(check, 4000);
    window.addEventListener(SYNCED_EVENT, check);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener(SYNCED_EVENT, check);
    };
  }, [id, updatedAt]);
  return queued;
}

/** "Linked task #n" when this install has a tasks table (a separate feature) and the task exists. */
export function useLinkedTaskNumber(taskId: string | null | undefined): number | string | null {
  const [n, setN] = useState<number | string | null>(null);
  useEffect(() => {
    if (!taskId) return;
    const d = db();
    if (!d.tables.some((t) => t.name === "tasks")) return;
    let cancelled = false;
    d.table("tasks")
      .get(taskId)
      .then(
        (row: { number?: number | string; deleted?: boolean } | undefined) => !cancelled && setN(row && !row.deleted ? (row.number ?? "") : null),
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, [taskId]);
  return taskId ? n : null;
}
