"use client";
import { DatabaseBackup, Receipt, Save } from "lucide-react";
import { useState } from "react";
import { exportProjectBackup } from "@/lib/backup";
import { formatMoney } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import { toast } from "@/lib/toast";

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
  if (!project) return null;
  const currency = settings?.pricing.currency ?? "USD";
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => (project[k] ?? "") !== form[k]);
  const field = (k: keyof typeof form, label: string, type = "text") => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
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
            <p className="text-sm text-slate-500">Used on the estimate PDF and to find or create the client in Billdu.</p>
          </div>
          {field("address", "Job address")}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field("clientName", "Client name")}</div>
            {field("clientEmail", "Client email", "email")}
            {field("clientPhone", "Client phone", "tel")}
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-28" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Gate code, site contact, special requests…" />
          </div>
          <div className="flex justify-end">
            <button className="btn btn-brand" disabled={!dirty}>
              <Save /> Save changes
            </button>
          </div>
        </form>

        <div className="space-y-5">
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

          <p className="px-1 text-xs text-slate-400">
            Created {new Date(project.createdAt).toLocaleDateString()} · Updated {new Date(project.updatedAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
