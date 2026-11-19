"use client";
// A job's change orders straight from the local database (works offline), refreshed after every sync.
import { useCallback, useEffect, useState } from "react";
import { db, put } from "@/lib/db";
import { SYNCED_EVENT } from "@/lib/sync";
import type { ChangeOrder } from "@/lib/types";

export function useChangeOrders(projectId: string | null | undefined) {
  const [rows, setRows] = useState<ChangeOrder[] | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const all = await db().changeOrders.where("projectId").equals(projectId).toArray();
      setRows(all.filter((c) => !c.deleted).sort((a, b) => b.number - a.number || b.createdAt.localeCompare(a.createdAt)));
    } catch {
      setRows([]);
    }
  }, [projectId]);

  useEffect(() => {
    const first = window.setTimeout(() => void reload(), 0);
    const onSync = () => void reload();
    window.addEventListener(SYNCED_EVENT, onSync);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener(SYNCED_EVENT, onSync);
    };
  }, [reload]);

  /** Write one or more rows (queued for sync) and refresh the list. */
  const save = useCallback(
    async (...cos: ChangeOrder[]) => {
      const out: ChangeOrder[] = [];
      for (const c of cos) out.push(await put("changeOrders", c));
      await reload();
      return out;
    },
    [reload],
  );

  return { rows, reload, save };
}

/** True while this row still has changes waiting to be pushed (so its client link may not be live yet). */
export function useRowPending(rowId: string | null | undefined, tick: unknown): boolean | null {
  const [state, setState] = useState<{ id: string; pending: boolean } | null>(null);
  useEffect(() => {
    if (!rowId) return;
    let cancelled = false;
    db()
      .syncQueue.where("rowId")
      .equals(rowId)
      .count()
      .then((n) => !cancelled && setState({ id: rowId, pending: n > 0 }))
      .catch(() => !cancelled && setState({ id: rowId, pending: false }));
    return () => {
      cancelled = true;
    };
  }, [rowId, tick]);
  return state && state.id === rowId ? state.pending : null;
}
