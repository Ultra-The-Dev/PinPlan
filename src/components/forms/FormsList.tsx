"use client";
// Field → Forms: the job's inspections, test records, T&M tags, safety forms and sign-offs. Start one from a template
// (the company's own and the ones for its trades first), fill it, sign it, submit it.
import { ClipboardCheck, ClipboardList, FileClock, HardHat, Lock, MapPin, Plus, Search, Signature, X } from "lucide-react";
import { useState } from "react";
import { newId, nowIso } from "@/lib/db";
import { FORM_CATEGORIES, formProgress, newJobForm, searchTemplates, templatesForTrades } from "@/lib/forms/forms";
import { allFormTemplates, useFormTemplates } from "@/lib/forms/templateStore";
import { saveForm, useForms } from "@/lib/forms/useForms";
import { localDay } from "@/lib/fieldDocs";
import { getAuthor } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { toast } from "@/lib/toast";
import type { FormTemplate, JobForm } from "@/lib/types";
import { useTrades } from "@/lib/useTrades";
import FormFill from "./FormFill";

const CAT_ICON: Record<FormTemplate["category"], React.ComponentType<{ className?: string }>> = {
  inspection: ClipboardCheck,
  test: ClipboardList,
  tm: FileClock,
  safety: HardHat,
  other: Signature,
};
const catName = (c: FormTemplate["category"]) => FORM_CATEGORIES.find((x) => x.id === c)?.name ?? "Form";
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function TemplateRow({ t, onPick }: { t: FormTemplate; onPick: () => void }) {
  const Icon = CAT_ICON[t.category] ?? ClipboardList;
  return (
    <li>
      <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100" onClick={onPick}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{t.name}</span>
          <span className="block text-xs text-slate-500">
            {catName(t.category)} · {t.fields.filter((f) => f.type !== "heading").length} fields{t.builtin ? "" : " · your company"}
          </span>
        </span>
      </button>
    </li>
  );
}

function TemplatePicker({ onPick, onClose }: { onPick: (t: FormTemplate) => void; onClose: () => void }) {
  const { templates } = useFormTemplates();
  const trades = useTrades();
  const [q, setQ] = useState("");
  const all = searchTemplates(allFormTemplates(templates), q);
  const { suggested, others } = templatesForTrades(all, trades);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="New form" className="card animate-in flex max-h-[90dvh] w-full max-w-lg flex-col rounded-b-none shadow-pop sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-11 pl-9 text-base" autoFocus placeholder="Search forms" aria-label="Search forms" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn btn-icon btn-ghost" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="overflow-auto p-2">
          {suggested.length > 0 && (
            <>
              <p className="section-title px-2 pt-2 pb-1">{q ? "Matches" : "For your work"}</p>
              <ul>
                {suggested.map((t) => (
                  <TemplateRow key={t.id} t={t} onPick={() => onPick(t)} />
                ))}
              </ul>
            </>
          )}
          {others.length > 0 && (
            <>
              <p className="section-title px-2 pt-3 pb-1">Other trades</p>
              <ul>
                {others.map((t) => (
                  <TemplateRow key={t.id} t={t} onPick={() => onPick(t)} />
                ))}
              </ul>
            </>
          )}
          {!suggested.length && !others.length && <p className="p-4 text-center text-sm text-slate-500">No form matches “{q}”.</p>}
        </div>
      </div>
    </div>
  );
}

type StatusFilter = "all" | "draft" | "submitted";

export default function FormsList() {
  const { project, sheets } = useEditor();
  const { email } = useSyncStatus();
  const { forms, loaded } = useForms(project?.id);
  const [open, setOpen] = useState<JobForm | null>(null);
  const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tpl, setTpl] = useState("");

  if (!project) return null;
  if (open) return <FormFill key={open.id} initial={open} onBack={() => setOpen(null)} />;

  async function start(t: FormTemplate) {
    setPicking(false);
    try {
      const f = await saveForm(newJobForm(t, project!.id, newId, nowIso(), getAuthor(email), localDay(nowIso())));
      setOpen(f);
    } catch {
      toast("Couldn't start the form", "error");
    }
  }

  const used = [...new Map(forms.map((f) => [f.templateId, f.template.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = forms.filter((f) => (status === "all" || f.status === status) && (!tpl || f.templateId === tpl));
  const drafts = forms.filter((f) => f.status === "draft").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="seg" aria-label="Form status">
          {(
            [
              ["all", `All ${forms.length}`],
              ["draft", `Drafts ${drafts}`],
              ["submitted", `Submitted ${forms.length - drafts}`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={`tab ${status === id ? "tab-active" : ""}`} aria-pressed={status === id} onClick={() => setStatus(id)}>
              {label}
            </button>
          ))}
        </nav>
        {used.length > 1 && (
          <select className="input h-9 w-auto max-w-48" aria-label="Filter by form" value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">Every form</option>
            {used.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-brand ml-auto h-10" onClick={() => setPicking(true)}>
          <Plus /> New form
        </button>
      </div>

      {loaded && forms.length === 0 && (
        <div className="card p-6 text-center">
          <ClipboardCheck className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-2 font-medium text-slate-900">No forms on this job yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Inspections, test records and signed T&amp;M tags — filled on site, signed on the spot and saved as a PDF.</p>
          <button className="btn btn-brand mt-4 h-11" onClick={() => setPicking(true)}>
            <Plus /> Start a form
          </button>
        </div>
      )}

      {shown.length > 0 && (
        <ul className="card divide-y divide-slate-100">
          {shown.map((f) => {
            const p = formProgress(f);
            const Icon = CAT_ICON[f.template.category] ?? ClipboardList;
            const sheet = f.sheetId ? sheets.find((s) => s.id === f.sheetId) : undefined;
            return (
              <li key={f.id}>
                <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50 active:bg-slate-100" onClick={() => setOpen(f)}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${f.status === "submitted" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{f.name}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                      {f.name !== f.template.name && <span>{f.template.name} ·</span>}
                      <span>{f.status === "submitted" && f.submittedAt ? `Submitted ${shortDate(f.submittedAt)}${f.submittedBy ? ` by ${f.submittedBy}` : ""}` : `Updated ${shortDate(f.updatedAt)}`}</span>
                      {sheet && (
                        <span className="inline-flex items-center gap-0.5">
                          · <MapPin className="h-3 w-3" /> {sheet.name}
                        </span>
                      )}
                    </span>
                  </span>
                  {f.status === "submitted" ? (
                    <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      <Lock className="h-3 w-3" /> Submitted
                    </span>
                  ) : (
                    <span className="flex w-20 shrink-0 flex-col items-end gap-1">
                      <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200">Draft</span>
                      <span className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${p.pct}%` }} />
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {loaded && forms.length > 0 && shown.length === 0 && <p className="text-center text-sm text-slate-500">No forms match.</p>}

      {picking && <TemplatePicker onPick={(t) => void start(t)} onClose={() => setPicking(false)} />}
    </div>
  );
}
