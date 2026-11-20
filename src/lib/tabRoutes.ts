// Job page tabs and the links into them (docs/navigation.md): Overview · Plan · Takeoff · Tasks · Photos ·
// Money (office) · Field. Older links (?tab=sheets, ?tab=billing&doc=…, ?tab=crew, ?tab=field&section=tasks, …) and the
// job-health next step still use the old tab ids, so they are mapped here to the new tab plus the sub-view they meant.
// Pure (no React).

export const JOB_TABS = ["overview", "plan", "takeoff", "tasks", "photos", "money", "field"] as const;
export type JobTabId = (typeof JOB_TABS)[number];

/** Steps on the Money tab, in order. */
export const MONEY_STEPS = ["pricing", "quote", "changes", "invoices"] as const;
export type MoneyStep = (typeof MONEY_STEPS)[number];

/** Tabs a technician never sees (prices). */
export const OFFICE_ONLY_TABS: readonly JobTabId[] = ["money"];

/**
 * Phones: the bottom bar holds four tabs and More (the rest, in JOB_TABS order). The office gets Money in the bar;
 * technicians (no Money) get Field there instead.
 */
export function phoneTabs(office: boolean): { bar: JobTabId[]; more: JobTabId[] } {
  const bar: JobTabId[] = office ? ["plan", "tasks", "photos", "money"] : ["plan", "tasks", "photos", "field"];
  const more = JOB_TABS.filter((t) => !bar.includes(t) && (office || !OFFICE_ONLY_TABS.includes(t)));
  return { bar, more };
}

/** Field sections that are job tabs of their own now (?tab=field&section=tasks → ?tab=tasks). */
const MOVED_SECTIONS: Partial<Record<string, JobTabId>> = { tasks: "tasks", photos: "photos" };

/** Old tab ids and what they open now: the new tab plus the query params that pick the sub-view. */
export const LEGACY_TABS: Record<string, { tab: JobTabId; params: Record<string, string> }> = {
  sheets: { tab: "plan", params: { manage: "1" } },
  estimate: { tab: "money", params: { step: "pricing" } },
  billing: { tab: "money", params: { step: "quote" } },
  changes: { tab: "money", params: { step: "changes" } },
  crew: { tab: "takeoff", params: { view: "wiring" } },
  info: { tab: "overview", params: {} },
};

export const isJobTab = (t: string | null | undefined): t is JobTabId => !!t && (JOB_TABS as readonly string[]).includes(t);
export const isMoneyStep = (s: string | null | undefined): s is MoneyStep => !!s && (MONEY_STEPS as readonly string[]).includes(s);

/** Where a job opens with no tab asked for: the office lands on Overview, technicians on today's field work. */
export function defaultJobTab(office: boolean): { tab: JobTabId; params: Record<string, string> } {
  return office ? { tab: "overview", params: {} } : { tab: "field", params: { section: "today" } };
}

export interface ResolvedJobTab {
  tab: JobTabId;
  /** The query string to show (without "?"), keeping every other param (id, doc, photo, task, …). */
  query: string;
  /** True when the URL asked for an old or unknown tab (or one this role can't open) and should be replaced by `query`. */
  redirect: boolean;
}

/**
 * Resolves `?tab=` (new or old id) for the job page. Params the old id implies are added only when the link didn't set
 * them already, so `?tab=photos&section=x` keeps its own section. Technicians asking for Money get their default tab.
 */
export function resolveJobTab(search: URLSearchParams | string, office: boolean): ResolvedJobTab {
  const params = new URLSearchParams(search);
  const asked = params.get("tab");
  let tab: JobTabId;
  let extra: Record<string, string> = {};
  if (isJobTab(asked)) tab = asked;
  else if (asked && LEGACY_TABS[asked]) ({ tab, params: extra } = LEGACY_TABS[asked]);
  else ({ tab, params: extra } = defaultJobTab(office));
  // Tasks and Photos used to be Field sections: old links (emails, My Tasks, bookmarks, the iPad app) open the tab.
  // A Field link to a task (&task= or &tf= with no section) meant the task list too.
  if (tab === "field") {
    const section = params.get("section");
    const moved = section ? MOVED_SECTIONS[section] : params.has("task") || params.has("tf") ? "tasks" : undefined;
    if (moved) {
      tab = moved;
      params.delete("section");
    }
  }
  if (!office && OFFICE_ONLY_TABS.includes(tab)) {
    ({ tab, params: extra } = defaultJobTab(office));
    // The money sub-view means nothing on another tab.
    params.delete("step");
  }
  const redirect = asked !== tab;
  params.set("tab", tab);
  for (const [k, v] of Object.entries(extra)) if (!params.has(k)) params.set(k, v);
  return { tab, query: params.toString(), redirect };
}

/** Link to a job tab with optional sub-view params. */
export function jobHref(projectId: string, tab: JobTabId, params: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams({ id: projectId, tab });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, v);
  return `/project?${q.toString()}`;
}

/** Sub-view params that belong to one tab only: dropped when switching tabs so they don't leak into the next one. */
export const TAB_PARAMS = ["manage", "section", "step", "view", "doc", "photo", "task", "tf", "device"] as const;

/** The URL after switching tab, keeping the job id and anything not tied to the old tab. */
export function switchTabQuery(search: URLSearchParams | string, tab: JobTabId, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(search);
  for (const k of TAB_PARAMS) q.delete(k);
  q.set("tab", tab);
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  return q.toString();
}

/** Same URL with one param set (or removed with null), e.g. the Money step or the Takeoff view. */
export function withParam(search: URLSearchParams | string, key: string, value: string | null): string {
  const q = new URLSearchParams(search);
  if (value == null) q.delete(key);
  else q.set(key, value);
  return q.toString();
}
