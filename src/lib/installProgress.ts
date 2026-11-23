// Install progress and as-built: each device (marker) and wire run can carry an install status (roughed → installed
// → tested, then verified by the office) with history, photo proof and a test result. Pure (no browser APIs) so it
// runs in tests; the iPad app mirrors it in PinPlanCore (InstallProgress.swift).
//
// Install state never changes what was quoted: takeoff.ts ignores it (counts still come only from placed markers/runs).
import { msg } from "./i18n/msg";
import { categoryOf } from "./catalog";
import { tradeCategory } from "./trades";
import { markerQty, sumQty } from "./markerCount";
import type { Closet, DeviceType, InstallState, InstallStatus, Marker, Run, RunKind, Sheet, TradeId } from "./types";

/** Display order, left to right ("issue" sits apart: it's a flag, not a step). */
export const STATUS_ORDER: InstallStatus[] = ["planned", "roughed", "installed", "tested", "verified", "issue"];
const RANK: Record<InstallStatus, number> = { planned: 0, roughed: 1, installed: 2, tested: 3, verified: 4, issue: -1 };

export const STATUS_COLORS: Record<InstallStatus, string> = {
  planned: "#94a3b8",
  roughed: "#f59e0b",
  installed: "#2563eb",
  tested: "#16a34a",
  verified: "#065f46",
  issue: "#dc2626",
};

export const STATUS_LABELS: Record<InstallStatus, string> = {
  planned: msg("Planned"),
  roughed: msg("Roughed"),
  installed: msg("Installed"),
  tested: msg("Tested"),
  verified: msg("Verified"),
  issue: msg("Issue"),
};

/** Default: a photo is needed to mark something installed. */
export const DEFAULT_PHOTO_REQUIRED: InstallStatus[] = ["installed"];
/** History kept per device (oldest dropped first). */
const MAX_HISTORY = 60;

export const isInstallStatus = (s: unknown): s is InstallStatus => typeof s === "string" && s in RANK;

/** A device's (or run's) current status: nothing recorded = planned. */
export function statusOf(item: { install?: InstallState | null } | null | undefined): InstallStatus {
  const s = item?.install?.status;
  return isInstallStatus(s) ? s : "planned";
}

/** Counts toward "% complete": tested or verified. */
export const isDone = (s: InstallStatus) => s === "tested" || s === "verified";
/** At least installed (installed, tested, verified). */
export const isInstalled = (s: InstallStatus) => RANK[s] >= RANK.installed;

// ---------------- workflows ----------------

export interface Workflow {
  id: string;
  /** The field steps in order (never planned, verified or issue). */
  steps: InstallStatus[];
  /** What each status is called for this kind of work ("Pulled", "Trimmed out"…). */
  labels: Record<InstallStatus, string>;
}

const wf = (id: string, steps: InstallStatus[], names: Partial<Record<InstallStatus, string>>): Workflow => ({ id, steps, labels: { ...STATUS_LABELS, ...names } });

const ELECTRICAL_CATS = new Set(["power", "switching", "panels", "ev"]);
const NO_ROUGH_CATS = new Set(["infrastructure", "panels"]);

/**
 * The steps for a device type (by its category/kind) or a run (by its kind), for the company's trades.
 * Devices: roughed → installed → tested (racks and panels skip rough-in). Cable runs: pulled → terminated → certified.
 * LED runs: installed → tested.
 */
export function workflowFor(item: { category?: string | null; kind?: string | null; run?: RunKind | null }, trades: TradeId[] = ["lowvoltage"]): Workflow {
  const primary = trades[0] ?? "lowvoltage";
  if (item.run === "led" || item.run === "stair") return wf("led", ["installed", "tested"], { installed: msg("Installed"), tested: msg("Lit & tested") });
  if (item.run === "wire") {
    if (primary === "plumbing" || primary === "hvac") return wf("pipe", ["roughed", "installed", "tested"], { roughed: msg("Run"), installed: msg("Connected"), tested: msg("Pressure tested") });
    if (primary === "electrical") return wf("circuit", ["roughed", "installed", "tested"], { roughed: msg("Pulled"), installed: msg("Terminated"), tested: msg("Tested") });
    return wf("cable", ["roughed", "installed", "tested"], { roughed: msg("Pulled"), installed: msg("Terminated"), tested: msg("Certified") });
  }
  if (item.kind === "led") return wf("led", ["installed", "tested"], { installed: msg("Installed"), tested: msg("Lit & tested") });
  const cat = item.category ?? "general";
  const steps: InstallStatus[] = NO_ROUGH_CATS.has(cat) ? ["installed", "tested"] : ["roughed", "installed", "tested"];
  if (ELECTRICAL_CATS.has(cat) || (cat === "lighting" && primary === "electrical"))
    return wf("electrical", steps, { roughed: msg("Rough-in"), installed: msg("Trimmed out"), tested: msg("Tested") });
  if (cat === "fire") return wf("fire", steps, { roughed: msg("Rough-in"), installed: msg("Installed"), tested: msg("Tested") });
  if (cat === "hvac") return wf("hvac", steps, { roughed: msg("Rough-in"), installed: msg("Set"), tested: msg("Started up") });
  if (cat === "plumbing") return wf("plumbing", steps, { roughed: msg("Rough-in"), installed: msg("Set"), tested: msg("Tested") });
  if (cat === "solar") return wf("solar", steps, { roughed: msg("Mounted"), installed: msg("Wired"), tested: msg("Commissioned") });
  return wf("lowvoltage", steps, { roughed: msg("Pre-wired"), installed: msg("Installed"), tested: msg("Tested") });
}

/** The workflow for a marker (via its device type) or a run. */
export function workflowOf(item: Marker | Run, catalog: DeviceType[], trades?: TradeId[]): Workflow {
  if ("points" in item) return workflowFor({ run: item.kind }, trades);
  const t = catalog.find((d) => d.id === item.deviceTypeId);
  return workflowFor({ category: t?.category, kind: t?.kind }, trades);
}

/** The next field step after `current` (planned → first step → … → last step); null once the last step is reached. */
export function nextStatus(current: InstallStatus | null | undefined, workflow: Workflow): InstallStatus | null {
  const cur = current ?? "planned";
  if (cur === "verified") return null;
  if (cur === "issue") return workflow.steps[0] ?? null;
  return workflow.steps.find((s) => RANK[s] > RANK[cur]) ?? null;
}

// ---------------- changes ----------------

export interface InstallOpts {
  photoId?: string | null;
  note?: string | null;
  /** undefined keeps the current test result; null clears it. */
  test?: InstallState["test"];
}

/** A new install state with `to` recorded (who, when, photo, note, test) and appended to the history. */
export function applyInstall(state: InstallState | null | undefined, to: InstallStatus, by: string | null, now: string, opts: InstallOpts = {}): InstallState {
  const prev = state ?? null;
  const photoIds = [...(prev?.photoIds ?? [])];
  if (opts.photoId && !photoIds.includes(opts.photoId)) photoIds.push(opts.photoId);
  const entry: NonNullable<InstallState["history"]>[number] = { status: to, by: by ?? null, at: now };
  if (opts.note?.trim()) entry.note = opts.note.trim();
  const history = [...(prev?.history ?? []), entry].slice(-MAX_HISTORY);
  return {
    status: to,
    by: by ?? null,
    at: now,
    photoIds,
    test: opts.test !== undefined ? opts.test : (prev?.test ?? null),
    history,
  };
}

/** Is a photo required before setting `to`? (Company setting; default: installed.) */
export function requiresPhoto(settings: { installPhotoRequired?: InstallStatus[] | null } | null | undefined, to: InstallStatus): boolean {
  const list = settings?.installPhotoRequired ?? DEFAULT_PHOTO_REQUIRED;
  return list.includes(to);
}

/**
 * May this role set `to`? Verifying is office only (owner/admin, or no team); technicians set every other status.
 * A verified device can only be changed by the office.
 */
export function canSetInstall(role: string | null | undefined, to: InstallStatus, from?: InstallStatus | null): boolean {
  if (role !== "tech") return true;
  if (to === "verified") return false;
  if (from === "verified") return false;
  return true;
}

/** Clearing a device's whole install record (history included) is office only. */
export const canResetInstall = (role: string | null | undefined) => role !== "tech";

/** Can this device be marked at all? Tentative (optional) and deleted devices can't. */
export const markable = (item: { tentative?: boolean | null; deleted?: boolean | null }) => !item.tentative && !item.deleted;

// ---------------- progress ----------------

export type ProgressBy = "sheet" | "category" | "closet";

export interface ProgressCounts {
  counts: Record<InstallStatus, number>;
  total: number;
  /** Tested + verified. */
  done: number;
  /** done / total, 0–100 (whole number); 0 when there's nothing. */
  pct: number;
}

export interface ProgressRow extends ProgressCounts {
  key: string;
  name: string;
  /** Cable runs in this group (wire home runs), counted separately from devices. */
  runs: ProgressCounts;
}

const emptyCounts = (): Record<InstallStatus, number> => ({ planned: 0, roughed: 0, installed: 0, tested: 0, verified: 0, issue: 0 });
const pctOf = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

function tally(statuses: InstallStatus[]): ProgressCounts {
  const counts = emptyCounts();
  for (const s of statuses) counts[s]++;
  const done = counts.tested + counts.verified;
  return { counts, total: statuses.length, done, pct: pctOf(done, statuses.length) };
}

/** Devices that count toward progress: placed, not tentative, not deleted, not LED types (those are runs). */
export function progressMarkers(markers: Marker[], catalog: DeviceType[]): Marker[] {
  const led = new Set(catalog.filter((d) => d.kind === "led").map((d) => d.id));
  return markers.filter((m) => markable(m) && !led.has(m.deviceTypeId));
}

/** Runs that count toward progress: every run that isn't tentative or deleted. */
export const progressRuns = (runs: Run[]) => runs.filter((r) => markable({ tentative: !!r.tentative, deleted: r.deleted }));

/** A device's status once per device it stands for: a count pin (×12) has one status and counts 12 times. */
const weighted = (ms: Marker[]): InstallStatus[] => ms.flatMap((m) => Array<InstallStatus>(markerQty(m)).fill(statusOf(m)));

/** Totals for a set of devices (the toolbar counter). */
export function progressTotals(markers: Marker[], catalog: DeviceType[]): ProgressCounts {
  return tally(weighted(progressMarkers(markers, catalog)));
}

/** Devices at `status` or further along (issue: exactly issue), for the walk-mode counter ("3/40 installed"). */
export function countAtLeast(markers: Marker[], catalog: DeviceType[], status: InstallStatus): { n: number; total: number } {
  const ms = progressMarkers(markers, catalog);
  const n = sumQty(ms.filter((m) => {
    const s = statusOf(m);
    return status === "issue" ? s === "issue" : RANK[s] >= RANK[status];
  }));
  return { n, total: sumQty(ms) };
}

/**
 * Progress grouped by sheet (floor), category or closet: counts per status and % done ((tested + verified) / total).
 * Tentative and deleted devices are left out; groups with nothing in them are hidden.
 */
export function progress(
  markers: Marker[],
  runs: Run[],
  sheets: Sheet[],
  catalog: DeviceType[],
  opts: { by: ProgressBy; closets?: Closet[]; trades?: TradeId[] },
): ProgressRow[] {
  const types = new Map(catalog.map((d) => [d.id, d]));
  const ms = progressMarkers(markers, catalog);
  const rs = progressRuns(runs);
  const groups = new Map<string, { name: string; sort: number; dev: InstallStatus[]; run: InstallStatus[] }>();
  const group = (key: string, name: string, sort: number) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { name, sort, dev: [], run: [] }));
    return g;
  };
  const sheetIdx = new Map(sheets.filter((s) => !s.deleted).map((s, i) => [s.id, { s, sort: s.order ?? i }]));
  const closetName = (id?: string | null) => opts.closets?.find((c) => c.id === id && !c.deleted)?.name;
  const catName = (c: string) => (opts.trades ? tradeCategory(c, opts.trades).name : categoryOf(c).name);
  const keyFor = (item: Marker | Run): { key: string; name: string; sort: number } | null => {
    if (opts.by === "sheet") {
      const s = sheetIdx.get(item.sheetId);
      return s ? { key: s.s.id, name: s.s.name, sort: s.sort } : null;
    }
    if (opts.by === "closet") {
      const name = closetName(item.closetId);
      return name ? { key: item.closetId!, name, sort: 0 } : { key: "none", name: "No closet", sort: 1 };
    }
    if ("points" in item) return item.kind === "wire" ? { key: "wiring", name: "Cabling", sort: 1e6 } : { key: "led", name: "LED", sort: 1e6 - 1 };
    const cat = types.get(item.deviceTypeId)?.category ?? "general";
    return { key: cat, name: catName(cat), sort: 0 };
  };
  for (const m of ms) {
    const k = keyFor(m);
    if (k) group(k.key, k.name, k.sort).dev.push(...weighted([m]));
  }
  for (const r of rs) {
    const k = keyFor(r);
    if (k) group(k.key, k.name, k.sort).run.push(statusOf(r));
  }
  return [...groups.entries()]
    .filter(([, g]) => g.dev.length + g.run.length > 0)
    .sort((a, b) => a[1].sort - b[1].sort || a[1].name.localeCompare(b[1].name))
    .map(([key, g]) => ({ key, name: g.name, ...tally(g.dev), runs: tally(g.run) }));
}

export interface InstallIssue {
  table: "markers" | "runs";
  id: string;
  sheetId: string;
  label: string;
  note: string | null;
  by: string | null;
  at: string | null;
}

/** Devices and runs flagged with an issue, newest first. */
export function issues(markers: Marker[], runs: Run[]): InstallIssue[] {
  const out: InstallIssue[] = [];
  const noteOf = (s: InstallState) => [...(s.history ?? [])].reverse().find((h) => h.status === "issue")?.note ?? null;
  for (const m of markers)
    if (!m.deleted && statusOf(m) === "issue") out.push({ table: "markers", id: m.id, sheetId: m.sheetId, label: m.label || "Device", note: noteOf(m.install!), by: m.install?.by ?? null, at: m.install?.at ?? null });
  for (const r of runs)
    if (!r.deleted && statusOf(r) === "issue")
      out.push({ table: "runs", id: r.id, sheetId: r.sheetId, label: r.switchLabel || r.zone || r.wireType || "Run", note: noteOf(r.install!), by: r.install?.by ?? null, at: r.install?.at ?? null });
  return out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/**
 * Installed devices per device type (installed, tested or verified; tentative left out). For a future progress-billing
 * integration — not used by invoicing.
 */
export function installedQuantities(markers: Marker[], catalog: DeviceType[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of progressMarkers(markers, catalog)) if (isInstalled(statusOf(m))) out[m.deviceTypeId] = (out[m.deviceTypeId] ?? 0) + markerQty(m);
  return out;
}

// ---------------- plan helpers ----------------

/** Index of the point nearest `p` within `maxDist` (same units), or -1. */
export function nearestWithin(points: { x: number; y: number }[], p: { x: number; y: number }, maxDist: number): number {
  let best = -1;
  let bestD = maxDist;
  points.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Short test result for tables: "Pass · 0.4 dB" / "Fail". */
export function testText(t: InstallState["test"]): string {
  if (!t) return "";
  return [t.pass ? "Pass" : "Fail", t.value?.trim()].filter(Boolean).join(" · ");
}
