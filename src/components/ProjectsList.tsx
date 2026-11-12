"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db, ensureSeeded, newId, nowIso, put, remove } from "@/lib/db";
import type { Project, ProjectStatus } from "@/lib/types";

const STATUS_STYLE: Record<ProjectStatus, string> = {
  estimate: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  installed: "bg-emerald-100 text-emerald-800",
};

interface Row extends Project {
  sheetCount: number;
  markerCount: number;
}

export default function ProjectsList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ clientName: "", address: "", clientEmail: "", clientPhone: "" });
  const [q, setQ] = useState("");

  async function fetchRows(): Promise<Row[]> {
    await ensureSeeded();
    const d = db();
    const projects = (await d.projects.toArray()).filter((p) => !p.deleted);
    const withCounts = await Promise.all(
      projects.map(async (p) => ({
        ...p,
        sheetCount: (await d.sheets.where("projectId").equals(p.id).toArray()).filter((s) => !s.deleted).length,
        markerCount: (await d.markers.where("projectId").equals(p.id).toArray()).filter((m) => !m.deleted).length,
      })),
    );
    return withCounts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
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
  }

  const filtered = rows?.filter((r) => `${r.clientName} ${r.address}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <div className="flex-1" />
        <input className="input max-w-xs" placeholder="Search client or address" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New project
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Job address</label>
            <input className="input" autoFocus placeholder="20 Hilltop Dr E" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Client name</label>
            <input className="input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          </div>
          <div>
            <label className="label">Client email</label>
            <input className="input" type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
          </div>
          <div>
            <label className="label">Client phone</label>
            <input className="input" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
          </div>
          <div className="flex items-end justify-end gap-2">
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn btn-primary">Create &amp; upload plans</button>
          </div>
        </form>
      )}

      {rows === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : filtered!.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-lg font-medium">No projects yet</p>
          <p className="mt-1 text-slate-500">Create a project, upload the plan set (PDF or phone photos), then tap to place devices.</p>
          {!creating && (
            <button className="btn btn-primary mt-4" onClick={() => setCreating(true)}>
              + New project
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered!.map((p) => (
            <li key={p.id} className="card flex items-start gap-3 p-4">
              <Link href={`/project?id=${p.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{p.address || "Untitled job"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                </div>
                <div className="truncate text-sm text-slate-500">{p.clientName || "No client name"}</div>
                <div className="mt-2 text-xs text-slate-500">
                  {p.sheetCount} sheet{p.sheetCount === 1 ? "" : "s"} · {p.markerCount} device{p.markerCount === 1 ? "" : "s"} · updated{" "}
                  {new Date(p.updatedAt).toLocaleDateString()}
                  {p.billduDocs?.length ? ` · ${p.billduDocs.length} in Billdu` : ""}
                </div>
              </Link>
              <button className="btn btn-sm btn-danger" onClick={() => del(p)} aria-label="Delete project">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
