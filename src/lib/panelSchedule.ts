// Electrical panel schedule: every circuit on each panel with its breaker, what it feeds, how many devices, the wire
// and a rough load. Derived (pure) from placed devices and drawn circuits, like the closet port schedule (wiring.ts).
// Mirrors how an electrician fills in the panel directory; load is an estimate from simple per-device defaults.
import { PANEL_KINDS } from "./catalog";
import { runLengthFt } from "./geometry";
import { runCables } from "./products";
import { toCsv } from "./takeoff";
import { deviceSpec, wireForBreaker } from "./trades";
import { markerQty, sumQty } from "./markerCount";
import type { CircuitInfo, Closet, DeviceType, Marker, Run, Sheet } from "./types";

export interface PanelInput {
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
}

export interface PanelCircuit {
  /** "12", "3/5" (2-pole), "" when the circuit has no number yet, "unassigned" for devices with no circuit. */
  number: string;
  breakerA: number | null;
  volts: number;
  poles: number;
  /** What it feeds: the typed description, else the rooms. */
  description: string;
  /** Device types on it, e.g. "4 × Duplex receptacle 20A (TR), 1 × GFCI receptacle". */
  devicesText: string;
  devices: number;
  labels: string[];
  wire: string;
  /** Length of its drawn home run(s), when measured. */
  wireFt: number | null;
  /** Estimated connected load. */
  va: number;
  /** The circuit's home-run line(s). */
  runIds: string[];
  tentative: boolean;
  /** Breaker defaulted from the devices (not typed on the circuit). */
  breakerGuessed: boolean;
}

export interface PanelScheduleT {
  closetId: string;
  name: string;
  kind: string;
  floor: string;
  circuits: PanelCircuit[];
  totalVA: number;
  /** totalVA / 240 V, rounded to 0.1 A. */
  amps240: number;
}

const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const UNASSIGNED = "unassigned";

/** Breaker spaces a circuit number uses: "3/5" → [3, 5], "12" → [12]. */
export function circuitSpaces(n: string | null | undefined): number[] {
  return (n ?? "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter((x) => Number.isFinite(x) && x > 0);
}

/** Panels that get a schedule: panel/subpanel closets, plus any closet that circuits were drawn to. */
export function panelClosets(data: PanelInput): Closet[] {
  const closets = live(data.closets);
  const runs = live(data.runs);
  return closets.filter((c) => PANEL_KINDS.includes(c.kind) || runs.some((r) => r.kind === "wire" && r.closetId === c.id && r.circuit));
}

interface Acc {
  number: string;
  info: CircuitInfo;
  runs: Run[];
  markers: Marker[];
}

/** One schedule per panel, circuits in breaker order (unnumbered after, unassigned devices last). */
export function panelSchedule(data: PanelInput, catalog: DeviceType[]): PanelScheduleT[] {
  const sheets = live(data.sheets);
  const markers = live(data.markers);
  const runs = live(data.runs).filter((r) => r.kind === "wire");
  const typeOf = new Map(catalog.map((t) => [t.id, t]));
  const out: PanelScheduleT[] = [];
  for (const panel of panelClosets(data)) {
    const groups = new Map<string, Acc>();
    const group = (key: string, number: string) => {
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { number, info: {}, runs: [], markers: [] }));
      return g;
    };
    const runKey = new Map<string, string>(); // run id → group key
    for (const r of runs.filter((x) => x.closetId === panel.id)) {
      const marker = markers.find((m) => m.id === r.markerId);
      const num = (r.circuit?.number ?? "").trim() || (marker?.circuit ?? "").trim();
      const key = num ? `n:${num}` : `r:${r.id}`;
      const g = group(key, num);
      g.runs.push(r);
      // The first run with details wins for breaker/volts/poles/description.
      for (const k of ["breakerA", "volts", "poles", "description"] as const) if (g.info[k] == null && r.circuit?.[k] != null && r.circuit[k] !== "") (g.info as Record<string, unknown>)[k] = r.circuit[k];
      runKey.set(r.id, key);
    }
    for (const m of markers.filter((x) => x.closetId === panel.id && typeOf.get(x.deviceTypeId)?.kind !== "led")) {
      const num = (m.circuit ?? "").trim();
      const own = runs.find((r) => r.markerId === m.id && r.closetId === panel.id);
      const key = num ? `n:${num}` : own ? runKey.get(own.id)! : UNASSIGNED;
      const g = group(key, num || (key === UNASSIGNED ? UNASSIGNED : ""));
      if (!g.markers.includes(m)) g.markers.push(m);
    }
    const circuits: PanelCircuit[] = [];
    for (const g of groups.values()) {
      const specs = g.markers.map((m) => deviceSpec(typeOf.get(m.deviceTypeId)));
      // A count pin's load counts once per device it stands for.
      const va = specs.reduce((s, x, i) => s + x.va * markerQty(g.markers[i]), 0);
      const needs240 = specs.some((x) => x.volts >= 208);
      const volts = g.info.volts ?? (needs240 ? 240 : 120);
      const poles = g.info.poles ?? (volts >= 208 ? 2 : 1);
      const guess = specs.reduce<number | null>((mx, x) => (x.breakerA != null && (mx == null || x.breakerA > mx) ? x.breakerA : mx), null);
      const breakerA = g.info.breakerA ?? guess;
      const typeCounts = new Map<string, number>();
      for (const m of g.markers) {
        const n = typeOf.get(m.deviceTypeId)?.name ?? m.deviceTypeId;
        typeCounts.set(n, (typeCounts.get(n) ?? 0) + markerQty(m));
      }
      const cables = g.runs.flatMap((r) => runCables(r)).filter((c) => c && c !== "Unspecified");
      const fromDevices = g.markers.map((m) => m.wireType).filter(Boolean);
      const wire = mostCommon(cables) ?? mostCommon(fromDevices) ?? (breakerA ? wireForBreaker(breakerA, volts) : "");
      const lens = g.runs.map((r) => runLengthFt(r));
      const known = lens.filter((x): x is number => x != null);
      const rooms = Array.from(new Set(g.markers.map((m) => m.room.trim()).filter(Boolean))).sort(natural);
      circuits.push({
        number: g.number,
        breakerA,
        volts,
        poles,
        description: (g.info.description ?? "").trim() || rooms.join(", "),
        devicesText: [...typeCounts].map(([n, c]) => `${c} × ${n}`).join(", "),
        devices: sumQty(g.markers),
        labels: g.markers.map((m) => (markerQty(m) > 1 ? `${m.label} ×${markerQty(m)}` : m.label)).sort(natural),
        wire,
        wireFt: known.length ? Math.round(known.reduce((a, b) => a + b, 0) * 10) / 10 : null,
        va,
        runIds: g.runs.map((r) => r.id),
        tentative: g.markers.length > 0 ? g.markers.every((m) => m.tentative) : g.runs.every((r) => !!r.tentative),
        breakerGuessed: g.info.breakerA == null && guess != null,
      });
    }
    circuits.sort((a, b) => rank(a) - rank(b) || (circuitSpaces(a.number)[0] ?? 0) - (circuitSpaces(b.number)[0] ?? 0) || natural(a.description, b.description));
    const totalVA = circuits.reduce((s, c) => s + c.va, 0);
    out.push({
      closetId: panel.id,
      name: panel.name,
      kind: panel.kind,
      floor: sheets.find((s) => s.id === panel.sheetId)?.name ?? "",
      circuits,
      totalVA,
      amps240: Math.round((totalVA / 240) * 10) / 10,
    });
  }
  return out;
}

const rank = (c: PanelCircuit) => (c.number === UNASSIGNED ? 2 : circuitSpaces(c.number).length ? 0 : 1);

function mostCommon(xs: string[]): string | null {
  if (!xs.length) return null;
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Numbers for circuits that have none yet: the next free breaker spaces in order (a 2-pole breaker takes n and n+2,
 * the space below it on the same side). Returns run id → number.
 */
export function numberCircuits(schedule: PanelScheduleT): Record<string, string> {
  const used = new Set(schedule.circuits.flatMap((c) => circuitSpaces(c.number)));
  const out: Record<string, string> = {};
  for (const c of schedule.circuits) {
    if (c.number || !c.runIds.length) continue;
    let n = 1;
    if (c.poles >= 2) {
      while (used.has(n) || used.has(n + 2)) n++;
      used.add(n);
      used.add(n + 2);
      const num = `${n}/${n + 2}`;
      for (const id of c.runIds) out[id] = num;
    } else {
      while (used.has(n)) n++;
      used.add(n);
      for (const id of c.runIds) out[id] = String(n);
    }
  }
  return out;
}

export const circuitLabel = (c: Pick<PanelCircuit, "number">) => (c.number === UNASSIGNED ? "No circuit" : c.number || "—");
export const breakerLabel = (c: Pick<PanelCircuit, "breakerA" | "poles">) => (c.breakerA ? `${c.breakerA}A${c.poles >= 2 ? ` ${c.poles}P` : ""}` : "—");

export function panelScheduleCsv(schedules: PanelScheduleT[]): string {
  const rows: (string | number)[][] = [["Panel", "Circuit", "Breaker A", "Poles", "Volts", "Description", "Devices", "Device count", "Wire", "Wire ft", "Load VA"]];
  for (const p of schedules) {
    for (const c of p.circuits)
      rows.push([p.name, circuitLabel(c), c.breakerA ?? "", c.poles, c.volts, c.description, c.devicesText, c.devices, c.wire, c.wireFt ?? "", c.va]);
    rows.push([p.name, "Total", "", "", "", "", "", p.circuits.reduce((s, c) => s + c.devices, 0), "", "", p.totalVA]);
  }
  return toCsv(rows);
}
