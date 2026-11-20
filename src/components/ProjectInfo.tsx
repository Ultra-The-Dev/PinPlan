"use client";
import { ChevronDown, DatabaseBackup, MapPin, Receipt, Save, Tag } from "lucide-react";
import { useState } from "react";
import { exportProjectBackup } from "@/lib/backup";
import { formatMoney } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import JobHealth from "./JobHealth";
import ProgressPanel from "./progress/ProgressPanel";
import JobTemplatesCard from "./templates/JobTemplatesCard";
import { toast } from "@/lib/toast";
import { currentPosition, mapsLink } from "@/lib/photos";
import { fmtDate, msg, useT } from "@/lib/i18n";

/** Common job labels for low-voltage work (any label can be typed). */
export const SUGGESTED_LABELS = [msg("Pre-wire"), msg("Trim-out"), msg("Service call"), msg("Waiting on GC"), msg("Waiting on client"), msg("Punch list"), msg("Warranty"), msg("Commercial")];

function JobLabels() {
  const t = useT();
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
        <h3 className="font-semibold">{t("Labels")}</h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <button key={l} className="chip bg-brand-50 text-brand-700 hover:bg-red-50 hover:text-red-700" title={t("Remove label")} onClick={() => set(labels.filter((x) => x !== l))}>
            {l} ×
          </button>
        ))}
        {!labels.length && <span className="text-sm text-slate-500">{t("Filter the Jobs page by label.")}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {SUGGESTED_LABELS.filter((l) => !labels.includes(l) && !labels.includes(t(l))).map((l) => (
          <button key={l} className="chip bg-slate-100 text-slate-600 hover:bg-slate-200" onClick={() => add(t(l))}>
            + {t(l)}
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
        <input className="input h-9" placeholder={t("New label")} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn btn-sm" disabled={!draft.trim()}>
          {t("Add")}
        </button>
      </form>
    </section>
  );
}

function JobLocation() {
  const t = useT();
  const { project, updateProject, photos } = useEditor();
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const has = project.lat != null && project.lng != null;
  const gpsPhoto = photos.find((p) => !p.deleted && p.lat != null && p.lng != null);
  return (
    <section className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-slate-400" />
        <h3 className="font-semibold">{t("Location")}</h3>
      </div>
      {has ? (
        <a className="text-sm text-brand-600 hover:underline" href={mapsLink(project.lat!, project.lng!)} target="_blank" rel="noreferrer">
          {t("{coords} — open in Maps", { coords: `${project.lat!.toFixed(5)}, ${project.lng!.toFixed(5)}` })}
        </a>
      ) : (
        <p className="text-sm text-slate-500">{t("Shows the job on the jobs map. Set automatically from the first photo with GPS.")}</p>
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
            else toast(t("Location isn’t available — allow location access in the browser."), "error");
          }}
        >
          {busy ? t("Locating…") : t("Use my location")}
        </button>
        {gpsPhoto && (
          <button className="btn btn-sm" onClick={() => void updateProject({ lat: gpsPhoto.lat, lng: gpsPhoto.lng })}>
            {t("Use a photo’s location")}
          </button>
        )}
        {has && (
          <button className="btn btn-sm btn-ghost text-slate-500" onClick={() => void updateProject({ lat: null, lng: null })}>
            {t("Clear")}
          </button>
        )}
      </div>
    </section>
  );
}

/** The job's Overview tab: health and the next step first, then the details, then everything else under "More". */
export default function ProjectInfo() {
  const t = useT();
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
        {/* Install progress (was on the Crew tab), once there are devices to install. */}
        {markers.length > 0 && (
          <div className="lg:col-span-2">
            <ProgressPanel />
          </div>
        )}
        <form
          className="card space-y-4 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            await updateProject(form);
            toast(t("Job details saved"));
          }}
        >
          <div>
            <h2 className="text-lg font-semibold">{t("Job details")}</h2>
            <p className="text-sm text-slate-500">{prices ? t("Shown on quotes, invoices and the client link.") : t("Address, client contact and site notes for the crew.")}</p>
          </div>
          {field("address", t("Job address"))}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field("clientName", t("Client name"))}</div>
            {field("clientEmail", t("Client email"), "email")}
            {field("clientPhone", t("Client phone"), "tel")}
          </div>
          <div>
            <label className="label" htmlFor="job-notes">{t("Notes")}</label>
            <textarea id="job-notes" className="input min-h-28" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("Gate code, site contact, special requests…")} />
          </div>
          <div className="flex justify-end">
            <button className="btn btn-brand" disabled={!dirty}>
              <Save /> {t("Save changes")}
            </button>
          </div>
        </form>

        <div className="space-y-5">
          <JobLocation />
        </div>

        <details className="group lg:col-span-2" data-testid="overview-more">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            {t("More")}
            <span className="font-normal text-slate-500">{t("Labels, job templates, backup")}</span>
          </summary>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            <JobLabels />
            <JobTemplatesCard />
            {/* Jobs sent to Billdu before keep their list; nothing shows unless the job has some. */}
            {prices && project.billduDocs.length > 0 && (
              <section className="card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-slate-400" />
                  <h3 className="font-semibold">{t("Billdu documents")}</h3>
                </div>
                <ul className="divide-y divide-slate-100">
                  {project.billduDocs.map((d) => (
                    <li key={`${d.type}-${d.id}`} className="flex items-center gap-2 py-2 text-sm">
                      <span className="chip bg-slate-100 capitalize text-slate-600">{d.type}</span>
                      <span className="min-w-0 flex-1 truncate">{d.serial || `#${d.id}`}{d.percent ? ` · ${d.percent}%` : ""}</span>
                      <span className="font-medium tabular-nums">{formatMoney(d.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
                {project.billduClientId ? <p className="mt-3 text-xs text-slate-400">{t("Billdu client #{id}", { id: project.billduClientId })}</p> : null}
              </section>
            )}

            <section className="card p-5">
              <div className="mb-1 flex items-center gap-2">
                <DatabaseBackup className="h-4 w-4 text-slate-400" />
                <h3 className="font-semibold">{t("Backup")}</h3>
              </div>
              <p className="mb-3 text-sm text-slate-500">
                {t("One file with all sheets ({sheets}), devices ({devices}), runs and pricing edits. Restore it from the Jobs page on any device.", { sheets: sheets.length, devices: markers.length })}
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
                <DatabaseBackup /> {busy ? t("Preparing…") : t("Download backup")}
              </button>
            </section>
          </div>
        </details>

        <p className="px-1 text-xs text-slate-400 lg:col-span-2">
          {t("Created {created} · Updated {updated}", { created: fmtDate(project.createdAt), updated: fmtDate(project.updatedAt, { dateStyle: "medium", timeStyle: "short" }) })}
        </p>
      </div>
    </div>
  );
}
