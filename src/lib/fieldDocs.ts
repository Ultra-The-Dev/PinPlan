// Field documentation helpers: checklist templates and progress, tags, the job timeline and photo filters.
// Mirrors PinPlanCore/FieldDocsLogic.swift.
import type { Checklist, ChecklistItem, JobDocument, JobLog, Photo, PhotoComment, Project } from "./types";

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: { text: string; requiresPhoto?: boolean }[];
}

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
  markerId?: string | null;
  text?: string;
}

export function filterPhotos(photos: Photo[], f: PhotoFilter): Photo[] {
  const q = f.text?.trim().toLowerCase();
  return photos.filter(
    (p) =>
      !p.deleted &&
      (!f.tags?.length || f.tags.every((t) => p.tags?.includes(t))) &&
      (!f.takenBy || p.takenBy === f.takenBy) &&
      (!f.day || p.takenAt.slice(0, 10) === f.day) &&
      (!f.markerId || p.markerId === f.markerId) &&
      (!q || `${p.caption ?? ""} ${p.room ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(q)),
  );
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
  { id: "overdue", name: "Overdue" },
  { id: "today", name: "Today" },
  { id: "week", name: "Next 7 days" },
  { id: "later", name: "Later" },
  { id: "none", name: "No due date" },
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
 * `who` keeps only that person's tasks. Sorted by due date (no date last), then job.
 */
export function openTasks(input: { projects: Project[]; checklists: Checklist[] }, opts: { today: string; who?: string | null }): OpenTask[] {
  const jobs = new Map(input.projects.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const who = opts.who?.trim().toLowerCase();
  const out: OpenTask[] = [];
  for (const c of input.checklists) {
    const project = jobs.get(c.projectId);
    if (c.deleted || !project) continue;
    for (const item of c.items) {
      if (item.done || (!item.assignee && !item.due && !item.photoId)) continue;
      if (who && item.assignee?.trim().toLowerCase() !== who) continue;
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

/** Names seen on the jobs (photo takers, log authors, checklist people) for the assignee picker. */
export function teamNames(input: { photos?: Photo[]; jobLogs?: JobLog[]; checklists?: Checklist[] }, me?: string): string[] {
  // One entry per person, whatever the capitalisation (first spelling seen wins).
  const s = new Map<string, string>();
  const add = (n?: string | null) => {
    const t = n?.trim();
    if (t && !s.has(t.toLowerCase())) s.set(t.toLowerCase(), t);
  };
  add(me);
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

/** Who is using the app here: name or email for "taken by". */
export const DEFAULT_AUTHOR = "Me";
