"use client";
import { FileText, MapPin, Plus, Search, Trash, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { db, ensureSeeded, newId, nowIso, put, remove } from "@/lib/db";
import { importBackup } from "@/lib/backup";
import { toast } from "@/lib/toast";
import { useSheetImage } from "@/lib/useImage";
import type { Project, ProjectStatus } from "@/lib/types";

const STATUS_STYLE: Record<ProjectStatus, string> = {
  estimate: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  approved: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
  installed: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
};

interface Row extends Project {
  sheetCount: number;
  markerCount: number;
  ledFt: number;
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
      return { ...p, billduDocs: p.billduDocs ?? [], sheetCount: sheets.length, markerCount: markers.length, ledFt: Math.round(ledFt), coverImageId: sheets[0]?.imageId ?? null };
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
  const restoreRef = useRef<HTMLInputElement>(null);
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
    router.push(`/project?id=${p.id}&tab=sheets`);
  }

  async function del(p: Row) {
    if (!confirm(`Delete project “${p.address || p.clientName}”? This removes its sheets and markers.`)) return;
    await remove("projects", p.id);
    refresh();
    toast("Project deleted");
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const n = await importBackup(file);
      toast(`Restored ${n} project${n === 1 ? "" : "s"}`);
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      if (restoreRef.current) restoreRef.current.value = "";
    }
  }

  const filtered = rows?.filter((r) => (status === "all" || r.status === status) && `${r.clientName} ${r.address}`.toLowerCase().includes(q.toLowerCase()));
  const totals = rows ? { all: rows.length, estimate: rows.filter((r) => r.status === "estimate").length, approved: rows.filter((r) => r.status === "approved").length, installed: rows.filter((r) => r.status === "installed").length } : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">Mark up plans, count every device and send the estimate to Billdu.</p>
        </div>
        <input ref={restoreRef} type="file" accept="application/json,.json,.pinplan" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
        <button className="btn" onClick={() => restoreRef.current?.click()} title="Restore a project backup">
          <Upload /> Restore backup
        </button>
        <button className="btn btn-brand" onClick={() => setCreating(true)}>
          <Plus /> New project
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="seg">
            {(["all", "estimate", "approved", "installed"] as const).map((s) => (
              <button key={s} className={`tab h-7 capitalize ${status === s ? "tab-active" : ""}`} onClick={() => setStatus(s)}>
                {s} <span className="text-xs text-slate-400">{totals![s]}</span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search client or address" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center" onClick={() => setCreating(false)}>
          <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="card animate-in grid w-full max-w-lg gap-4 p-6 shadow-pop sm:grid-cols-2">
            <div className="flex items-start sm:col-span-2">
              <div className="flex-1">
                <h2 className="text-lg font-semibold">New project</h2>
                <p className="text-sm text-slate-500">Next you&apos;ll upload the plan set.</p>
              </div>
              <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={() => setCreating(false)} aria-label="Close">
                <X />
              </button>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Job address</label>
              <input className="input" autoFocus placeholder="20 Hilltop Dr E" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Client name</label>
              <input className="input" placeholder="Client or company" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            </div>
            <div>
              <label className="label">Client email</label>
              <input className="input" type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
            </div>
            <div>
              <label className="label">Client phone</label>
              <input className="input" type="tel" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-1 sm:col-span-2">
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn btn-brand" disabled={!form.address.trim() && !form.clientName.trim()}>
                Create &amp; upload plans
              </button>
            </div>
          </form>
        </div>
      )}

      {rows === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-64 animate-pulse bg-slate-100/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card mx-auto max-w-xl px-8 py-14 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <MapPin className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold">Start your first job</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            Create a project, upload the plan set (PDF or phone photos), then tap to place cameras, Wi-Fi, speakers, TVs, LED runs and closets.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 text-left text-xs text-slate-600">
            {["Upload plans", "Tap to place devices", "Takeoff → estimate → Billdu"].map((t, i) => (
              <div key={t} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <div className="mb-1 font-semibold text-brand-600">{i + 1}</div>
                {t}
              </div>
            ))}
          </div>
          <button className="btn btn-brand mt-6" onClick={() => setCreating(true)}>
            <Plus /> New project
          </button>
        </div>
      ) : filtered!.length === 0 ? (
        <p className="py-10 text-center text-slate-500">No projects match.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered!.map((p) => (
            <ProjectCard key={p.id} p={p} onDelete={() => del(p)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectCard({ p, onDelete }: { p: Row; onDelete: () => void }) {
  const img = useSheetImage(p.coverImageId);
  return (
    <li className="card group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-pop">
      <Link href={`/project?id=${p.id}`} className="block">
        <div className="relative aspect-[16/9] overflow-hidden border-b border-slate-100 bg-slate-50">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt="" className="h-full w-full object-cover object-center opacity-90 transition group-hover:scale-[1.02] group-hover:opacity-100" />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300">
              <FileText className="h-10 w-10" />
            </div>
          )}
          <span className={`chip absolute top-3 left-3 capitalize ${STATUS_STYLE[p.status]}`}>{p.status}</span>
        </div>
        <div className="p-4">
          <div className="truncate font-semibold text-slate-900">{p.address || "Untitled job"}</div>
          <div className="truncate text-sm text-slate-500">{p.clientName || "No client name"}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Mini label="Sheets" value={p.sheetCount} />
            <Mini label="Devices" value={p.markerCount} />
            <Mini label="LED LF" value={p.ledFt} />
          </div>
          <div className="mt-3 flex items-center text-xs text-slate-400">
            Updated {new Date(p.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            {p.billduDocs.length ? <span className="chip ml-auto bg-slate-100 text-slate-600">{p.billduDocs.length} in Billdu</span> : null}
          </div>
        </div>
      </Link>
      <button
        className="btn btn-sm btn-icon absolute top-3 right-3 bg-white/90 opacity-0 backdrop-blur transition group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
        onClick={onDelete}
        aria-label="Delete project"
        title="Delete project"
      >
        <Trash className="text-red-600" />
      </button>
    </li>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5">
      <div className="text-sm font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">{label}</div>
    </div>
  );
}
