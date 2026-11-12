"use client";
import { useEditor } from "@/lib/store";
import { useState } from "react";

export default function ProjectInfo() {
  const { project, updateProject } = useEditor();
  const [form, setForm] = useState(() => ({
    address: project?.address ?? "",
    clientName: project?.clientName ?? "",
    clientEmail: project?.clientEmail ?? "",
    clientPhone: project?.clientPhone ?? "",
    notes: project?.notes ?? "",
  }));
  const [saved, setSaved] = useState(false);
  if (!project) return null;
  const field = (k: keyof typeof form, label: string, type = "text") => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="h-full overflow-auto">
      <form
        className="card mx-auto my-6 grid max-w-2xl gap-3 p-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await updateProject(form);
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      >
        <h2 className="text-lg font-semibold sm:col-span-2">Job details</h2>
        <div className="sm:col-span-2">{field("address", "Job address")}</div>
        {field("clientName", "Client name")}
        {field("clientEmail", "Client email", "email")}
        {field("clientPhone", "Client phone")}
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input min-h-24" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          {saved && <span className="text-sm text-emerald-700">Saved</span>}
          <button className="btn btn-primary">Save</button>
        </div>
        {project.billduClientId ? (
          <p className="text-xs text-slate-500 sm:col-span-2">Billdu client #{project.billduClientId}</p>
        ) : null}
      </form>
    </div>
  );
}
