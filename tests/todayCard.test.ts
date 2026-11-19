// The Today card (src/components/field/TodayCard.tsx) and the Field sections: the pure parts it is built from.
import { describe, expect, it } from "vitest";
import { pickFieldSection, todayLog, unfinishedChecklists } from "@/lib/fieldDocs";
import { canEditSchedule, onCrew } from "@/lib/schedule";
import { myTasksDueNow } from "@/lib/tasks";
import type { Checklist, JobLog, Photo, PlanTask } from "@/lib/types";

const T0 = "2026-11-19T10:00:00.000Z";
const TODAY = "2026-11-19";

const task = (over: Partial<PlanTask>): PlanTask => ({ id: "t", projectId: "p1", number: 1, title: "Task", status: "open", createdAt: T0, updatedAt: T0, ...over });
const log = (over: Partial<JobLog>): JobLog => ({ id: "l", projectId: "p1", date: TODAY, body: "", createdAt: T0, updatedAt: T0, ...over });

describe("my tasks due now", () => {
  it("only my open tasks that are overdue or due today, overdue first", () => {
    const tasks = [
      task({ id: "a", number: 1, assignee: "Mike", due: "2026-11-19" }),
      task({ id: "b", number: 2, assignee: "mike jones", due: "2026-11-17" }),
      task({ id: "c", number: 3, assignee: "Mike", due: "2026-11-20" }),
      task({ id: "d", number: 4, assignee: "Mike", due: "2026-11-18", status: "done" }),
      task({ id: "e", number: 5, assignee: "Ann", due: "2026-11-18" }),
      task({ id: "f", number: 6, assignee: "Mike" }),
      task({ id: "g", number: 7, assignee: "Mike", due: "2026-11-19", deleted: true }),
    ];
    expect(myTasksDueNow(tasks, ["Mike", "Mike Jones"], TODAY).map((t) => [t.task.id, t.bucket])).toEqual([
      ["b", "overdue"],
      ["a", "today"],
    ]);
    // No names: nothing (never everyone's).
    expect(myTasksDueNow(tasks, [], TODAY)).toEqual([]);
  });
});

describe("today's daily log", () => {
  it("start when there is none today on this job", () => {
    expect(todayLog([log({ date: "2026-11-18" }), log({ projectId: "p2" }), log({ deleted: true })], "p1", TODAY)).toEqual({ status: "start", log: null });
  });
  it("continue mine first, else anyone's; signed once it has a signature", () => {
    const logs = [
      log({ id: "ann", author: "Ann", updatedAt: "2026-11-19T12:00:00.000Z" }),
      log({ id: "mine", author: "mike", updatedAt: "2026-11-19T09:00:00.000Z" }),
    ];
    expect(todayLog(logs, "p1", TODAY, ["Mike"])).toMatchObject({ status: "continue", log: { id: "mine" } });
    expect(todayLog(logs, "p1", TODAY, [])).toMatchObject({ status: "continue", log: { id: "ann" } });
    const signed = [log({ id: "s", author: "Ann", report: { signature: { name: "Mike", imageId: "i", signedAt: T0 } } })];
    expect(todayLog(signed, "p1", TODAY, ["Mike"])).toMatchObject({ status: "signed", log: { id: "s" } });
  });
});

describe("open checklists", () => {
  const cl = (id: string, items: Checklist["items"], over: Partial<Checklist> = {}): Checklist => ({ id, projectId: "p1", name: id, items, createdAt: T0, updatedAt: T0, ...over });
  it("leaves out finished, empty, deleted and other jobs' checklists; least done first", () => {
    const photos: Photo[] = [{ id: "ph", projectId: "p1", imageId: "i", width: 1, height: 1, takenAt: T0, createdAt: T0, updatedAt: T0, checklistId: "proof", checklistItemId: "x" }];
    const list = [
      cl("half", [{ id: "1", text: "a", done: true }, { id: "2", text: "b" }]),
      cl("none", [{ id: "1", text: "a" }]),
      cl("done", [{ id: "1", text: "a", done: true }]),
      cl("empty", []),
      cl("gone", [{ id: "1", text: "a" }], { deleted: true }),
      cl("other", [{ id: "1", text: "a" }], { projectId: "p2" }),
      // Ticked but the photo it needs is missing: still open.
      cl("needsPhoto", [{ id: "1", text: "a", done: true, requiresPhoto: true }]),
      cl("proof", [{ id: "x", text: "a", done: true, requiresPhoto: true }]),
    ];
    expect(unfinishedChecklists(list, photos, "p1").map((x) => [x.checklist.id, x.done, x.total])).toEqual([
      ["needsPhoto", 0, 1],
      ["none", 0, 1],
      ["half", 1, 2],
    ]);
  });
});

describe("this week's phases for me", () => {
  it("on the crew under any of my names", () => {
    const item = { crew: ["Jordan Lee", "Pat"] };
    expect(onCrew(item, ["Jordan", "jordan lee"])).toBe(true);
    expect(onCrew(item, "pat")).toBe(true);
    expect(onCrew(item, ["Sam", ""])).toBe(false);
    expect(onCrew(item, [])).toBe(false);
    expect(canEditSchedule("tech", item, ["Me", "Jordan Lee"])).toBe("progress");
    expect(canEditSchedule("tech", item, ["Me"])).toBe("none");
    expect(canEditSchedule("admin", null, [])).toBe("all");
  });
});

describe("Field sections", () => {
  it("follows the address, then task links, then the role", () => {
    expect(pickFieldSection("logs", { tech: true })).toBe("logs");
    expect(pickFieldSection("docs", {})).toBe("files");
    expect(pickFieldSection("history", {})).toBe("timeline");
    expect(pickFieldSection(null, { taskLink: true, tech: true })).toBe("tasks");
    expect(pickFieldSection(null, { tech: true })).toBe("today");
    expect(pickFieldSection(null, { tech: false })).toBe("tasks");
    expect(pickFieldSection("nonsense", { tech: true })).toBe("today");
  });
});
