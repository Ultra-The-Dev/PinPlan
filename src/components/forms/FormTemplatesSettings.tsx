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
import { t, useT } from "@/lib/i18n";

const catName = (c: FormTemplate["category"]) => t(FORM_CATEGORIES.find((x) => x.id === c)?.name ?? "Form");
const fieldCount = (tpl: FormTemplate) => tpl.fields.filter((f) => f.type !== "heading").length;

export default function FormTemplatesSettings() {
  const { templates, loaded } = useFormTemplates();
  const office = canEditTemplates(useRole());
  const [editing, setEditing] = useState<{ tpl: FormTemplate; isNew: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = useT();

  if (!loaded) return <p className="text-sm text-slate-500">{t("Loading…")}</p>;
  const mine = [...templates].sort((a, b) => a.name.localeCompare(b.name));

  async function save(tpl: FormTemplate, isNew: boolean) {
    try {
      const now = nowIso();
      await saveFormTemplates((cur) => (isNew ? [...cur, { ...tpl, createdAt: tpl.createdAt ?? now, updatedAt: now }] : cur.map((x) => (x.id === tpl.id ? bumpVersion(tpl, now) : x))));
      setEditing(null);
      toast(t("Saved “{name}”", { name: tpl.name }), "success");
    } catch {
      toast(t("Couldn't save the template"), "error");
    }
  }

  async function remove(tpl: FormTemplate) {
    if (!confirm(t("Delete the form template “{name}”? Forms already filled on jobs keep their copy.", { name: tpl.name }))) return;
    await saveFormTemplates((cur) => cur.filter((x) => x.id !== tpl.id));
    toast(t("Deleted “{name}”", { name: tpl.name }));
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const { template, errors } = templateFromJson(await file.text());
    if (!template || errors.length) return toast(t("Can't import: {error}", { error: errors[0] ? t(errors[0]) : t("not a form template") }), "error");
    // Imported templates get a fresh id, so importing twice (or a built-in's export) never overwrites one.
    const tpl = duplicateTemplate(template, newId, nowIso(), templates);
    setEditing({ tpl: { ...tpl, name: template.name && !templates.some((x) => x.name === template.name) ? template.name : tpl.name }, isNew: true });
  }

  if (editing)
    return (
      <TemplateBuilder
        key={editing.tpl.id}
        initial={editing.tpl}
        onCancel={() => setEditing(null)}
        onSave={(tpl) => save(tpl, editing.isNew)}
      />
    );

  const exportJson = (tpl: FormTemplate) => downloadText(templateToJson(tpl), `${slug(tpl.name)}.form.json`, "application/json");

  return (
    <div className="space-y-4">
      {office && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-brand" onClick={() => setEditing({ tpl: { id: newId(), name: "New form", category: "inspection", version: 1, fields: [{ id: "date", type: "date", label: "Date", required: true }] }, isNew: true })}>
            <Plus /> {t("New template")}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload /> {t("Import JSON")}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importFile(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
        </div>
      )}
      {mine.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          {t("No company templates yet.")} {office ? t("Duplicate a built-in below to make it yours, or start a new one.") : t("The office can add your company's own forms here.")}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100" aria-label={t("Company form templates")}>
          {mine.map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{tpl.name}</span>
                <span className="block text-xs text-slate-500">
                  {catName(tpl.category)} · {t.tn("{n} field", "{n} fields", fieldCount(tpl))} · v{tpl.version}
                  {tpl.trade ? ` · ${t(tradePack(tpl.trade).name)}` : ""}
                </span>
              </span>
              {office && (
                <>
                  <button className="btn btn-sm btn-ghost" aria-label={t("Edit {name}", { name: tpl.name })} title={t("Edit")} onClick={() => setEditing({ tpl, isNew: false })}>
                    <Pencil />
                  </button>
                  <button className="btn btn-sm btn-ghost" aria-label={t("Duplicate {name}", { name: tpl.name })} title={t("Duplicate")} onClick={() => setEditing({ tpl: duplicateTemplate(tpl, newId, nowIso(), templates), isNew: true })}>
                    <Copy />
                  </button>
                </>
              )}
              <button className="btn btn-sm btn-ghost" aria-label={t("Export {name}", { name: tpl.name })} title={t("Export JSON")} onClick={() => exportJson(tpl)}>
                <Download />
              </button>
              {office && (
                <button className="btn btn-sm btn-ghost text-slate-400 hover:text-red-600" aria-label={t("Delete {name}", { name: tpl.name })} title={t("Delete")} onClick={() => void remove(tpl)}>
                  <Trash />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <p className="section-title mb-1">{t("Built in")}</p>
        <ul className="divide-y divide-slate-100" aria-label={t("Built-in form templates")}>
          {FORM_BUILTINS.map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{tpl.name}</span>
                <span className="block text-xs text-slate-500">
                  {catName(tpl.category)} · {t.tn("{n} field", "{n} fields", fieldCount(tpl))}{tpl.trade ? ` · ${t(tradePack(tpl.trade).name)}` : ""}
                </span>
              </span>
              {office && (
                <button className="btn btn-sm" aria-label={t("Duplicate {name}", { name: tpl.name })} onClick={() => setEditing({ tpl: duplicateTemplate(tpl, newId, nowIso(), templates), isNew: true })}>
                  <Copy /> {t("Duplicate")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
