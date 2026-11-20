"use client";
// Settings → Checklist templates: rename or delete the company's saved checklists. New ones are saved from a job's
// checklist ("Save as template"). Built-in templates are always there and can't be changed.
import { Camera, Check, ChevronDown, Pencil, Trash, X } from "lucide-react";
import { useState } from "react";
import { saveChecklistTemplates } from "@/lib/db";
import { removeTemplate, renameTemplate } from "@/lib/fieldDocs";
import { tradeChecklists } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import type { ChecklistTemplate } from "@/lib/types";
import { useChecklistTemplates } from "@/lib/useChecklistTemplates";

function TemplateRow({ t: tpl }: { t: ChecklistTemplate }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tpl.name);
  const [open, setOpen] = useState(false);
  const photos = tpl.items.filter((i) => i.requiresPhoto).length;

  async function rename() {
    if (!name.trim()) return;
    try {
      await saveChecklistTemplates((cur) => renameTemplate(cur, tpl.id, name));
      setEditing(false);
    } catch {
      toast(t("Couldn't rename the template"), "error");
    }
  }

  async function remove() {
    if (!confirm(t("Delete the template “{name}”? Checklists already started from it stay on their jobs.", { name: tpl.name }))) return;
    try {
      await saveChecklistTemplates((cur) => removeTemplate(cur, tpl.id));
      toast(t("Deleted “{name}”", { name: tpl.name }));
    } catch {
      toast(t("Couldn't delete the template"), "error");
    }
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
          <input className="input h-9" autoFocus aria-label={t("Template name")} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-sm btn-brand" disabled={!name.trim()} aria-label={t("Save name")}>
            <Check />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label={t("Cancel")}
            onClick={() => {
              setName(tpl.name);
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
              <span className="block truncate text-sm font-medium">{tpl.name}</span>
              <span className="block text-xs text-slate-500">
                {t.tn("{n} item", "{n} items", tpl.items.length)}
                {photos > 0 && ` · ${t.tn("{n} needs a photo", "{n} need a photo", photos)}`}
              </span>
            </span>
          </button>
          <button className="btn btn-sm btn-ghost text-slate-500" title={t("Rename")} aria-label={t("Rename {name}", { name: tpl.name })} onClick={() => {
              setName(tpl.name);
              setEditing(true);
            }}
          >
            <Pencil />
          </button>
          <button className="btn btn-sm btn-ghost text-slate-400 hover:text-red-600" title={t("Delete")} aria-label={t("Delete {name}", { name: tpl.name })} onClick={() => void remove()}>
            <Trash />
          </button>
        </div>
      )}
      {open && !editing && (
        <ul className="mt-2 space-y-1 pl-6 text-sm text-slate-600">
          {tpl.items.map((i, n) => (
            <li key={n} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              <span className="min-w-0 flex-1">{i.text}</span>
              {i.requiresPhoto && <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-label={t("Photo required")} />}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ChecklistTemplatesSettings() {
  const { templates, loaded } = useChecklistTemplates();
  const builtIns = tradeChecklists(useTrades());
  const t = useT();
  if (!loaded) return <p className="text-sm text-slate-500">{t("Loading…")}</p>;
  const mine = [...templates].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-3">
      {mine.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          {t("No saved templates yet. Open a job’s Checklists, set one up the way your crew works, then tap the bookmark button to save it as a template.")}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {mine.map((x) => (
            <TemplateRow key={x.id} t={x} />
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">{t("Built in: {names}.", { names: builtIns.map((x) => x.name).join(", ") })}</p>
    </div>
  );
}
