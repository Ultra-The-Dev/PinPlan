"use client";
// "Pin to plan" for a form: pick a sheet and tap a spot on a still image of it, or pick a device. No plan overlay —
// the form shows the place as a chip that opens the plan there.
import { MapPin, X } from "lucide-react";
import { useState } from "react";
import { useEditor } from "@/lib/store";
import type { JobForm, Marker, Sheet } from "@/lib/types";
import { useSheetImage } from "@/lib/useImage";
import { useDialog } from "./useDialog";
import { t, useT } from "@/lib/i18n";

export type FormPlace = Pick<JobForm, "sheetId" | "x" | "y" | "markerId">;

const markerName = (m: Marker, typeName?: string) => [m.label || typeName || t("Device"), m.room].filter(Boolean).join(" · ");

function SheetSpot({ sheet, x, y, onPick }: { sheet: Sheet; x: number | null; y: number | null; onPick: (x: number, y: number) => void }) {
  const img = useSheetImage(sheet.imageId);
  const t = useT();
  if (!img) return <div className="flex h-56 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">{t("Loading the plan…")}</div>;
  // Keyboard: arrows move the pin (Shift = bigger steps); the first arrow or Enter drops it in the middle.
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    if (d[e.key]) {
      e.preventDefault();
      if (x == null || y == null) onPick(0.5, 0.5);
      else onPick(clamp(x + d[e.key][0]), clamp(y + d[e.key][1]));
    } else if ((e.key === "Enter" || e.key === " ") && (x == null || y == null)) {
      e.preventDefault();
      onPick(0.5, 0.5);
    }
  };
  return (
    <div
      className="relative overflow-hidden rounded-lg ring-1 ring-slate-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      tabIndex={0}
      role="group"
      aria-label={x != null && y != null ? t("Plan {name}: tap the spot, or use the arrow keys to move the pin (now at {x}% across, {y}% down)", { name: sheet.name, x: Math.round(x * 100), y: Math.round(y * 100) }) : t("Plan {name}: tap the spot, or use the arrow keys to move the pin", { name: sheet.name })}
      onKeyDown={onKey}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt={t("Plan: {name}", { name: sheet.name })}
        className="block w-full cursor-crosshair select-none"
        draggable={false}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onPick(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
        }}
      />
      {x != null && y != null && (
        <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-brand-600 drop-shadow" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
          <MapPin className="h-7 w-7 fill-brand-100" />
        </span>
      )}
    </div>
  );
}

export function FormLocationPicker({ place, onSave, onClose }: { place: FormPlace; onSave: (p: FormPlace) => void; onClose: () => void }) {
  const { sheets, markers, catalog } = useEditor();
  const [sheetId, setSheetId] = useState(place.sheetId ?? sheets[0]?.id ?? "");
  const [pt, setPt] = useState<{ x: number | null; y: number | null }>({ x: place.x ?? null, y: place.y ?? null });
  const [markerId, setMarkerId] = useState<string | null>(place.markerId ?? null);
  const sheet = sheets.find((s) => s.id === sheetId);
  const onSheet = markers.filter((m) => m.sheetId === sheetId);
  const typeName = (m: Marker) => catalog.find((d) => d.id === m.deviceTypeId)?.name;
  const dialog = useDialog(onClose);
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("Pin to plan")} className="card animate-in max-h-[95dvh] w-full max-w-2xl space-y-3 overflow-auto rounded-b-none p-5 shadow-pop outline-none sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("Pin to plan")}</h2>
            <p className="text-sm text-slate-500">{t("Tap the spot on the plan (or use the arrow keys), or pick a device.")}</p>
          </div>
          <button className="btn btn-sm btn-icon btn-ghost" aria-label={t("Close")} onClick={onClose}>
            <X />
          </button>
        </div>
        {!sheets.length ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{t("This job has no plans yet. Add one in the Sheets tab first.")}</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="label">{t("Sheet")}</span>
                <select
                  className="input h-11"
                  value={sheetId}
                  onChange={(e) => {
                    setSheetId(e.target.value);
                    setPt({ x: null, y: null });
                    setMarkerId(null);
                  }}
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">{t("Device (optional)")}</span>
                <select
                  className="input h-11"
                  value={markerId ?? ""}
                  onChange={(e) => {
                    const m = onSheet.find((x) => x.id === e.target.value);
                    setMarkerId(m?.id ?? null);
                    if (m) setPt({ x: m.x, y: m.y });
                  }}
                >
                  <option value="">{t("No device")}</option>
                  {onSheet.map((m) => (
                    <option key={m.id} value={m.id}>
                      {markerName(m, typeName(m))}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {sheet && (
              <SheetSpot
                sheet={sheet}
                x={pt.x}
                y={pt.y}
                onPick={(x, y) => {
                  setPt({ x, y });
                  setMarkerId(null);
                }}
              />
            )}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {place.sheetId && (
            <button className="btn h-11 mr-auto text-red-600" onClick={() => onSave({ sheetId: null, x: null, y: null, markerId: null })}>
              {t("Remove pin")}
            </button>
          )}
          <button className="btn h-11" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand h-11 px-5" disabled={!sheetId || pt.x == null} onClick={() => onSave({ sheetId, x: pt.x, y: pt.y, markerId })}>
            {t("Save pin")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Plan: First floor · Camera 3" — tap opens the plan at that place. */
export function placeText(place: FormPlace, sheets: Sheet[], markers: Marker[]): string | null {
  const sheet = sheets.find((s) => s.id === place.sheetId);
  if (!sheet) return null;
  const m = markers.find((x) => x.id === place.markerId);
  return [sheet.name, m?.label || m?.room].filter(Boolean).join(" · ");
}
