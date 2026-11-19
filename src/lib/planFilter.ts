// What the plan viewer shows: layer toggles (the company's trade categories + wiring) and display filters (device type,
// status, room, "only this type"). Display only — counts, takeoff and exports always use every placed device. Pure.
import type { Closet, Layer, Marker, Run } from "./types";

export type PlanStatusFilter = "all" | "firm" | "tentative";

export interface PlanFilters {
  /** Device types switched off in the type list. */
  hiddenTypes: string[];
  status: PlanStatusFilter;
  /** Only these rooms (empty = every room). */
  rooms: string[];
  /** "Show only this type" (set from the selected device or the type list). */
  onlyType: string | null;
  /** Filtered-out devices are faded instead of hidden. */
  dim: boolean;
  /** Equipment closets / panels. */
  closets: boolean;
  /** Device labels next to each badge. */
  labels: boolean;
}

export const DEFAULT_FILTERS: PlanFilters = { hiddenTypes: [], status: "all", rooms: [], onlyType: null, dim: false, closets: true, labels: false };

export type Visibility = "show" | "dim" | "hide";

/** Number of display filters in effect (layers aside), for the toolbar badge. */
export function activeFilterCount(f: PlanFilters): number {
  return (f.hiddenTypes.length ? 1 : 0) + (f.status !== "all" ? 1 : 0) + (f.rooms.length ? 1 : 0) + (f.onlyType ? 1 : 0);
}

function passesFilters(typeId: string | null | undefined, tentative: boolean, room: string | null, f: PlanFilters): boolean {
  if (typeId && f.onlyType && typeId !== f.onlyType) return false;
  if (typeId && f.hiddenTypes.includes(typeId)) return false;
  if (f.status === "firm" && tentative) return false;
  if (f.status === "tentative" && !tentative) return false;
  if (room !== null && f.rooms.length && !f.rooms.includes(room.trim())) return false;
  return true;
}

/** A hidden layer always hides; a filter hides, or fades in dim mode. */
export function markerVisibility(m: Pick<Marker, "deviceTypeId" | "tentative" | "room">, layer: Layer, hiddenLayers: Layer[], f: PlanFilters): Visibility {
  if (hiddenLayers.includes(layer)) return "hide";
  if (passesFilters(m.deviceTypeId, !!m.tentative, m.room ?? "", f)) return "show";
  return f.dim ? "dim" : "hide";
}

/**
 * Wire runs are on the wiring layer and follow the device they come from (its filters); LED/stair runs are on the
 * lighting layer and are filtered by their own type.
 */
export function runVisibility(r: Pick<Run, "kind" | "deviceTypeId" | "tentative" | "markerId">, hiddenLayers: Layer[], f: PlanFilters, markerVis?: (id: string) => Visibility | undefined): Visibility {
  if (hiddenLayers.includes(r.kind === "wire" ? "wiring" : "lighting")) return "hide";
  if (r.kind === "wire") {
    const mv = r.markerId ? markerVis?.(r.markerId) : undefined;
    if (mv && mv !== "show") return f.dim ? "dim" : mv;
    if (!passesFilters(null, !!r.tentative, null, f)) return f.dim ? "dim" : "hide";
    // "Only this type" fades loose wires that don't come from a device of that type.
    if (f.onlyType && !mv) return f.dim ? "dim" : "hide";
    return "show";
  }
  return passesFilters(r.deviceTypeId ?? null, !!r.tentative, null, f) ? "show" : f.dim ? "dim" : "hide";
}

export function closetVisibility(c: Pick<Closet, "kind">, category: Layer, hiddenLayers: Layer[], f: PlanFilters): Visibility {
  if (!f.closets || hiddenLayers.includes(category)) return "hide";
  return "show";
}

/** Items per layer on one sheet (devices by their category, runs on wiring / lighting, closets by kind's category). */
export function layerCounts(
  markers: Pick<Marker, "deviceTypeId">[],
  runs: Pick<Run, "kind">[],
  categoryOfType: (typeId: string) => Layer,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of markers) {
    const l = categoryOfType(m.deviceTypeId);
    out[l] = (out[l] ?? 0) + 1;
  }
  for (const r of runs) {
    const l: Layer = r.kind === "wire" ? "wiring" : "lighting";
    out[l] = (out[l] ?? 0) + 1;
  }
  return out;
}

/** Merge stored filters with defaults (older or partial saves). */
export function normalizeFilters(v: unknown): PlanFilters {
  const o = (v && typeof v === "object" ? v : {}) as Partial<PlanFilters>;
  return {
    hiddenTypes: Array.isArray(o.hiddenTypes) ? o.hiddenTypes.filter((x) => typeof x === "string") : [],
    status: o.status === "firm" || o.status === "tentative" ? o.status : "all",
    rooms: Array.isArray(o.rooms) ? o.rooms.filter((x) => typeof x === "string") : [],
    onlyType: typeof o.onlyType === "string" ? o.onlyType : null,
    dim: !!o.dim,
    closets: o.closets !== false,
    labels: !!o.labels,
  };
}
