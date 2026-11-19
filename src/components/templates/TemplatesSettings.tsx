"use client";
// Settings → Job templates: rename, describe, delete, export and import the company's job templates. New ones are
// saved from a job (Job tab → Templates → Save as template). Office only.
import { Check, ChevronDown, Download, LayoutTemplate, Pencil, Trash, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { templatesFile, templateSummary, validateTemplate } from "@/lib/jobTemplates";
import { deleteTemplate, importTemplates, updateTemplate, useJobTemplates } from "@/lib/jobTemplatesDb";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { toast } from "@/lib/toast";
import type { JobTemplate } from "@/lib/types";
import { WarningList } from "./ui";

function Row({ t }: { t: JobTemplate }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description ?? "");
  // Synced rows can come from another app version: show a normalised copy, never crash on its shape.
  const p = validateTemplate(t.payload).payload;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await updateTemplate(t.id, { name: name.trim(), description: description.trim() || null });
    setEditing(false);
    toast("Template saved");
  }

  async function del() {
    if (!confirm(`Delete the template “${t.name}”? Jobs already started from it don't change.`)) return;
    await deleteTemplate(t.id);
    toast(`Deleted “${t.name}”`);
  }

  if (editing)
    return (
      <li className="py-3">
        <form className="space-y-2" onSubmit={save}>
          <input className="input" autoFocus aria-label="Template name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <textarea className="input min-h-16" aria-label="Description" placeholder="Description (optional)" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setName(t.name);
                setDescription(t.description ?? "");
                setEditing(false);
              }}
            >
              <X /> Cancel
            </button>
            <button className="btn btn-sm btn-brand" disabled={!name.trim()}>
              <Check /> Save
            </button>
          </div>
        </form>
      </li>
    );

  return (
    <li className="py-3" data-testid="job-template-row">
      <div className="flex items-center gap-2">
        <button className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{t.name}</span>
            <span className="line-clamp-2 block text-xs text-slate-500">{t.description ? `${t.description} · ` : ""}{templateSummary(t)}</span>
          </span>
        </button>
        <button className="btn btn-icon btn-ghost text-slate-500" title="Rename or describe" aria-label={`Edit ${t.name}`} onClick={() => setEditing(true)}>
          <Pencil />
        </button>
        <button className="btn btn-icon btn-ghost text-slate-500 hover:text-red-600" title="Delete" aria-label={`Delete ${t.name}`} onClick={del}>
          <Trash />
        </button>
      </div>
      {open && (
        <div className="mt-2 ml-6 space-y-2 text-sm text-slate-600">
          {(t.trades?.length ?? 0) > 0 && <p className="text-xs text-slate-500">Trades: {t.trades!.join(", ")}</p>}
          {(p.project.labels?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {p.project.labels!.map((l) => (
                <span key={l} className="chip bg-brand-50 text-brand-700">
                  {l}
                </span>
              ))}
            </div>
          )}
          {p.checklists.map((c, i) => (
            <div key={i}>
              <p className="font-medium text-slate-700">{c.name}</p>
              <ul className="ml-4 list-disc text-xs text-slate-500">
                {c.items.slice(0, 8).map((it, j) => (
                  <li key={j}>{it.text}</li>
                ))}
                {c.items.length > 8 && <li>+{c.items.length - 8} more</li>}
              </ul>
            </div>
          ))}
          {p.estimateLines.length > 0 && (
            <ul className="text-xs text-slate-500">
              {p.estimateLines.map((l, i) => (
                <li key={i}>{l.description || l.key.replace(/^[a-z]+:/, "")}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function TemplatesSettings() {
  const office = can(useRole(), "prices");
  const { templates, loaded } = useJobTemplates();
  const fileRef = useRef<HTMLInputElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  if (!office) return null;

  async function onImport(file: File | undefined) {
    if (!file) return;
    try {
      const r = await importTemplates(await file.text());
      setWarnings(r.warnings);
      toast(r.added ? `Imported ${r.added} template${r.added === 1 ? "" : "s"}` : "No templates in that file", r.added ? "success" : "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section id="templates" className="card scroll-mt-6 space-y-4 p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <LayoutTemplate className="h-4 w-4 text-slate-400" /> Job templates
          </h2>
          <p className="text-sm text-slate-500">Product choices, pricing, labels, checklists and standard charges to start new jobs from. Save one from a job’s Job tab.</p>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            <Upload /> Import
          </button>
          <button
            className="btn btn-sm"
            disabled={!templates.length}
            onClick={() => downloadBlob(new Blob([templatesFile(templates, new Date().toISOString())], { type: "application/json" }), "pinplan-job-templates.json")}
          >
            <Download /> Export
          </button>
        </div>
      </div>
      <WarningList warnings={warnings} />
      {!loaded ? null : templates.length ? (
        <ul className="divide-y divide-slate-100">
          {templates.map((t) => (
            <Row key={t.id} t={t} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No job templates yet. Open a job, go to the Job tab and tap “Save as template”.</p>
      )}
    </section>
  );
}
