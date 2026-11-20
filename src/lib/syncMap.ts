// Pure mappers between local (camelCase, Dexie) rows and Supabase (snake_case, Postgres) rows.
import { INACTIVE_MESSAGE } from "./billingLogic";
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
      productChoices: "product_choices",
      labels: "labels",
      lat: "lat",
      lng: "lng",
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
      // Sheet index (20261123100500_sheet_links.sql): "number"/"title" are renamed to avoid reserved-ish words.
      number: "sheet_number",
      title: "sheet_title",
      discipline: "discipline",
      tags: "tags",
      revisionLabel: "revision_label",
      revisions: "revisions",
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
      icon: "icon",
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
  products: {
    remote: "products",
    conflict: "owner_id,id",
    columns: {
      id: "id",
      updatedAt: "updated_at",
      deleted: "deleted",
      deviceTypeId: "device_type_id",
      brand: "brand",
      model: "model",
      sku: "sku",
      unitPrice: "unit_price",
      laborPrice: "labor_price",
      notes: "notes",
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
      wires: "wires",
      productId: "product_id",
      closetId: "closet_id",
      circuit: "circuit",
      tentative: "tentative",
      notes: "notes",
      photoId: "photo_id",
      install: "install",
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
      wireTypes: "wire_types",
      markerId: "marker_id",
      closetId: "closet_id",
      circuit: "circuit",
      tentative: "tentative",
      notes: "notes",
      install: "install",
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
  // Field documentation (all children of a project).
  photos: {
    remote: "photos",
    conflict: "id",
    columns: {
      ...childOf,
      imageId: "image_id",
      width: "width",
      height: "height",
      takenAt: "taken_at",
      takenBy: "taken_by",
      lat: "lat",
      lng: "lng",
      caption: "caption",
      tags: "tags",
      annotations: "annotations",
      markerId: "marker_id",
      sheetId: "sheet_id",
      room: "room",
      beforeId: "before_id",
      checklistId: "checklist_id",
      checklistItemId: "checklist_item_id",
    },
  },
  photoComments: {
    remote: "photo_comments",
    conflict: "id",
    columns: { ...childOf, photoId: "photo_id", author: "author", text: "text" },
  },
  checklists: {
    remote: "checklists",
    conflict: "id",
    columns: { ...childOf, name: "name", items: "items" },
  },
  jobLogs: {
    remote: "job_logs",
    conflict: "id",
    columns: { ...childOf, date: "log_date", title: "title", body: "body", author: "author", photoIds: "photo_ids", report: "report" },
  },
  documents: {
    remote: "job_documents",
    conflict: "id",
    columns: { ...childOf, name: "name", mime: "mime", size: "size", fileId: "file_id" },
  },
  // Quotes / invoices / credit notes and payments (docs/documents.md). The database gives numbers and keeps the
  // client's answer; whatever the app sends for those is ignored.
  salesDocs: {
    remote: "sales_documents",
    conflict: "id",
    columns: {
      ...childOf,
      kind: "kind",
      title: "title",
      number: "number",
      status: "status",
      issueDate: "issue_date",
      dueDate: "due_date",
      validUntil: "valid_until",
      termsDays: "terms_days",
      client: "client",
      lines: "lines",
      discount: "discount",
      taxes: "taxes",
      fees: "fees",
      deposit: "deposit",
      deductions: "deductions",
      currency: "currency",
      notes: "notes",
      terms: "terms",
      footer: "footer",
      internalNotes: "internal_notes",
      options: "options",
      subtotal: "subtotal",
      discountTotal: "discount_total",
      taxTotal: "tax_total",
      total: "total",
      amountPaid: "amount_paid",
      balanceDue: "balance_due",
      source: "source",
      convertedFrom: "converted_from",
      invoiceType: "invoice_type",
      billedPct: "billed_pct",
      shareToken: "share_token",
      shareHash: "share_hash",
      sentAt: "sent_at",
      viewedAt: "viewed_at",
      respondedAt: "responded_at",
      signerName: "signer_name",
      signature: "signature",
      clientNote: "client_note",
      paidAt: "paid_at",
      voidedAt: "voided_at",
    },
  },
  salesPayments: {
    remote: "sales_document_payments",
    conflict: "id",
    columns: { ...childOf, documentId: "document_id", amount: "amount", date: "paid_on", method: "method", reference: "reference", note: "note", voided: "voided" },
  },
  // Company job templates (docs/job-templates.md). team_id and created_by are set by the database from the signed-in user.
  jobTemplates: {
    remote: "job_templates",
    conflict: "id",
    columns: { ...common, name: "name", description: "description", trades: "trades", payload: "payload", createdBy: "created_by" },
  },
  // Change orders (docs/change-orders.md). Office only; the client's answer is written by the server.
  changeOrders: {
    remote: "change_orders",
    conflict: "id",
    columns: {
      ...childOf,
      number: "number",
      title: "title",
      reason: "reason",
      description: "description",
      status: "status",
      lines: "lines",
      markupPct: "markup_pct",
      taxPct: "tax_pct",
      scheduleDays: "schedule_days",
      photoIds: "photo_ids",
      rfiId: "rfi_id",
      sheetIds: "sheet_ids",
      markerIds: "marker_ids",
      shareToken: "share_token",
      publicView: "public_view",
      sentAt: "sent_at",
      respondedAt: "responded_at",
      approvedName: "approved_name",
      signatureImageId: "signature_image_id",
      clientComment: "client_comment",
      createdBy: "created_by",
    },
  },
  // RFIs (docs/rfis.md). The no-login answer page writes answer/answered_by/answered_at through the server.
  rfis: {
    remote: "rfis",
    conflict: "id",
    columns: {
      ...childOf,
      number: "number",
      subject: "subject",
      question: "question",
      suggestion: "suggestion",
      status: "status",
      ballInCourt: "ball_in_court",
      priority: "priority",
      costImpact: "cost_impact",
      scheduleImpact: "schedule_impact",
      toName: "to_name",
      toEmail: "to_email",
      toCompany: "to_company",
      cc: "cc",
      due: "due",
      sheetId: "sheet_id",
      x: "x",
      y: "y",
      markerId: "marker_id",
      taskId: "task_id",
      photoIds: "photo_ids",
      documentIds: "document_ids",
      answer: "answer",
      answeredBy: "answered_by",
      answeredAt: "answered_at",
      shareToken: "share_token",
      sentAt: "sent_at",
      closedAt: "closed_at",
      createdBy: "created_by",
      sender: "sender",
    },
  },
  // Job schedule (docs/schedule-lookahead.md). `start`/`end` are reserved words in SQL, hence start_date/end_date.
  scheduleItems: {
    remote: "schedule_items",
    conflict: "id",
    columns: {
      ...childOf,
      name: "name",
      phase: "phase",
      start: "start_date",
      end: "end_date",
      crew: "crew",
      hoursPlanned: "hours_planned",
      progress: "progress",
      color: "color",
      dependsOn: "depends_on",
      sheetIds: "sheet_ids",
      notes: "notes",
      sort: "sort_order",
      workdaysOnly: "workdays_only",
    },
  },
  // Filled forms and inspections (src/lib/forms). The template is a snapshot, kept with the form.
  forms: {
    remote: "job_forms",
    conflict: "id",
    columns: {
      ...childOf,
      templateId: "template_id",
      name: "name",
      template: "template",
      status: "status",
      values: "values",
      signatures: "signatures",
      sheetId: "sheet_id",
      x: "x",
      y: "y",
      markerId: "marker_id",
      photoIds: "photo_ids",
      submittedBy: "submitted_by",
      submittedAt: "submitted_at",
      createdBy: "created_by",
    },
  },
  // Saved measurements on sheets (docs/saved-measurements.md). Values are computed, never stored.
  measurements: {
    remote: "measurements",
    conflict: "id",
    columns: { ...childOf, sheetId: "sheet_id", kind: "kind", points: "points", label: "label", color: "color", extraFt: "extra_ft", wastePct: "waste_pct", notes: "notes", author: "author" },
  },
  // Hyperlinks on plans (docs/sheet-index-links.md).
  sheetLinks: {
    remote: "sheet_links",
    conflict: "id",
    columns: { ...childOf, sheetId: "sheet_id", x: "x", y: "y", w: "w", h: "h", target: "target", label: "label", auto: "auto" },
  },
  // Tasks pinned on the plan (src/lib/tasks.ts). Photos stay in `photos`; the task lists their ids.
  tasks: {
    remote: "tasks",
    conflict: "id",
    columns: {
      ...childOf,
      number: "number",
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      category: "category",
      assignee: "assignee",
      watchers: "watchers",
      due: "due",
      startDate: "start_date",
      sheetId: "sheet_id",
      x: "x",
      y: "y",
      markerId: "marker_id",
      room: "room",
      tags: "tags",
      checklist: "checklist",
      photoIds: "photo_ids",
      activity: "activity",
      createdBy: "created_by",
      closedAt: "closed_at",
      verifiedBy: "verified_by",
      verifiedAt: "verified_at",
    },
  },
  // Plan markups (docs/plan-markups.md): redlines drawn on a sheet; never counted.
  planMarkups: {
    remote: "plan_markups",
    conflict: "id",
    columns: {
      ...childOf,
      sheetId: "sheet_id",
      kind: "kind",
      points: "points",
      text: "text",
      color: "color",
      width: "width",
      fontSize: "font_size",
      layer: "layer",
      private: "private",
      author: "author",
      authorId: "author_id",
    },
  },
};


/** Push order: parents before children so foreign keys and RLS checks pass. */
export const PUSH_ORDER: SyncTable[] = [
  "projects",
  "deviceTypes",
  "products",
  "sheets",
  "closets",
  "markers",
  "runs",
  "estimateLines",
  "photos",
  "photoComments",
  "checklists",
  "jobLogs",
  "documents",
  "salesDocs",
  "salesPayments",
  "jobTemplates",
  "changeOrders",
  "rfis",
  "scheduleItems",
  "forms",
  "measurements",
  "sheetLinks",
  "tasks",
  "planMarkups",
];

const TIMESTAMP_KEYS = new Set(["createdAt", "updatedAt", "sentAt", "viewedAt", "respondedAt", "voidedAt", "answeredAt", "closedAt", "submittedAt", "verifiedAt"]);
const BOOL_DEFAULTS: Record<string, boolean> = { deleted: false, tentative: false, removed: false, archived: false, voided: false, auto: false, private: false };
/** Columns that are NOT NULL in the database: what to send when the row has nothing. */
const DOC_DEFAULTS: Record<string, unknown> = { client: {}, lines: [], taxes: [], subtotal: 0, discount_total: 0, tax_total: 0, total: 0, amount_paid: 0, balance_due: 0, source: "manual", status: "draft", currency: "USD" };
const RFI_DEFAULTS: Record<string, unknown> = { number: 0, subject: "", question: "", status: "draft", ball_in_court: "us" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** NOT NULL change order columns: what to send when the row has nothing. */
const CO_DEFAULTS: Record<string, unknown> = { lines: [], status: "draft", reason: "other", title: "", number: 0 };

/** Local row -> remote row. Unknown keys are dropped; undefined becomes null. */
export function toRemote(table: SyncTable, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [local, remote] of Object.entries(TABLES[table].columns)) {
    let v = row[local];
    if (v === undefined) v = local in BOOL_DEFAULTS ? BOOL_DEFAULTS[local] : null;
    out[remote] = v;
  }
  if (table === "projects" && !Array.isArray(out.billdu_docs)) out.billdu_docs = [];
  if ((table === "runs" || table === "measurements") && !Array.isArray(out.points)) out.points = [];
  if (table === "runs" && !Array.isArray(out.points)) out.points = [];
  if (table === "planMarkups" && !Array.isArray(out.points)) out.points = [];
  if (table === "salesDocs") for (const [k, v] of Object.entries(DOC_DEFAULTS)) if (out[k] == null) out[k] = v;
  if (table === "salesPayments" && out.amount == null) out.amount = 0;
  if (table === "jobTemplates") {
    if (out.payload == null || typeof out.payload !== "object") out.payload = { version: 1, project: {}, checklists: [], estimateLines: [] };
    // The database sets created_by itself; anything that isn't a user id would fail the uuid column.
    if (typeof out.created_by !== "string" || !UUID.test(out.created_by)) out.created_by = null;
  }
  if (table === "changeOrders") for (const [k, v] of Object.entries(CO_DEFAULTS)) if (out[k] == null) out[k] = v;
  if (table === "rfis") for (const [k, v] of Object.entries(RFI_DEFAULTS)) if (out[k] == null) out[k] = v;
  if (table === "forms") {
    if (out.status == null) out.status = "draft";
    if (out.values == null) out.values = {};
  }
  if (table === "tasks") {
    if (out.status == null) out.status = "open";
    if (out.title == null) out.title = "";
    if (out.number == null) out.number = 0;
  }
  // Every other NOT NULL column (an explicit null fails the insert even when the column has a default): one bad or
  // older row must not be refused for a missing optional-looking field. tests/syncMap.test.ts checks the migrations.
  if ("created_at" in out && out.created_at == null) out.created_at = out.updated_at ?? EPOCH;
  if (out.updated_at == null) out.updated_at = out.created_at ?? EPOCH;
  const day = String(out.created_at ?? EPOCH).slice(0, 10);
  for (const [k, v] of Object.entries(NOT_NULL_DEFAULTS[table] ?? {})) if (k in out && out[k] == null) out[k] = typeof v === "function" ? v(out, day) : structuredClone(v);
  return out;
}

const EPOCH = "1970-01-01T00:00:00.000Z";
type Fallback = unknown | ((row: Record<string, unknown>, day: string) => unknown);
/** What to send for a NOT NULL column the local row doesn't have (by remote column). Values match the column defaults. */
const NOT_NULL_DEFAULTS: Partial<Record<SyncTable, Record<string, Fallback>>> = {
  projects: { client_name: "", address: "", status: "estimate" },
  sheets: { name: "", page_number: 1, sort_order: 0, image_id: "", width: 0, height: 0 },
  deviceTypes: { name: "", category: "infrastructure", symbol: "", abbrev: "", shape: "circle", color: "#000000", unit: "each", unit_price: 0, labor_price: 0, default_wire: "", default_mount: "ceiling", kind: "device", sort_order: 0 },
  products: { device_type_id: "", brand: "", model: "", unit_price: 0, labor_price: 0 },
  markers: { sheet_id: "", device_type_id: "", x: 0, y: 0, label: "", room: "", mount: "ceiling", wire_type: "", notes: "" },
  runs: { sheet_id: "", kind: "wire" },
  closets: { sheet_id: "", kind: "equipment", x: 0, y: 0, name: "" },
  estimateLines: { key: "" },
  photos: { image_id: "", width: 0, height: 0, taken_at: (r: Record<string, unknown>) => r.created_at },
  photoComments: { photo_id: "", text: "" },
  checklists: { name: "", items: [] },
  jobLogs: { log_date: (_r: Record<string, unknown>, day: string) => day, body: "" },
  documents: { name: "", mime: "application/octet-stream", size: 0, file_id: "" },
  salesDocs: { kind: "quote" },
  salesPayments: { document_id: "", paid_on: (_r: Record<string, unknown>, day: string) => day, method: "other" },
  jobTemplates: { name: "" },
  scheduleItems: {
    name: "",
    start_date: (r: Record<string, unknown>, day: string) => r.end_date ?? day,
    end_date: (r: Record<string, unknown>) => r.start_date,
    crew: [],
    depends_on: [],
    sheet_ids: [],
  },
  forms: {
    template_id: "",
    name: "",
    template: (r: Record<string, unknown>) => ({ id: r.template_id, name: r.name, category: "other", fields: [], version: 1 }),
  },
  measurements: { sheet_id: "", kind: "length" },
  sheetLinks: { sheet_id: "", x: 0, y: 0, w: 0, h: 0, target: (r: Record<string, unknown>) => ({ kind: "sheet", sheetId: r.sheet_id }) },
  planMarkups: { sheet_id: "", kind: "pen" },
};

/** A sales document the server numbered after this device's copy was written (same or older `updatedAt` locally,
 *  e.g. a device clock that runs ahead): keep the local row but take the number. Null when nothing to merge. */
export function mergeServerNumber(local: Record<string, unknown> | undefined, remote: Record<string, unknown>): Record<string, unknown> | null {
  if (!local || local.number || !remote.number || remote.deleted) return null;
  return { ...local, number: remote.number };
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
  if ((table === "runs" || table === "measurements") && !Array.isArray(out.points)) out.points = [];
  if (table === "runs" && !Array.isArray(out.points)) out.points = [];
  if (table === "planMarkups" && !Array.isArray(out.points)) out.points = [];
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

/** How many of `fileIds` (a job's photo images / document files) still have an image upload queued. Counts each file once. */
export function pendingUploadCount(items: { table: string; rowId: string }[], fileIds: Iterable<string>): number {
  const want = new Set(fileIds);
  if (!want.size) return 0;
  const queued = new Set<string>();
  for (const it of items) if (it.table === "images" && want.has(it.rowId)) queued.add(it.rowId);
  return queued.size;
}

/** What a Supabase error says is missing from the cloud schema (a migration that hasn't been run yet), if anything. */
export type SchemaGap = { kind: "table" } | { kind: "column"; column: string } | null;

export function schemaGap(error: { code?: string | null; message?: string | null } | null | undefined): SchemaGap {
  if (!error) return null;
  const msg = error.message ?? "";
  // PostgREST: "Could not find the 'labels' column of 'projects' in the schema cache" (PGRST204).
  const col = /Could not find the '([^']+)' column/i.exec(msg);
  if (col) return { kind: "column", column: col[1] };
  // PostgREST: "Could not find the table 'public.photos' in the schema cache" (PGRST205); Postgres: relation does not exist (42P01).
  if (error.code === "PGRST205" || error.code === "42P01" || /Could not find the table|relation "?[\w.]+"? does not exist/i.test(msg)) return { kind: "table" };
  return null;
}

/** Drop columns the cloud database doesn't have yet from an upsert payload. */
export function withoutColumns(rows: Record<string, unknown>[], missing: Set<string> | undefined): Record<string, unknown>[] {
  if (!missing?.size) return rows;
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !missing.has(k))));
}

/** Lookback on the pull watermark, so rows stamped in a transaction that committed after a later-stamped one aren't skipped. */
export const PULL_LOOKBACK_MS = 30_000;

/** Where a pull starts: a little before the saved watermark (rows seen again are no-ops under last-write-wins). */
export function pullStart(watermark: string, lookbackMs = PULL_LOOKBACK_MS): string {
  const t = Date.parse(watermark);
  if (!Number.isFinite(t) || t <= lookbackMs) return watermark;
  return new Date(t - lookbackMs).toISOString();
}

/**
 * Paging over `synced_at >= since` ordered by (synced_at, id), skipping `skip` rows. Many rows share one `synced_at` (a bulk
 * upsert is one transaction), so a page can end part-way through a timestamp: the next page restarts at that timestamp and
 * skips the rows of it already seen, instead of `synced_at > last`, which would lose the rest.
 */
export function nextPullPage(cur: { since: string; skip: number }, rows: { synced_at?: unknown }[], pageSize: number): { since: string; skip: number; done: boolean } {
  if (!rows.length) return { ...cur, done: true };
  const last = String(rows[rows.length - 1].synced_at);
  if (rows.length < pageSize) return { since: last, skip: 0, done: true };
  let tail = 0;
  for (let i = rows.length - 1; i >= 0 && String(rows[i].synced_at) === last; i--) tail++;
  // The whole page sits on the cursor's own timestamp: keep counting past it.
  if (tail === rows.length && last === cur.since) return { since: last, skip: cur.skip + tail, done: false };
  return { since: last, skip: tail, done: false };
}

// ---------------- refused changes ----------------

/** Tables a technician's device never pushes: the database refuses them (prices, catalog, office documents), so their
 *  edits are dropped instead of blocking every sync. */
export const TECH_SKIPPED_TABLES: ReadonlySet<SyncTable> = new Set<SyncTable>(["deviceTypes", "products", "estimateLines", "salesDocs", "salesPayments", "jobTemplates", "changeOrders", "sheetLinks"]);

/**
 * The database refused a push because of the rows themselves (a permission, a constraint, a bad value): send them one
 * at a time and set the refused ones aside. Not for network trouble, an expired sign-in, rate limits, a server error,
 * a migration that hasn't been run (see schemaGap) or a lapsed subscription (the team is read-only; edits stay queued).
 */
export function isRowRefusal(error: { code?: string | null; message?: string | null } | null | undefined, status?: number | null): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  if (msg.includes(INACTIVE_MESSAGE)) return false;
  if (schemaGap(error)) return false;
  if (/failed to fetch|network|load failed|timed? ?out|aborted/i.test(msg)) return false;
  // Expired or bad sign-in (PostgREST JWT errors): signing in again fixes it, the rows are fine.
  if (/^PGRST30\d$/.test(code) || /jwt/i.test(msg)) return false;
  if (code === "42501" || /^2[23][0-9A-Z]{3}$/.test(code)) return true;
  if (typeof status === "number") return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
  return false;
}

/** The key a refused change is stored under. */
export const refusedKey = (table: string, rowId: string) => `${table}:${rowId}`;

/** The "<remote table>.<column>" tag for a column the cloud database is missing. */
export const gapTag = (remote: string, column: string) => `${remote}.${column}`;
