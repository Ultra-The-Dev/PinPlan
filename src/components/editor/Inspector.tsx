"use client";
import { Camera, Copy, Minus, Plus, Trash, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CLOSET_KINDS, MOUNTS } from "@/lib/catalog";
import { saveImage } from "@/lib/db";
import { formatFt, parseFeet, runLengthFt } from "@/lib/geometry";
import { cableCounts, cablesPatch, CABLE_TYPES, markerCables, productIdFor, productTitle, runCables, settingCable } from "@/lib/products";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import { wireColor } from "@/lib/symbols";
import { useSheetImage } from "@/lib/useImage";
import SymbolIcon from "./SymbolIcon";
import PhotoViewer from "../photos/PhotoViewer";
import { getAuthor, importPhoto } from "@/lib/photos";
import { useSyncStatus } from "@/lib/sync";
import { useBlobUrl } from "@/lib/useImage";
import type { Photo } from "@/lib/types";
import type { ClosetKind, Mount } from "@/lib/types";

/** Text/number field that commits on blur or Enter (so typing doesn't flood undo history). */
function Field(props: { label: string; value: string | number | null | undefined; onCommit: (v: string) => void; type?: string; placeholder?: string; inputMode?: "decimal" | "numeric" | "text" }) {
  const [v, setV] = useState(props.value == null ? "" : String(props.value));
  const commit = () => {
    if (v !== (props.value == null ? "" : String(props.value))) props.onCommit(v);
  };
  return (
    <div>
      <label className="label">{props.label}</label>
      <input
        className="input"
        type={props.type ?? "text"}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

const num = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  const f = parseFeet(t);
  return f;
};

export default function Inspector() {
  const st = useEditor();
  const { selection, select, multi } = st;
  if (multi.length >= 2) return <BulkInspector />;
  if (!selection) return null;
  const key = `${selection.table}:${selection.id}`;
  return (
    <div key={key}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur">
        <span className="section-title">{selection.table === "markers" ? "Device" : selection.table === "runs" ? "Run" : "Closet"}</span>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={() => select(null)} aria-label="Close">
          <X />
        </button>
      </div>
      <div className="space-y-3.5 p-4">
        {selection.table === "markers" && <MarkerInspector id={selection.id} />}
        {selection.table === "runs" && <RunInspector id={selection.id} />}
        {selection.table === "closets" && <ClosetInspector id={selection.id} />}
      </div>
    </div>
  );
}

/** The cables pulled to a device or carried by a home run: one row per type with a count, plus "Add cable". */
function CablesEditor({ cables, onChange }: { cables: string[]; onChange: (list: string[]) => void }) {
  const counts = cableCounts(cables);
  const unused = CABLE_TYPES.filter((w) => !counts.some((c) => c.type === w));
  return (
    <div>
      <label className="label">Cables</label>
      <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {counts.map((c) => (
          <div key={c.type} className="flex items-center gap-2 px-3 py-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: wireColor(c.type) }} />
            <span className="min-w-0 flex-1 truncate text-sm">{c.type}</span>
            <button className="btn btn-sm btn-icon btn-ghost" aria-label={`One less ${c.type}`} onClick={() => onChange(settingCable(c.type, c.count - 1, cables))}>
              <Minus />
            </button>
            <span className="w-5 text-center text-sm font-medium tabular-nums">{c.count}</span>
            <button className="btn btn-sm btn-icon btn-ghost" aria-label={`One more ${c.type}`} onClick={() => onChange(settingCable(c.type, c.count + 1, cables))}>
              <Plus />
            </button>
          </div>
        ))}
        {!counts.length && <p className="px-3 py-2 text-sm text-slate-400">No cable</p>}
        {unused.length > 0 && (
          <select
            aria-label="Add cable"
            className="w-full cursor-pointer rounded-b-xl bg-transparent px-3 py-2 text-sm font-medium text-brand-600 outline-none"
            value=""
            onChange={(e) => e.target.value && onChange([...cables, e.target.value])}
          >
            <option value="">+ Add cable…</option>
            {unused.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

/** Edit several devices at once. Each change is one undo step. */
function BulkInspector() {
  const { multi, markers, catalog, closets, sheets, products, multiMode, setMultiMode, updateMarkers, deleteMarkers, autoHomeRuns, select } = useEditor();
  const ms = markers.filter((m) => multi.includes(m.id));
  const [room, setRoom] = useState("");
  const typeIds = [...new Set(ms.map((m) => m.deviceTypeId))];
  const typeName = (id: string) => catalog.find((d) => d.id === id)?.name ?? id;
  const sameCables = ms.every((m) => JSON.stringify(markerCables(m)) === JSON.stringify(markerCables(ms[0])));
  const oneType = typeIds.length === 1 ? typeIds[0] : null;
  const typeProducts = oneType ? products.filter((p) => p.deviceTypeId === oneType && !p.archived) : [];
  const allTentative = ms.every((m) => m.tentative);
  const sheetName = (sid: string) => sheets.find((s) => s.id === sid)?.name ?? "";
  const ids = ms.map((m) => m.id);
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur">
        <span className="section-title">{ms.length} devices selected</span>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={() => select(null)} aria-label="Clear selection">
          <X />
        </button>
      </div>
      <div className="space-y-3.5 p-4">
        <div className="flex flex-wrap gap-1.5">
          {typeIds.map((t) => (
            <span key={t} className="chip bg-slate-100 text-slate-600">
              {typeName(t)} × {ms.filter((m) => m.deviceTypeId === t).length}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500">{multiMode ? "Tap devices to add or remove them." : "Shift-click devices to add or remove them."}</p>
        <div>
          <label className="label">Room</label>
          <div className="flex gap-2">
            <input className="input" placeholder={[...new Set(ms.map((m) => m.room))].length === 1 ? ms[0].room || "e.g. Kitchen" : "Mixed"} value={room} onChange={(e) => setRoom(e.target.value)} />
            <button className="btn" disabled={!room.trim()} onClick={() => updateMarkers(ids, () => ({ room: room.trim() }))}>
              Apply
            </button>
          </div>
        </div>
        {oneType ? (
          <div>
            <label className="label">Product</label>
            <select className="input" value="" onChange={(e) => updateMarkers(ids, () => ({ productId: e.target.value === "__job" ? null : e.target.value }))}>
              <option value="" disabled>
                Set product for all {ms.length}…
              </option>
              <option value="__job">Job’s choice</option>
              {typeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {productTitle(p)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Select devices of one type to set their product.</p>
        )}
        <CablesEditor cables={sameCables ? markerCables(ms[0]) : []} onChange={(list) => updateMarkers(ids, () => cablesPatch(list))} />
        {!sameCables && <p className="-mt-2 text-xs text-slate-500">Cables differ between these devices — a change replaces each device’s cables.</p>}
        <div>
          <label className="label">Home-run closet</label>
          <select className="input" value="" onChange={(e) => updateMarkers(ids, () => ({ closetId: e.target.value === "__none" ? null : e.target.value }))}>
            <option value="" disabled>
              Set closet for all {ms.length}…
            </option>
            <option value="__none">— none —</option>
            {closets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({sheetName(c.sheetId)})
              </option>
            ))}
          </select>
        </div>
        <label className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ring-1 ${allTentative ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
          <input type="checkbox" className="accent-amber-600" checked={allTentative} onChange={(e) => updateMarkers(ids, () => ({ tentative: e.target.checked }))} />
          <span className="font-medium">Tentative (?)</span>
        </label>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            className="btn"
            onClick={async () => {
              let n = 0;
              for (const id of ids) n += await autoHomeRuns(undefined, id);
              toast(n ? `Drew ${n} home runs` : "Place an equipment closet first", n ? "success" : "info");
            }}
          >
            Draw home runs
          </button>
          <button className="btn btn-danger" onClick={() => deleteMarkers(ids)}>
            <Trash /> Delete {ms.length}
          </button>
        </div>
        <button className={`btn w-full ${multiMode ? "btn-on" : ""}`} onClick={() => setMultiMode(!multiMode)}>
          {multiMode ? "Done adding" : "Tap to add more"}
        </button>
      </div>
    </div>
  );
}

/** Quick ways into a multi-selection from one device. */
function SelectMore({ id }: { id: string }) {
  const { markers, selectMany, setMultiMode } = useEditor();
  const m = markers.find((x) => x.id === id);
  if (!m) return null;
  const sameFloor = markers.filter((x) => x.deviceTypeId === m.deviceTypeId && x.sheetId === m.sheetId).map((x) => x.id);
  const sameJob = markers.filter((x) => x.deviceTypeId === m.deviceTypeId).map((x) => x.id);
  const sameRoom = m.room ? markers.filter((x) => x.sheetId === m.sheetId && x.room === m.room).map((x) => x.id) : [];
  const pick = (ids: string[]) => selectMany([id, ...ids.filter((x) => x !== id)]);
  return (
    <div>
      <label className="label">Select more</label>
      <div className="flex flex-wrap gap-1.5">
        {sameFloor.length > 1 && (
          <button className="btn btn-sm" onClick={() => pick(sameFloor)}>
            All like this on floor ({sameFloor.length})
          </button>
        )}
        {sameJob.length > sameFloor.length && (
          <button className="btn btn-sm" onClick={() => pick(sameJob)}>
            In whole job ({sameJob.length})
          </button>
        )}
        {sameRoom.length > 1 && (
          <button className="btn btn-sm" onClick={() => pick(sameRoom)}>
            Everything in {m.room} ({sameRoom.length})
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setMultiMode(true)} title="Then tap devices on the plan (or shift-click)">
          Tap to pick…
        </button>
      </div>
    </div>
  );
}

function MarkerInspector({ id }: { id: string }) {
  const { markers, catalog, closets, sheets, runs, products, project, updateMarker, deleteEntity, autoHomeRuns, addMarker, select } = useEditor();
  const m = markers.find((x) => x.id === id);
  const duplicate = async () => {
    if (!m) return;
    const copy = await addMarker(m.deviceTypeId, Math.min(1, m.x + 0.015), Math.min(1, m.y + 0.015), {
      room: m.room,
      mount: m.mount,
      wireType: m.wireType,
      wires: m.wires,
      productId: m.productId,
      closetId: m.closetId,
      tentative: m.tentative,
    });
    if (copy) select({ table: "markers", id: copy.id });
  };
  const photo = useSheetImage(m?.photoId);
  if (!m) return null;
  const type = catalog.find((d) => d.id === m.deviceTypeId);
  const run = runs.find((r) => r.kind === "wire" && r.markerId === m.id);
  const sheetName = (sid: string) => sheets.find((s) => s.id === sid)?.name ?? "";
  const typeProducts = products.filter((p) => p.deviceTypeId === m.deviceTypeId && (!p.archived || p.id === m.productId));
  const jobProduct = project ? products.find((p) => p.id === productIdFor({ deviceTypeId: m.deviceTypeId, productId: null }, project, products)) : undefined;
  return (
    <>
      <div className="flex items-center gap-3">
        {type && <SymbolIcon type={type} size={40} tentative={m.tentative} />}
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{m.label}</h3>
          <p className="truncate text-xs text-slate-500">
            {type?.name}
            {m.room ? ` · ${m.room}` : ""}
          </p>
        </div>
      </div>
      <div>
        <label className="label">Device</label>
        <select className="input" value={m.deviceTypeId} onChange={(e) => updateMarker(m.id, { deviceTypeId: e.target.value, productId: null })}>
          {catalog
            .filter((d) => d.kind === "device")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className="label">Product</label>
        <select
          className="input"
          value={m.productId && typeProducts.some((p) => p.id === m.productId) ? m.productId : ""}
          onChange={(e) => updateMarker(m.id, { productId: e.target.value || null })}
        >
          <option value="">{jobProduct ? `Job’s choice — ${productTitle(jobProduct)}` : "Job’s choice — catalog price"}</option>
          {typeProducts
            .filter((p) => p.id !== jobProduct?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {productTitle(p)}
              </option>
            ))}
        </select>
        {typeProducts.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">
            No products for this type yet ·{" "}
            <Link href="/products" className="font-medium text-brand-600 hover:underline">
              add in Products
            </Link>
          </p>
        )}
      </div>
      <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm ring-1 transition ${m.tentative ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
        <input type="checkbox" className="mt-0.5 accent-amber-600" checked={m.tentative} onChange={(e) => updateMarker(m.id, { tentative: e.target.checked })} />
        <span>
          <span className="font-medium">Tentative (?)</span>
          <span className="block text-xs text-slate-500">Listed separately; optional on the estimate</span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Label" value={m.label} onCommit={(v) => updateMarker(m.id, { label: v })} />
        <Field label="Room" value={m.room} placeholder="e.g. Kitchen" onCommit={(v) => updateMarker(m.id, { room: v })} />
      </div>
      <div>
        <label className="label">Mount</label>
        <select className="input" value={m.mount} onChange={(e) => updateMarker(m.id, { mount: e.target.value as Mount })}>
          {MOUNTS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <CablesEditor cables={markerCables(m)} onChange={(list) => updateMarker(m.id, cablesPatch(list))} />
      <div>
        <label className="label">Home-run closet</label>
        <select className="input" value={m.closetId ?? ""} onChange={(e) => updateMarker(m.id, { closetId: e.target.value || null })}>
          <option value="">— none —</option>
          {closets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({sheetName(c.sheetId)})
            </option>
          ))}
        </select>
        {m.closetId && (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            {run ? <span>Home run: {formatFt(runLengthFt(run)).replace("LF", "ft")}</span> : <span>No wire line drawn</span>}
            <button className="btn btn-sm" onClick={() => autoHomeRuns(undefined, m.id)}>
              {run ? "Redraw" : "Draw home run"}
            </button>
          </div>
        )}
      </div>
      <div>
        <label className="label">Notes</label>
        <NotesField value={m.notes} onCommit={(v) => updateMarker(m.id, { notes: v })} />
      </div>
      <div>
        <label className="label">Photo</label>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="Device location" className="mb-2 max-h-40 w-full rounded-lg object-cover" />
        )}
        <label className="btn btn-sm cursor-pointer">
          <Camera />
          {photo ? "Replace photo" : "Add photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const img = await createImageBitmap(f);
              const k = Math.min(1, 1600 / Math.max(img.width, img.height));
              const c = document.createElement("canvas");
              c.width = Math.round(img.width * k);
              c.height = Math.round(img.height * k);
              c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
              const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.85));
              const photoId = await saveImage(blob, c.width, c.height);
              updateMarker(m.id, { photoId });
            }}
          />
        </label>
      </div>
      <SitePhotos markerId={m.id} sheetId={m.sheetId} room={m.room} />
      <SelectMore id={m.id} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button className="btn" onClick={() => duplicate()}>
          <Copy /> Duplicate
        </button>
        <button className="btn btn-danger" onClick={() => deleteEntity("markers", m.id)}>
          <Trash /> Delete
        </button>
      </div>
    </>
  );
}

function NotesField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value ?? "");
  return <textarea className="input min-h-16" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />;
}

function RunInspector({ id }: { id: string }) {
  const { runs, catalog, markers, closets, sheets, updateRun, deleteEntity } = useEditor();
  const r = runs.find((x) => x.id === id);
  if (!r) return null;
  const sheet = sheets.find((s) => s.id === r.sheetId);
  const len = runLengthFt(r);
  const ledTypes = catalog.filter((d) => d.kind === "led");
  const title = r.kind === "wire" ? "Wire run" : r.kind === "stair" ? "Stair LED" : "LED run";
  const marker = markers.find((m) => m.id === r.markerId);
  const closet = closets.find((c) => c.id === r.closetId);
  return (
    <>
      <h3 className="font-semibold">
        {title} <span className="font-normal text-slate-500">· {formatFt(len)}</span>
      </h3>
      {r.kind !== "wire" && (
        <>
          <div>
            <label className="label">LED type</label>
            <select className="input" value={r.deviceTypeId ?? ""} onChange={(e) => updateRun(r.id, { deviceTypeId: e.target.value || null })}>
              {ledTypes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Zone #" value={r.zone} inputMode="numeric" onCommit={(v) => updateRun(r.id, { zone: v.trim() })} />
            <Field label="Switch" value={r.switchLabel} placeholder="S21" onCommit={(v) => updateRun(r.id, { switchLabel: v.trim() })} />
          </div>
        </>
      )}
      {r.kind === "stair" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Steps" value={r.steps} inputMode="numeric" onCommit={(v) => updateRun(r.id, { steps: v.trim() ? parseInt(v, 10) || 0 : null })} />
          <Field label="LF per step" value={r.lfPerStep} inputMode="decimal" onCommit={(v) => updateRun(r.id, { lfPerStep: num(v) })} />
        </div>
      ) : (
        <div>
          <Field
            label={r.kind === "wire" ? "Cable length override (ft)" : "Typed LF (from plan callout)"}
            value={r.typedFt}
            inputMode="decimal"
            placeholder={r.measuredFt != null ? `measured ${r.measuredFt.toFixed(1)}` : sheet?.pxPerFt ? "" : "no scale — type LF"}
            onCommit={(v) => updateRun(r.id, { typedFt: num(v) })}
          />
          <p className="mt-1 text-xs text-slate-500">
            {r.measuredFt != null
              ? `${r.kind === "wire" ? "Estimated" : "Measured"}: ${r.measuredFt.toFixed(1)} ft${r.typedFt != null ? " (typed value wins)" : ""}`
              : "Set the sheet scale to measure, or type the length."}
          </p>
        </div>
      )}
      {r.kind === "wire" && (
        <>
          <CablesEditor
            cables={runCables(r).filter((c) => c !== "Unspecified")}
            onChange={(list) => {
              const p = cablesPatch(list.length ? list : ["Cat6"]);
              updateRun(r.id, { wireType: p.wireType, wireTypes: p.wires });
            }}
          />
          <p className="text-xs text-slate-500">
            {marker ? marker.label : "—"} → {closet ? closet.name : "—"}
          </p>
        </>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!r.tentative} onChange={(e) => updateRun(r.id, { tentative: e.target.checked })} />
        Tentative (?)
      </label>
      <div>
        <label className="label">Notes</label>
        <NotesField value={r.notes ?? ""} onCommit={(v) => updateRun(r.id, { notes: v })} />
      </div>
      <p className="text-xs text-slate-500">Drag the white handles to reshape the run.</p>
      <button className="btn btn-danger w-full" onClick={() => deleteEntity("runs", r.id)}>
        <Trash /> Delete run
      </button>
    </>
  );
}

function ClosetInspector({ id }: { id: string }) {
  const { closets, markers, updateCloset, deleteEntity } = useEditor();
  const c = closets.find((x) => x.id === id);
  if (!c) return null;
  const n = markers.filter((m) => m.closetId === c.id).length;
  return (
    <>
      <h3 className="font-semibold">{c.name}</h3>
      <Field label="Name" value={c.name} onCommit={(v) => updateCloset(c.id, { name: v })} />
      <div>
        <label className="label">Kind</label>
        <select className="input" value={c.kind} onChange={(e) => updateCloset(c.id, { kind: e.target.value as ClosetKind })}>
          {CLOSET_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-slate-600">{n} devices home-run here.</p>
      <div>
        <label className="label">Notes</label>
        <NotesField value={c.notes ?? ""} onCommit={(v) => updateCloset(c.id, { notes: v })} />
      </div>
      <button className="btn btn-danger w-full" onClick={() => deleteEntity("closets", c.id)}>
        <Trash /> Delete closet
      </button>
    </>
  );
}

function SiteThumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <button onClick={onOpen} className="h-14 w-14 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200" aria-label={photo.caption || "Open photo"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

/** Job photos linked to this device (the camera badge on the plan); add one straight from here. */
function SitePhotos({ markerId, sheetId, room }: { markerId: string; sheetId: string; room: string }) {
  const { photos, project, saveRow } = useEditor();
  const { email } = useSyncStatus();
  const [viewer, setViewer] = useState<string | null>(null);
  const list = photos.filter((p) => !p.deleted && p.markerId === markerId).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  return (
    <div>
      <label className="label">Site photos ({list.length})</label>
      {list.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {list.map((p) => (
            <SiteThumb key={p.id} photo={p} onOpen={() => setViewer(p.id)} />
          ))}
        </div>
      )}
      <label className="btn btn-sm cursor-pointer">
        <Camera /> Add site photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={async (e) => {
            if (!project || !e.target.files) return;
            for (const f of [...e.target.files]) {
              const p = await importPhoto(f, { projectId: project.id, author: getAuthor(email), extra: { markerId, sheetId, room: room || null } });
              await saveRow("photos", p);
            }
            e.target.value = "";
            toast("Photo added to this device", "success");
          }}
        />
      </label>
      {viewer && <PhotoViewer photos={list} startId={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
