"use client";
// Install status changes. In the editor they go through the store (updateMarker / updateRun → commit), so undo,
// persistence and sync work as for every other edit; outside the editor (bulk actions) `put` is used directly.
import { nowIso, put } from "@/lib/db";
import { applyInstall, canResetInstall, canSetInstall, markable, requiresPhoto, statusOf, type InstallOpts } from "@/lib/installProgress";
import { getAuthor, importPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useTeam } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { InstallState, InstallStatus, Marker, Run } from "@/lib/types";
import type { InstallRef } from "./progressStore";

export const me = () => getAuthor(useSyncStatus.getState().email);
export const myRole = () => useTeam.getState().role;

export function findItem(ref: InstallRef): Marker | Run | undefined {
  const s = useEditor.getState();
  return ref.table === "markers" ? s.markers.find((m) => m.id === ref.id) : s.runs.find((r) => r.id === ref.id);
}

export function itemLabel(item: Marker | Run | undefined): string {
  if (!item) return "Device";
  if ("points" in item) {
    const m = item.markerId ? useEditor.getState().markers.find((x) => x.id === item.markerId) : undefined;
    return m ? `${m.label} cable` : item.switchLabel || (item.zone ? `Zone ${item.zone}` : item.wireType || "Run");
  }
  return item.label || "Device";
}

/** Why `to` can't be set on this item right now (null = it can). */
export function blockedReason(item: Marker | Run | undefined, to: InstallStatus): string | null {
  if (!item || item.deleted) return "That device is gone";
  if (!markable({ tentative: !!item.tentative, deleted: item.deleted })) return "Optional (?) devices aren't tracked — confirm it first";
  if (!canSetInstall(myRole(), to, statusOf(item))) return to === "verified" ? "Only the office can verify" : "Verified — only the office can change it";
  return null;
}

async function write(ref: InstallRef, install: InstallState | null) {
  const st = useEditor.getState();
  if (ref.table === "markers") await st.updateMarker(ref.id, { install });
  else await st.updateRun(ref.id, { install });
}

/** Set a status (with optional photo, note, test). Returns false (with a toast) when it isn't allowed. */
export async function setInstall(ref: InstallRef, to: InstallStatus, opts: InstallOpts = {}): Promise<boolean> {
  const item = findItem(ref);
  const why = blockedReason(item, to);
  if (why) {
    toast(why, "info");
    return false;
  }
  await write(ref, applyInstall(item!.install, to, me(), nowIso(), opts));
  return true;
}

/** Save a test result. A pass marks it tested (unless it's further along); a fail flags an issue. */
export async function saveTest(ref: InstallRef, test: NonNullable<InstallState["test"]>, photoId?: string | null): Promise<boolean> {
  const to = testTarget(statusOf(findItem(ref)), test.pass);
  return setInstall(ref, to, { test, photoId, note: !test.pass ? test.note || "Test failed" : test.note });
}

/** The status a saved test result sets: a pass marks it tested (verified stays verified); a fail flags an issue. */
export const testTarget = (cur: InstallStatus, pass: boolean): InstallStatus => (!pass ? "issue" : cur === "verified" ? "verified" : "tested");

/** Attach a proof photo without changing the status. */
export async function attachPhoto(ref: InstallRef, photoId: string) {
  const item = findItem(ref);
  if (!item) return;
  const cur: InstallState = item.install ?? { status: "planned", photoIds: [], history: [] };
  if (cur.photoIds?.includes(photoId)) return;
  await write(ref, { ...cur, photoIds: [...(cur.photoIds ?? []), photoId] });
}

/** Office: clear the install record (status and history). */
export async function resetInstall(ref: InstallRef): Promise<boolean> {
  if (!canResetInstall(myRole())) {
    toast("Only the office can reset progress", "info");
    return false;
  }
  await write(ref, null);
  return true;
}

export const photoNeeded = (to: InstallStatus) => requiresPhoto(useEditor.getState().settings, to);

/** Save a file from the camera as a job photo on the device (Photo.markerId), returning its id. */
export async function saveProofPhoto(file: File, ref: InstallRef): Promise<string | null> {
  const st = useEditor.getState();
  const item = findItem(ref);
  if (!st.project || !item) return null;
  const markerId = "points" in item ? (item.markerId ?? null) : item.id;
  const room = "points" in item ? null : item.room || null;
  const p = await importPhoto(file, { projectId: st.project.id, author: me(), extra: { markerId, sheetId: item.sheetId, room, tags: ["install"] } });
  const saved = await st.saveRow("photos", p);
  return saved.id;
}

/**
 * Office bulk action: mark these devices verified. When the job is open in the editor this is one commit (one undo
 * step), so a later plan undo can't silently restore a pre-verify copy of the row; otherwise it writes with `put`.
 */
export async function bulkVerify(markers: Marker[]): Promise<number> {
  if (!canSetInstall(myRole(), "verified")) {
    toast("Only the office can verify", "info");
    return 0;
  }
  const by = me();
  const now = nowIso();
  const st = useEditor.getState();
  const open = !!markers.length && st.project?.id === markers[0].projectId;
  const todo = markers
    // Use the editor's current copy (it may be newer than the list the panel rendered).
    .map((m) => (open ? (st.markers.find((x) => x.id === m.id) ?? m) : m))
    .filter((m) => markable(m) && statusOf(m) !== "verified");
  if (!todo.length) return 0;
  if (open) {
    await st.commit(todo.map((m) => ({ table: "markers" as const, before: m, after: { ...m, install: applyInstall(m.install, "verified", by, now) } })));
    return todo.length;
  }
  for (const m of todo) await put("markers", { ...m, install: applyInstall(m.install, "verified", by, now) });
  return todo.length;
}
