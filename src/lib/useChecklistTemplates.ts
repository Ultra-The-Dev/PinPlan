"use client";
import { useEffect, useState } from "react";
import { getChecklistTemplates } from "./db";
import type { ChecklistTemplate } from "./types";

/** The company's saved checklist templates (reloads when one is saved, renamed or deleted). */
export function useChecklistTemplates(): { templates: ChecklistTemplate[]; loaded: boolean } {
  const [state, setState] = useState<{ templates: ChecklistTemplate[]; loaded: boolean }>({ templates: [], loaded: false });
  useEffect(() => {
    let alive = true;
    const load = () =>
      void getChecklistTemplates()
        .then((templates) => alive && setState({ templates, loaded: true }))
        .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    load();
    window.addEventListener("pinplan:checklist-templates", load);
    return () => {
      alive = false;
      window.removeEventListener("pinplan:checklist-templates", load);
    };
  }, []);
  return state;
}
