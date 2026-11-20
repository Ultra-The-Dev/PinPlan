// Tasks pinned on the plan (src/lib/tasks.ts). The iPad app runs the same fixtures in PinPlanCore TaskTests.swift.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TABLES, toLocal, toRemote } from "@/lib/syncMap";
import {
  addTaskComment,
  applyTaskChange,
  canDeleteTask,
  canSetStatus,
  checklistLines,
  decodeTaskFilter,
  duplicateTask,
  encodeTaskFilter,
  filterIsEmpty,
  filterTasks,
  nearestRoom,
  newTask,
  nextTaskNumber,
  openPlanTasksFor,
  parseQuickEntry,
  sortTasks,
  STATUSES,
  taskCategoryOptions,
  taskPinColor,
  taskPlacement,
  commentPlanTask,
  createdFromComment,
  formTaskDrafts,
  formTaskNote,
  isMineFilter,
  mineOpenFilter,
  OPEN_STATUSES,
  sortOverdueFirst,
  taskFromChecklistItem,
  taskFromComment,
  taskFromDevice,
} from "@/lib/tasks";
import { openTasks } from "@/lib/fieldDocs";
import type { Checklist, Project } from "@/lib/types";
import { cropRect } from "@/lib/tasks/planCrop";
import type { PlanTask, TaskStatus } from "@/lib/types";

const T0 = "2026-11-19T10:00:00.000Z";
const T1 = "2026-11-19T11:00:00.000Z";
const TODAY = "2026-11-19";
let n = 0;
const ids = () => `e${++n}`;

const CATEGORIES = ["Electrical", "Low voltage", "Fire alarm", "HVAC", "Plumbing"];
const PEOPLE = ["Mike Jones", "Maria Lopez", "Ann", "Pat"];

function task(over: Partial<PlanTask> = {}): PlanTask {
  return { id: "t1", projectId: "p1", number: 1, title: "Loose cover", status: "open", createdAt: T0, updatedAt: T0, ...over };
}

describe("parseQuickEntry", () => {
  it("pulls out category, priority, assignee and tags", () => {
    expect(parseQuickEntry("Fix ceiling @Electrical @P1 @Mike #level2", { categories: CATEGORIES, people: PEOPLE })).toEqual({
      title: "Fix ceiling",
      category: "Electrical",
      priority: 1,
      assignee: "Mike Jones",
      tags: ["level2"],
    });
  });
  it("is case-insensitive and prefix-based", () => {
    const q = parseQuickEntry("Patch hole @elec @p3 @MAR", { categories: CATEGORIES, people: PEOPLE });
    expect(q).toMatchObject({ title: "Patch hole", category: "Electrical", priority: 3, assignee: "Maria Lopez" });
    // A word of a multi-word category matches too.
    expect(parseQuickEntry("Smoke head @alarm", { categories: CATEGORIES }).category).toBe("Fire alarm");
  });
  it("keeps an unknown @word in the title", () => {
    const q = parseQuickEntry("Call @Bob about @Electrical box", { categories: CATEGORIES, people: PEOPLE });
    expect(q.title).toBe("Call @Bob about box");
    expect(q.category).toBe("Electrical");
    expect(q.assignee).toBeUndefined();
  });
  it("collects several tags once each, keeps the first priority", () => {
    const q = parseQuickEntry("Loose cover @P1 #lobby #Level2 #LOBBY @P2", { categories: CATEGORIES, people: PEOPLE });
    expect(q).toEqual({ title: "Loose cover", priority: 1, tags: ["lobby", "Level2"] });
  });
  it("prefers an exact match, then categories over people", () => {
    expect(parseQuickEntry("x @Pat", { categories: CATEGORIES, people: PEOPLE }).assignee).toBe("Pat");
    expect(parseQuickEntry("x @hv", { categories: CATEGORIES, people: ["Hvasquez"] })).toMatchObject({ category: "HVAC" });
  });
  it("leaves plain text and a lone @ or # alone", () => {
    expect(parseQuickEntry("  Fix  the door @ # ")).toEqual({ title: "Fix the door @ #", tags: [] });
  });
});

describe("applyTaskChange", () => {
  it("logs one event per changed attribute and nothing for unchanged ones", () => {
    const t = task({ assignee: "Ann", priority: 2 });
    const next = applyTaskChange(t, { status: "in_progress", assignee: "Mike", priority: 2, due: "2026-11-20", category: "Electrical" }, "Ann", T1, ids);
    const kinds = next.activity!.map((e) => e.kind);
    expect(kinds).toEqual(["status", "assign", "field", "field"]);
    expect(next.activity![0]).toMatchObject({ kind: "status", from: "open", to: "in_progress", by: "Ann", at: T1 });
    expect(next.activity![1]).toMatchObject({ kind: "assign", from: "Ann", to: "Mike" });
    expect(next.activity![2]).toMatchObject({ kind: "field", text: "due date", to: "2026-11-20" });
    expect(next.updatedAt).toBe(T1);
  });
  it("returns the same task when nothing changed", () => {
    const t = task({ priority: 1 });
    expect(applyTaskChange(t, { priority: 1, title: "Loose cover" }, "Ann", T1, ids)).toBe(t);
  });
  it("sets closedAt on Completed and verifiedBy/At on Verified; reopening clears them", () => {
    const done = applyTaskChange(task(), { status: "done" }, "Mike", T0, ids);
    expect(done.closedAt).toBe(T0);
    expect(done.verifiedAt).toBeUndefined();
    const ver = applyTaskChange(done, { status: "verified" }, "Office", T1, ids);
    expect(ver).toMatchObject({ verifiedBy: "Office", verifiedAt: T1, closedAt: T0 });
    const reopened = applyTaskChange(ver, { status: "open" }, "Office", T1, ids);
    expect(reopened).toMatchObject({ closedAt: null, verifiedBy: null, verifiedAt: null });
    // Straight to Verified also closes it.
    expect(applyTaskChange(task(), { status: "verified" }, "Office", T1, ids).closedAt).toBe(T1);
  });
  it("logs checklist ticks, photos and pin moves", () => {
    const t = task({ checklist: [{ id: "a", text: "Tighten screws" }, { id: "b", text: "Paint" }], photoIds: ["p1"], sheetId: "s1", x: 0.1, y: 0.2 });
    const c = applyTaskChange(t, { checklist: [{ id: "a", text: "Tighten screws", done: true }, { id: "b", text: "Paint" }, { id: "c", text: "New" }] }, "Ann", T1, ids);
    expect(c.activity!.at(-1)).toMatchObject({ kind: "checklist", text: "Checked “Tighten screws”, Added 1 item" });
    const p = applyTaskChange(t, { photoIds: ["p1", "p2", "p3"] }, "Ann", T1, ids);
    expect(p.activity!.at(-1)).toMatchObject({ kind: "photo", text: "Added 2 photos" });
    const m = applyTaskChange(t, { x: 0.3, y: 0.4 }, "Ann", T1, ids);
    expect(m.activity).toHaveLength(1);
    expect(m.activity![0]).toMatchObject({ kind: "field", text: "moved the pin" });
  });
  it("comments append to the history", () => {
    const t = addTaskComment(task(), "  Needs a ladder ", "Ann", T1, ids);
    expect(t.activity).toEqual([{ id: expect.any(String), at: T1, by: "Ann", kind: "comment", text: "Needs a ladder" }]);
    expect(addTaskComment(t, "   ", "Ann", T1, ids)).toBe(t);
  });
  it("new tasks start open with a created line", () => {
    const t = newTask({ id: "x", projectId: "p1", number: 4, title: " Fix " }, "Ann", T0, ids);
    expect(t).toMatchObject({ status: "open", title: "Fix", createdBy: "Ann", createdAt: T0 });
    expect(t.activity).toEqual([{ id: expect.any(String), at: T0, by: "Ann", kind: "created" }]);
  });
});

describe("permissions", () => {
  const ALL: TaskStatus[] = ["open", "in_progress", "ready", "done", "verified"];
  it("techs move between open / in progress / ready / completed only", () => {
    for (const from of ALL)
      for (const to of ALL) {
        const expected = from === to || (from !== "verified" && to !== "verified");
        expect(canSetStatus("tech", from, to), `${from} → ${to}`).toBe(expected);
      }
  });
  it("owner, admin and solo users may do anything", () => {
    for (const role of ["owner", "admin", null] as const) for (const from of ALL) for (const to of ALL) expect(canSetStatus(role, from, to)).toBe(true);
  });
  it("techs delete only their own tasks", () => {
    expect(canDeleteTask("tech", { createdBy: "Mike" }, "mike")).toBe(true);
    expect(canDeleteTask("tech", { createdBy: "Ann" }, "Mike")).toBe(false);
    expect(canDeleteTask("tech", { createdBy: null }, "Mike")).toBe(false);
    expect(canDeleteTask("admin", { createdBy: "Ann" }, "Mike")).toBe(true);
  });
});

describe("filterTasks", () => {
  const list: PlanTask[] = [
    task({ id: "a", number: 1, status: "open", priority: 1, category: "Electrical", assignee: "Mike", due: "2026-11-18", sheetId: "s1", x: 0.1, y: 0.1, tags: ["lobby"] }),
    task({ id: "b", number: 2, status: "done", priority: 2, category: "HVAC", assignee: "Ann", due: "2026-11-17", sheetId: "s1" }),
    task({ id: "c", number: 3, status: "in_progress", assignee: "mike", due: TODAY, title: "Smoke detector", description: "Kitchen ceiling" }),
    task({ id: "d", number: 4, status: "ready", category: "electrical", due: "2026-11-25", sheetId: "s2", room: "Lobby", markerId: "m1" }),
    task({ id: "e", number: 5, status: "open", due: "2026-12-30" }),
    task({ id: "f", number: 6, status: "open", deleted: true }),
  ];
  const ids_ = (f: Parameters<typeof filterTasks>[1]) => filterTasks(list, f, TODAY).map((t) => t.id);
  it("an empty filter keeps every live task", () => {
    expect(ids_({})).toEqual(["a", "b", "c", "d", "e"]);
    expect(filterIsEmpty({})).toBe(true);
    expect(filterIsEmpty({ status: [] })).toBe(true);
  });
  it("combines status, priority, category, assignee and sheet", () => {
    expect(ids_({ status: ["open", "ready"] })).toEqual(["a", "d", "e"]);
    expect(ids_({ category: ["ELECTRICAL"] })).toEqual(["a", "d"]);
    expect(ids_({ assignee: ["Mike"] })).toEqual(["a", "c"]);
    expect(ids_({ assignee: ["Mike"], status: ["open"] })).toEqual(["a"]);
    expect(ids_({ priority: [1, 2] })).toEqual(["a", "b"]);
    expect(ids_({ sheetId: "s1" })).toEqual(["a", "b"]);
    expect(ids_({ sheetId: "" })).toEqual(["c", "e"]);
    expect(ids_({ assignee: [""] })).toEqual(["d", "e"]);
  });
  it("buckets due dates against a fixed today", () => {
    // b is past due but completed: not overdue.
    expect(ids_({ due: "overdue" })).toEqual(["a"]);
    expect(ids_({ due: "today" })).toEqual(["c"]);
    expect(ids_({ due: "week" })).toEqual(["c", "d"]);
    expect(ids_({ due: "none" })).toEqual([]);
  });
  it("narrows to one device (the device card's tasks on the plan)", () => {
    expect(ids_({ markerId: "m1" })).toEqual(["d"]);
    expect(ids_({ markerId: "m2" })).toEqual([]);
    expect(filterIsEmpty({ markerId: "m1" })).toBe(false);
    expect(decodeTaskFilter(encodeTaskFilter({ markerId: "m1" }))).toEqual({ markerId: "m1" });
  });
  it("searches text, #number and tags", () => {
    expect(ids_({ text: "smoke kitchen" })).toEqual(["c"]);
    expect(ids_({ text: "#4" })).toEqual(["d"]);
    expect(ids_({ text: "lobby" })).toEqual(["a", "d"]);
    expect(ids_({ tags: ["LOBBY"] })).toEqual(["a"]);
  });
  it("round-trips through the address", () => {
    const f = { status: ["open", "in_progress"] as TaskStatus[], priority: [1 as const], category: ["Fire alarm"], assignee: ["Mike Jones"], sheetId: "s1", due: "overdue" as const, text: "a;b, c", tags: ["lobby"] };
    expect(decodeTaskFilter(encodeTaskFilter(f))).toEqual(f);
    expect(decodeTaskFilter(encodeTaskFilter({ sheetId: "" }))).toEqual({ sheetId: "" });
    expect(decodeTaskFilter("")).toEqual({});
    expect(decodeTaskFilter("s:bogus;d:never;zz:1")).toEqual({ status: [] });
  });
  it("sorts by number, due, priority and status, ties by createdAt", () => {
    const live = list.filter((t) => !t.deleted);
    expect(sortTasks(live, "due").map((t) => t.id)).toEqual(["b", "a", "c", "d", "e"]);
    expect(sortTasks(live, "priority").map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(sortTasks(live, "status").map((t) => t.id)).toEqual(["a", "e", "c", "d", "b"]);
    const dupes = [task({ id: "y", number: 7, createdAt: T1 }), task({ id: "x", number: 7, createdAt: T0 })];
    expect(sortTasks(dupes, "number").map((t) => t.id)).toEqual(["x", "y"]);
  });
});

describe("duplicateTask", () => {
  it("copies the work, resets ticks, drops history, photos and position", () => {
    const src = task({
      status: "verified",
      priority: 1,
      category: "Electrical",
      assignee: "Mike",
      tags: ["lobby"],
      description: "d",
      checklist: [{ id: "a", text: "Screws", done: true, doneBy: "Mike", requiresPhoto: true }],
      photoIds: ["p1"],
      activity: [{ id: "e", at: T0, by: "Ann", kind: "created" }],
      sheetId: "s1",
      x: 0.5,
      y: 0.5,
      room: "Lobby",
      closedAt: T0,
      verifiedBy: "Office",
    });
    let k = 0;
    const copy = duplicateTask(src, T1, { id: "t2", number: 9, by: "Ann", newItemId: () => `n${++k}` });
    expect(copy).toEqual({
      id: "t2",
      projectId: "p1",
      number: 9,
      title: "Loose cover",
      description: "d",
      status: "open",
      priority: 1,
      category: "Electrical",
      assignee: "Mike",
      tags: ["lobby"],
      checklist: [{ id: "n1", text: "Screws", requiresPhoto: true, done: false }],
      sheetId: null,
      x: null,
      y: null,
      photoIds: [],
      activity: [],
      createdBy: "Ann",
      createdAt: T1,
      updatedAt: T1,
    });
    expect(copy.tags).not.toBe(src.tags);
  });
});

describe("numbering, pins and lists", () => {
  it("next number is the highest + 1, deleted ones included", () => {
    expect(nextTaskNumber([])).toBe(1);
    expect(nextTaskNumber([{ number: 3 }, { number: 12 }, { number: 7 }])).toBe(13);
    expect(nextTaskNumber([task({ number: 5, deleted: true })])).toBe(6);
  });
  it("pin colour follows the status; placement reads the position", () => {
    for (const s of STATUSES) expect(taskPinColor(task({ status: s.id }))).toBe(s.color);
    expect(taskPinColor(task({ status: "open" }))).toBe("#dc2626");
    expect(taskPinColor(task({ status: "done" }))).toBe("#16a34a");
    expect(taskPlacement(task({ sheetId: "s", x: 0, y: 0.2 }))).toBe("pin");
    expect(taskPlacement(task({ sheetId: "s", x: null, y: null }))).toBe("sheet");
    expect(taskPlacement(task({}))).toBe("general");
  });
  it("My Tasks: open plan tasks for a person, bucketed and sorted", () => {
    const list = [
      task({ id: "a", number: 1, assignee: "Mike", due: "2026-11-25" }),
      task({ id: "b", number: 2, assignee: "mike", due: "2026-11-18" }),
      task({ id: "c", number: 3, assignee: "Mike", status: "done" }),
      task({ id: "d", number: 4, assignee: "Ann" }),
      task({ id: "e", number: 5, assignee: "Mike" }),
      task({ id: "f", number: 6 }),
    ];
    expect(openPlanTasksFor("MIKE", list, TODAY).map((x) => [x.task.id, x.bucket])).toEqual([
      ["b", "overdue"],
      ["a", "week"],
      ["e", "none"],
    ]);
    expect(openPlanTasksFor(null, list, TODAY).map((x) => x.task.id)).toEqual(["b", "a", "d", "e"]);
  });
  it("room from the nearest device, categories from trades and tasks, pasted checklist lines", () => {
    const markers = [
      { sheetId: "s1", x: 0.5, y: 0.5, room: "Lobby" },
      { sheetId: "s1", x: 0.52, y: 0.5, room: "Hall" },
      { sheetId: "s2", x: 0.1, y: 0.1, room: "Other" },
    ];
    expect(nearestRoom(markers, "s1", 0.53, 0.5)).toBe("Hall");
    expect(nearestRoom(markers, "s1", 0.9, 0.9)).toBeNull();
    expect(taskCategoryOptions(["Electrical", "Lighting"], [task({ category: "electrical" }), task({ category: "Drywall" })])).toEqual(["Electrical", "Lighting", "Drywall"]);
    expect(checklistLines("- one\n2. two\n\n[ ] three\n• four ")).toEqual(["one", "two", "three", "four"]);
  });
  it("plan crop stays inside the image and finds the pin", () => {
    expect(cropRect(2000, 1000, 0.5, 0.5)).toEqual({ sx: 700, sy: 200, side: 600, pinX: 0.5, pinY: 0.5 });
    const edge = cropRect(2000, 1000, 0, 1);
    expect(edge).toMatchObject({ sx: 0, sy: 400, side: 600, pinX: 0 });
    expect(edge.pinY).toBeCloseTo(1);
    expect(cropRect(300, 400, 0.5, 0.5).side).toBe(300);
  });
});

describe("sync mapping for tasks", () => {
  it("round-trips through toRemote / toLocal", () => {
    const local: PlanTask = task({
      description: "d",
      priority: 1,
      category: "Electrical",
      assignee: "Mike",
      watchers: ["Ann"],
      due: "2026-11-20",
      startDate: "2026-11-18",
      sheetId: "s1",
      x: 0.25,
      y: 0.75,
      markerId: "m1",
      room: "Lobby",
      tags: ["lobby"],
      checklist: [{ id: "a", text: "Screws", done: true }],
      photoIds: ["p1"],
      activity: [{ id: "e", at: T0, by: "Ann", kind: "created" }],
      createdBy: "Ann",
      closedAt: T1,
      verifiedBy: "Office",
      verifiedAt: T1,
      deleted: false,
    });
    const remote = toRemote("tasks", local as unknown as Record<string, unknown>);
    expect(TABLES.tasks.remote).toBe("tasks");
    expect(remote).toMatchObject({ project_id: "p1", start_date: "2026-11-18", photo_ids: ["p1"], closed_at: T1, verified_by: "Office", sheet_id: "s1" });
    // Postgres hands timestamps back in its own format.
    const back = toLocal("tasks", { ...remote, closed_at: "2026-11-19 11:00:00+00", verified_at: "2026-11-19T11:00:00+00:00" });
    expect(back).toEqual(local);
  });
  it("fills the required columns for a bare row", () => {
    const remote = toRemote("tasks", { id: "t", projectId: "p" });
    expect(remote).toMatchObject({ status: "open", title: "", number: 0, deleted: false });
  });
});

describe("tasks migration", () => {
  const sql = readFileSync(path.resolve(__dirname, "../supabase/migrations/20261123100100_plan_tasks.sql"), "utf8");
  const billing = readFileSync(path.resolve(__dirname, "../supabase/migrations/20261121000000_billing.sql"), "utf8");
  it("keeps tasks to the job's team, with soft deletes only", () => {
    expect(sql).toMatch(/enable row level security/);
    for (const op of ["select", "insert", "update"]) expect(sql).toMatch(new RegExp(`for ${op} .*is_project_member\\(project_id\\)`));
    expect(sql).not.toMatch(/for delete/);
  });
  it("stamps synced_at and honours the billing read-only lock", () => {
    expect(sql).toMatch(/tasks_synced_at before insert or update on public\.tasks .*set_synced_at/);
    expect(sql).toMatch(/tasks_write_guard before insert or update on public\.tasks .*job_write_guard/);
    expect(billing).toMatch(/'tasks'[,\]]/);
  });
  it("doesn't let a technician set or clear Verified (and doesn't stall their sync either)", () => {
    expect(sql).toMatch(/tasks_verify_guard before insert or update on public\.tasks/);
    expect(sql).toMatch(/if not public\.is_tech\(\) then\s+return new;/);
    expect(sql).not.toMatch(/raise exception/);
  });
});

describe("one task model", () => {
  const names = ["Mike", "Mike Jones", "mjones"];
  const list = [
    task({ id: "a", number: 1, assignee: "Mike", due: "2026-11-25" }),
    task({ id: "b", number: 2, assignee: "mike jones", due: "2026-11-18", status: "in_progress" }),
    task({ id: "c", number: 3, assignee: "MJONES", status: "ready" }),
    task({ id: "d", number: 4, assignee: "Mike", status: "done" }),
    task({ id: "e", number: 5, assignee: "Mike", status: "verified" }),
    task({ id: "f", number: 6, assignee: "Ann", due: "2026-11-10" }),
    task({ id: "g", number: 7, assignee: "Mike", deleted: true }),
    task({ id: "h", number: 8 }),
  ];

  it("Mine matches any of my names; the job list and /tasks count the same", () => {
    expect(OPEN_STATUSES).toEqual(["open", "in_progress", "ready"]);
    const board = openPlanTasksFor(names, list, TODAY);
    expect(board.map((t) => t.task.id)).toEqual(["b", "a", "c"]);
    // Parity: the job's "Mine" chip (filterTasks + mineOpenFilter) and the /tasks board (openPlanTasksFor).
    expect(filterTasks(list, mineOpenFilter(names), TODAY).length).toBe(board.length);
    for (const who of [["Ann"], ["Mike"], ["nobody"]]) expect(filterTasks(list, mineOpenFilter(who), TODAY).length).toBe(openPlanTasksFor(who, list, TODAY).length);
    // A single name still works as before.
    expect(openPlanTasksFor("Mike", list, TODAY).map((t) => t.task.id)).toEqual(["a"]);
    expect(openPlanTasksFor([], list, TODAY).map((t) => t.task.id)).toEqual(["f", "b", "a", "c"]);
  });

  it("knows when the filter is exactly me", () => {
    expect(isMineFilter(mineOpenFilter(names), names)).toBe(true);
    expect(isMineFilter({ assignee: ["mike", "MIKE JONES", "mjones"] }, names)).toBe(true);
    expect(isMineFilter({ assignee: ["Mike"] }, names)).toBe(false);
    expect(isMineFilter({ assignee: [...names, "Ann"] }, names)).toBe(false);
    expect(isMineFilter({}, names)).toBe(false);
  });

  it("office view: overdue first", () => {
    const all = sortOverdueFirst(openPlanTasksFor(null, list, TODAY));
    expect(all.map((t) => [t.task.id, t.bucket])).toEqual([
      ["f", "overdue"],
      ["b", "overdue"],
      ["a", "week"],
      ["c", "none"],
    ]);
  });

  it("a photo comment becomes a task with the photo, its place, and a link back to the comment", () => {
    const c = { id: "cm1", text: " Cover missing ", author: "Ann", photoId: "ph1" };
    const fields = taskFromComment(c, { sheetId: "s1", room: " Lobby ", markerId: "m1" }, { assignee: " Mike ", due: "2026-11-20" });
    expect(fields).toEqual({ title: "Cover missing", description: "From Ann’s photo comment", assignee: "Mike", due: "2026-11-20", photoIds: ["ph1"], sheetId: "s1", room: "Lobby", markerId: "m1" });
    expect(taskFromComment(c, null, { text: "Edited", due: "soon" })).toMatchObject({ title: "Edited", due: null, sheetId: null, assignee: null });
    const t = { ...newTask({ id: "t9", projectId: "p1", number: 9, ...fields }, "Ann", T0, ids), activity: [createdFromComment("cm1", "Ann", T0, "ev")] };
    expect(commentPlanTask([task(), t], { id: "cm1" })?.id).toBe("t9");
    expect(commentPlanTask([{ ...t, deleted: true }], { id: "cm1" })).toBeUndefined();
    expect(commentPlanTask([t], { id: "other" })).toBeUndefined();
  });

  it("a form's No answers become tasks once", () => {
    const failed = [{ text: "Breakers labeled — No" }, { text: "Panel cover on — No" }, { text: "breakers labeled — no" }];
    const drafts = formTaskDrafts([], { name: "Panel inspection", sheetId: "s1" }, failed);
    expect(drafts).toEqual([
      { title: "Breakers labeled — No", description: formTaskNote("Panel inspection"), sheetId: "s1", markerId: null },
      { title: "Panel cover on — No", description: "From form “Panel inspection”", sheetId: "s1", markerId: null },
    ]);
    const made = drafts.map((d, i) => task({ id: `f${i}`, number: i + 1, ...d }));
    expect(formTaskDrafts(made, { name: "Panel inspection" }, failed)).toEqual([]);
    // Deleted ones can be made again; another form's are separate.
    expect(formTaskDrafts(made.map((t) => ({ ...t, deleted: true })), { name: "Panel inspection" }, failed)).toHaveLength(2);
    expect(formTaskDrafts(made, { name: "Rough-in" }, failed)).toHaveLength(2);
  });

  it("checklist items and device issues prefill a task", () => {
    expect(taskFromChecklistItem({ name: "Trim-out " }, { text: " Plates on ", due: "2026-11-21", photoId: "p0" }, ["p1", "p0"])).toEqual({
      title: "Plates on",
      description: "From checklist “Trim-out”",
      due: "2026-11-21",
      photoIds: ["p0", "p1"],
    });
    expect(taskFromDevice({ id: "m1", sheetId: "s1", x: 0.2, y: 0.3, room: "Kitchen" }, "C3", " Box missing ")).toEqual({
      title: "Fix C3",
      description: "Box missing",
      sheetId: "s1",
      x: 0.2,
      y: 0.3,
      room: "Kitchen",
      markerId: "m1",
    });
  });

  it("older assigned checklist items still show on /tasks, for any of my names", () => {
    const projects: Project[] = [{ id: "p1", clientName: "", address: "1 Main", status: "estimate", billduDocs: [], createdAt: T0, updatedAt: T0 }];
    const checklists: Checklist[] = [
      {
        id: "c1",
        projectId: "p1",
        name: "Punch list",
        items: [
          { id: "i1", text: "Old item", assignee: "mike jones", due: "2026-11-18" },
          { id: "i2", text: "Done", assignee: "Mike", done: true },
          { id: "i3", text: "Ann's", assignee: "Ann" },
        ],
        createdAt: T0,
        updatedAt: T0,
      },
    ];
    expect(openTasks({ projects, checklists }, { today: TODAY, who: names }).map((t) => t.item.id)).toEqual(["i1"]);
    expect(openTasks({ projects, checklists }, { today: TODAY, who: "Ann" }).map((t) => t.item.id)).toEqual(["i3"]);
    expect(openTasks({ projects, checklists }, { today: TODAY, who: [] }).map((t) => t.item.id)).toEqual(["i1", "i3"]);
  });
});
