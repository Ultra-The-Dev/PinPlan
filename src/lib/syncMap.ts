// Pure mappers between local (camelCase, Dexie) rows and Supabase (snake_case, Postgres) rows.
import type { SyncTable } from "./db";

export interface TableSpec {
  /** Postgres table name. */
  remote: string;
  /** Conflict target for upserts. */
  conflict: string;
  /** Local key -> remote column. Only these keys are sent. */
  columns: Record<string, string>;
}

const common = { id: "id", createdAt: "created_at", updatedAt: "updated_at", deleted: "deleted" };
const childOf = { ...common, projectId: "project_id" };

export const TABLES: Record<SyncTable, TableSpec> = {
  projects: {
    remote: "projects",
    conflict: "id",
    columns: {
      ...common,
      clientName: "client_name",
      clientEmail: "client_email",
      clientPhone: "client_phone",
      address: "address",
      status: "status",
      notes: "notes",
      billduClientId: "billdu_client_id",
      billduDocs: "billdu_docs",
      pricing: "pricing",
    },
  },
  sheets: {
    remote: "sheets",
    conflict: "id",
    columns: {
      ...childOf,
      name: "name",
      pageNumber: "page_number",
      order: "sort_order",
      imageId: "image_id",
      width: "width",
      height: "height",
      pxPerFt: "px_per_ft",
      pxPerInch: "px_per_inch",
      scaleLabel: "scale_label",
    },
  },
  deviceTypes: {
    remote: "device_types",
    conflict: "owner_id,id",
    columns: {
      id: "id",
      updatedAt: "updated_at",
      deleted: "deleted",
      name: "name",
      category: "category",
      symbol: "symbol",
      abbrev: "abbrev",
      shape: "shape",
      color: "color",
      unit: "unit",
      unitPrice: "unit_price",
      laborPrice: "labor_price",
      defaultWire: "default_wire",
      defaultMount: "default_mount",
      kind: "kind",
      billduProductId: "billdu_product_id",
      sort: "sort_order",
      archived: "archived",
    },
  },
  markers: {
    remote: "markers",
    conflict: "id",
    columns: {
      ...childOf,
      sheetId: "sheet_id",
      deviceTypeId: "device_type_id",
      x: "x",
      y: "y",
      label: "label",
      room: "room",
      mount: "mount",
      wireType: "wire_type",
      closetId: "closet_id",
      tentative: "tentative",
      notes: "notes",
      photoId: "photo_id",
    },
  },
  runs: {
    remote: "runs",
    conflict: "id",
    columns: {
      ...childOf,
      sheetId: "sheet_id",
      kind: "kind",
      deviceTypeId: "device_type_id",
      points: "points",
      measuredFt: "measured_ft",
      typedFt: "typed_ft",
      zone: "zone",
      switchLabel: "switch_label",
      steps: "steps",
      lfPerStep: "lf_per_step",
      wireType: "wire_type",
      markerId: "marker_id",
      closetId: "closet_id",
      tentative: "tentative",
      notes: "notes",
    },
  },
  closets: {
    remote: "closets",
    conflict: "id",
    columns: { ...childOf, sheetId: "sheet_id", kind: "kind", x: "x", y: "y", name: "name", notes: "notes" },
  },
  estimateLines: {
    remote: "estimate_lines",
    conflict: "id",
    columns: {
      id: "id",
      projectId: "project_id",
      updatedAt: "updated_at",
      deleted: "deleted",
      key: "key",
      description: "description",
      qty: "qty",
      unit: "unit",
      unitPrice: "unit_price",
      removed: "removed",
      include: "include",
      sort: "sort_order",
    },
  },
};

/** Push order: parents before children so foreign keys and RLS checks pass. */
export const PUSH_ORDER: SyncTable[] = ["projects", "deviceTypes", "sheets", "closets", "markers", "runs", "estimateLines"];

const TIMESTAMP_KEYS = new Set(["createdAt", "updatedAt"]);
const BOOL_DEFAULTS: Record<string, boolean> = { deleted: false, tentative: false, removed: false, archived: false };

/** Local row -> remote row. Unknown keys are dropped; undefined becomes null. */
export function toRemote(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [local, remote] of Object.entries(TABLES[table].columns)) {
    let v = row[local];
    if (v === undefined) v = local in BOOL_DEFAULTS ? BOOL_DEFAULTS[local] : null;
    out[remote] = v;
  }
  if (table === "projects" && !Array.isArray(out.billdu_docs)) out.billdu_docs = [];
  if (table === "runs" && !Array.isArray(out.points)) out.points = [];
  return out;
}

/** Remote row -> local row. Nulls are dropped (optional fields), timestamps normalised to ISO. */
export function toLocal(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [local, remote] of Object.entries(TABLES[table].columns)) {
    const v = row[remote];
    if (v === null || v === undefined) continue;
    out[local] = TIMESTAMP_KEYS.has(local) && typeof v === "string" ? normaliseTs(v) : v;
  }
  if (table === "projects" && !Array.isArray(out.billduDocs)) out.billduDocs = [];
  if (table === "runs" && !Array.isArray(out.points)) out.points = [];
  return out;
}

function normaliseTs(v: string): string {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : v;
}

/** True when the remote row should replace the local one (last write wins). */
export function remoteWins(local: { updatedAt?: string } | undefined, remote: { updatedAt?: string }): boolean {
  if (!local) return true;
  const l = Date.parse(local.updatedAt ?? "") || 0;
  const r = Date.parse(remote.updatedAt ?? "") || 0;
  return r > l;
}

/** Collapse queue items to one per table+row, keeping the latest seq for each. */
export function dedupeQueue<T extends { seq?: number; table: string; rowId: string }>(items: T[]): T[] {
  const latest = new Map<string, T>();
  for (const it of [...items].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) latest.set(`${it.table}:${it.rowId}`, it);
  return [...latest.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}
