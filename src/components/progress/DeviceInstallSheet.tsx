"use client";
// One device's (or run's) install record, for the field: big status buttons, proof photos, a test result (pass/fail
// plus a reading such as dB loss or ohms), "Report issue", and the history. Bottom sheet on phones, dialog on desktop.
import { AlertTriangle, BadgeCheck, Camera, Check, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { STATUS_COLORS, STATUS_LABELS, canResetInstall, canSetInstall, statusOf, testText, workflowOf, type Workflow } from "@/lib/installProgress";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import { useBlobUrl } from "@/lib/useImage";
import { useTrades } from "@/lib/useTrades";
import type { InstallStatus, Marker, Photo, Run } from "@/lib/types";
import PhotoViewer from "../photos/PhotoViewer";
import { attachPhoto, itemLabel, photoNeeded, resetInstall, saveProofPhoto, saveTest, setInstall } from "./actions";
import type { InstallRef } from "./progressStore";

export function testPlaceholder(w: Workflow): string {
  if (w.id === "cable") return "e.g. 0.4 dB loss, 92 m";
  if (w.id === "circuit" || w.id === "electrical") return "e.g. 0.3 Ω, 120 V";
  if (w.id === "pipe" || w.id === "plumbing" || w.id === "hvac") return "e.g. 150 psi held 15 min";
  if (w.id === "fire") return "e.g. signal received at panel";
  return "Reading (optional)";
}

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export default function DeviceInstallSheet({ item: ref, onClose }: { item: InstallRef; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // Only opened by a tap, never during prerender.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose} data-plan-ui>
      <div
        role="dialog"
        aria-label="Install progress"
        className="animate-in scroll-thin max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="device-install-sheet"
      >
        <InstallBody ref_={ref} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}

function InstallBody({ ref_: ref, onClose }: { ref_: InstallRef; onClose: () => void }) {
  const markers = useEditor((s) => s.markers);
  const runs = useEditor((s) => s.runs);
  const catalog = useEditor((s) => s.catalog);
  const item: Marker | Run | undefined = ref.table === "markers" ? markers.find((m) => m.id === ref.id) : runs.find((r) => r.id === ref.id);
  if (!item || item.deleted)
    return (
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">This device was deleted.</p>
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    );
  const type = "points" in item ? undefined : catalog.find((d) => d.id === item.deviceTypeId);
  return (
    <>
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="section-title">Install progress</div>
          <h3 className="truncate text-lg font-semibold">{itemLabel(item)}</h3>
          <p className="truncate text-xs text-slate-500">
            {"points" in item ? (item.kind === "wire" ? `${item.wireType || "Cable"} run` : "LED run") : [type?.name, item.room].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button className="btn btn-icon btn-ghost h-11 w-11" onClick={onClose} aria-label="Close">
          <X />
        </button>
      </div>
      <InstallControls item={item} table={ref.table} big />
    </>
  );
}

/** Status buttons, photos, test, issue and history for one item. Shared by the sheet and the inspector. */
export function InstallControls({ item, table, big }: { item: Marker | Run; table: "markers" | "runs"; big?: boolean }) {
  const role = useRole();
  const trades = useTrades();
  const catalog = useEditor((s) => s.catalog);
  const allPhotos = useEditor((s) => s.photos);
  const ref: InstallRef = { table, id: item.id };
  const wf = useMemo(() => workflowOf(item, catalog, trades), [item, catalog, trades]);
  const status = statusOf(item);
  const inst = item.install ?? null;
  const markerId = "points" in item ? item.markerId : item.id;
  const photos = useMemo(
    () => allPhotos.filter((p) => !p.deleted && (inst?.photoIds?.includes(p.id) || (markerId && p.markerId === markerId))).sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
    [allPhotos, inst?.photoIds, markerId],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [pass, setPass] = useState<boolean | null>(inst?.test ? inst.test.pass : null);
  const [value, setValue] = useState(inst?.test?.value ?? "");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueNote, setIssueNote] = useState("");
  const tentative = !!item.tentative;

  const run = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await f();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const pickPhoto = (then: (file: File) => Promise<void>) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void run("photo", () => then(f));
    };
    input.click();
  };
  const go = (to: InstallStatus) => {
    if (photoNeeded(to) && status !== to)
      return pickPhoto(async (f) => {
        const photoId = await saveProofPhoto(f, ref);
        if (photoId) await setInstall(ref, to, { photoId });
      });
    void run(to, () => setInstall(ref, to));
  };

  if (tentative) return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">Optional (?) devices aren&apos;t tracked. Confirm the device first.</p>;

  const steps: InstallStatus[] = [...wf.steps, ...(canSetInstall(role, "verified") ? (["verified"] as InstallStatus[]) : [])];
  const h = big ? "h-14" : "h-10";
  return (
    <div className="space-y-4" data-testid="install-controls">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: STATUS_COLORS[status] }} />
        <span className="text-sm font-semibold">{status === "planned" ? "Not started" : wf.labels[status]}</span>
        {inst?.at && (
          <span className="truncate text-xs text-slate-500">
            {inst.by ? `${inst.by} · ` : ""}
            {when(inst.at)}
          </span>
        )}
      </div>
      <div className={`grid gap-2 ${steps.length > 3 ? "grid-cols-2" : "grid-cols-3"}`}>
        {steps.map((s) => {
          const on = status === s;
          const allowed = canSetInstall(role, s, status);
          return (
            <button
              key={s}
              className={`flex ${h} flex-col items-center justify-center rounded-xl px-2 text-sm font-semibold ring-1 transition active:scale-[0.98] disabled:opacity-40 ${on ? "text-white ring-transparent" : "bg-white text-slate-800 ring-slate-200 hover:bg-slate-50"}`}
              style={on ? { background: STATUS_COLORS[s] } : undefined}
              disabled={!allowed || !!busy}
              onClick={() => go(s)}
              aria-pressed={on}
            >
              <span className="flex items-center gap-1.5">
                {on ? <Check className="h-4 w-4" /> : s === "verified" ? <BadgeCheck className="h-4 w-4" style={{ color: STATUS_COLORS[s] }} /> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[s] }} />}
                {wf.labels[s]}
              </span>
              {photoNeeded(s) && !on && <span className="text-[10px] font-normal opacity-70">photo</span>}
            </button>
          );
        })}
      </div>

      <div>
        <div className="label">Proof photos ({photos.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {photos.map((p) => (
            <Thumb key={p.id} photo={p} onOpen={() => setViewer(p.id)} />
          ))}
          <button
            className={`flex ${big ? "h-16 w-16" : "h-14 w-14"} flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 ring-dashed hover:bg-slate-50`}
            onClick={() =>
              pickPhoto(async (f) => {
                const id = await saveProofPhoto(f, ref);
                if (id) await attachPhoto(ref, id);
              })
            }
            disabled={busy === "photo"}
          >
            <Camera className="h-5 w-5" />
            {busy === "photo" ? "Saving…" : "Add"}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="label">Test result{inst?.test ? ` · last: ${testText(inst.test)}` : ""}</div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button className={`${h} rounded-xl text-sm font-semibold ring-1 ${pass === true ? "bg-emerald-600 text-white ring-transparent" : "bg-white ring-slate-200"}`} onClick={() => setPass(true)} aria-pressed={pass === true}>
            Pass
          </button>
          <button className={`${h} rounded-xl text-sm font-semibold ring-1 ${pass === false ? "bg-red-600 text-white ring-transparent" : "bg-white ring-slate-200"}`} onClick={() => setPass(false)} aria-pressed={pass === false}>
            Fail
          </button>
        </div>
        <div className="flex gap-2">
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={testPlaceholder(wf)} aria-label="Test reading" />
          <button
            className="btn btn-primary h-10"
            disabled={pass === null || !!busy || !canSetInstall(role, pass ? "tested" : "issue", status)}
            onClick={() => run("test", () => saveTest(ref, { pass: !!pass, value: value.trim() || null }))}
          >
            Save
          </button>
        </div>
      </div>

      {!issueOpen ? (
        <button className="btn btn-danger w-full" onClick={() => setIssueOpen(true)} disabled={!canSetInstall(role, "issue", status)}>
          <AlertTriangle /> Report issue
        </button>
      ) : (
        <div className="space-y-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <label className="label text-red-700">What&apos;s wrong?</label>
          <textarea className="input min-h-16" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} placeholder="e.g. Box missing, ceiling not open yet" autoFocus />
          <div className="flex gap-2">
            <button
              className="btn btn-danger flex-1"
              disabled={!!busy}
              onClick={() =>
                run("issue", async () => {
                  if (await setInstall(ref, "issue", { note: issueNote })) {
                    setIssueOpen(false);
                    setIssueNote("");
                  }
                })
              }
            >
              Flag issue
            </button>
            <button className="btn" onClick={() => setIssueOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!!inst?.history?.length && (
        <div>
          <div className="label">History</div>
          <ol className="space-y-1.5 text-xs">
            {[...inst.history].reverse().map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[e.status] ?? "#94a3b8" }} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{e.status === "planned" ? "Reset" : (wf.labels[e.status] ?? STATUS_LABELS[e.status])}</span>
                  {e.note ? <span className="text-slate-600"> — {e.note}</span> : null}
                  <span className="block text-slate-400">
                    {e.by ? `${e.by} · ` : ""}
                    {when(e.at)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {canResetInstall(role) && inst && (
        <button className="btn btn-sm btn-ghost text-slate-500" onClick={() => confirm("Clear this device's progress and history?") && void run("reset", () => resetInstall(ref))}>
          <RotateCcw /> Reset progress
        </button>
      )}
      {viewer && <PhotoViewer photos={photos} startId={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

function Thumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const url = useBlobUrl(photo.imageId);
  return (
    <button onClick={onOpen} className="h-16 w-16 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200" aria-label={photo.caption || "Open photo"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}
