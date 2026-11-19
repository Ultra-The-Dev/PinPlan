"use client";
// Which devices and runs the Progress view shows on a sheet (and walk mode can tap): placed, not tentative, visible
// with the plan's layers & filters, and passing the Progress status / category filters.
import { useMemo } from "react";
import { markable, statusOf } from "@/lib/installProgress";
import { markerVisibility, runVisibility, type PlanFilters } from "@/lib/planFilter";
import { useEditor } from "@/lib/store";
import type { DeviceType, InstallStatus, Layer, Marker, Run } from "@/lib/types";
import { useViewer } from "@/lib/viewerStore";
import { useProgressUi } from "./progressStore";

interface Input {
  markers: Marker[];
  runs: Run[];
  catalog: DeviceType[];
  hiddenLayers: Layer[];
  filters: PlanFilters;
  statuses: InstallStatus[];
  category: string | null;
}

export function shownItems(sheetId: string, i: Input): { markers: Marker[]; runs: Run[] } {
  const types = new Map(i.catalog.map((d) => [d.id, d]));
  const passes = (s: InstallStatus) => !i.statuses.length || i.statuses.includes(s);
  const vis = new Map<string, ReturnType<typeof markerVisibility>>();
  const markers: Marker[] = [];
  for (const m of i.markers) {
    if (m.sheetId !== sheetId || !markable(m)) continue;
    const t = types.get(m.deviceTypeId);
    if (t?.kind === "led") continue;
    const v = markerVisibility(m, (t?.category ?? "security") as Layer, i.hiddenLayers, i.filters);
    vis.set(m.id, v);
    if (v !== "show") continue;
    if (i.category && t?.category !== i.category) continue;
    if (passes(statusOf(m))) markers.push(m);
  }
  const runs = i.category
    ? []
    : i.runs.filter(
        (r) => r.sheetId === sheetId && markable({ tentative: !!r.tentative, deleted: r.deleted }) && runVisibility(r, i.hiddenLayers, i.filters, (id) => vis.get(id)) === "show" && passes(statusOf(r)),
      );
  return { markers, runs };
}

/** Same, read now (for taps, outside React). */
export function shownItemsNow(sheetId: string) {
  const e = useEditor.getState();
  const ui = useProgressUi.getState();
  return shownItems(sheetId, { markers: e.markers, runs: e.runs, catalog: e.catalog, hiddenLayers: e.hiddenLayers, filters: useViewer.getState().filters, statuses: ui.statuses, category: ui.category });
}

export function useShownItems(sheetId: string) {
  const markers = useEditor((s) => s.markers);
  const runs = useEditor((s) => s.runs);
  const catalog = useEditor((s) => s.catalog);
  const hiddenLayers = useEditor((s) => s.hiddenLayers);
  const filters = useViewer((s) => s.filters);
  const statuses = useProgressUi((s) => s.statuses);
  const category = useProgressUi((s) => s.category);
  return useMemo(() => shownItems(sheetId, { markers, runs, catalog, hiddenLayers, filters, statuses, category }), [sheetId, markers, runs, catalog, hiddenLayers, filters, statuses, category]);
}
