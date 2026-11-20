"use client";
// New job → "Start from template". Lists the company's job templates ("Blank" first) and applies the chosen one to the
// job right after it's created. Anyone who can create jobs can use it; technicians never get prices from it.
import { LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { templateSummary } from "@/lib/jobTemplates";
import { applyTemplateToJob, useJobTemplates } from "@/lib/jobTemplatesDb";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import type { Project } from "@/lib/types";
import { TemplateSheet, WarningList } from "./ui";
import { t as tr, useT } from "@/lib/i18n";

/** State for the new-job form: the picked template, applying it, and the "skipped" list afterwards. */
export function useTemplateStart() {
  const t = useT();
  const { templates } = useJobTemplates();
  const prices = can(useRole(), "prices");
  const [templateId, setTemplateId] = useState("");
  const [skipped, setSkipped] = useState<{ warnings: string[]; open: () => void } | null>(null);
  const chosen = templates.find((x) => x.id === templateId) ?? null;

  /** Apply the chosen template to the new job, then `open` it (after showing what was skipped, if anything). */
  async function applyThenOpen(project: Project, open: () => void) {
    if (!chosen) return open();
    let warnings: string[];
    try {
      warnings = await applyTemplateToJob(chosen, project, prices);
    } catch (e) {
      warnings = [tr("The template couldn't be applied: {error}", { error: e instanceof Error ? e.message : String(e) })];
    }
    setTemplateId("");
    if (warnings.length) setSkipped({ warnings, open });
    else open();
  }

  const field = templates.length ? (
    <div className="sm:col-span-2">
      <label className="label" htmlFor="new-job-template">
        <LayoutTemplate className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        {t("Start from template")}
      </label>
      <select id="new-job-template" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        <option value="">{t("Blank")}</option>
        {templates.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      {chosen && <p className="mt-1 text-xs text-slate-500">{chosen.description ? `${chosen.description} · ` : ""}{templateSummary(chosen, { prices })}</p>}
    </div>
  ) : null;

  const dialog = skipped ? (
    <TemplateSheet title={t("Job created")} subtitle={t("A few things in the template were skipped:")} onClose={() => (setSkipped(null), skipped.open())}>
      <WarningList warnings={skipped.warnings} />
      <div className="mt-4 flex justify-end">
        <button className="btn btn-brand" autoFocus onClick={() => (setSkipped(null), skipped.open())}>
          {t("Open the job")}
        </button>
      </div>
    </TemplateSheet>
  ) : null;

  return { field, dialog, applyThenOpen };
}
