"use client";
// Add sensors (docs/find-similar.md, "Alarm sensors from openings"), inside the Find similar card: for the doors and
// windows on this plan, a door contact on each door, a window contact on each window and / or one glass-break per room
// with windows. The counts show first; a tap on a door or window on the plan leaves it out (findSimilarInput.ts); the
// plan shows where each sensor will go (FindSimilarLayer.tsx). Placing is one undo step (useEditor.addMarkers).
import { Check, ShieldCheck, X } from "lucide-react";
import { useMemo } from "react";
import { SENSOR_TYPE_IDS, missingSensorTypes, sheetOpenings, type SensorKind } from "@/lib/alarmSensors";
import { useT } from "@/lib/i18n";
import { useEditor } from "@/lib/store";
import type { Sheet } from "@/lib/types";
import { closeSensors, placeSensors, sensorPlan, toggleSensorKind, useFindSimilar } from "./findSimilarStore";

const OPTIONS: { kind: SensorKind; label: string }[] = [
  { kind: "door", label: "Door contact on each door" },
  { kind: "window", label: "Window contact on each window" },
  { kind: "glass", label: "Glass-break detector per room with windows" },
];

export default function AlarmSensorsSection({ sheet }: { sheet: Sheet }) {
  const t = useT();
  const sensors = useFindSimilar((s) => s.sensors);
  const markers = useEditor((s) => s.markers);
  const catalog = useEditor((s) => s.catalog);
  const openings = useMemo(() => sheetOpenings(markers, catalog, sheet.id), [markers, catalog, sheet.id]);
  // What each option would place, checked or not, so the counts show before choosing.
  const all = useMemo(() => (sensors ? sensorPlan({ ...sensors, kinds: ["door", "window", "glass"] }, markers, catalog, sheet) : null), [sensors, markers, catalog, sheet]);
  const plan = useMemo(() => (sensors ? sensorPlan(sensors, markers, catalog, sheet) : null), [sensors, markers, catalog, sheet]);
  if (!sensors || !plan || !all) return null;

  const doors = openings.filter((o) => o.kind === "door").length;
  const windows = openings.length - doors;
  const missing = missingSensorTypes(catalog);
  const n = plan.placements.length;
  const parts = [
    plan.counts.door ? t.tn("{n} door contact", "{n} door contacts", plan.counts.door) : null,
    plan.counts.window ? t.tn("{n} window contact", "{n} window contacts", plan.counts.window) : null,
    plan.counts.glass ? t.tn("{n} glass-break", "{n} glass-breaks", plan.counts.glass) : null,
  ].filter(Boolean);
  const covered = sensors.kinds.reduce((s, k) => s + plan.covered[k], 0);
  const left = sensors.excluded.filter((id) => openings.some((o) => o.id === id)).length;

  return (
    <div className="flex flex-col gap-2" data-testid="alarm-sensors">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-brand-600" />
        <h3 className="flex-1 font-semibold text-slate-900">{t("Add alarm sensors")}</h3>
      </div>
      {openings.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-900" role="status">
          {t("No doors or windows on this floor yet. Count them first: Find similar, counted as Door, then as Window.")}
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-600" data-testid="alarm-openings">
            {t("Doors")} <span className="font-semibold text-slate-900 tabular-nums">{doors}</span> · {t("Windows")} <span className="font-semibold text-slate-900 tabular-nums">{windows}</span>
          </p>
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">{t("Sensors to place")}</legend>
            {OPTIONS.map((o) => {
              const off = missing.includes(o.kind);
              const type = catalog.find((d) => d.id === SENSOR_TYPE_IDS[o.kind]);
              return (
                <label key={o.kind} className={`flex items-start gap-2 rounded-lg px-1.5 py-1 ${off ? "opacity-50" : "cursor-pointer hover:bg-slate-50"}`}>
                  <input type="checkbox" className="mt-0.5 accent-brand-600" checked={!off && sensors.kinds.includes(o.kind)} disabled={off} onChange={() => toggleSensorKind(o.kind)} data-testid={`alarm-kind-${o.kind}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-800">{t(o.label)}</span>
                    {o.kind === "glass" && <span className="block text-[11px] text-slate-500">{t("Rooms come from each window’s room; windows without one are grouped by distance.")}</span>}
                    {off && <span className="block text-[11px] text-slate-500">{t("Not in your price list: {name}", { name: type?.name ?? SENSOR_TYPE_IDS[o.kind] })}</span>}
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">{off ? "—" : all.counts[o.kind]}</span>
                </label>
              );
            })}
          </fieldset>
          <p className="font-semibold text-slate-900" role="status" data-testid="alarm-summary">
            {parts.length ? parts.join(" · ") : t("Nothing to add")}
          </p>
          <p className="text-xs text-slate-500">
            {left ? t.tn("{n} opening left out. Tap it again to take it back.", "{n} openings left out. Tap them again to take them back.", left) : t("Tap a door or window on the plan to leave it out.")}
            {covered > 0 && <> {t.tn("{n} already has its sensor.", "{n} already have their sensors.", covered)}</>}
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button className="btn btn-sm btn-brand" disabled={!n} onClick={() => void placeSensors(sheet)} data-testid="alarm-place">
          <Check /> {n ? t.tn("Place {n} sensor", "Place {n} sensors", n) : t("Place sensors")}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => closeSensors()} data-testid="alarm-cancel">
          <X /> {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
