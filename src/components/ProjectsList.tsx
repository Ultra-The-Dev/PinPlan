"use client";
import { projectStatusLabel, statusChip } from "@/lib/statusStyle";
import { Compass, FileText, LifeBuoy, Loader2, MapPin, Plus, Search, Trash, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { db, ensureSeeded, newId, nowIso, put, remove } from "@/lib/db";
import { importBackup } from "@/lib/backup";
import { fmtDate, useT } from "@/lib/i18n";
import { useSyncStatus } from "@/lib/sync";
import { jobHref } from "@/lib/tabRoutes";
import { useRole, useTeam } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { toast } from "@/lib/toast";
import { SHEET_THUMB } from "@/lib/thumbs";
import { useThumbUrl } from "@/lib/useImage";
import type { Project, ProjectStatus } from "@/lib/types";
import JobsViewToggle from "./nav/JobsViewToggle";
import { useTemplateStart } from "./templates/TemplatePicker";
import { startTour } from "./tour/startTour";
import { tourAnchor } from "@/lib/tour/anchors";

const STATUS_STYLE: Record<ProjectStatus, string> = { estimate: statusChip("estimate"), approved: statusChip("approved"), installed: statusChip("installed") };

interface Row extends Project {
  sheetCount: number;
  markerCount: number;
  ledFt: number;
  photoCount: number;
  coverImageId: string | null;
}

async function fetchRows(): Promise<Row[]> {
  await ensureSeeded();
  const d = db();
  const projects = (await d.projects.toArray()).filter((p) => !p.deleted);
  const rows = await Promise.all(
    projects.map(async (p) => {
      const sheets = (await d.sheets.where("projectId").equals(p.id).toArray()).filter((s) => !s.deleted).sort((a, b) => a.order - b.order);
      const markers = (await d.markers.where("projectId").equals(p.id).toArray()).filter((m) => !m.deleted);
      const runs = (await d.runs.where("projectId").equals(p.id).toArray()).filter((r) => !r.deleted && r.kind !== "wire" && !r.tentative);
      const ledFt = runs.reduce((n, r) => n + (r.kind === "stair" ? (r.typedFt ?? (r.steps ?? 0) * (r.lfPerStep ?? 0)) : (r.typedFt ?? r.measuredFt ?? 0)), 0);
      const photos = (await d.photos.where("projectId").equals(p.id).toArray()).filter((x) => !x.deleted).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
      return {
        ...p,
        billduDocs: p.billduDocs ?? [],
        sheetCount: sheets.length,
        markerCount: markers.length,
        ledFt: Math.round(ledFt),
        photoCount: photos.length,
        // Cover: the first plan sheet, else the newest job photo.
        coverImageId: sheets[0]?.imageId ?? photos[0]?.imageId ?? null,
      };
    }),
  );
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export default function ProjectsList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ clientName: "", address: "", clientEmail: "", clientPhone: "" });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [label, setLabel] = useState<string | null>(null);
  const role = useRole();
  const t = useT();
  // Office: create, restore and delete jobs. Technicians work on the jobs the office set up.
  const office = can(role, "prices");
  const onTeam = useTeam((s) => !!s.team);
  const sync = useSyncStatus();
  // Signed in to a team on a fresh device: the jobs are on their way down, so say so rather than "no jobs".
  const fetching = onTeam && sync.configured && sync.signedIn && !sync.lastSyncAt && (sync.syncing || sync.online);
  const restoreRef = useRef<HTMLInputElement>(null);
  const template = useTemplateStart();
  const refresh = () => fetchRows().then(setRows);

  useEffect(() => {
    let alive = true;
    const run = () => fetchRows().then((r) => alive && setRows(r));
    run();
    window.addEventListener("pinplan:synced", run);
    return () => {
      alive = false;
      window.removeEventListener("pinplan:synced", run);
    };
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.address.trim() && !form.clientName.trim()) return;
    const p: Project = {
      id: newId(),
      clientName: form.clientName.trim(),
      address: form.address.trim(),
      clientEmail: form.clientEmail.trim(),
      clientPhone: form.clientPhone.trim(),
      status: "estimate",
      billduDocs: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await put("projects", p);
    await template.applyThenOpen(p, () => router.push(jobHref(p.id, "plan", { manage: "1" })));
  }

  async function del(p: Row) {
    if (!confirm(t("Delete job “{name}”? This removes its sheets and devices.", { name: p.address || p.clientName }))) return;
    await remove("projects", p.id);
    refresh();
    toast(t("Job deleted"));
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const n = await importBackup(file);
      toast(t.tn("Restored {n} job", "Restored {n} jobs", n));
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      if (restoreRef.current) restoreRef.current.value = "";
    }
  }

  const filtered = rows?.filter(
    (r) => (status === "all" || r.status === status) && (!label || (r.labels ?? []).includes(label)) && `${r.clientName} ${r.address} ${(r.labels ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase()),
  );
  const allLabels = rows ? [...new Set(rows.flatMap((r) => r.labels ?? []))].sort() : [];
  const totals = rows ? { all: rows.length, estimate: rows.filter((r) => r.status === "estimate").length, approved: rows.filter((r) => r.status === "approved").length, installed: rows.filter((r) => r.status === "installed").length } : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">{t("Jobs")}</h1>
          <p className="mt-1 text-sm text-slate-500">{office ? t("Plans, device counts, quotes and invoices for every job.") : t("Every job on your team: plans, devices, photos and checklists.")}</p>
        </div>
        {office && (
          <>
            <input ref={restoreRef} type="file" accept="application/json,.json,.pinplan" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
            <button className="btn max-sm:hidden" onClick={() => restoreRef.current?.click()} title={t("Restore a job backup")}>
              <Upload /> {t("Restore backup")}
            </button>
            <button className="btn btn-brand" onClick={() => setCreating(true)} {...tourAnchor("jobs-new")}>
              <Plus /> {t("New job")}
            </button>
          </>
        )}
      </div>
      <div className="mb-5">
        <JobsViewToggle />
      </div>

      {rows && rows.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="seg">
            {(["all", "estimate", "approved", "installed"] as const).map((s) => (
              <button key={s} className={`tab h-7 ${status === s ? "tab-active" : ""}`} onClick={() => setStatus(s)}>
                {s === "all" ? t("All") : t(projectStatusLabel(s))} <span className="text-xs text-slate-400">{totals![s]}</span>
              </button>
            ))}
          </div>
          {allLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allLabels.map((l) => (
                <button key={l} className={`chip ${label === l ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`} onClick={() => setLabel(label === l ? null : l)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <div className="relative w-full sm:ml-auto sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder={t("Search client, address or label")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center" onClick={() => setCreating(false)}>
          <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="card animate-in grid max-h-[calc(100dvh-2rem)] w-full max-w-lg gap-4 overflow-y-auto overscroll-contain p-5 shadow-pop sm:grid-cols-2 sm:p-6">
            <div className="flex items-start sm:col-span-2">
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{t("New job")}</h2>
                <p className="text-sm text-slate-500">{t("Next you'll upload the plan set.")}</p>
              </div>
              <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={() => setCreating(false)} aria-label={t("Close")}>
                <X />
              </button>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="new-job-address">{t("Job address")}</label>
              <input id="new-job-address" className="input" autoFocus placeholder="12 Maple Ridge Rd" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="new-client-name">{t("Client name")}</label>
              <input id="new-client-name" className="input" placeholder={t("Client or company")} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="new-client-email">{t("Client email")}</label>
              <input id="new-client-email" className="input" type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="new-client-phone">{t("Client phone")}</label>
              <input id="new-client-phone" className="input" type="tel" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
            </div>
            {template.field}
            <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                {t("Cancel")}
              </button>
              <button className="btn btn-brand" disabled={!form.address.trim() && !form.clientName.trim()}>
                {t("Create & upload plans")}
              </button>
            </div>
          </form>
        </div>
      )}

      {template.dialog}
      {rows === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-64 animate-pulse bg-slate-100/60" />
          ))}
        </div>
      ) : rows.length === 0 && fetching ? (
        <div className="card mx-auto max-w-xl px-8 py-14 text-center" role="status">
          <Loader2 className="mx-auto mb-4 h-7 w-7 animate-spin text-brand-600" />
          <h2 className="text-xl font-semibold">{t("Getting your team's jobs…")}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{t("The first download can take a minute on a slow connection.")}</p>
        </div>
      ) : rows.length === 0 && !office ? (
        <div className="card mx-auto max-w-xl px-8 py-14 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <MapPin className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold">{t("Your office's jobs will show up here")}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{t("When the office adds a job, its plans, devices, tasks and checklists appear on this page.")}</p>
          <Link href="/help/crew" className="btn mt-6">
            <LifeBuoy /> {t("Crew guide: tasks, photos, checklists and daily logs")}
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <div className="card mx-auto max-w-xl px-8 py-14 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <MapPin className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold">{t("Start your first job")}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            {t("Create a job, upload the plan set (PDF or phone photos), then tap to place each device and draw the wire runs.")}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-left text-xs text-slate-600">
            {[t("Upload plans"), t("Tap to place devices"), t("Counts → quote → invoice")].map((step, i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <div className="mb-1 font-semibold text-brand-600">{i + 1}</div>
                {step}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button className="btn btn-brand" onClick={() => setCreating(true)}>
              <Plus /> {t("New job")}
            </button>
            <button className="btn" onClick={() => void startTour("first-job")} data-testid="empty-start-tour">
              <Compass /> {t("Start the tour")}
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            <Link href="/help" className="font-medium text-brand-700 hover:underline">
              {t("Help and tutorials")}
            </Link>
          </p>
        </div>
      ) : filtered!.length === 0 ? (
        <p className="py-10 text-center text-slate-500">{t("No jobs match.")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered!.map((p) => (
            <ProjectCard key={p.id} p={p} onDelete={can(role, "deleteJob") ? () => del(p) : undefined} prices={office} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({ p, onDelete, prices }: { p: Row; onDelete?: () => void; prices: boolean }) {
  // A small preview, not the full sheet: a dozen full-size sheets would exhaust an iPad's memory (src/lib/thumbs.ts).
  const img = useThumbUrl(p.coverImageId, SHEET_THUMB);
  const t = useT();
  return (
    <li className="card group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-pop">
      <Link href={`/project?id=${p.id}`} className="block">
        <div className="relative aspect-[16/9] overflow-hidden border-b border-slate-100 bg-slate-50">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-center opacity-90 transition group-hover:scale-[1.02] group-hover:opacity-100" />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300">
              <FileText className="h-10 w-10" />
            </div>
          )}
          <span className={`chip absolute top-3 left-3 ${STATUS_STYLE[p.status]}`}>{t(projectStatusLabel(p.status))}</span>
        </div>
        <div className="p-4">
          <div className="truncate font-semibold text-slate-900">{p.address || t("Untitled job")}</div>
          <div className="truncate text-sm text-slate-500">{p.clientName || t("No client name")}</div>
          {(p.labels ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(p.labels ?? []).map((l) => (
                <span key={l} className="chip bg-brand-50 text-brand-700">
                  {l}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Mini label={t("Devices")} value={p.markerCount} />
            <Mini label={t("Photos")} value={p.photoCount} />
            {/* LED footage only where there is some (most trades never draw LED runs). */}
            {p.ledFt > 0 ? <Mini label={t("LED LF")} value={p.ledFt} /> : <Mini label={t("Sheets")} value={p.sheetCount} />}
          </div>
          <div className="mt-3 flex items-center text-xs text-slate-400">
            {t("Updated {date}", { date: fmtDate(p.updatedAt) })}
            {prices && p.billduDocs.length ? <span className="chip ml-auto bg-slate-100 text-slate-600">{t("{n} in Billdu", { n: p.billduDocs.length })}</span> : null}
          </div>
        </div>
      </Link>
      {onDelete && (
        <button
          className="btn btn-sm btn-icon absolute top-3 right-3 bg-white/90 opacity-0 backdrop-blur transition group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={onDelete}
          aria-label={t("Delete job")}
          title={t("Delete job")}
        >
          <Trash className="text-red-600" />
        </button>
      )}
    </li>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5">
      <div className="text-sm font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
    </div>
  );
}
