"use client";
// Job tab → Templates: "Save as template" (this job's setup, without the client) and "Duplicate job" (a full copy of
// the plans and devices for tract / model homes). Office only: technicians don't create templates or copy jobs.
import { BookmarkPlus, Copy, LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { duplicateJobInDb, saveJobAsTemplate, type DuplicateProgress } from "@/lib/jobTemplatesDb";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { toast } from "@/lib/toast";
import { useTrades } from "@/lib/useTrades";
import { TemplateSheet, ToggleRow } from "./ui";
import { useT } from "@/lib/i18n";

function SaveTemplateSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { project, checklists, estimateLines } = useEditor();
  const prices = can(useRole(), "prices");
  const trades = useTrades();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [opts, setOpts] = useState({ includePrices: prices, includeChecklists: true, includeEstimate: prices, includeNotes: false });
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const set = (k: keyof typeof opts) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }));
  const lists = checklists.filter((c) => !c.deleted).length;
  const custom = estimateLines.filter((l) => !l.deleted && !l.removed && l.key.startsWith("custom:")).length;
  const choices = Object.keys(project.productChoices ?? {}).length;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !project) return;
    setBusy(true);
    try {
      const saved = await saveJobAsTemplate(project.id, {
        name,
        description,
        trades,
        includePrices: prices && opts.includePrices,
        includeChecklists: opts.includeChecklists,
        includeEstimate: prices && opts.includeEstimate,
        includeNotes: opts.includeNotes,
      });
      toast(t("Saved the template “{name}”", { name: saved.name }));
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
      setBusy(false);
    }
  }

  return (
    <TemplateSheet title={t("Save as template")} subtitle={t("Start new jobs from this setup. The client, address, plans and devices aren't saved.")} onClose={onClose} busy={busy}>
      <form className="space-y-4" onSubmit={save}>
        <div>
          <label className="label" htmlFor="tpl-name">{t("Template name")}</label>
          <input id="tpl-name" className="input" autoFocus placeholder={t("e.g. LV standard, Model home pre-wire")} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="tpl-description">{t("Description (optional)")}</label>
          <textarea id="tpl-description" className="input min-h-16" placeholder={t("When to use it")} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
          <div className="px-3 py-2 text-xs text-slate-500">
            {project.labels?.length
              ? t("Always saved: {choices} and {labels}.", { choices: t.tn("{n} product choice", "{n} product choices", choices), labels: t.tn("{n} label", "{n} labels", project.labels.length) })
              : t("Always saved: {choices}.", { choices: t.tn("{n} product choice", "{n} product choices", choices) })}
          </div>
          <div className="px-2">
            <ToggleRow label={t("Checklists")} hint={t("{n} on this job, saved unticked", { n: lists })} checked={opts.includeChecklists} onChange={set("includeChecklists")} testId="tpl-checklists" />
          </div>
          {prices && (
            <div className="px-2">
              <ToggleRow label={t("Custom estimate lines")} hint={t.tn("{n} extra charge, plus price and wording edits", "{n} extra charges, plus price and wording edits", custom)} checked={opts.includeEstimate} onChange={set("includeEstimate")} testId="tpl-estimate" />
            </div>
          )}
          {prices && (
            <div className="px-2">
              <ToggleRow label={t("Prices")} hint={t("Markup, wire prices and line prices. Technicians never see them.")} checked={opts.includePrices} onChange={set("includePrices")} testId="tpl-prices" />
            </div>
          )}
          <div className="px-2">
            <ToggleRow label={t("Job notes")} hint={t("Off by default: notes are often about one site")} checked={opts.includeNotes} onChange={set("includeNotes")} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand" disabled={!name.trim() || busy}>
            <BookmarkPlus /> {busy ? t("Saving…") : t("Save template")}
          </button>
        </div>
      </form>
    </TemplateSheet>
  );
}

function DuplicateSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const { project, markers, runs, sheets, checklists } = useEditor();
  const [form, setForm] = useState(() => ({ address: "", clientName: project?.clientName ?? "", clientEmail: project?.clientEmail ?? "", clientPhone: project?.clientPhone ?? "" }));
  const [checklistMode, setChecklistMode] = useState<"reset" | "skip">("reset");
  const [includeEstimate, setIncludeEstimate] = useState(true);
  const [progress, setProgress] = useState<DuplicateProgress | null>(null);
  if (!project) return null;
  const busy = !!progress;
  const lists = checklists.filter((c) => !c.deleted).length;

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!project || busy) return;
    setProgress({ done: 0, total: 1, step: t("Starting…") });
    try {
      const p = await duplicateJobInDb(
        project.id,
        { ...form, includeCounts: true, includeChecklists: checklistMode, includeEstimate, includePhotos: false },
        setProgress,
      );
      toast(t("Duplicated as “{name}”", { name: p.address || p.clientName }));
      router.push(`/project?id=${p.id}&tab=sheets`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
      setProgress(null);
    }
  }

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  return (
    <TemplateSheet
      title={t("Duplicate job")}
      subtitle={t("Copies {sheets}, {devices}, {runs}, closets and calibration. Photos, logs, documents, quotes and invoices stay here.", {
        sheets: t.tn("{n} plan sheet", "{n} plan sheets", sheets.length),
        devices: t.tn("{n} device", "{n} devices", markers.length),
        runs: t.tn("{n} run", "{n} runs", runs.length),
      })}
      onClose={onClose}
      busy={busy}
    >
      <form className="space-y-4" onSubmit={go}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="dup-address">{t("New job address")}</label>
            <input id="dup-address" className="input" autoFocus placeholder="Lot 12, 14 Maple Ridge Rd" value={form.address} disabled={busy} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="dup-client">{t("Client name")}</label>
            <input id="dup-client" className="input" value={form.clientName} disabled={busy} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="dup-email">{t("Client email")}</label>
            <input id="dup-email" className="input" type="email" value={form.clientEmail} disabled={busy} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="dup-phone">{t("Client phone")}</label>
            <input id="dup-phone" className="input" type="tel" value={form.clientPhone} disabled={busy} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
          </div>
        </div>
        <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
          <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-800">{t("Checklists")}</span>
              <span className="block text-xs text-slate-500">{t("{n} on this job", { n: lists })}</span>
            </span>
            <div className="seg" role="radiogroup" aria-label={t("Checklists")}>
              {(["reset", "skip"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={checklistMode === m} disabled={busy} className={`tab h-8 ${checklistMode === m ? "tab-active" : ""}`} onClick={() => setChecklistMode(m)}>
                  {m === "reset" ? t("Copy unticked") : t("Leave out")}
                </button>
              ))}
            </div>
          </div>
          <div className="px-2">
            <ToggleRow label={t("Estimate edits")} hint={t("Price overrides and custom lines")} checked={includeEstimate} disabled={busy} onChange={setIncludeEstimate} testId="dup-estimate" />
          </div>
        </div>
        {progress && (
          <div aria-live="polite">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{t(progress.step)}</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand" disabled={busy || (!form.address.trim() && !form.clientName.trim())}>
            <Copy /> {busy ? t("Duplicating…") : t("Duplicate job")}
          </button>
        </div>
      </form>
    </TemplateSheet>
  );
}

export default function JobTemplatesCard() {
  const t = useT();
  const office = can(useRole(), "prices");
  const [open, setOpen] = useState<"save" | "duplicate" | null>(null);
  if (!office) return null;
  return (
    <section className="card p-5" data-testid="job-templates-card">
      <div className="mb-1 flex items-center gap-2">
        <LayoutTemplate className="h-4 w-4 text-slate-400" />
        <h3 className="font-semibold">{t("Templates")}</h3>
      </div>
      <p className="mb-3 text-sm text-slate-500">{t("Reuse this setup on the next job, or copy the whole job for a repeat layout (model homes).")}</p>
      <div className="grid gap-2">
        <button className="btn h-11 w-full" onClick={() => setOpen("save")}>
          <BookmarkPlus /> {t("Save as template")}
        </button>
        <button className="btn h-11 w-full" onClick={() => setOpen("duplicate")}>
          <Copy /> {t("Duplicate job")}
        </button>
      </div>
      {open === "save" && <SaveTemplateSheet onClose={() => setOpen(null)} />}
      {open === "duplicate" && <DuplicateSheet onClose={() => setOpen(null)} />}
    </section>
  );
}
