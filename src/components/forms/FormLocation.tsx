"use client";
// "Pin to plan" for a form: pick a sheet and tap a spot on a still image of it, or pick a device. No plan overlay —
// the form shows the place as a chip that opens the plan there.
import { MapPin, X } from "lucide-react";
import { useState } from "react";
import { useEditor } from "@/lib/store";
import type { JobForm, Marker, Sheet } from "@/lib/types";
import { useSheetImage } from "@/lib/useImage";

export type FormPlace = Pick<JobForm, "sheetId" | "x" | "y" | "markerId">;

const markerName = (m: Marker, typeName?: string) => [m.label || typeName || "Device", m.room].filter(Boolean).join(" · ");

function SheetSpot({ sheet, x, y, onPick }: { sheet: Sheet; x: number | null; y: number | null; onPick: (x: number, y: number) => void }) {
  const img = useSheetImage(sheet.imageId);
  if (!img) return <div className="flex h-56 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">Loading the plan…</div>;
  return (
    <div className="relative overflow-hidden rounded-lg ring-1 ring-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt={`Plan: ${sheet.name}`}
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Pin to plan" className="card animate-in max-h-[95dvh] w-full max-w-2xl space-y-3 overflow-auto rounded-b-none p-5 shadow-pop sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Pin to plan</h2>
            <p className="text-sm text-slate-500">Tap the spot on the plan, or pick a device.</p>
          </div>
          <button className="btn btn-sm btn-icon btn-ghost" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {!sheets.length ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">This job has no plans yet. Add one in the Sheets tab first.</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="label">Sheet</span>
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
                <span className="label">Device (optional)</span>
                <select
                  className="input h-11"
                  value={markerId ?? ""}
                  onChange={(e) => {
                    const m = onSheet.find((x) => x.id === e.target.value);
                    setMarkerId(m?.id ?? null);
                    if (m) setPt({ x: m.x, y: m.y });
                  }}
                >
                  <option value="">No device</option>
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
              Remove pin
            </button>
          )}
          <button className="btn h-11" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-brand h-11 px-5" disabled={!sheetId || pt.x == null} onClick={() => onSave({ sheetId, x: pt.x, y: pt.y, markerId })}>
            Save pin
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
