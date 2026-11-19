"use client";
// Settings → Checklist templates: rename or delete the company's saved checklists. New ones are saved from a job's
// checklist ("Save as template"). Built-in templates are always there and can't be changed.
import { Camera, Check, ChevronDown, Pencil, Trash, X } from "lucide-react";
import { useState } from "react";
import { saveChecklistTemplates } from "@/lib/db";
import { CHECKLIST_TEMPLATES, removeTemplate, renameTemplate } from "@/lib/fieldDocs";
import { toast } from "@/lib/toast";
import type { ChecklistTemplate } from "@/lib/types";
import { useChecklistTemplates } from "@/lib/useChecklistTemplates";

function TemplateRow({ t }: { t: ChecklistTemplate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  const [open, setOpen] = useState(false);
  const photos = t.items.filter((i) => i.requiresPhoto).length;

  async function rename() {
    if (!name.trim()) return;
    await saveChecklistTemplates((cur) => renameTemplate(cur, t.id, name));
    setEditing(false);
  }

  async function remove() {
    if (!confirm(`Delete the template “${t.name}”? Checklists already started from it stay on their jobs.`)) return;
    await saveChecklistTemplates((cur) => removeTemplate(cur, t.id));
    toast(`Deleted “${t.name}”`);
  }

  return (
    <li className="py-3">
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <input className="input h-9" autoFocus aria-label="Template name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-sm btn-brand" disabled={!name.trim()} aria-label="Save name">
            <Check />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label="Cancel"
            onClick={() => {
              setName(t.name);
              setEditing(false);
            }}
          >
            <X />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{t.name}</span>
              <span className="block text-xs text-slate-500">
                {t.items.length} item{t.items.length === 1 ? "" : "s"}
                {photos > 0 && ` · ${photos} need${photos === 1 ? "s" : ""} a photo`}
              </span>
            </span>
          </button>
          <button className="btn btn-sm btn-ghost text-slate-500" title="Rename" aria-label={`Rename ${t.name}`} onClick={() => {
              setName(t.name);
              setEditing(true);
            }}
          >
            <Pencil />
          </button>
          <button className="btn btn-sm btn-ghost text-slate-400 hover:text-red-600" title="Delete" aria-label={`Delete ${t.name}`} onClick={() => void remove()}>
            <Trash />
          </button>
        </div>
      )}
      {open && !editing && (
        <ul className="mt-2 space-y-1 pl-6 text-sm text-slate-600">
          {t.items.map((i, n) => (
            <li key={n} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              <span className="min-w-0 flex-1">{i.text}</span>
              {i.requiresPhoto && <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Photo required" />}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ChecklistTemplatesSettings() {
  const { templates, loaded } = useChecklistTemplates();
  if (!loaded) return <p className="text-sm text-slate-500">Loading…</p>;
  const mine = [...templates].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-3">
      {mine.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          No saved templates yet. Open a job’s Checklists, set one up the way your crew works, then tap the bookmark button to save it as a template.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {mine.map((t) => (
            <TemplateRow key={t.id} t={t} />
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">Built in: {CHECKLIST_TEMPLATES.map((t) => t.name).join(", ")}.</p>
    </div>
  );
}
