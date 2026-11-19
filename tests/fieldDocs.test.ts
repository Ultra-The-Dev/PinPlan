import { describe, expect, it } from "vitest";
import { CHECKLIST_TEMPLATES, bulkEditPhotos, checklistFromTemplate, checklistProgress, daysUntil, filterPhotos, localDay, roomOptions, tagsInUse, openTasks, photosByDay, tagOptions, taskBucket, teamNames, timeline } from "@/lib/fieldDocs";
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

  it("filters by a date range of local days, inclusive, either end open", () => {
    const da = localDay(a.takenAt);
    const db = localDay(b.takenAt);
    expect(da > db).toBe(true);
    expect(filterPhotos([a, b, c], { from: da })).toEqual([a]);
    expect(filterPhotos([a, b, c], { to: db })).toEqual([b]);
    expect(filterPhotos([a, b, c], { from: db, to: da })).toEqual([a, b]);
    expect(filterPhotos([a, b, c], { from: da, to: db })).toEqual([a, b]); // reversed range still works
    expect(filterPhotos([a, b, c], { from: da, to: da })).toEqual([a]);
    expect(filterPhotos([a, b, c], { from: "2030-01-01" })).toEqual([]);
    expect(filterPhotos([a, b, c], { from: null, to: "" })).toEqual([a, b]);
    expect(filterPhotos([a, b, c], { from: db, tags: ["Pre-wire"] })).toEqual([a]);
  });

  it("bulk edits only the selected live photos that change", () => {
    const d = photo({ tags: ["Camera", "Issue"], room: "Garage", markerId: "m1", sheetId: "s1" });
    const all = [a, b, c, d];
    const ids = [a.id, b.id, c.id, d.id];
    // room: deleted c skipped, d already has it
    const r = bulkEditPhotos(all, ids, { kind: "room", room: " Garage " });
    expect(r.map((p) => p.id)).toEqual([a.id]);
    expect(r[0].room).toBe("Garage");
    expect(a.room).toBeUndefined(); // inputs untouched
    expect(bulkEditPhotos(all, [b.id, d.id], { kind: "room", room: "" }).map((p) => p.room)).toEqual([null, null]);
    // device: sets marker + sheet, takes the device's room, keeps the photo's room when the device has none
    const dv = bulkEditPhotos(all, [a.id, b.id], { kind: "device", marker: { id: "m2", sheetId: "s2", room: "Kitchen" } });
    expect(dv.map((p) => [p.markerId, p.sheetId, p.room])).toEqual([["m2", "s2", "Kitchen"], ["m2", "s2", "Kitchen"]]);
    expect(bulkEditPhotos(all, [b.id], { kind: "device", marker: { id: "m2", sheetId: "s2", room: "" } })[0].room).toBe("Garage");
    expect(bulkEditPhotos(all, [d.id], { kind: "device", marker: { id: "m1", sheetId: "s1", room: "Garage" } })).toEqual([]);
    // unlink
    expect(bulkEditPhotos(all, [a.id, d.id], { kind: "device", marker: null }).map((p) => [p.id, p.markerId])).toEqual([[d.id, null]]);
    // remove tag
    const rt = bulkEditPhotos(all, ids, { kind: "removeTag", tag: "Camera" });
    expect(rt.map((p) => [p.id, p.tags])).toEqual([[a.id, ["Pre-wire"]], [b.id, []], [d.id, ["Issue"]]]);
    expect(bulkEditPhotos(all, ids, { kind: "removeTag", tag: "Nope" })).toEqual([]);
  });

  it("lists tags on a selection and room suggestions", () => {
    const d = photo({ tags: ["Camera", "Issue"], room: "garage" });
    expect(tagsInUse([a, b, c, d])).toEqual(["Camera", "Issue", "Pre-wire"]);
    expect(roomOptions([a, b, c, d], [{ room: "Kitchen" }, { room: "Attic", deleted: true }, { room: " " }])).toEqual(["Garage", "Kitchen"]);
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
