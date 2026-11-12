"use client";
import { useState } from "react";
import { CLOSET_KINDS, MOUNTS, WIRE_TYPES } from "@/lib/catalog";
import { saveImage } from "@/lib/db";
import { formatFt, parseFeet, runLengthFt } from "@/lib/geometry";
import { useEditor } from "@/lib/store";
import { useSheetImage } from "@/lib/useImage";
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
  const { selection, select } = st;
  if (!selection) return null;
  const key = `${selection.table}:${selection.id}`;
  return (
    <div className="space-y-3 p-3" key={key}>
      {selection.table === "markers" && <MarkerInspector id={selection.id} />}
      {selection.table === "runs" && <RunInspector id={selection.id} />}
      {selection.table === "closets" && <ClosetInspector id={selection.id} />}
      <button className="btn w-full" onClick={() => select(null)}>
        Done
      </button>
    </div>
  );
}

function MarkerInspector({ id }: { id: string }) {
  const { markers, catalog, closets, sheets, runs, updateMarker, deleteEntity, autoHomeRuns } = useEditor();
  const m = markers.find((x) => x.id === id);
  const photo = useSheetImage(m?.photoId);
  if (!m) return null;
  const type = catalog.find((d) => d.id === m.deviceTypeId);
  const run = runs.find((r) => r.kind === "wire" && r.markerId === m.id);
  const sheetName = (sid: string) => sheets.find((s) => s.id === sid)?.name ?? "";
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: type?.color }} />
        <h3 className="font-semibold">{m.label}</h3>
      </div>
      <div>
        <label className="label">Device</label>
        <select className="input" value={m.deviceTypeId} onChange={(e) => updateMarker(m.id, { deviceTypeId: e.target.value })}>
          {catalog
            .filter((d) => d.kind === "device")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
        <input type="checkbox" checked={m.tentative} onChange={(e) => updateMarker(m.id, { tentative: e.target.checked })} />
        Tentative (?) — listed separately, optional on the estimate
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Label" value={m.label} onCommit={(v) => updateMarker(m.id, { label: v })} />
        <Field label="Room" value={m.room} placeholder="e.g. Kitchen" onCommit={(v) => updateMarker(m.id, { room: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Mount</label>
          <select className="input" value={m.mount} onChange={(e) => updateMarker(m.id, { mount: e.target.value as Mount })}>
            {MOUNTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Wire type</label>
          <select className="input" value={m.wireType} onChange={(e) => updateMarker(m.id, { wireType: e.target.value })}>
            {Array.from(new Set([...WIRE_TYPES, m.wireType])).map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
      </div>
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
      <button className="btn btn-danger w-full" onClick={() => deleteEntity("markers", m.id)}>
        Delete device
      </button>
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
          <div>
            <label className="label">Wire type</label>
            <select className="input" value={r.wireType ?? ""} onChange={(e) => updateRun(r.id, { wireType: e.target.value })}>
              {Array.from(new Set([...WIRE_TYPES, r.wireType ?? "Cat6"])).map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </div>
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
        Delete run
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
        Delete closet
      </button>
    </>
  );
}
