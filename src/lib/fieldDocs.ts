// Field documentation helpers: checklist templates and progress, tags, the job timeline and photo filters.
// Mirrors PinPlanCore/FieldDocsLogic.swift.
import { msg } from "./i18n/msg";
import type { Checklist, ChecklistItem, ChecklistTemplate, JobDocument, JobLog, Photo, PhotoComment, Project } from "./types";
import { memberLabel } from "./teamLogic";

export type { ChecklistTemplate } from "./types";

/** Starting checklists for low-voltage / smart-home work. */
export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    id: "prewire",
    name: "Pre-wire walkthrough",
    items: [
      { text: "Low-voltage brackets / mud rings at every device location", requiresPhoto: true },
      { text: "Speaker and TV back boxes, blocking in place", requiresPhoto: true },
      { text: "Every cable labeled at both ends", requiresPhoto: true },
      { text: "All cables home-run to the equipment closet", requiresPhoto: true },
      { text: "Exterior camera locations prewired and sealed", requiresPhoto: true },
      { text: "Photos of every open wall before insulation / drywall", requiresPhoto: true },
      { text: "Walkthrough with GC / client done" },
    ],
  },
  {
    id: "trim",
    name: "Trim-out",
    items: [
      { text: "Cameras mounted, aimed and focused", requiresPhoto: true },
      { text: "Wi-Fi access points mounted", requiresPhoto: true },
      { text: "Speakers installed, grilles on", requiresPhoto: true },
      { text: "TVs mounted and level", requiresPhoto: true },
      { text: "Keypads / touch panels installed" },
      { text: "LED strips and drivers installed and tested", requiresPhoto: true },
      { text: "Wall plates and jacks finished" },
    ],
  },
  {
    id: "rack",
    name: "Equipment closet / rack",
    items: [
      { text: "Rack mounted and secured", requiresPhoto: true },
      { text: "Patch panel terminated and labeled", requiresPhoto: true },
      { text: "Router, switches and NVR installed" },
      { text: "Cable management dressed", requiresPhoto: true },
      { text: "UPS / surge protection installed" },
      { text: "Final rack photos, front and back", requiresPhoto: true },
    ],
  },
  {
    id: "final",
    name: "Final walkthrough & handoff",
    items: [
      { text: "Every device tested" },
      { text: "Wi-Fi coverage checked in every room" },
      { text: "All cameras viewable in the app", requiresPhoto: true },
      { text: "Client trained on the apps" },
      { text: "Logins and passwords handed over" },
      { text: "Site cleaned up", requiresPhoto: true },
      { text: "Client sign-off" },
    ],
  },
  {
    id: "punch",
    name: "Punch list",
    items: [],
  },
];

export const SUGGESTED_TAGS = ["Pre-wire", "Trim-out", "Rack", "Camera", "Wi-Fi", "Audio", "TV", "Lighting", "Issue", "Damage", "Before", "After", "Completed"];

export function checklistFromTemplate(t: ChecklistTemplate, projectId: string, newId: () => string, now = new Date().toISOString()): Checklist {
  return {
    id: newId(),
    projectId,
    name: t.name,
    items: t.items.map((i) => ({ id: newId(), text: i.text, requiresPhoto: !!i.requiresPhoto })),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------- company checklist templates (saved in settings) ----------------

/** Trimmed, non-empty item list (only text + photo rule — never who ticked it, assignees or due dates). */
const templateItems = (items: { text?: string | null; requiresPhoto?: boolean | null }[]) =>
  items.map((i) => ({ text: (i.text ?? "").trim(), requiresPhoto: !!i.requiresPhoto })).filter((i) => i.text);

/** Turn a job's checklist into a reusable company template. Job-specific state (done, photos, assignee, due, notes) is dropped. */
export function templateFromChecklist(c: Pick<Checklist, "name" | "items">, name: string, newId: () => string, now = new Date().toISOString()): ChecklistTemplate {
  return { id: newId(), name: name.trim() || c.name.trim() || "Checklist", items: templateItems(c.items), custom: true, createdAt: now, updatedAt: now };
}

/** Clean up templates read from settings (old or hand-edited data): drops broken rows and duplicate ids, fixes items, marks them custom. */
export function normalizeTemplates(raw: unknown): ChecklistTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: ChecklistTemplate[] = [];
  const seen = new Set<string>();
  for (const t of raw as Partial<ChecklistTemplate>[]) {
    if (!t || typeof t !== "object" || typeof t.id !== "string" || !t.id || seen.has(t.id) || typeof t.name !== "string" || !t.name.trim()) continue;
    seen.add(t.id);
    const items = Array.isArray(t.items) ? templateItems(t.items.filter((i) => i && typeof i.text === "string")) : [];
    out.push({ id: t.id, name: t.name.trim(), items, custom: true, ...(typeof t.createdAt === "string" && t.createdAt ? { createdAt: t.createdAt } : {}), ...(typeof t.updatedAt === "string" && t.updatedAt ? { updatedAt: t.updatedAt } : {}) });
  }
  return out;
}

/** Templates to start a checklist from: the company's own (A→Z) first, then the built-ins (default: low voltage's;
 *  other trades pass their packs' built-ins — tradeChecklists in trades.ts). */
export function allChecklistTemplates(custom: ChecklistTemplate[] | null | undefined, builtIns: ChecklistTemplate[] = CHECKLIST_TEMPLATES): ChecklistTemplate[] {
  const mine = normalizeTemplates(custom).sort((a, b) => a.name.localeCompare(b.name));
  return [...mine, ...builtIns];
}

/** "Trim-out" → "Trim-out (2)" when that name is taken (case-insensitive; `exceptId` is the template being renamed). */
export function uniqueTemplateName(name: string, existing: ChecklistTemplate[], exceptId?: string): string {
  const base = name.trim() || "Checklist";
  const taken = new Set(existing.filter((t) => t.id !== exceptId).map((t) => t.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`.toLowerCase())) return `${base} (${n})`;
}

/** Add a template to the saved list, keeping names unique. */
export function addTemplate(list: ChecklistTemplate[], t: ChecklistTemplate): ChecklistTemplate[] {
  return [...list, { ...t, name: uniqueTemplateName(t.name, list) }];
}

/** Rename one saved template (name kept unique). Unknown ids or blank names leave the list unchanged. */
export function renameTemplate(list: ChecklistTemplate[], id: string, name: string, now = new Date().toISOString()): ChecklistTemplate[] {
  if (!name.trim() || !list.some((t) => t.id === id)) return list;
  const next = uniqueTemplateName(name, list, id);
  return list.map((t) => (t.id === id ? { ...t, name: next, updatedAt: now } : t));
}

export const removeTemplate = (list: ChecklistTemplate[], id: string) => list.filter((t) => t.id !== id);

/** Photos taken for one checklist item. */
export const itemPhotos = (photos: Photo[], checklistId: string, itemId: string) =>
  photos.filter((p) => !p.deleted && p.checklistId === checklistId && p.checklistItemId === itemId);

/** An item counts as complete when ticked — and, if it needs a photo, when it has one. */
export function itemComplete(item: ChecklistItem, photoCount: number): boolean {
  return !!item.done && (!item.requiresPhoto || photoCount > 0);
}

export function checklistProgress(c: Checklist, photos: Photo[]) {
  const total = c.items.length;
  const done = c.items.filter((i) => itemComplete(i, itemPhotos(photos, c.id, i.id).length)).length;
  const missingPhotos = c.items.filter((i) => i.done && i.requiresPhoto && itemPhotos(photos, c.id, i.id).length === 0).length;
  return { done, total, missingPhotos, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** All tags used on the job (most used first), then the suggestions not used yet. */
export function tagOptions(photos: Photo[]): string[] {
  const n = new Map<string, number>();
  for (const p of photos) for (const t of p.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1);
  const used = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  return [...used, ...SUGGESTED_TAGS.filter((t) => !n.has(t))];
}

export interface PhotoFilter {
  tags?: string[];
  takenBy?: string | null;
  /** YYYY-MM-DD */
  day?: string | null;
  /** Date range, inclusive, as local days (YYYY-MM-DD) — same days the gallery groups by. Either end may be open. */
  from?: string | null;
  to?: string | null;
  markerId?: string | null;
  text?: string;
}

export function filterPhotos(photos: Photo[], f: PhotoFilter): Photo[] {
  const q = f.text?.trim().toLowerCase();
  // A reversed range (From after To) is read the right way round.
  const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
  return photos.filter(
    (p) =>
      !p.deleted &&
      (!from || localDay(p.takenAt) >= from) &&
      (!to || localDay(p.takenAt) <= to) &&
      (!f.tags?.length || f.tags.every((t) => p.tags?.includes(t))) &&
      (!f.takenBy || p.takenBy === f.takenBy) &&
      (!f.day || p.takenAt.slice(0, 10) === f.day) &&
      (!f.markerId || p.markerId === f.markerId) &&
      (!q || `${p.caption ?? ""} ${p.room ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(q)),
  );
}

/** One change applied to many photos at once (Photos tab select mode). */
export type PhotoBulkEdit =
  | { kind: "room"; room: string | null }
  /** Link to a device (its sheet, and its room when it has one), or unlink with `null`. */
  | { kind: "device"; marker: { id: string; sheetId: string; room?: string | null } | null }
  | { kind: "removeTag"; tag: string };

/** The photos that actually change, already changed. Pure; the caller saves them in one undo step. */
export function bulkEditPhotos(photos: Photo[], ids: Iterable<string>, e: PhotoBulkEdit): Photo[] {
  const want = new Set(ids);
  const out: Photo[] = [];
  for (const p of photos) {
    if (p.deleted || !want.has(p.id)) continue;
    let next: Photo = p;
    if (e.kind === "room") {
      const room = e.room?.trim() || null;
      if ((p.room ?? null) !== room) next = { ...p, room };
    } else if (e.kind === "device") {
      const m = e.marker;
      if (!m) {
        if (p.markerId) next = { ...p, markerId: null };
      } else {
        const room = m.room?.trim() || p.room || null;
        if (p.markerId !== m.id || p.sheetId !== m.sheetId || (p.room ?? null) !== room) next = { ...p, markerId: m.id, sheetId: m.sheetId, room };
      }
    } else if (p.tags?.includes(e.tag)) next = { ...p, tags: p.tags.filter((t) => t !== e.tag) };
    if (next !== p) out.push(next);
  }
  return out;
}

/** Tags on any of these photos, most used first (for "remove tag" on a selection). */
export function tagsInUse(photos: Photo[]): string[] {
  const n = new Map<string, number>();
  for (const p of photos) if (!p.deleted) for (const t of new Set(p.tags ?? [])) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** Rooms already used on the job (photos, then devices), alphabetical, case-insensitively unique — suggestions for "set room". */
export function roomOptions(photos: Photo[], markers: { room?: string | null; deleted?: boolean }[] = []): string[] {
  const s = new Map<string, string>();
  for (const x of [...photos, ...markers]) {
    const r = x.deleted ? "" : (x.room?.trim() ?? "");
    if (r && !s.has(r.toLowerCase())) s.set(r.toLowerCase(), r);
  }
  return [...s.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Photos grouped by the local day they were taken (newest first). */
export function photosByDay(photos: Photo[]): { day: string; photos: Photo[] }[] {
  const m = new Map<string, Photo[]>();
  for (const p of [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt))) {
    const d = localDay(p.takenAt);
    m.set(d, [...(m.get(d) ?? []), p]);
  }
  return [...m].map(([day, ps]) => ({ day, photos: ps }));
}

export function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type TaskBucket = "overdue" | "today" | "week" | "later" | "none";
export const TASK_BUCKETS: { id: TaskBucket; name: string }[] = [
  // Not msg(): the dictionary's "Overdue" is the invoice status («Просрочен»), wrong for a list of tasks.
  { id: "overdue", name: "Overdue" },
  { id: "today", name: msg("Today") },
  { id: "week", name: msg("Next 7 days") },
  { id: "later", name: msg("Later") },
  { id: "none", name: msg("No due date") },
];

export interface OpenTask {
  project: Project;
  checklist: Checklist;
  item: ChecklistItem;
  bucket: TaskBucket;
}

/** Days from `today` to `due` (both YYYY-MM-DD). */
export function daysUntil(due: string, today: string): number {
  return Math.round((Date.UTC(+due.slice(0, 4), +due.slice(5, 7) - 1, +due.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86400000);
}

export function taskBucket(due: string | null | undefined, today: string): TaskBucket {
  if (!due) return "none";
  const d = daysUntil(due, today);
  return d < 0 ? "overdue" : d === 0 ? "today" : d <= 7 ? "week" : "later";
}

/**
 * Open (not ticked) checklist items that are tasks — assigned to someone, with a due date or made from a photo comment — across jobs.
 * `who` keeps only that person's tasks (a list = any of those names, e.g. all of mine). Sorted by due date (no date
 * last), then job. New tasks are plan tasks (src/lib/tasks.ts); these older assigned checklist items still show on /tasks.
 */
export function openTasks(input: { projects: Project[]; checklists: Checklist[] }, opts: { today: string; who?: string | string[] | null }): OpenTask[] {
  const jobs = new Map(input.projects.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const who = new Set((Array.isArray(opts.who) ? opts.who : [opts.who]).map((w) => w?.trim().toLowerCase() ?? "").filter(Boolean));
  const out: OpenTask[] = [];
  for (const c of input.checklists) {
    const project = jobs.get(c.projectId);
    if (c.deleted || !project) continue;
    for (const item of c.items) {
      if (item.done || (!item.assignee && !item.due && !item.photoId)) continue;
      if (who.size && !who.has(item.assignee?.trim().toLowerCase() ?? "")) continue;
      out.push({ project, checklist: c, item, bucket: taskBucket(item.due, opts.today) });
    }
  }
  return out.sort((a, b) => (a.item.due ?? "9999").localeCompare(b.item.due ?? "9999") || (a.project.address || "").localeCompare(b.project.address || ""));
}

export const PUNCH_TEMPLATE_ID = "punch";

/** The job's live punch list (the oldest one, if there are several). */
export function findPunchList(checklists: Checklist[], projectId: string): Checklist | undefined {
  const name = CHECKLIST_TEMPLATES.find((t) => t.id === PUNCH_TEMPLATE_ID)!.name.toLowerCase();
  return checklists
    .filter((c) => !c.deleted && c.projectId === projectId && c.name.trim().toLowerCase() === name)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

/** The item a comment was already turned into (by comment id; older items without one: same photo, same text), if any. */
export function commentTask(checklists: Checklist[], comment: PhotoComment): { checklist: Checklist; item: ChecklistItem } | undefined {
  const text = comment.text.trim();
  for (const c of checklists) {
    if (c.deleted || c.projectId !== comment.projectId) continue;
    const item = c.items.find((i) => i.commentId === comment.id) ?? c.items.find((i) => !i.commentId && i.photoId === comment.photoId && i.text === text);
    if (item) return { checklist: c, item };
  }
  return undefined;
}

/** A checklist item made from a photo comment: the comment's text (or an edited version), linked back to the photo. */
export function taskItemFromComment(comment: PhotoComment, opts: { text?: string | null; assignee?: string | null; due?: string | null }, newId: () => string): ChecklistItem {
  const text = (opts.text ?? "").trim() || comment.text.trim();
  const assignee = opts.assignee?.trim() || null;
  const due = opts.due && /^\d{4}-\d{2}-\d{2}$/.test(opts.due) ? opts.due : null;
  return { id: newId(), text, photoId: comment.photoId, commentId: comment.id, assignee, due, note: comment.author ? `From ${comment.author}’s photo comment` : null };
}

/**
 * Turn a photo comment into a task on the job's "Punch list" (started from the punch template when the job has none).
 * Returns the checklist to save (new or updated) and the added item.
 */
export function addTaskFromComment(
  checklists: Checklist[],
  comment: PhotoComment,
  opts: { text?: string | null; assignee?: string | null; due?: string | null },
  newId: () => string,
  now = new Date().toISOString(),
): { checklist: Checklist; item: ChecklistItem; created: boolean } {
  const item = taskItemFromComment(comment, opts, newId);
  const existing = findPunchList(checklists, comment.projectId);
  const base = existing ?? checklistFromTemplate(CHECKLIST_TEMPLATES.find((t) => t.id === PUNCH_TEMPLATE_ID)!, comment.projectId, newId, now);
  return { checklist: { ...base, items: [...base.items, item], updatedAt: now }, item, created: !existing };
}

/** Names seen on the jobs (photo takers, log authors, checklist people) and the company team, for the assignee picker. */
export function teamNames(
  input: { photos?: Photo[]; jobLogs?: JobLog[]; checklists?: Checklist[]; members?: { name?: string | null; email?: string | null }[] },
  me?: string,
): string[] {
  // One entry per person, whatever the capitalisation (first spelling seen wins).
  const s = new Map<string, string>();
  const add = (n?: string | null) => {
    const t = n?.trim();
    if (t && !s.has(t.toLowerCase())) s.set(t.toLowerCase(), t);
  };
  add(me);
  for (const m of input.members ?? []) add(memberLabel(m));
  for (const p of input.photos ?? []) add(p.takenBy);
  for (const l of input.jobLogs ?? []) add(l.author);
  for (const c of input.checklists ?? []) for (const i of c.items) for (const n of [i.doneBy, i.assignee]) add(n);
  return [...s.values()].sort((a, b) => a.localeCompare(b));
}

export interface TimelineEvent {
  at: string;
  kind: "created" | "photos" | "comment" | "checklist" | "log" | "document" | "billdu";
  text: string;
  who?: string | null;
  /** Photos to show with the event. */
  photoIds?: string[];
  refId?: string;
}

/** Everything that happened on the job, newest first. Photo uploads are grouped per person per hour. */
export function timeline(input: {
  project: Project;
  photos: Photo[];
  photoComments: PhotoComment[];
  checklists: Checklist[];
  jobLogs: JobLog[];
  documents: JobDocument[];
}): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ at: input.project.createdAt, kind: "created", text: "Job created" }];
  const groups = new Map<string, Photo[]>();
  for (const p of input.photos.filter((x) => !x.deleted)) {
    const k = `${p.takenBy ?? ""}|${p.createdAt.slice(0, 13)}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const ps of groups.values()) {
    const latest = ps.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    ev.push({ at: latest.createdAt, kind: "photos", text: `${ps.length} photo${ps.length === 1 ? "" : "s"} added`, who: latest.takenBy, photoIds: ps.map((p) => p.id) });
  }
  // Comments on deleted photos (e.g. older data) are left out.
  const livePhotos = new Set(input.photos.filter((x) => !x.deleted).map((x) => x.id));
  for (const c of input.photoComments.filter((x) => !x.deleted && livePhotos.has(x.photoId)))
    ev.push({ at: c.createdAt, kind: "comment", text: `Commented: “${c.text.length > 80 ? c.text.slice(0, 80) + "…" : c.text}”`, who: c.author, photoIds: [c.photoId], refId: c.photoId });
  for (const c of input.checklists.filter((x) => !x.deleted)) {
    ev.push({ at: c.createdAt, kind: "checklist", text: `Checklist started: ${c.name}`, refId: c.id });
    for (const i of c.items) if (i.done && i.doneAt) ev.push({ at: i.doneAt, kind: "checklist", text: `${c.name}: ${i.text}`, who: i.doneBy, refId: c.id });
  }
  for (const l of input.jobLogs.filter((x) => !x.deleted))
    ev.push({ at: l.createdAt, kind: "log", text: `Daily log${l.title ? `: ${l.title}` : ""}`, who: l.author, photoIds: l.photoIds ?? undefined, refId: l.id });
  for (const d of input.documents.filter((x) => !x.deleted)) ev.push({ at: d.createdAt, kind: "document", text: `Document added: ${d.name}`, refId: d.id });
  for (const b of input.project.billduDocs ?? [])
    ev.push({ at: b.createdAt, kind: "billdu", text: `Billdu ${b.type} ${b.serial ?? `#${b.id}`}${b.label ? ` (${b.label})` : ""}` });
  return ev.filter((e) => !!e.at).sort((a, b) => b.at.localeCompare(a.at));
}

export type TimelineFilterId = "photos" | "comments" | "checklists" | "logs" | "documents" | "billdu";
/** Filter chips for the timeline and the event kinds each one shows. */
export const TIMELINE_FILTERS: { id: TimelineFilterId; label: string; kind: TimelineEvent["kind"] }[] = [
  { id: "photos", label: msg("Photos"), kind: "photos" },
  { id: "comments", label: msg("Comments"), kind: "comment" },
  { id: "checklists", label: msg("Checklists"), kind: "checklist" },
  { id: "logs", label: msg("Logs"), kind: "log" },
  { id: "documents", label: msg("Documents"), kind: "document" },
  { id: "billdu", label: "Billdu", kind: "billdu" },
];
/** How many events the timeline shows at first (and adds per "Load more"). */
export const TIMELINE_PAGE = 100;

export interface TimelineFilter {
  /** Chips that are on; none on = every kind (including "Job created"). */
  kinds?: TimelineFilterId[];
  /** Only this person's events (case-insensitive). */
  who?: string | null;
  /** Free-text search over the event text and person. */
  text?: string;
}

/** Keeps the events that match every active filter. Order is kept. */
export function filterTimeline(events: TimelineEvent[], f: TimelineFilter): TimelineEvent[] {
  const kinds = f.kinds?.length ? new Set(TIMELINE_FILTERS.filter((x) => f.kinds!.includes(x.id)).map((x) => x.kind)) : null;
  const who = f.who?.trim().toLowerCase();
  const q = f.text?.trim().toLowerCase();
  return events.filter(
    (e) =>
      (!kinds || kinds.has(e.kind)) &&
      (!who || e.who?.trim().toLowerCase() === who) &&
      (!q || `${e.text} ${e.who ?? ""}`.toLowerCase().includes(q)),
  );
}

/** People who appear on the timeline, one per person whatever the capitalisation, sorted. */
export function timelinePeople(events: TimelineEvent[]): string[] {
  const s = new Map<string, string>();
  for (const e of events) {
    const t = e.who?.trim();
    if (t && !s.has(t.toLowerCase())) s.set(t.toLowerCase(), t);
  }
  return [...s.values()].sort((a, b) => a.localeCompare(b));
}

/** The first `limit` events and how many are left for "Load more". */
export function pageTimeline(events: TimelineEvent[], limit = TIMELINE_PAGE): { shown: TimelineEvent[]; remaining: number } {
  const n = Math.max(0, Math.floor(limit));
  return { shown: events.slice(0, n), remaining: Math.max(0, events.length - n) };
}

// ---------------- Field sections ----------------

/**
 * Every section of a job's Field tab a link can open (&section=…); the tab groups some of them. Tasks and photos are
 * job tabs of their own now (src/lib/tabRoutes.ts sends old section=tasks / section=photos links there).
 */
export const FIELD_SECTIONS = ["today", "checklists", "forms", "logs", "files", "rfis", "schedule", "progress", "timeline"] as const;
export type FieldSection = (typeof FIELD_SECTIONS)[number];

/** Old section names in saved links. */
const FIELD_ALIASES: Record<string, FieldSection> = { docs: "files", documents: "files", history: "timeline", log: "logs" };

/** The section to show: the address's, else Today (what to do today, for the office and technicians alike). */
export function pickFieldSection(asked: string | null | undefined): FieldSection {
  const s = asked ? (FIELD_ALIASES[asked] ?? asked) : null;
  if (s && (FIELD_SECTIONS as readonly string[]).includes(s)) return s as FieldSection;
  return "today";
}

// ---------------- Today card ----------------

export type TodayLogStatus = "start" | "continue" | "signed";

/**
 * Today's daily log on a job, so "Write today's log" continues it instead of starting a second one: mine first
 * (author or signer is one of `names`), else anyone's. "signed" once it carries a signature.
 */
export function todayLog(logs: JobLog[], projectId: string, today: string, names: string[] = []): { status: TodayLogStatus; log: JobLog | null } {
  const mine = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const isMine = (l: JobLog) => [l.author, l.report?.signature?.name].some((n) => !!n && mine.has(n.trim().toLowerCase()));
  const list = logs
    .filter((l) => !l.deleted && l.projectId === projectId && l.date === today)
    .sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || b.updatedAt.localeCompare(a.updatedAt));
  const log = list[0] ?? null;
  return { status: !log ? "start" : log.report?.signature ? "signed" : "continue", log };
}

/** A job's checklists that still have items to do (ticks, or a missing photo), least done first. */
export function unfinishedChecklists(checklists: Checklist[], photos: Photo[], projectId?: string | null): { checklist: Checklist; done: number; total: number }[] {
  return checklists
    .filter((c) => !c.deleted && (!projectId || c.projectId === projectId) && c.items.length > 0)
    .map((c) => {
      const p = checklistProgress(c, photos);
      return { checklist: c, done: p.done, total: p.total };
    })
    .filter((x) => x.done < x.total)
    .sort((a, b) => a.done / a.total - b.done / b.total || a.checklist.name.localeCompare(b.checklist.name));
}

/** Who is using the app here: name or email for "taken by". */
export const DEFAULT_AUTHOR = "Me";
