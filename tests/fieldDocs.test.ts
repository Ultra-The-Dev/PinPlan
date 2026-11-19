import { describe, expect, it } from "vitest";
import { addTaskFromComment, CHECKLIST_TEMPLATES, checklistFromTemplate, checklistProgress, commentTask, daysUntil, findPunchList, filterPhotos, openTasks, photosByDay, tagOptions, taskBucket, taskItemFromComment, teamNames, timeline } from "@/lib/fieldDocs";
import type { Checklist, ChecklistItem, Photo, Project } from "@/lib/types";

const ts = "2026-11-19T15:00:00.000Z";
let n = 0;
const id = () => `id${++n}`;
const photo = (extra: Partial<Photo> = {}): Photo => ({ id: id(), projectId: "p", imageId: id(), width: 4, height: 3, takenAt: ts, createdAt: ts, updatedAt: ts, ...extra });
const project: Project = { id: "p", clientName: "", address: "", status: "estimate", billduDocs: [{ id: 5, type: "estimate", serial: "EST1", amount: 100, createdAt: "2026-11-18T10:00:00.000Z" }], createdAt: "2026-11-10T09:00:00.000Z", updatedAt: ts };

describe("checklists", () => {
  it("a photo-required item counts only when it has a photo", () => {
    const c = checklistFromTemplate(CHECKLIST_TEMPLATES[0], "p", id, ts);
    expect(c.items.length).toBeGreaterThan(5);
    c.items[0].done = true; // needs a photo, has none
    c.items[6].done = true; // no photo needed
    expect(checklistProgress(c, [])).toMatchObject({ done: 1, missingPhotos: 1 });
    const withPhoto = [photo({ checklistId: c.id, checklistItemId: c.items[0].id })];
    expect(checklistProgress(c, withPhoto)).toMatchObject({ done: 2, missingPhotos: 0 });
  });
});

describe("photos", () => {
  const a = photo({ tags: ["Camera", "Pre-wire"], takenBy: "jane", caption: "Front porch", takenAt: "2026-11-19T15:00:00.000Z" });
  const b = photo({ tags: ["Camera"], takenBy: "mike", room: "Garage", takenAt: "2026-11-18T15:00:00.000Z" });
  const c = photo({ tags: ["Rack"], takenBy: "jane", takenAt: "2026-11-18T16:00:00.000Z", deleted: true });

  it("filters by tags (all of them), person, day and text", () => {
    expect(filterPhotos([a, b, c], { tags: ["Camera"] })).toEqual([a, b]);
    expect(filterPhotos([a, b, c], { tags: ["Camera", "Pre-wire"] })).toEqual([a]);
    expect(filterPhotos([a, b, c], { takenBy: "mike" })).toEqual([b]);
    expect(filterPhotos([a, b, c], { text: "garage" })).toEqual([b]);
  });

  it("lists used tags first, then suggestions", () => {
    const t = tagOptions([a, b]);
    expect(t.slice(0, 2)).toEqual(["Camera", "Pre-wire"]);
    expect(t).toContain("Wi-Fi");
  });

  it("groups by day, newest first", () => {
    expect(photosByDay([b, a]).map((g) => g.photos.length)).toEqual([1, 1]);
    expect(photosByDay([b, a])[0].photos[0]).toBe(a);
  });

  it("builds a timeline: photos grouped per person and hour, Billdu, job created", () => {
    const t = timeline({ project, photos: [a, photo({ takenBy: "jane" }), b], photoComments: [], checklists: [], jobLogs: [], documents: [] });
    expect(t[0]).toMatchObject({ kind: "photos", text: "2 photos added", who: "jane" });
    expect(t.map((e) => e.kind)).toEqual(["photos", "photos", "billdu", "created"]);
  });
});

describe("tasks and punch lists", () => {
  const ts = "2026-11-19T00:00:00.000Z";
  const job = (id: string, address: string, deleted = false) => ({ id, clientName: "", address, status: "estimate" as const, billduDocs: [], createdAt: ts, updatedAt: ts, deleted });
  const projects = [job("a", "1 Oak"), job("b", "2 Elm"), job("gone", "3 Ash", true)];
  const cl = (id: string, projectId: string, items: ChecklistItem[]): Checklist => ({ id, projectId, name: "Punch list", items, createdAt: ts, updatedAt: ts });
  const checklists = [
    cl("c1", "a", [
      { id: "1", text: "Touch up plate", assignee: "Alex", due: "2026-11-18" },
      { id: "2", text: "Re-aim camera", assignee: "Sam", due: "2026-11-19" },
      { id: "3", text: "Done already", assignee: "Alex", due: "2026-11-01", done: true },
      { id: "4", text: "Not a task" },
    ]),
    cl("c2", "b", [
      { id: "5", text: "Label rack", assignee: "alex", due: "2026-11-24" },
      { id: "6", text: "Order shade motor", due: "2026-12-30" },
      { id: "7", text: "Program keypads", assignee: "Alex" },
    ]),
    cl("c3", "gone", [{ id: "8", text: "Deleted job", assignee: "Alex", due: "2026-11-18" }]),
  ];

  it("buckets due dates", () => {
    expect(taskBucket("2026-11-18", "2026-11-19")).toBe("overdue");
    expect(taskBucket("2026-11-19", "2026-11-19")).toBe("today");
    expect(taskBucket("2026-11-26", "2026-11-19")).toBe("week");
    expect(taskBucket("2026-11-27", "2026-11-19")).toBe("later");
    expect(taskBucket(null, "2026-11-19")).toBe("none");
    expect(daysUntil("2026-12-01", "2026-11-30")).toBe(1);
  });

  it("lists open assigned or dated items across live jobs, by due date", () => {
    const all = openTasks({ projects, checklists }, { today: "2026-11-19" });
    expect(all.map((t) => t.item.id)).toEqual(["1", "2", "5", "6", "7"]);
    expect(all.map((t) => t.bucket)).toEqual(["overdue", "today", "week", "later", "none"]);
    expect(all[2].project.address).toBe("2 Elm");
  });

  it("filters to one person (case-insensitive)", () => {
    expect(openTasks({ projects, checklists }, { today: "2026-11-19", who: "Alex" }).map((t) => t.item.id)).toEqual(["1", "5", "7"]);
  });

  it("collects team names for the assignee picker", () => {
    expect(teamNames({ checklists }, "Me")).toEqual(["Alex", "Me", "Sam"]);
    expect(CHECKLIST_TEMPLATES.some((t) => t.id === "punch")).toBe(true);
  });
});

describe("tasks from photo comments", () => {
  const ts = "2026-11-19T00:00:00.000Z";
  const now = "2026-11-19T12:00:00.000Z";
  const comment = { id: "cm1", projectId: "a", photoId: "ph1", author: "Sam", text: "  Plate is cracked, replace  ", createdAt: ts, updatedAt: ts };
  const ids = () => {
    let n = 0;
    return () => `id${++n}`;
  };

  it("builds an item linked to the photo, with optional assignee and due date", () => {
    const item = taskItemFromComment(comment, { assignee: " Alex ", due: "2026-11-21" }, ids());
    expect(item).toEqual({ id: "id1", text: "Plate is cracked, replace", photoId: "ph1", commentId: "cm1", assignee: "Alex", due: "2026-11-21", note: "From Sam’s photo comment" });
    const bare = taskItemFromComment({ ...comment, author: null }, { text: "Swap the plate", assignee: "  ", due: "soon" }, ids());
    expect(bare).toMatchObject({ text: "Swap the plate", photoId: "ph1", assignee: null, due: null, note: null });
    expect(taskItemFromComment(comment, { text: "   " }, ids()).text).toBe("Plate is cracked, replace");
  });

  it("starts the punch list from the template when the job has none", () => {
    const other: Checklist = { id: "x", projectId: "a", name: "Trim-out", items: [], createdAt: ts, updatedAt: ts };
    const r = addTaskFromComment([other], comment, {}, ids(), now);
    expect(r.created).toBe(true);
    expect(r.checklist).toMatchObject({ projectId: "a", name: "Punch list", createdAt: now, updatedAt: now });
    expect(r.checklist.items).toEqual([r.item]);
    expect(r.item.photoId).toBe("ph1");
  });

  it("appends to the job's existing punch list, ignoring deleted lists and other jobs", () => {
    const punch: Checklist = { id: "p1", projectId: "a", name: "Punch list", items: [{ id: "old", text: "Old item" }], createdAt: "2026-11-02T00:00:00.000Z", updatedAt: ts };
    const later: Checklist = { ...punch, id: "p2", createdAt: "2026-11-05T00:00:00.000Z", items: [] };
    const gone: Checklist = { ...punch, id: "p0", createdAt: "2026-11-01T00:00:00.000Z", deleted: true };
    const otherJob: Checklist = { ...punch, id: "pb", projectId: "b", createdAt: "2026-10-01T00:00:00.000Z" };
    expect(findPunchList([later, gone, otherJob, punch], "a")?.id).toBe("p1");
    const r = addTaskFromComment([later, gone, otherJob, punch], comment, { due: "2026-11-20" }, ids(), now);
    expect(r.created).toBe(false);
    expect(r.checklist.id).toBe("p1");
    expect(r.checklist.items.map((i) => i.text)).toEqual(["Old item", "Plate is cracked, replace"]);
    expect(punch.items).toHaveLength(1);
    // The comment now shows as a task, and it appears on the Tasks page even without an assignee.
    expect(commentTask([r.checklist], comment)?.item.id).toBe(r.item.id);
    expect(commentTask([r.checklist], { ...comment, id: "cm2", text: "Something else" })).toBeUndefined();
    // Still linked after the item's text is edited (matched by comment id), and another comment on the photo isn't.
    const edited = { ...r.checklist, items: r.checklist.items.map((i) => (i.id === r.item.id ? { ...i, text: "Replace plate (white)" } : i)) };
    expect(commentTask([edited], comment)?.item.id).toBe(r.item.id);
    expect(commentTask([edited], { ...comment, id: "cm2", text: "Replace plate (white)" })).toBeUndefined();
    // Items from before comment ids were stored still match on photo + text.
    const legacy = { ...r.checklist, items: r.checklist.items.map((i) => ({ ...i, commentId: undefined })) };
    expect(commentTask([legacy], comment)?.item.id).toBe(r.item.id);
    const projects = [{ id: "a", clientName: "", address: "1 Oak", status: "estimate" as const, billduDocs: [], createdAt: ts, updatedAt: ts }];
    const r2 = addTaskFromComment([], comment, {}, ids(), now);
    expect(openTasks({ projects, checklists: [r2.checklist] }, { today: "2026-11-19" }).map((t) => t.item.photoId)).toEqual(["ph1"]);
  });
});

describe("timeline and deleted photos", () => {
  it("leaves out comments on deleted photos", () => {
    const pr: Project = { id: "p", clientName: "", address: "", status: "estimate", billduDocs: [], createdAt: "2026-11-10T09:00:00.000Z", updatedAt: "2026-11-10T09:00:00.000Z" };
    const live = { id: "a", projectId: "p", imageId: "ia", width: 1, height: 1, takenAt: "2026-11-19T10:00:00.000Z", createdAt: "2026-11-19T10:00:00.000Z", updatedAt: "2026-11-19T10:00:00.000Z" };
    const gone = { ...live, id: "b", imageId: "ib", deleted: true };
    const c = (id: string, photoId: string) => ({ id, projectId: "p", photoId, author: "Sam", text: `on ${photoId}`, createdAt: "2026-11-19T11:00:00.000Z", updatedAt: "2026-11-19T11:00:00.000Z" });
    const ev = timeline({ project: pr, photos: [live, gone], photoComments: [c("1", "a"), c("2", "b")], checklists: [], jobLogs: [], documents: [] });
    expect(ev.filter((e) => e.kind === "comment").map((e) => e.text)).toEqual(["Commented: “on a”"]);
  });
});
