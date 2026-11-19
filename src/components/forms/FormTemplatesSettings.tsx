"use client";
// Settings → Forms: the company's own form templates (build, change, duplicate, import / export JSON) and the built-ins,
// which can be duplicated to customise. Templates are office work; technicians see the list only.
import { Copy, Download, Pencil, Plus, Trash, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { newId, nowIso } from "@/lib/db";
import { downloadText, slug } from "@/lib/download";
import { FORM_BUILTINS } from "@/lib/forms/builtins";
import { FORM_CATEGORIES, bumpVersion, canEditTemplates, duplicateTemplate, templateFromJson, templateToJson } from "@/lib/forms/forms";
import { saveFormTemplates, useFormTemplates } from "@/lib/forms/templateStore";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import { tradePack } from "@/lib/trades";
import type { FormTemplate } from "@/lib/types";
import TemplateBuilder from "./TemplateBuilder";

const catName = (c: FormTemplate["category"]) => FORM_CATEGORIES.find((x) => x.id === c)?.name ?? "Form";
const fieldCount = (t: FormTemplate) => t.fields.filter((f) => f.type !== "heading").length;

export default function FormTemplatesSettings() {
  const { templates, loaded } = useFormTemplates();
  const office = canEditTemplates(useRole());
  const [editing, setEditing] = useState<{ t: FormTemplate; isNew: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!loaded) return <p className="text-sm text-slate-500">Loading…</p>;
  const mine = [...templates].sort((a, b) => a.name.localeCompare(b.name));

  async function save(t: FormTemplate, isNew: boolean) {
    try {
      const now = nowIso();
      await saveFormTemplates((cur) => (isNew ? [...cur, { ...t, createdAt: t.createdAt ?? now, updatedAt: now }] : cur.map((x) => (x.id === t.id ? bumpVersion(t, now) : x))));
      setEditing(null);
      toast(`Saved “${t.name}”`, "success");
    } catch {
      toast("Couldn't save the template", "error");
    }
  }

  async function remove(t: FormTemplate) {
    if (!confirm(`Delete the form template “${t.name}”? Forms already filled on jobs keep their copy.`)) return;
    await saveFormTemplates((cur) => cur.filter((x) => x.id !== t.id));
    toast(`Deleted “${t.name}”`);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const { template, errors } = templateFromJson(await file.text());
    if (!template || errors.length) return toast(`Can't import: ${errors[0] ?? "not a form template"}`, "error");
    // Imported templates get a fresh id, so importing twice (or a built-in's export) never overwrites one.
    const t = duplicateTemplate(template, newId, nowIso(), templates);
    setEditing({ t: { ...t, name: template.name && !templates.some((x) => x.name === template.name) ? template.name : t.name }, isNew: true });
  }

  if (editing)
    return (
      <TemplateBuilder
        key={editing.t.id}
        initial={editing.t}
        onCancel={() => setEditing(null)}
        onSave={(t) => save(t, editing.isNew)}
      />
    );

  const exportJson = (t: FormTemplate) => downloadText(templateToJson(t), `${slug(t.name)}.form.json`, "application/json");

  return (
    <div className="space-y-4">
      {office && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-brand" onClick={() => setEditing({ t: { id: newId(), name: "New form", category: "inspection", version: 1, fields: [{ id: "date", type: "date", label: "Date", required: true }] }, isNew: true })}>
            <Plus /> New template
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload /> Import JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
        </div>
      )}
      {mine.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          No company templates yet. {office ? "Duplicate a built-in below to make it yours, or start a new one." : "The office can add your company's own forms here."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="Company form templates">
          {mine.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block text-xs text-slate-500">
                  {catName(t.category)} · {fieldCount(t)} fields · v{t.version}
                  {t.trade ? ` · ${tradePack(t.trade).name}` : ""}
                </span>
              </span>
              {office && (
                <>
                  <button className="btn btn-sm btn-ghost" aria-label={`Edit ${t.name}`} title="Edit" onClick={() => setEditing({ t, isNew: false })}>
                    <Pencil />
                  </button>
                  <button className="btn btn-sm btn-ghost" aria-label={`Duplicate ${t.name}`} title="Duplicate" onClick={() => setEditing({ t: duplicateTemplate(t, newId, nowIso(), templates), isNew: true })}>
                    <Copy />
                  </button>
                </>
              )}
              <button className="btn btn-sm btn-ghost" aria-label={`Export ${t.name}`} title="Export JSON" onClick={() => exportJson(t)}>
                <Download />
              </button>
              {office && (
                <button className="btn btn-sm btn-ghost text-slate-400 hover:text-red-600" aria-label={`Delete ${t.name}`} title="Delete" onClick={() => void remove(t)}>
                  <Trash />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <p className="section-title mb-1">Built in</p>
        <ul className="divide-y divide-slate-100" aria-label="Built-in form templates">
          {FORM_BUILTINS.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{t.name}</span>
                <span className="block text-xs text-slate-500">
                  {catName(t.category)} · {fieldCount(t)} fields{t.trade ? ` · ${tradePack(t.trade).name}` : ""}
                </span>
              </span>
              {office && (
                <button className="btn btn-sm" aria-label={`Duplicate ${t.name}`} onClick={() => setEditing({ t: duplicateTemplate(t, newId, nowIso(), templates), isNew: true })}>
                  <Copy /> Duplicate
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
