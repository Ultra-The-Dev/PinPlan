"use client";
// A job's filled forms, read straight from IndexedDB (they aren't part of the editor store), reloaded after every save
// here and after each sync.
import { useCallback, useEffect, useState } from "react";
import { dataUrlToBlob } from "./signature";
import { db, put, saveImage } from "../db";
import type { JobForm } from "../types";

export const FORMS_EVENT = "pinplan:forms";

export async function listForms(projectId: string): Promise<JobForm[]> {
  const rows = await db().forms.where("projectId").equals(projectId).toArray();
  return rows.filter((f) => !f.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Save a form (queued for sync) and tell open lists. */
export async function saveForm(form: JobForm): Promise<JobForm> {
  const saved = await put("forms", form);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FORMS_EVENT, { detail: { id: saved.id } }));
  return saved;
}

export async function deleteForm(form: JobForm): Promise<void> {
  await saveForm({ ...form, deleted: true });
}

/** Store a drawn signature (PNG data URL) as an image that syncs like photos. */
export async function saveSignatureImage(dataUrl: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const bmp = typeof createImageBitmap === "function" ? await createImageBitmap(blob).catch(() => null) : null;
  const id = await saveImage(blob, bmp?.width ?? 600, bmp?.height ?? 200);
  bmp?.close();
  return id;
}

export function useForms(projectId: string | null | undefined): { forms: JobForm[]; loaded: boolean; reload: () => void } {
  const [state, setState] = useState<{ pid: string | null; forms: JobForm[]; loaded: boolean }>({ pid: null, forms: [], loaded: false });
  const [n, setN] = useState(0);
  const reload = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    void listForms(projectId)
      .then((forms) => alive && setState({ pid: projectId, forms, loaded: true }))
      .catch(() => alive && setState({ pid: projectId, forms: [], loaded: true }));
    return () => {
      alive = false;
    };
  }, [projectId, n]);
  useEffect(() => {
    window.addEventListener(FORMS_EVENT, reload);
    window.addEventListener("pinplan:synced", reload);
    return () => {
      window.removeEventListener(FORMS_EVENT, reload);
      window.removeEventListener("pinplan:synced", reload);
    };
  }, [reload]);
  return state.pid === projectId ? { forms: state.forms, loaded: state.loaded, reload } : { forms: [], loaded: false, reload };
}
