"use client";
// Company form templates: stored in the app settings under `formTemplates`, the same way company checklist templates are
// (see getChecklistTemplates / saveChecklistTemplates in db.ts). saveSettings keeps the stored copy, so only this writes them.
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "../catalog";
import { db, ensureSeeded, nowIso } from "../db";
import type { FormTemplate } from "../types";
import { FORM_BUILTINS } from "./builtins";
import { normalizeFormTemplates } from "./forms";

export const FORM_TEMPLATES_EVENT = "pinplan:form-templates";

export async function getFormTemplates(): Promise<FormTemplate[]> {
  await ensureSeeded();
  return normalizeFormTemplates((await db().settings.get("app"))?.formTemplates);
}

/** Replace the saved form templates with `update(current)` (read-modify-write on the latest stored copy, in one transaction). */
export async function saveFormTemplates(update: (cur: FormTemplate[]) => FormTemplate[]): Promise<FormTemplate[]> {
  await ensureSeeded();
  const d = db();
  const next = await d.transaction("rw", d.settings, async () => {
    const s = (await d.settings.get("app")) ?? DEFAULT_SETTINGS;
    const list = normalizeFormTemplates(update(normalizeFormTemplates(s.formTemplates)));
    await d.settings.put({ ...s, formTemplates: list, updatedAt: nowIso() });
    return list;
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FORM_TEMPLATES_EVENT));
  return next;
}

/** Every template to start a form from: the company's own (A→Z), then the built-ins. */
export function allFormTemplates(custom: FormTemplate[]): FormTemplate[] {
  return [...[...custom].sort((a, b) => a.name.localeCompare(b.name)), ...FORM_BUILTINS];
}

/** The company's saved form templates (reloads when one is saved or deleted). */
export function useFormTemplates(): { templates: FormTemplate[]; loaded: boolean } {
  const [state, setState] = useState<{ templates: FormTemplate[]; loaded: boolean }>({ templates: [], loaded: false });
  useEffect(() => {
    let alive = true;
    const load = () =>
      void getFormTemplates()
        .then((templates) => alive && setState({ templates, loaded: true }))
        .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    load();
    window.addEventListener(FORM_TEMPLATES_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(FORM_TEMPLATES_EVENT, load);
    };
  }, []);
  return state;
}
