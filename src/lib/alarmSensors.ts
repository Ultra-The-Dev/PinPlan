// Alarm sensors from openings (docs/find-similar.md, "Alarm sensors from openings"). Contractors count doors and
// windows (Find similar, or by hand) to know how many alarm sensors to install; "Add sensors" then places them in one
// step: a door contact on each door, a window contact on each window, or one glass-break detector per room that has
// windows. Pure (no browser APIs): the plan card previews and places what `planSensors` returns, and the takeoff's
// "Openings" summary comes from `openingsSummary`. Counts still come only from placed devices (CLAUDE.md).
// Mirrored in ios/PinPlanCore/Sources/PinPlanCore/AlarmSensors.swift (same rules, same tests).
import { ALARM_SEED_IDS, OPENING_TYPE_IDS } from "./catalog";
import type { Takeoff, TakeoffBucket } from "./takeoff";
import type { DeviceType, Marker } from "./types";

export type OpeningKind = "door" | "window";
/** door = a door contact on each door; window = a window contact on each window; glass = a glass-break per room. */
export type SensorKind = "door" | "window" | "glass";
export const SENSOR_KINDS: SensorKind[] = ["door", "window", "glass"];

/** The catalog item each kind of sensor places (the Security items in catalog.ts). */
export const SENSOR_TYPE_IDS: Record<SensorKind, string> = { door: "door-contact", window: "window-contact", glass: "glass-break" };

// Names that mention a door or window but are hardware or sensors for one, not the opening itself.
const NOT_AN_OPENING =
  /\b(contacts?|sensors?|switch(es)?|alarms?|glass|break|detectors?|locks?|strikes?|chimes?|bells?|cameras?|shades?|blinds?|curtains?|films?|tints?|closers?|openers?|operators?|readers?|hardware|stations?|supervision|monitors?)\b/i;

/**
 * Is this device type an opening, and which? The generic Door and Window always are; the company's own types count
 * when their name says door or window and nothing else ("Door", "Sliding door", "Windows"), not "Door contact",
 * "Window shade" or "Doorbell".
 */
export function openingKind(t: Pick<DeviceType, "id" | "name"> | undefined): OpeningKind | null {
  if (!t) return null;
  if (t.id === OPENING_TYPE_IDS[0]) return "door";
  if (t.id === OPENING_TYPE_IDS[1]) return "window";
  if (ALARM_SEED_IDS.includes(t.id) || NOT_AN_OPENING.test(t.name)) return null;
  if (/\bdoors?\b/i.test(t.name)) return "door";
  if (/\bwindows?\b/i.test(t.name)) return "window";
  return null;
}

/** A door or window placed on a sheet. */
export interface Opening {
  id: string;
  kind: OpeningKind;
  x: number;
  y: number;
  room: string;
}

type PlacedMarker = Pick<Marker, "id" | "sheetId" | "deviceTypeId" | "x" | "y" | "room" | "deleted">;

/** The doors and windows on one sheet, in placement order. */
export function sheetOpenings(markers: PlacedMarker[], catalog: Pick<DeviceType, "id" | "name">[], sheetId: string): Opening[] {
  const kinds = new Map<string, OpeningKind | null>(catalog.map((d) => [d.id, openingKind(d)]));
  const out: Opening[] = [];
  for (const m of markers) {
    if (m.deleted || m.sheetId !== sheetId) continue;
    const kind = kinds.get(m.deviceTypeId) ?? null;
    if (kind) out.push({ id: m.id, kind, x: m.x, y: m.y, room: (m.room ?? "").trim() });
  }
  return out;
}

/** Sheet size (px) and scale, for distances. */
export interface SensorSheet {
  id: string;
  width: number;
  height: number;
  pxPerFt?: number | null;
}

/** How far (sheet px) a sensor sits from its opening: 2 ft, or 2.5% of the sheet's long side without a scale. */
export function sensorOffsetPx(sheet: SensorSheet): number {
  return sheet.pxPerFt && sheet.pxPerFt > 0 ? 2 * sheet.pxPerFt : 0.025 * Math.max(sheet.width, sheet.height);
}

/** Windows closer than this (sheet px) share a glass-break when their rooms aren't known: 15 ft, or 6% of the sheet. */
export function windowClusterPx(sheet: SensorSheet): number {
  return sheet.pxPerFt && sheet.pxPerFt > 0 ? 15 * sheet.pxPerFt : 0.06 * Math.max(sheet.width, sheet.height);
}

/** One sensor to place. */
export interface SensorPlacement {
  kind: SensorKind;
  deviceTypeId: string;
  x: number;
  y: number;
  room: string;
  /** The door, the window, or the windows of the room (glass-break). */
  openingIds: string[];
}

export interface SensorPlan {
  placements: SensorPlacement[];
  /** Sensors to place, per kind (only the kinds asked for). */
  counts: Record<SensorKind, number>;
  /** Openings (door / window) or rooms (glass) that already have that sensor, so nothing is placed for them. */
  covered: Record<SensorKind, number>;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// Contacts sit up and to the right of the opening, glass-breaks up and to the left: both stay tappable.
const DIAG = Math.SQRT1_2;

/**
 * Where sensors go for the openings on a sheet. `kinds`: which sensors (door contacts, window contacts, glass-breaks);
 * `excluded`: openings the user left out. Nothing is placed twice: an opening with a sensor of that type within 1.5×
 * the offset already counts as covered, and a room (or a group of nearby windows) with a glass-break already has one.
 */
export function planSensors(
  openings: Opening[],
  existing: Pick<Marker, "sheetId" | "deviceTypeId" | "x" | "y" | "room" | "deleted">[],
  sheet: SensorSheet,
  opts: { kinds: SensorKind[]; excluded?: Iterable<string> },
): SensorPlan {
  const excluded = new Set(opts.excluded ?? []);
  const use = openings.filter((o) => !excluded.has(o.id));
  const counts: Record<SensorKind, number> = { door: 0, window: 0, glass: 0 };
  const covered: Record<SensorKind, number> = { door: 0, window: 0, glass: 0 };
  const placements: SensorPlacement[] = [];
  const off = sensorOffsetPx(sheet);
  const dx = (off * DIAG) / sheet.width;
  const dy = (off * DIAG) / sheet.height;
  const distPx = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot((a.x - b.x) * sheet.width, (a.y - b.y) * sheet.height);
  const live = existing.filter((m) => !m.deleted && m.sheetId === sheet.id);

  for (const kind of ["door", "window"] as const) {
    if (!opts.kinds.includes(kind)) continue;
    const typeId = SENSOR_TYPE_IDS[kind];
    const have = live.filter((m) => m.deviceTypeId === typeId);
    for (const o of use) {
      if (o.kind !== kind) continue;
      if (have.some((m) => distPx(m, o) < 1.5 * off)) {
        covered[kind] += 1;
        continue;
      }
      placements.push({ kind, deviceTypeId: typeId, x: clamp01(o.x + dx), y: clamp01(o.y - dy), room: o.room, openingIds: [o.id] });
      counts[kind] += 1;
    }
  }

  if (opts.kinds.includes("glass")) {
    const typeId = SENSOR_TYPE_IDS.glass;
    const have = live.filter((m) => m.deviceTypeId === typeId);
    const link = windowClusterPx(sheet);
    for (const g of windowGroups(use.filter((o) => o.kind === "window"), (a, b) => distPx(a, b) <= link)) {
      const cx = g.windows.reduce((s, w) => s + w.x, 0) / g.windows.length;
      const cy = g.windows.reduce((s, w) => s + w.y, 0) / g.windows.length;
      const at = { x: clamp01(cx - dx), y: clamp01(cy - dy) };
      const already = g.room
        ? have.some((m) => sameRoom(m.room, g.room) || distPx(m, at) < 1.5 * off)
        : have.some((m) => distPx(m, at) < 1.5 * off || g.windows.some((w) => distPx(m, w) <= link));
      if (already) {
        covered.glass += 1;
        continue;
      }
      placements.push({ kind: "glass", deviceTypeId: typeId, x: at.x, y: at.y, room: g.room, openingIds: g.windows.map((w) => w.id) });
      counts.glass += 1;
    }
  }
  return { placements, counts, covered };
}

const roomKey = (r: string | null | undefined) => (r ?? "").trim().toLowerCase();
const sameRoom = (a: string | null | undefined, b: string) => !!roomKey(a) && roomKey(a) === roomKey(b);

/**
 * Windows grouped for glass-breaks: by room when the window has one (case and spaces ignored), else windows near each
 * other (chains of `near`) form a group. Groups in the order of their first window.
 */
export function windowGroups(windows: Opening[], near: (a: Opening, b: Opening) => boolean): { room: string; windows: Opening[] }[] {
  const groups: { room: string; windows: Opening[] }[] = [];
  const byRoom = new Map<string, { room: string; windows: Opening[] }>();
  const loose: Opening[] = [];
  const order = new Map<object, number>();
  windows.forEach((w, i) => {
    const k = roomKey(w.room);
    if (!k) {
      loose.push(w);
      return;
    }
    let g = byRoom.get(k);
    if (!g) {
      g = { room: w.room.trim(), windows: [] };
      byRoom.set(k, g);
      groups.push(g);
      order.set(g, i);
    }
    g.windows.push(w);
  });
  // Single-linkage clusters of the windows without a room.
  const seen = new Set<string>();
  for (const w of loose) {
    if (seen.has(w.id)) continue;
    const g = { room: "", windows: [w] };
    seen.add(w.id);
    for (let i = 0; i < g.windows.length; i++)
      for (const o of loose) if (!seen.has(o.id) && near(g.windows[i], o)) {
        seen.add(o.id);
        g.windows.push(o);
      }
    groups.push(g);
    order.set(g, windows.indexOf(w));
  }
  return groups.sort((a, b) => order.get(a)! - order.get(b)!);
}

/** Sensor kinds whose catalog item is missing or archived (they can't be placed until it's back in the price list). */
export function missingSensorTypes(catalog: Pick<DeviceType, "id" | "archived">[], kinds: SensorKind[] = SENSOR_KINDS): SensorKind[] {
  return kinds.filter((k) => !catalog.some((d) => d.id === SENSOR_TYPE_IDS[k] && !d.archived));
}

// ---------------- takeoff: "Openings" ----------------

export interface OpeningsCount {
  doors: number;
  windows: number;
  doorContacts: number;
  windowContacts: number;
  glassBreaks: number;
}

export interface OpeningsSummary {
  floors: { sheetId: string; name: string; counts: OpeningsCount }[];
  total: OpeningsCount;
  /** Any door or window placed on the job. */
  hasOpenings: boolean;
  /** Any door contact, window contact or glass-break placed on the job. */
  hasSensors: boolean;
}

/** "Doors 14 · Windows 22" and "Door contacts 14 · Window contacts 22 · Glass-break 6", per floor and for the job, from
 *  the takeoff (placed devices only). Doors and windows: every type that is an opening (openingKind). */
export function openingsSummary(takeoff: Takeoff, catalog: Pick<DeviceType, "id" | "name">[]): OpeningsSummary {
  const doorIds = catalog.filter((d) => openingKind(d) === "door").map((d) => d.id);
  const windowIds = catalog.filter((d) => openingKind(d) === "window").map((d) => d.id);
  const sum = (b: TakeoffBucket, ids: string[]) => ids.reduce((n, id) => n + (b.counts[id] ?? 0), 0);
  const of = (b: TakeoffBucket): OpeningsCount => ({
    doors: sum(b, doorIds),
    windows: sum(b, windowIds),
    doorContacts: b.counts[SENSOR_TYPE_IDS.door] ?? 0,
    windowContacts: b.counts[SENSOR_TYPE_IDS.window] ?? 0,
    glassBreaks: b.counts[SENSOR_TYPE_IDS.glass] ?? 0,
  });
  const total = of(takeoff.total);
  return {
    floors: takeoff.floors.map((f) => ({ sheetId: f.sheetId, name: f.name, counts: of(f) })),
    total,
    hasOpenings: total.doors + total.windows > 0,
    hasSensors: total.doorContacts + total.windowContacts + total.glassBreaks > 0,
  };
}
