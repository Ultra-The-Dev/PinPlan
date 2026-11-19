"use client";
import { DatabaseBackup, MapPin, Receipt, Save, Tag } from "lucide-react";
import { useState } from "react";
import { exportProjectBackup } from "@/lib/backup";
import { formatMoney } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import JobHealth from "./JobHealth";
import JobTemplatesCard from "./templates/JobTemplatesCard";
import { toast } from "@/lib/toast";
import { currentPosition, mapsLink } from "@/lib/photos";

/** Common job labels for low-voltage work (any label can be typed). */
export const SUGGESTED_LABELS = ["Pre-wire", "Trim-out", "Service call", "Waiting on GC", "Waiting on client", "Punch list", "Warranty", "Commercial"];

function JobLabels() {
  const { project, updateProject } = useEditor();
  const [draft, setDraft] = useState("");
  if (!project) return null;
  const labels = project.labels ?? [];
  const set = (next: string[]) => void updateProject({ labels: next.length ? next : null });
  const add = (l: string) => {
    const v = l.trim();
    if (v && !labels.includes(v)) set([...labels, v]);
    setDraft("");
  };
  return (
    <section className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Tag className="h-4 w-4 text-slate-400" />
        <h3 className="font-semibold">Labels</h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <button key={l} className="chip bg-brand-50 text-brand-700 hover:bg-red-50 hover:text-red-700" title="Remove label" onClick={() => set(labels.filter((x) => x !== l))}>
            {l} ×
          </button>
        ))}
        {!labels.length && <span className="text-sm text-slate-500">Sort jobs on the Projects page by label.</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {SUGGESTED_LABELS.filter((l) => !labels.includes(l)).map((l) => (
          <button key={l} className="chip bg-slate-100 text-slate-600 hover:bg-slate-200" onClick={() => add(l)}>
            + {l}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <input className="input h-9" placeholder="New label" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn btn-sm" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

function JobLocation() {
  const { project, updateProject, photos } = useEditor();
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const has = project.lat != null && project.lng != null;
  const gpsPhoto = photos.find((p) => !p.deleted && p.lat != null && p.lng != null);
  return (
    <section className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-slate-400" />
        <h3 className="font-semibold">Location</h3>
      </div>
      {has ? (
        <a className="text-sm text-brand-600 hover:underline" href={mapsLink(project.lat!, project.lng!)} target="_blank" rel="noreferrer">
          {project.lat!.toFixed(5)}, {project.lng!.toFixed(5)} — open in Maps
        </a>
      ) : (
        <p className="text-sm text-slate-500">Shows the job on the jobs map. Set automatically from the first photo with GPS.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const pos = await currentPosition(10000);
            setBusy(false);
            if (pos) await updateProject(pos);
            else toast("Location isn’t available — allow location access in the browser.", "error");
          }}
        >
          {busy ? "Locating…" : "Use my location"}
        </button>
        {gpsPhoto && (
          <button className="btn btn-sm" onClick={() => void updateProject({ lat: gpsPhoto.lat, lng: gpsPhoto.lng })}>
            Use a photo’s location
          </button>
        )}
        {has && (
          <button className="btn btn-sm btn-ghost text-slate-500" onClick={() => void updateProject({ lat: null, lng: null })}>
            Clear
          </button>
        )}
      </div>
    </section>
  );
}

export default function ProjectInfo() {
  const { project, updateProject, settings, sheets, markers } = useEditor();
  const [form, setForm] = useState(() => ({
    address: project?.address ?? "",
    clientName: project?.clientName ?? "",
    clientEmail: project?.clientEmail ?? "",
    clientPhone: project?.clientPhone ?? "",
    notes: project?.notes ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const prices = can(useRole(), "prices");
  if (!project) return null;
  const currency = settings?.pricing.currency ?? "USD";
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => (project[k] ?? "") !== form[k]);
  const field = (k: keyof typeof form, label: string, type = "text") => (
    <div>
      <label className="label" htmlFor={`job-${k}`}>{label}</label>
      <input id={`job-${k}`} className="input" type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <JobHealth />
        <form
          className="card space-y-4 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            await updateProject(form);
            toast("Job details saved");
          }}
        >
          <div>
            <h2 className="text-lg font-semibold">Job details</h2>
            <p className="text-sm text-slate-500">{prices ? "Used on the estimate PDF and to find or create the client in Billdu." : "Address, client contact and site notes for the crew."}</p>
          </div>
          {field("address", "Job address")}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field("clientName", "Client name")}</div>
            {field("clientEmail", "Client email", "email")}
            {field("clientPhone", "Client phone", "tel")}
          </div>
          <div>
            <label className="label" htmlFor="job-notes">Notes</label>
            <textarea id="job-notes" className="input min-h-28" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Gate code, site contact, special requests…" />
          </div>
          <div className="flex justify-end">
            <button className="btn btn-brand" disabled={!dirty}>
              <Save /> Save changes
            </button>
          </div>
        </form>

        <div className="space-y-5">
          <JobLabels />
          <JobLocation />
          {prices && (
          <section className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold">Billdu documents</h3>
            </div>
            {project.billduDocs.length ? (
              <ul className="divide-y divide-slate-100">
                {project.billduDocs.map((d) => (
                  <li key={`${d.type}-${d.id}`} className="flex items-center gap-2 py-2 text-sm">
                    <span className="chip bg-slate-100 capitalize text-slate-600">{d.type}</span>
                    <span className="min-w-0 flex-1 truncate">{d.serial || `#${d.id}`}{d.percent ? ` · ${d.percent}%` : ""}</span>
                    <span className="font-medium tabular-nums">{formatMoney(d.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nothing sent yet. Send from the Estimate tab.</p>
            )}
            {project.billduClientId ? <p className="mt-3 text-xs text-slate-400">Billdu client #{project.billduClientId}</p> : null}
          </section>
          )}

          <section className="card p-5">
            <div className="mb-1 flex items-center gap-2">
              <DatabaseBackup className="h-4 w-4 text-slate-400" />
              <h3 className="font-semibold">Backup</h3>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              One file with all {sheets.length} sheets, {markers.length} devices, runs and estimate edits. Restore it from the Projects page on any device.
            </p>
            <button
              className="btn w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await exportProjectBackup(project.id);
                } catch (e) {
                  toast(e instanceof Error ? e.message : String(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <DatabaseBackup /> {busy ? "Preparing…" : "Download backup"}
            </button>
          </section>

          <JobTemplatesCard />

          <p className="px-1 text-xs text-slate-400">
            Created {new Date(project.createdAt).toLocaleDateString()} · Updated {new Date(project.updatedAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
