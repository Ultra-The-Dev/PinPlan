"use client";
import { Camera, Copy, ListTodo, Minus, Plus, Trash, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { closetMeta, MOUNT_LABELS, MOUNTS, PANEL_KINDS } from "@/lib/catalog";
import { saveImage } from "@/lib/db";
import { formatFt, parseFeet, runLengthFt } from "@/lib/geometry";
import { cableCounts, cablesPatch, markerCables, productIdFor, productTitle, runCables, settingCable } from "@/lib/products";
import { BREAKER_SIZES, deviceSpec, hasTrade, tradeClosetKinds, tradeVocab, tradeWireTypes, wireForBreaker } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";
import { markerQty, normalizeCount, pinLabel, sumQty } from "@/lib/markerCount";
import CountStepper from "./CountStepper";
import { useT } from "@/lib/i18n";
import { wireColor } from "@/lib/symbols";
import { useSheetImage } from "@/lib/useImage";
import SymbolIcon from "./SymbolIcon";
import PhotoViewer from "../photos/PhotoViewer";
import DeviceInstallSection from "../progress/DeviceInstallSection";
import { getAuthor, importPhoto } from "@/lib/photos";
import { useSyncStatus } from "@/lib/sync";
import { useBlobUrl } from "@/lib/useImage";
import type { Photo } from "@/lib/types";
import { encodeTaskFilter } from "@/lib/tasks";
import { useProjectTasks } from "../tasks/taskStore";
import { useJobNav } from "../nav/useJobNav";
import type { CircuitInfo, ClosetKind, Mount, Run } from "@/lib/types";

/** Text/number field that commits on blur or Enter (so typing doesn't flood undo history). */
function Field(props: { label: string; value: string | number | null | undefined; onCommit: (v: string) => void; type?: string; placeholder?: string; inputMode?: "decimal" | "numeric" | "text" }) {
  const uid = useId();
  const [v, setV] = useState(props.value == null ? "" : String(props.value));
  const commit = () => {
    if (v !== (props.value == null ? "" : String(props.value))) props.onCommit(v);
  };
  return (
    <div>
      <label className="label" htmlFor={`${uid}-f`}>{props.label}</label>
      <input
        id={`${uid}-f`}
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
  const t = useT();
  const st = useEditor();
  const { selection, select, multi } = st;
  if (multi.length >= 2) return <BulkInspector />;
  if (!selection) return null;
  const key = `${selection.table}:${selection.id}`;
  return (
    <div key={key}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur">
        <span className="section-title">{selection.table === "markers" ? t("Device") : selection.table === "runs" ? t("Run") : t("Closet")}</span>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={() => select(null)} aria-label={t("Close")}>
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
  const t = useT();
  const counts = cableCounts(cables);
  // The company's wire / pipe types (low voltage: the original cable list).
  const trades = useTrades();
  const unused = tradeWireTypes(trades).filter((w) => !counts.some((c) => c.type === w));
  return (
    <div>
      <div className="label">{t("Cables")}</div>
      <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {counts.map((c) => (
          <div key={c.type} className="flex items-center gap-2 px-3 py-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: wireColor(c.type) }} />
            <span className="min-w-0 flex-1 truncate text-sm">{c.type}</span>
            <button className="btn btn-sm btn-icon btn-ghost" aria-label={t("One less {type}", { type: c.type })} onClick={() => onChange(settingCable(c.type, c.count - 1, cables))}>
              <Minus />
            </button>
            <span className="w-5 text-center text-sm font-medium tabular-nums">{c.count}</span>
            <button className="btn btn-sm btn-icon btn-ghost" aria-label={t("One more {type}", { type: c.type })} onClick={() => onChange(settingCable(c.type, c.count + 1, cables))}>
              <Plus />
            </button>
          </div>
        ))}
        {!counts.length && <p className="px-3 py-2 text-sm text-slate-400">{t("No cable")}</p>}
        {unused.length > 0 && (
          <select
            aria-label={t("Add cable")}
            className="w-full cursor-pointer rounded-b-xl bg-transparent px-3 py-2 text-sm font-medium text-brand-600 outline-none pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
            value=""
            onChange={(e) => e.target.value && onChange([...cables, e.target.value])}
          >
            <option value="">{t("+ Add cable…")}</option>
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
  const t = useT();
  const uid = useId();
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
  const trades = useTrades();
  const electrical = hasTrade(trades, "electrical");
  const [circuit, setCircuit] = useState("");
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur">
        <span className="section-title">{t.tn("{n} device selected", "{n} devices selected", ms.length)}</span>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={() => select(null)} aria-label={t("Clear selection")}>
          <X />
        </button>
      </div>
      <div className="space-y-3.5 p-4">
        <div className="flex flex-wrap gap-1.5">
          {typeIds.map((tid) => (
            <span key={tid} className="chip bg-slate-100 text-slate-600">
              {typeName(tid)} × {sumQty(ms.filter((m) => m.deviceTypeId === tid))}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500">{multiMode ? t("Tap devices to add or remove them.") : t("Shift-click devices to add or remove them.")}</p>
        <div>
          <label className="label" htmlFor={`${uid}-room`}>{t("Room")}</label>
          <div className="flex gap-2">
            <input id={`${uid}-room`} className="input" placeholder={[...new Set(ms.map((m) => m.room))].length === 1 ? ms[0].room || t("e.g. Kitchen") : t("Mixed")} value={room} onChange={(e) => setRoom(e.target.value)} />
            <button className="btn" disabled={!room.trim()} onClick={() => updateMarkers(ids, () => ({ room: room.trim() }))}>
              {t("Apply")}
            </button>
          </div>
        </div>
        {oneType ? (
          <div>
            <label className="label" htmlFor={`${uid}-product`}>{t("Product")}</label>
            <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-product`} value="" onChange={(e) => updateMarkers(ids, () => ({ productId: e.target.value === "__job" ? null : e.target.value }))}>
              <option value="" disabled>
                {t("Set product for all {n}…", { n: ms.length })}
              </option>
              <option value="__job">{t("Job’s choice")}</option>
              {typeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {productTitle(p)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-slate-500">{t("Select devices of one type to set their product.")}</p>
        )}
        <CablesEditor cables={sameCables ? markerCables(ms[0]) : []} onChange={(list) => updateMarkers(ids, () => cablesPatch(list))} />
        {!sameCables && <p className="-mt-2 text-xs text-slate-500">{t("Cables differ between these devices — a change replaces each device’s cables.")}</p>}
        <div>
          <label className="label" htmlFor={`${uid}-home-run`}>{t("Wire run to: {closet}", { closet: t(tradeVocab(trades).closet) })}</label>
          <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-home-run`} value="" onChange={(e) => updateMarkers(ids, () => ({ closetId: e.target.value === "__none" ? null : e.target.value }))}>
            <option value="" disabled>
              {t("Set {closet} for all {n}…", { closet: t(tradeVocab(trades).closet), n: ms.length })}
            </option>
            <option value="__none">{t("— none —")}</option>
            {closets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({sheetName(c.sheetId)})
              </option>
            ))}
          </select>
        </div>
        {electrical && (
          <div>
            <label className="label" htmlFor={`${uid}-circuit`}>{t("Circuit #")}</label>
            <div className="flex gap-2">
              <input id={`${uid}-circuit`} className="input" inputMode="numeric" placeholder={[...new Set(ms.map((m) => m.circuit ?? ""))].length === 1 ? ms[0].circuit || t("e.g. 12") : t("Mixed")} value={circuit} onChange={(e) => setCircuit(e.target.value)} />
              <button className="btn" onClick={() => updateMarkers(ids, () => ({ circuit: circuit.trim() || null }))}>
                {circuit.trim() ? t("Apply") : t("Clear")}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t("Puts these devices on one circuit of their panel (the panel schedule groups them).")}</p>
          </div>
        )}
        <label className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ring-1 ${allTentative ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
          <input type="checkbox" className="accent-amber-600" checked={allTentative} onChange={(e) => updateMarkers(ids, () => ({ tentative: e.target.checked }))} />
          <span className="font-medium">{t("Optional item")}</span>
        </label>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            className="btn"
            onClick={async () => {
              let n = 0;
              for (const id of ids) n += await autoHomeRuns(undefined, id);
              toast(n ? t.tn("Drew {n} wire run", "Drew {n} wire runs", n) : t("Place an equipment closet first"), n ? "success" : "info");
            }}
          >
            {t("Draw wire runs")}
          </button>
          <button className="btn btn-danger" onClick={() => deleteMarkers(ids)}>
            <Trash /> {t("Delete {n}", { n: ms.length })}
          </button>
        </div>
        <button className={`btn w-full ${multiMode ? "btn-on" : ""}`} onClick={() => setMultiMode(!multiMode)}>
          {multiMode ? t("Done adding") : t("Tap to add more")}
        </button>
      </div>
    </div>
  );
}

/** Quick ways into a multi-selection from one device. */
function SelectMore({ id }: { id: string }) {
  const t = useT();
  const { markers, selectMany, setMultiMode } = useEditor();
  const m = markers.find((x) => x.id === id);
  if (!m) return null;
  const sameFloor = markers.filter((x) => x.deviceTypeId === m.deviceTypeId && x.sheetId === m.sheetId).map((x) => x.id);
  const sameJob = markers.filter((x) => x.deviceTypeId === m.deviceTypeId).map((x) => x.id);
  const sameRoom = m.room ? markers.filter((x) => x.sheetId === m.sheetId && x.room === m.room).map((x) => x.id) : [];
  const pick = (ids: string[]) => selectMany([id, ...ids.filter((x) => x !== id)]);
  return (
    <div>
      <div className="label">{t("Select more")}</div>
      <div className="flex flex-wrap gap-1.5">
        {sameFloor.length > 1 && (
          <button className="btn btn-sm" onClick={() => pick(sameFloor)}>
            {t("All like this on floor ({n})", { n: sameFloor.length })}
          </button>
        )}
        {sameJob.length > sameFloor.length && (
          <button className="btn btn-sm" onClick={() => pick(sameJob)}>
            {t("In whole job ({n})", { n: sameJob.length })}
          </button>
        )}
        {sameRoom.length > 1 && (
          <button className="btn btn-sm" onClick={() => pick(sameRoom)}>
            {t("Everything in {room} ({n})", { room: m.room, n: sameRoom.length })}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setMultiMode(true)} title={t("Then tap devices on the plan (or shift-click)")}>
          {t("Tap to pick…")}
        </button>
      </div>
    </div>
  );
}

function MarkerInspector({ id }: { id: string }) {
  const t = useT();
  const uid = useId();
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
      count: m.count,
    });
    if (copy) select({ table: "markers", id: copy.id });
  };
  const photo = useSheetImage(m?.photoId);
  const trades = useTrades();
  if (!m) return null;
  const vocab = tradeVocab(trades);
  const myCloset = closets.find((c) => c.id === m.closetId);
  // Electrical devices on a panel carry a circuit number (the panel schedule groups by it).
  const showCircuit = hasTrade(trades, "electrical") && (!!m.circuit || (!!myCloset && PANEL_KINDS.includes(myCloset.kind)));
  const circuitsOnPanel = myCloset ? [...new Set(markers.filter((x) => x.closetId === myCloset.id && x.circuit).map((x) => x.circuit!))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
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
          <h3 className="truncate text-base font-semibold">{pinLabel(m)}</h3>
          <p className="truncate text-xs text-slate-500">
            {type?.name}
            {m.room ? ` · ${m.room}` : ""}
          </p>
        </div>
      </div>
      <DeviceLinks markerId={m.id} />
      <div>
        <label className="label" htmlFor={`${uid}-device`}>{t("Device")}</label>
        <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-device`} value={m.deviceTypeId} onChange={(e) => updateMarker(m.id, { deviceTypeId: e.target.value, productId: null })}>
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
        <label className="label" htmlFor={`${uid}-product`}>{t("Product")}</label>
        <select
          id={`${uid}-product`}
          className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          value={m.productId && typeProducts.some((p) => p.id === m.productId) ? m.productId : ""}
          onChange={(e) => updateMarker(m.id, { productId: e.target.value || null })}
        >
          <option value="">{jobProduct ? t("Job’s choice — {product}", { product: productTitle(jobProduct) }) : t("Job’s choice — catalog price")}</option>
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
            {t("No products for this type yet")} ·{" "}
            <Link href="/products" className="font-medium text-brand-600 hover:underline">
              {t("add in Price list")}
            </Link>
          </p>
        )}
      </div>
      <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm ring-1 transition ${m.tentative ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
        <input type="checkbox" className="mt-0.5 accent-amber-600" checked={m.tentative} onChange={(e) => updateMarker(m.id, { tentative: e.target.checked })} />
        <span>
          <span className="font-medium">{t("Optional item")}</span>
          <span className="block text-xs text-slate-500">{t("Shows a ? on the plan; listed separately, optional on the quote")}</span>
        </span>
      </label>
      <div>
        <label className="label" htmlFor={`${uid}-count`}>{t("Count")}</label>
        <CountStepper id={`${uid}-count`} value={markerQty(m)} onChange={(n) => updateMarker(m.id, { count: normalizeCount(n) })} testId="marker-count" />
        <p className="mt-1 text-xs text-slate-500">{markerQty(m) > 1 ? t("This pin counts as {n} in the takeoff, estimate and exports.", { n: markerQty(m) }) : t("Several of these here? Set how many: one pin counts as all of them.")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Label")} value={m.label} onCommit={(v) => updateMarker(m.id, { label: v })} />
        <Field label={t("Room")} value={m.room} placeholder={t("e.g. Kitchen")} onCommit={(v) => updateMarker(m.id, { room: v })} />
      </div>
      <div>
        <label className="label" htmlFor={`${uid}-mount`}>{t("Mount")}</label>
        <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-mount`} value={m.mount} onChange={(e) => updateMarker(m.id, { mount: e.target.value as Mount })}>
          {MOUNTS.map((x) => (
            <option key={x} value={x}>
              {t(MOUNT_LABELS[x])}
            </option>
          ))}
        </select>
      </div>
      <CablesEditor cables={markerCables(m)} onChange={(list) => updateMarker(m.id, cablesPatch(list))} />
      <div>
        <label className="label" htmlFor={`${uid}-home-run`}>{t("Wire run to: {closet}", { closet: t(vocab.closet) })}</label>
        <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-home-run`} value={m.closetId ?? ""} onChange={(e) => updateMarker(m.id, { closetId: e.target.value || null })}>
          <option value="">{t("— none —")}</option>
          {closets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({sheetName(c.sheetId)})
            </option>
          ))}
        </select>
        {m.closetId && (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            {run ? <span>{t("Wire run: {len}", { len: formatFt(runLengthFt(run)).replace("LF", t("ft")) })}</span> : <span>{t("No wire line drawn")}</span>}
            <button className="btn btn-sm" onClick={() => autoHomeRuns(undefined, m.id)}>
              {run ? t("Redraw") : t("Draw wire run")}
            </button>
          </div>
        )}
      </div>
      {showCircuit && (
        <div>
          <Field label={t("Circuit #")} value={m.circuit ?? ""} inputMode="numeric" placeholder={circuitsOnPanel.length ? t("e.g. {list}", { list: circuitsOnPanel.join(", ") }) : t("e.g. 12")} onCommit={(v) => updateMarker(m.id, { circuit: v.trim() || null })} />
          <p className="mt-1 text-xs text-slate-500">
            {(() => {
              const sp = deviceSpec(type);
              const spec = `${sp.breakerA ? `${sp.breakerA} A` : "—"}${sp.poles >= 2 ? ` ${t("2-pole")}` : ""}, ${sp.volts} V${sp.va ? ` · ~${sp.va} VA` : ""}`;
              return t("Typical: {spec}", { spec });
            })()}
          </p>
        </div>
      )}
      <div>
        <label className="label" htmlFor={`${uid}-notes`}>{t("Notes")}</label>
        <NotesField id={`${uid}-notes`} value={m.notes} onCommit={(v) => updateMarker(m.id, { notes: v })} />
      </div>
      <div>
        <div className="label">{t("Photo")}</div>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={t("Device location")} className="mb-2 max-h-40 w-full rounded-lg object-cover" />
        )}
        <label className="btn btn-sm cursor-pointer">
          <Camera />
          {photo ? t("Replace photo") : t("Add photo")}
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
      <DeviceInstallSection marker={m} />
      <SitePhotos markerId={m.id} sheetId={m.sheetId} room={m.room} />
      <SelectMore id={m.id} />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button className="btn" onClick={() => duplicate()}>
          <Copy /> {t("Duplicate")}
        </button>
        <button className="btn btn-danger" onClick={() => deleteEntity("markers", m.id)}>
          <Trash /> {t("Delete")}
        </button>
      </div>
    </>
  );
}

function NotesField({ id, value, onCommit }: { id?: string; value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value ?? "");
  return <textarea id={id} className="input min-h-16" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />;
}

function RunInspector({ id }: { id: string }) {
  const t = useT();
  const uid = useId();
  const { runs, catalog, markers, closets, sheets, updateRun, deleteEntity } = useEditor();
  const trades = useTrades();
  const r = runs.find((x) => x.id === id);
  if (!r) return null;
  const sheet = sheets.find((s) => s.id === r.sheetId);
  const len = runLengthFt(r);
  const ledTypes = catalog.filter((d) => d.kind === "led");
  const marker = markers.find((m) => m.id === r.markerId);
  const closet = closets.find((c) => c.id === r.closetId);
  const isCircuit = r.kind === "wire" && (!!r.circuit || (hasTrade(trades, "electrical") && !!closet && PANEL_KINDS.includes(closet.kind)));
  const title = r.kind === "wire" ? (isCircuit ? t("Circuit") : t(tradeVocab(trades).run)) : r.kind === "stair" ? t("Stair LED") : t("LED run");
  return (
    <>
      <h3 className="font-semibold">
        {title} <span className="font-normal text-slate-500">· {formatFt(len)}</span>
      </h3>
      {r.kind !== "wire" && (
        <>
          <div>
            <label className="label" htmlFor={`${uid}-led-type`}>{t("LED type")}</label>
            <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-led-type`} value={r.deviceTypeId ?? ""} onChange={(e) => updateRun(r.id, { deviceTypeId: e.target.value || null })}>
              {ledTypes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Zone #")} value={r.zone} inputMode="numeric" onCommit={(v) => updateRun(r.id, { zone: v.trim() })} />
            <Field label={t("Switch")} value={r.switchLabel} placeholder="S21" onCommit={(v) => updateRun(r.id, { switchLabel: v.trim() })} />
          </div>
        </>
      )}
      {r.kind === "stair" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Steps")} value={r.steps} inputMode="numeric" onCommit={(v) => updateRun(r.id, { steps: v.trim() ? parseInt(v, 10) || 0 : null })} />
          <Field label={t("LF per step")} value={r.lfPerStep} inputMode="decimal" onCommit={(v) => updateRun(r.id, { lfPerStep: num(v) })} />
        </div>
      ) : (
        <div>
          <Field
            label={r.kind === "wire" ? t("Cable length override (ft)") : t("Typed LF (from plan callout)")}
            value={r.typedFt}
            inputMode="decimal"
            placeholder={r.measuredFt != null ? t("measured {n}", { n: r.measuredFt.toFixed(1) }) : sheet?.pxPerFt ? "" : t("no scale — type LF")}
            onCommit={(v) => updateRun(r.id, { typedFt: num(v) })}
          />
          <p className="mt-1 text-xs text-slate-500">
            {r.measuredFt != null
              ? r.kind === "wire"
                ? r.typedFt != null
                  ? t("Estimated: {n} ft (typed value wins)", { n: r.measuredFt.toFixed(1) })
                  : t("Estimated: {n} ft", { n: r.measuredFt.toFixed(1) })
                : r.typedFt != null
                  ? t("Measured: {n} ft (typed value wins)", { n: r.measuredFt.toFixed(1) })
                  : t("Measured: {n} ft", { n: r.measuredFt.toFixed(1) })
              : t("Set the sheet scale to measure, or type the length.")}
          </p>
        </div>
      )}
      {isCircuit && <CircuitEditor run={r} onChange={(c) => updateRun(r.id, { circuit: c })} />}
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
        {t("Optional item")}
      </label>
      <div>
        <label className="label" htmlFor={`${uid}-notes`}>{t("Notes")}</label>
        <NotesField id={`${uid}-notes`} value={r.notes ?? ""} onCommit={(v) => updateRun(r.id, { notes: v })} />
      </div>
      <DeviceInstallSection run={r} />
      <p className="text-xs text-slate-500">{t("Drag the white handles to reshape the run.")}</p>
      <button className="btn btn-danger w-full" onClick={() => deleteEntity("runs", r.id)}>
        <Trash /> {t("Delete run")}
      </button>
    </>
  );
}

/** Electrical circuit details on a run: number, breaker, voltage, poles, what it feeds. */
function CircuitEditor({ run, onChange }: { run: Run; onChange: (c: CircuitInfo) => void }) {
  const t = useT();
  const uid = useId();
  const c = run.circuit ?? {};
  const set = (patch: Partial<CircuitInfo>) => onChange({ ...c, ...patch });
  return (
    <div className="space-y-2 rounded-xl bg-orange-50/60 p-3 ring-1 ring-orange-200">
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Circuit #")} value={c.number ?? ""} placeholder={t("e.g. 12 or 3/5")} onCommit={(v) => set({ number: v.trim() || null })} />
        <div>
          <label className="label" htmlFor={`${uid}-breaker`}>{t("Breaker")}</label>
          <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-breaker`} value={c.breakerA ?? ""} onChange={(e) => set({ breakerA: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {BREAKER_SIZES.map((a) => (
              <option key={a} value={a}>
                {a} A
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-voltage`}>{t("Voltage")}</label>
          <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-voltage`} value={c.volts ?? 120} onChange={(e) => { const v = Number(e.target.value); set({ volts: v, poles: v >= 208 ? Math.max(2, c.poles ?? 2) : 1 }); }}>
            {[120, 240, 208, 277].map((v) => (
              <option key={v} value={v}>
                {v} V
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-poles`}>{t("Poles")}</label>
          <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-poles`} value={c.poles ?? 1} onChange={(e) => set({ poles: Number(e.target.value) })}>
            {[1, 2, 3].map((p) => (
              <option key={p} value={p}>
                {t("{n}-pole", { n: p })}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Field label={t("Feeds")} value={c.description ?? ""} placeholder={t("e.g. Kitchen counter receptacles")} onCommit={(v) => set({ description: v.trim() || null })} />
      {c.breakerA ? <p className="text-xs text-slate-500">{t("Usual wire for {a} A: {wire}", { a: c.breakerA, wire: wireForBreaker(c.breakerA, c.volts ?? 120) })}</p> : null}
    </div>
  );
}

function ClosetInspector({ id }: { id: string }) {
  const t = useT();
  const uid = useId();
  const { closets, markers, updateCloset, deleteEntity } = useEditor();
  const trades = useTrades();
  const c = closets.find((x) => x.id === id);
  if (!c) return null;
  const n = sumQty(markers.filter((m) => m.closetId === c.id));
  // This company's kinds, plus the closet's own kind if it's from another trade.
  const kinds = tradeClosetKinds(trades);
  if (!kinds.some((k) => k.id === c.kind)) kinds.push(closetMeta(c.kind));
  return (
    <>
      <h3 className="font-semibold">{c.name}</h3>
      <Field label={t("Name")} value={c.name} onCommit={(v) => updateCloset(c.id, { name: v })} />
      <div>
        <label className="label" htmlFor={`${uid}-kind`}>{t("Kind")}</label>
        <select className="input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" id={`${uid}-kind`} value={c.kind} onChange={(e) => updateCloset(c.id, { kind: e.target.value as ClosetKind })}>
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-slate-600">{t.tn("{n} device is wired back here.", "{n} devices are wired back here.", n)}</p>
      <div>
        <label className="label" htmlFor={`${uid}-notes`}>{t("Notes")}</label>
        <NotesField id={`${uid}-notes`} value={c.notes ?? ""} onCommit={(v) => updateCloset(c.id, { notes: v })} />
      </div>
      <button className="btn btn-danger w-full" onClick={() => deleteEntity("closets", c.id)}>
        <Trash /> {t("Delete closet")}
      </button>
    </>
  );
}

function SiteThumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const t = useT();
  const url = useBlobUrl(photo.imageId);
  return (
    <button onClick={onOpen} className="h-14 w-14 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200" aria-label={photo.caption || t("Open photo")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

/**
 * "N photos" and "N tasks" for a device, when it has any: one tap opens the Photos tab filtered to the device, or the
 * task (the Tasks tab filtered to the device when there are several). The plan shows where; the tabs hold the rest.
 */
function DeviceLinks({ markerId }: { markerId: string }) {
  const t = useT();
  const { setTab } = useJobNav();
  const projectId = useEditor((s) => s.project?.id);
  const photos = useEditor((s) => s.photos).filter((p) => !p.deleted && p.markerId === markerId).length;
  const tasks = useProjectTasks(projectId).filter((tk) => !tk.deleted && tk.markerId === markerId);
  if (!photos && !tasks.length) return null;
  const chip = "chip h-9 gap-1.5 bg-brand-50 px-3 text-sm font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100 [&_svg]:h-4 [&_svg]:w-4";
  return (
    <div className="flex flex-wrap gap-2" data-testid="device-links">
      {photos > 0 && (
        <button type="button" className={chip} onClick={() => setTab("photos", { device: markerId })} data-testid="device-photos">
          <Camera />
          {t.tn("{n} photo", "{n} photos", photos)}
        </button>
      )}
      {tasks.length > 0 && (
        <button
          type="button"
          className={chip}
          onClick={() => setTab("tasks", tasks.length === 1 ? { tf: "", task: tasks[0].id } : { tf: encodeTaskFilter({ markerId }) })}
          data-testid="device-tasks"
        >
          <ListTodo />
          {t.tn("{n} task", "{n} tasks", tasks.length)}
        </button>
      )}
    </div>
  );
}

/** Job photos linked to this device (the camera badge on the plan); add one straight from here. */
function SitePhotos({ markerId, sheetId, room }: { markerId: string; sheetId: string; room: string }) {
  const t = useT();
  const { photos, project, saveRow } = useEditor();
  const { email } = useSyncStatus();
  const [viewer, setViewer] = useState<string | null>(null);
  const list = photos.filter((p) => !p.deleted && p.markerId === markerId).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  return (
    <div>
      <div className="label">{t("Site photos ({n})", { n: list.length })}</div>
      {list.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {list.map((p) => (
            <SiteThumb key={p.id} photo={p} onOpen={() => setViewer(p.id)} />
          ))}
        </div>
      )}
      <label className="btn btn-sm cursor-pointer">
        <Camera /> {t("Add site photo")}
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
            toast(t("Photo added to this device"), "success");
          }}
        />
      </label>
      {viewer && <PhotoViewer photos={list} startId={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
