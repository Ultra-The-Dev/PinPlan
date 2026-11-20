"use client";
// Saving revisions: swap a sheet's drawing, move its markup by an alignment transform, roll back.
// Markers, runs and closets go through the editor store (one undo step); other registered tables are written directly.
import { db, nowIso, putMany, type SyncTable } from "@/lib/db";
import { polylineFt } from "@/lib/geometry";
import { t } from "@/lib/i18n";
import { getAuthor } from "@/lib/photos";
import {
  carryRow,
  composeTransforms,
  invertTransform,
  isIdentity,
  pushRevision,
  revisionCarries,
  rollbackRevision,
  scaleAfterAlign,
  type Affine,
  type NewRevisionImage,
  type ScaleOutcome,
} from "@/lib/revisions";
import { useEditor } from "@/lib/store";
import { fetchProjectImage, useSyncStatus } from "@/lib/sync";
import type { Closet, Marker, Run, Sheet } from "@/lib/types";

type Changes = Parameters<ReturnType<typeof useEditor.getState>["commit"]>[0];
const STORE_TABLES = new Set(["markers", "runs", "closets"]);

export const revisionAuthor = () => getAuthor(useSyncStatus.getState().email);

/** Latest copy of a sheet (the editor's, else the database's). */
export async function latestSheet(id: string): Promise<Sheet | null> {
  const s = useEditor.getState().sheets.find((x) => x.id === id);
  return s ?? (await db().sheets.get(id)) ?? null;
}

/** Save a changed sheet row. A new scale re-measures runs like a calibration; a cleared one keeps the measured lengths until recalibrated. */
async function saveSheet(before: Sheet, after: Sheet, extra: Changes = []): Promise<void> {
  const st = useEditor.getState();
  if (st.project?.id === before.projectId && st.sheets.some((s) => s.id === before.id)) {
    if (!extra.length && after.pxPerFt && after.pxPerFt !== before.pxPerFt) {
      const { id, ...patch } = after;
      void id;
      return st.updateSheet(before.id, patch);
    }
    return st.commit([{ table: "sheets", before, after }, ...extra]);
  }
  await putMany("sheets", [after]);
}

export interface PushResult {
  sheet: Sheet;
  scale: ScaleOutcome;
  /** Size or shape changed by more than 1%: worth aligning. */
  resized: boolean;
}

/** Make `img` the sheet's current drawing (markup stays where it is). */
export async function uploadRevision(sheetId: string, img: NewRevisionImage, label: string): Promise<PushResult | null> {
  const before = await latestSheet(sheetId);
  if (!before) return null;
  const { sheet, scale } = pushRevision(before, img, label, revisionAuthor(), new Date().toISOString());
  await saveSheet(before, sheet);
  const resized = Math.abs(img.width / before.width - 1) > 0.01 || Math.abs(img.height / before.height - 1) > 0.01;
  return { sheet, scale, resized };
}

export interface CarryReport {
  moved: number;
  /** Labels of the devices (and counts of other rows) that fell off the sheet and were clamped to its edge. */
  offDevices: string[];
  offRuns: number;
  offOther: number;
  /** The scale was carried over from the previous drawing through the alignment. */
  scaleFromAlignment: boolean;
}

async function hasTable(name: string): Promise<boolean> {
  try {
    return db().tables.some((t) => t.name === name);
  } catch {
    return false;
  }
}

/**
 * Move everything pinned to the sheet by T (relative coordinates, current positions → new positions), as one undo
 * step. With `link`, T is stored as the previous drawing's transformToNext (composed with any earlier alignment).
 * `since`: only rows created before this time move (rows placed on the new drawing are already right).
 */
export async function moveSheetMarkup(sheetId: string, T: Affine, opts: { since?: string | null; sheetAfter?: (s: Sheet) => Sheet } = {}): Promise<CarryReport> {
  const before = await latestSheet(sheetId);
  const report: CarryReport = { moved: 0, offDevices: [], offRuns: 0, offOther: 0, scaleFromAlignment: false };
  if (!before) return report;
  const since = opts.since ? Date.parse(opts.since) : null;
  const old = (r: { createdAt?: string; deleted?: boolean; sheetId?: string }) => !r.deleted && r.sheetId === sheetId && (since == null || !r.createdAt || Date.parse(r.createdAt) <= since);
  const st = useEditor.getState();
  const inStore = st.project?.id === before.projectId;
  const changes: Changes = [];
  const after = opts.sheetAfter ? opts.sheetAfter(before) : before;
  if (after !== before) changes.push({ table: "sheets", before, after });
  if (!isIdentity(T)) {
    for (const carry of revisionCarries()) {
      if (!carry.fields.xy && !carry.fields.points) continue;
      const storeTable = STORE_TABLES.has(carry.table) && inStore;
      let rows: Record<string, unknown>[];
      if (storeTable) rows = (st[carry.table as "markers" | "runs" | "closets"] as (Marker | Run | Closet)[]).filter(old) as unknown as Record<string, unknown>[];
      else {
        if (!(await hasTable(carry.table))) continue;
        try {
          rows = ((await db().table(carry.table).where("sheetId").equals(sheetId).toArray()) as Record<string, unknown>[]).filter((r) => old(r as never));
        } catch {
          // Not indexed by sheetId: scan.
          rows = ((await db().table(carry.table).toArray()) as Record<string, unknown>[]).filter((r) => old(r as never));
        }
      }
      const direct: Record<string, unknown>[] = [];
      for (const row of rows) {
        const res = carryRow(row, carry.fields, T);
        if (!res.changed) continue;
        report.moved++;
        if (res.clamped) {
          if (carry.table === "markers") report.offDevices.push(String(row.label || "device"));
          else if (carry.table === "runs") report.offRuns++;
          else report.offOther++;
        }
        if (storeTable) changes.push({ table: carry.table as "markers" | "runs" | "closets", before: row as never, after: res.row as never });
        else direct.push(res.row);
      }
      if (direct.length) await putMany(carry.table as SyncTable, direct as { id: string }[]);
    }
  }
  if (!changes.length) return report;
  // LED runs are re-measured on the (possibly re-scaled) sheet, like a moved handle.
  if (after.pxPerFt)
    for (const c of changes)
      if (c.table === "runs" && c.after && (c.after as Run).kind === "led") c.after = { ...(c.after as Run), measuredFt: polylineFt((c.after as Run).points, after) };
  if (inStore) await st.commit(changes);
  else
    for (const t of ["sheets", "markers", "runs", "closets"] as const) {
      const rows = changes.filter((c) => c.table === t).map((c) => c.after as { id: string });
      if (rows.length) await putMany(t, rows);
    }
  return report;
}

/**
 * Align the current drawing to the previous one: `T` takes positions on the previous drawing to the current one.
 * Markup placed before this drawing arrived moves; the transform is stored; a scale lost to the new size comes back.
 */
export async function alignToPrevious(sheetId: string, T: Affine): Promise<CarryReport> {
  const sheet = await latestSheet(sheetId);
  const prev = sheet?.revisions?.[0];
  if (!sheet || !prev) throw new Error(t("This sheet has no earlier drawing to align to."));
  // Markup may already have been moved by an earlier alignment: undo that one first.
  const undoPrev = prev.transformToNext ? invertTransform(prev.transformToNext) : null;
  const move = undoPrev ? composeTransforms(undoPrev, T) : T;
  let scaleFromAlignment = false;
  const report = await moveSheetMarkup(sheetId, move, {
    since: prev.replacedAt,
    sheetAfter: (s) => {
      const revisions = [{ ...s.revisions![0], transformToNext: isIdentity(T) ? null : T }, ...s.revisions!.slice(1)];
      const next: Sheet = { ...s, revisions };
      // A reset scale, or one still derived from the previous drawing, follows the alignment's zoom.
      const px = scaleAfterAlign(s, T);
      if (px != null) {
        next.pxPerFt = px;
        next.scaleLabel = prev.scaleLabel ?? null;
        scaleFromAlignment = true;
      }
      return next;
    },
  });
  return { ...report, scaleFromAlignment };
}

/** Restore an earlier drawing (the replaced one stays in history); markup follows the stored alignments. */
export async function rollbackTo(sheetId: string, revisionId: string): Promise<CarryReport | null> {
  const before = await latestSheet(sheetId);
  if (!before) return null;
  const target = before.revisions?.find((r) => r.id === revisionId);
  if (!target) return null;
  // Restoring a drawing this device doesn't have would leave the plan blank here.
  if (!(await fetchProjectImage(before.projectId, target.imageId, target.width, target.height)))
    throw new Error(t("{label} isn't downloaded on this device yet — connect to the internet and try again.", { label: target.label }));
  const res = rollbackRevision(before, revisionId, revisionAuthor(), new Date().toISOString());
  if (!res) return null;
  const report = await moveSheetMarkup(sheetId, res.transform, { sheetAfter: () => res.sheet });
  // Upload the restored drawing again so the cloud row's image_path names it (other devices download by that path).
  await db().syncQueue.add({ table: "images", rowId: target.imageId, queuedAt: nowIso() });
  return report;
}

/** Swap the current drawing for a rotated copy without moving the markup (a re-issue that came in sideways). */
export async function replaceCurrentImage(sheetId: string, imageId: string, width: number, height: number): Promise<void> {
  const before = await latestSheet(sheetId);
  if (!before) return;
  await saveSheet(before, { ...before, imageId, width, height, imageUrl: null });
}
