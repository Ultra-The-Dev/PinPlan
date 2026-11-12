import { runLengthFt } from "./geometry";
import type { Closet, ClosetKind, DeviceType, Marker, Run, Sheet } from "./types";

/** Quantities for one floor (sheet) or for the whole project. Built only from placed markers/runs. */
export interface TakeoffBucket {
  /** All placed markers per device type (includes tentative). */
  counts: Record<string, number>;
  /** Tentative (?) markers per device type — subset of counts. */
  tentative: Record<string, number>;
  /** LED linear feet per LED device type (includes stair LED). Tentative runs excluded. */
  ledFt: Record<string, number>;
  /** Tentative LED feet per type. */
  ledTentativeFt: Record<string, number>;
  /** Distinct LED zones (zone numbers; runs with no zone count one each). */
  ledZones: number;
  ledTotalFt: number;
  stairFt: number;
  stairSteps: number;
  /** Cable feet per wire type, from drawn/auto home runs. */
  wireFt: Record<string, number>;
  /** Home runs per wire type. */
  wireRuns: Record<string, number>;
  closets: Record<ClosetKind, number>;
  /** Runs with no length yet (no scale and nothing typed). */
  unmeasuredRuns: number;
}

export interface FloorTakeoff extends TakeoffBucket {
  sheetId: string;
  name: string;
}

export interface Takeoff {
  floors: FloorTakeoff[];
  total: TakeoffBucket;
}

function emptyBucket(): TakeoffBucket {
  return {
    counts: {},
    tentative: {},
    ledFt: {},
    ledTentativeFt: {},
    ledZones: 0,
    ledTotalFt: 0,
    stairFt: 0,
    stairSteps: 0,
    wireFt: {},
    wireRuns: {},
    closets: { equipment: 0, switch: 0, rack: 0 },
    unmeasuredRuns: 0,
  };
}

const add = (rec: Record<string, number>, key: string, n: number) => {
  rec[key] = (rec[key] ?? 0) + n;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface TakeoffInput {
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
  catalog?: DeviceType[];
}

export function computeTakeoff({ sheets, markers, runs, closets }: TakeoffInput): Takeoff {
  const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);
  const ordered = live(sheets).sort((a, b) => a.order - b.order);
  const floors: FloorTakeoff[] = ordered.map((s) => ({ ...emptyBucket(), sheetId: s.id, name: s.name }));
  const bySheet = new Map(floors.map((f) => [f.sheetId, f]));
  const zoneSets = new Map<string, Set<string>>(floors.map((f) => [f.sheetId, new Set()]));

  for (const m of live(markers)) {
    const f = bySheet.get(m.sheetId);
    if (!f) continue;
    add(f.counts, m.deviceTypeId, 1);
    if (m.tentative) add(f.tentative, m.deviceTypeId, 1);
  }

  for (const r of live(runs)) {
    const f = bySheet.get(r.sheetId);
    if (!f) continue;
    const len = runLengthFt(r);
    if (len == null) {
      f.unmeasuredRuns += 1;
    }
    if (r.kind === "led" || r.kind === "stair") {
      const typeId = r.deviceTypeId ?? (r.kind === "stair" ? "led-stair" : "led-unassigned");
      const zones = zoneSets.get(r.sheetId)!;
      zones.add(r.zone?.trim() ? `z:${r.zone.trim()}` : `run:${r.id}`);
      if (len == null) continue;
      if (r.tentative) {
        add(f.ledTentativeFt, typeId, len);
        continue;
      }
      add(f.ledFt, typeId, len);
      f.ledTotalFt += len;
      if (r.kind === "stair") {
        f.stairFt += len;
        f.stairSteps += r.steps ?? 0;
      }
    } else if (r.kind === "wire") {
      const wt = r.wireType || "Unspecified";
      add(f.wireRuns, wt, 1);
      if (len != null) add(f.wireFt, wt, len);
    }
  }

  for (const c of live(closets)) {
    const f = bySheet.get(c.sheetId);
    if (f) f.closets[c.kind] += 1;
  }

  const total = emptyBucket();
  for (const f of floors) {
    f.ledZones = zoneSets.get(f.sheetId)!.size;
    f.ledTotalFt = round1(f.ledTotalFt);
    f.stairFt = round1(f.stairFt);
    for (const rec of [f.ledFt, f.ledTentativeFt, f.wireFt]) for (const k in rec) rec[k] = round1(rec[k]);

    for (const k in f.counts) add(total.counts, k, f.counts[k]);
    for (const k in f.tentative) add(total.tentative, k, f.tentative[k]);
    for (const k in f.ledFt) add(total.ledFt, k, f.ledFt[k]);
    for (const k in f.ledTentativeFt) add(total.ledTentativeFt, k, f.ledTentativeFt[k]);
    for (const k in f.wireFt) add(total.wireFt, k, f.wireFt[k]);
    for (const k in f.wireRuns) add(total.wireRuns, k, f.wireRuns[k]);
    for (const k of Object.keys(f.closets) as ClosetKind[]) total.closets[k] += f.closets[k];
    total.ledZones += f.ledZones;
    total.ledTotalFt += f.ledTotalFt;
    total.stairFt += f.stairFt;
    total.stairSteps += f.stairSteps;
    total.unmeasuredRuns += f.unmeasuredRuns;
  }
  total.ledTotalFt = round1(total.ledTotalFt);
  total.stairFt = round1(total.stairFt);
  for (const rec of [total.ledFt, total.ledTentativeFt, total.wireFt]) for (const k in rec) rec[k] = round1(rec[k]);

  return { floors, total };
}

/** Sum of counts for a set of device type ids (e.g. all cameras). */
export function countOf(bucket: TakeoffBucket, ids: string[], opts: { confirmedOnly?: boolean } = {}): number {
  return ids.reduce(
    (n, id) => n + (bucket.counts[id] ?? 0) - (opts.confirmedOnly ? (bucket.tentative[id] ?? 0) : 0),
    0,
  );
}

/** Flatten the takeoff into CSV rows (one row per item per floor + project total). */
export function takeoffCsv(takeoff: Takeoff, catalog: DeviceType[]): string {
  const name = (id: string) => catalog.find((d) => d.id === id)?.name ?? id;
  const rows: (string | number)[][] = [["Floor", "Item", "Unit", "Quantity", "Tentative"]];
  const emit = (floor: string, b: TakeoffBucket) => {
    for (const id of Object.keys(b.counts)) rows.push([floor, name(id), "each", b.counts[id], b.tentative[id] ?? 0]);
    for (const id of Object.keys(b.ledFt)) rows.push([floor, name(id), "LF", b.ledFt[id], b.ledTentativeFt[id] ?? 0]);
    for (const id of Object.keys(b.ledTentativeFt))
      if (!(id in b.ledFt)) rows.push([floor, name(id), "LF", 0, b.ledTentativeFt[id]]);
    rows.push([floor, "LED zones", "each", b.ledZones, ""]);
    rows.push([floor, "LED total", "LF", b.ledTotalFt, ""]);
    if (b.stairSteps) rows.push([floor, "Stair steps", "each", b.stairSteps, ""]);
    for (const wt of Object.keys(b.wireFt)) rows.push([floor, `Wire — ${wt}`, "ft", b.wireFt[wt], ""]);
    for (const wt of Object.keys(b.wireRuns)) rows.push([floor, `Home runs — ${wt}`, "each", b.wireRuns[wt], ""]);
    for (const k of Object.keys(b.closets) as ClosetKind[])
      if (b.closets[k]) rows.push([floor, `${k[0].toUpperCase()}${k.slice(1)} closet`, "each", b.closets[k], ""]);
  };
  for (const f of takeoff.floors) emit(f.name, f);
  emit("Whole project", takeoff.total);
  return toCsv(rows);
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}
