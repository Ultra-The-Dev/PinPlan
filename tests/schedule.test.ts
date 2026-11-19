import { describe, expect, it } from "vitest";
import {
  addWorkdays,
  canEditSchedule,
  cascade,
  criticalPath,
  crewLoad,
  durationDays,
  groupByWeek,
  itemsFromTemplate,
  lookahead,
  lookaheadWindow,
  moveItem,
  phaseTemplates,
  resizeItem,
  schedulePercent,
  toIcs,
  validateDeps,
  workdaysBetween,
  wouldCycle,
} from "@/lib/schedule";
import { PUSH_ORDER, TABLES, toLocal, toRemote } from "@/lib/syncMap";
import type { ScheduleItem } from "@/lib/types";

const ts = "2026-11-19T00:00:00.000Z";
// 2026-11-23 is a Monday.
function item(id: string, start: string, end: string, extra: Partial<ScheduleItem> = {}): ScheduleItem {
  return { id, projectId: "p", name: id.toUpperCase(), start, end, createdAt: ts, updatedAt: ts, ...extra };
}
const byId = (rows: ScheduleItem[]) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe("workday math", () => {
  it("skips weekends both ways", () => {
    expect(addWorkdays("2026-11-27", 1)).toBe("2026-11-30"); // Fri + 1 → Mon
    expect(addWorkdays("2026-11-23", 5)).toBe("2026-11-30"); // Mon + 5 → next Mon
    expect(addWorkdays("2026-11-30", -1)).toBe("2026-11-27"); // Mon − 1 → Fri
    expect(addWorkdays("2026-11-28", 1)).toBe("2026-11-30"); // Sat + 1 → Mon
    expect(addWorkdays("2026-11-27", 1, false)).toBe("2026-11-28");
    expect(addWorkdays("2026-11-23", 0)).toBe("2026-11-23");
  });
  it("counts working days inclusively", () => {
    expect(workdaysBetween("2026-11-23", "2026-11-27")).toBe(5);
    expect(workdaysBetween("2026-11-27", "2026-11-30")).toBe(2);
    expect(workdaysBetween("2026-11-23", "2026-12-06")).toBe(10);
    expect(workdaysBetween("2026-11-28", "2026-11-29")).toBe(0);
    expect(workdaysBetween("2026-11-27", "2026-11-30", false)).toBe(4);
    expect(workdaysBetween("2026-11-30", "2026-11-27")).toBe(0);
    expect(durationDays(item("a", "2026-11-27", "2026-11-30"))).toBe(2);
    expect(durationDays(item("a", "2026-11-28", "2026-11-29"))).toBe(1);
  });
});

describe("cascade", () => {
  // A (Mon–Tue) → B (lag 1, Thu–Fri) → C (Mon).
  const chain = () => [
    item("a", "2026-11-23", "2026-11-24"),
    item("b", "2026-11-26", "2026-11-27", { dependsOn: [{ id: "a", lagDays: 1 }] }),
    item("c", "2026-11-30", "2026-11-30", { dependsOn: [{ id: "b" }] }),
  ];
  it("pushes a chain with lag, keeping durations", () => {
    const rows = moveItem(chain(), "a", 3); // A → Thu–Fri
    const m = byId(rows);
    expect(m.a).toMatchObject({ start: "2026-11-26", end: "2026-11-27" });
    expect(m.b).toMatchObject({ start: "2026-12-01", end: "2026-12-02" }); // Fri + 1 + lag 1 → Tue
    expect(m.c).toMatchObject({ start: "2026-12-03", end: "2026-12-03" });
    expect(rows).toHaveLength(3);
  });
  it("never pulls dependents earlier", () => {
    const rows = moveItem(chain(), "a", -7);
    expect(rows.map((r) => r.id)).toEqual(["a"]);
    expect(rows[0]).toMatchObject({ start: "2026-11-16", end: "2026-11-17" });
  });
  it("only moves what is too early", () => {
    const items = [item("a", "2026-11-23", "2026-11-23"), item("b", "2026-12-07", "2026-12-08", { dependsOn: [{ id: "a" }] })];
    expect(moveItem(items, "a", 1).map((r) => r.id)).toEqual(["a"]);
  });
  it("resizing pushes dependents and rejects end before start", () => {
    const rows = resizeItem(chain(), "a", "2026-11-25")!;
    expect(byId(rows).b).toMatchObject({ start: "2026-11-27", end: "2026-11-30" });
    expect(resizeItem(chain(), "a", "2026-11-20")).toBeNull();
  });
  it("ignores dependencies on deleted items and warns", () => {
    const items = [item("a", "2026-11-23", "2026-11-24", { deleted: true }), item("b", "2026-11-23", "2026-11-23", { dependsOn: [{ id: "a" }, { id: "zzz" }] })];
    expect(cascade(items, "a")).toEqual([]);
    expect(validateDeps(items).missing).toEqual([
      { id: "b", dep: "a" },
      { id: "b", dep: "zzz" },
    ]);
  });
  it("keeps workday items off weekends when moved", () => {
    const rows = moveItem([item("a", "2026-11-26", "2026-11-27")], "a", 2); // Thu → Sat → Mon
    expect(rows[0]).toMatchObject({ start: "2026-11-30", end: "2026-12-01" });
  });
});

describe("dependency checks", () => {
  it("detects cycles", () => {
    const items = [
      item("a", "2026-11-23", "2026-11-23", { dependsOn: [{ id: "c" }] }),
      item("b", "2026-11-23", "2026-11-23", { dependsOn: [{ id: "a" }] }),
      item("c", "2026-11-23", "2026-11-23", { dependsOn: [{ id: "b" }] }),
      item("d", "2026-11-23", "2026-11-23", { dependsOn: [{ id: "c" }] }),
    ];
    expect(validateDeps(items).cycle.sort()).toEqual(["a", "b", "c"]);
    expect(cascade(items, "a")).toEqual([]); // no infinite loop
    const ok = [item("a", "2026-11-23", "2026-11-23"), item("b", "2026-11-24", "2026-11-24", { dependsOn: [{ id: "a" }] })];
    expect(validateDeps(ok).cycle).toEqual([]);
    expect(wouldCycle(ok, "a", "b")).toBe(true);
    expect(wouldCycle(ok, "b", "a")).toBe(false);
    expect(wouldCycle(ok, "a", "a")).toBe(true);
  });
  it("finds the critical path through a diamond", () => {
    const items = [
      item("a", "2026-11-23", "2026-11-23"),
      item("b", "2026-11-24", "2026-11-30", { dependsOn: [{ id: "a" }] }), // 5 workdays
      item("c", "2026-11-24", "2026-11-25", { dependsOn: [{ id: "a" }] }), // 2
      item("d", "2026-12-01", "2026-12-01", { dependsOn: [{ id: "b" }, { id: "c" }] }),
    ];
    expect(criticalPath(items)).toEqual(["a", "b", "d"]);
    // Lag counts: give C a long wait.
    items[2] = { ...items[2], dependsOn: [{ id: "a", lagDays: 10 }] };
    expect(criticalPath(items)).toEqual(["a", "c", "d"]);
  });
});

describe("look-ahead", () => {
  it("covers Monday of this week through three weeks", () => {
    expect(lookaheadWindow("2026-11-25")).toEqual({ from: "2026-11-23", to: "2026-12-13" });
    expect(lookaheadWindow("2026-11-29")).toEqual({ from: "2026-11-23", to: "2026-12-13" }); // Sunday belongs to the week before
    const items = [
      item("past", "2026-11-16", "2026-11-22"),
      item("running", "2026-11-16", "2026-11-23"),
      item("last", "2026-12-13", "2026-12-14"),
      item("later", "2026-12-14", "2026-12-15"),
      item("gone", "2026-11-25", "2026-11-25", { deleted: true }),
    ];
    expect(lookahead(items, "2026-11-25").map((i) => i.id)).toEqual(["running", "last"]);
    expect(lookahead(items, "2026-11-25", 4).map((i) => i.id)).toEqual(["running", "last", "later"]);
  });
  it("groups the agenda by week", () => {
    const g = groupByWeek([item("a", "2026-11-25", "2026-11-25"), item("b", "2026-12-01", "2026-12-02"), item("c", "2026-11-16", "2026-11-24")], "2026-11-25");
    expect(g.map((w) => [w.week, w.items.map((i) => i.id)])).toEqual([
      ["2026-11-23", ["c", "a"]],
      ["2026-11-30", ["b"]],
    ]);
  });
});

describe("crew board", () => {
  it("spreads hours and flags overbooking", () => {
    const load = crewLoad(
      {
        j1: [item("a", "2026-11-23", "2026-11-24", { crew: ["Sam", "Lee"], hoursPlanned: 32 })], // 8 h each per day
        j2: [item("b", "2026-11-24", "2026-11-24", { crew: ["sam"], hoursPlanned: 4 })],
        j3: [item("c", "2026-11-25", "2026-11-25", { crew: ["Lee"], hoursPlanned: 10 }), item("d", "2026-11-25", "2026-11-25", { crew: ["Lee"] })],
      },
      "2026-11-23",
      "2026-11-29",
    );
    expect(load.people).toEqual(["Lee", "Sam"]);
    expect(load.days).toHaveLength(7);
    expect(load.cells.Sam["2026-11-23"]).toMatchObject({ hours: 8, overbooked: false });
    expect(load.cells.Sam["2026-11-24"]).toMatchObject({ hours: 12, overbooked: true });
    expect(load.cells.Sam["2026-11-24"].jobs.map((j) => j.projectId)).toEqual(["j1", "j2"]);
    // Two phases of one job on one day isn't double-booked, but 10 h is.
    expect(load.cells.Lee["2026-11-25"]).toMatchObject({ hours: 10, overbooked: true });
    expect(load.cells.Lee["2026-11-26"]).toBeUndefined();
  });
  it("two jobs on the same day is overbooked even without hours", () => {
    const load = crewLoad({ j1: [item("a", "2026-11-23", "2026-11-23", { crew: ["Sam"] })], j2: [item("b", "2026-11-23", "2026-11-23", { crew: ["Sam"] })] }, "2026-11-23", "2026-11-23");
    expect(load.cells.Sam["2026-11-23"]).toMatchObject({ hours: 0, overbooked: true });
  });
  it("skips weekends for workday items", () => {
    const load = crewLoad({ j: [item("a", "2026-11-27", "2026-11-30", { crew: ["Sam"], hoursPlanned: 16 })] }, "2026-11-23", "2026-12-06");
    expect(Object.keys(load.cells.Sam)).toEqual(["2026-11-27", "2026-11-30"]);
    expect(load.cells.Sam["2026-11-30"].hours).toBe(8);
  });
});

describe("progress, templates and permissions", () => {
  it("weights by hours, else by duration", () => {
    expect(schedulePercent([item("a", "2026-11-23", "2026-11-23", { hoursPlanned: 30, progress: 100 }), item("b", "2026-11-24", "2026-11-24", { hoursPlanned: 10, progress: 0 })])).toBe(75);
    expect(schedulePercent([item("a", "2026-11-23", "2026-11-25", { progress: 100 }), item("b", "2026-11-26", "2026-11-26", { hoursPlanned: 10 })])).toBe(75);
    expect(schedulePercent([])).toBe(0);
  });
  it("lays a trade template out as a chain", () => {
    const [lv] = phaseTemplates(["lowvoltage"]);
    expect(lv.phases.map((p) => p.name)).toEqual(["Pre-wire", "Rough inspection", "Trim", "Programming", "Final / walkthrough"]);
    let n = 0;
    const items = itemsFromTemplate(lv, { projectId: "p", start: "2026-11-23", now: ts, newId: () => `i${n++}` });
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({ start: "2026-11-23", end: "2026-11-25", dependsOn: [] });
    expect(items[1]).toMatchObject({ start: "2026-11-27", dependsOn: [{ id: "i0", lagDays: 1 }] });
    expect(validateDeps(items)).toEqual({ cycle: [], missing: [] });
    expect(cascade(items, "i0")).toEqual([]);
    expect(phaseTemplates([]).map((t) => t.trade)).toEqual(["lowvoltage"]);
    expect(phaseTemplates(["electrical", "fire"]).map((t) => t.trade)).toEqual(["electrical", "fire"]);
  });
  it("lets techs update only items they are crewed on", () => {
    const it1 = item("a", "2026-11-23", "2026-11-23", { crew: ["Sam Lee"] });
    expect(canEditSchedule("admin", it1, "x")).toBe("all");
    expect(canEditSchedule(null, it1, null)).toBe("all");
    expect(canEditSchedule("tech", it1, "sam lee")).toBe("progress");
    expect(canEditSchedule("tech", it1, "Pat")).toBe("none");
    expect(canEditSchedule("tech", null, "Pat")).toBe("none");
  });
});

describe("calendar export", () => {
  it("writes all-day events with an exclusive end", () => {
    const ics = toIcs([item("a", "2026-11-23", "2026-11-24", { name: "Rough-in, floor 1", crew: ["Sam"], notes: "Bring lift" })], { id: "p", clientName: "Acme", address: "1 Main St" });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261123\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261125\r\n");
    expect(ics).toContain("UID:a@pinplan");
    expect(ics).toContain("DTSTAMP:20261119T000000Z");
    expect(ics.replace(/\r\n /g, "")).toContain("SUMMARY:Rough-in\\, floor 1 — Acme · 1 Main St");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("sync mapping", () => {
  it("round-trips a schedule item, mapping start/end to start_date/end_date", () => {
    const row = item("s", "2026-11-23", "2026-11-25", { crew: ["Sam"], hoursPlanned: 24, progress: 40, dependsOn: [{ id: "x", lagDays: 2 }], sheetIds: ["sh"], sort: 2, workdaysOnly: false, color: "#2563eb", phase: "trim", notes: "n" });
    const r = toRemote("scheduleItems", row as unknown as Record<string, unknown>);
    expect(r).toMatchObject({ project_id: "p", start_date: "2026-11-23", end_date: "2026-11-25", depends_on: [{ id: "x", lagDays: 2 }], sheet_ids: ["sh"], sort_order: 2, workdays_only: false, hours_planned: 24 });
    expect(r).not.toHaveProperty("start");
    expect(toLocal("scheduleItems", { ...r, deleted: false })).toEqual({ ...row, deleted: false });
    expect(TABLES.scheduleItems.remote).toBe("schedule_items");
    expect(PUSH_ORDER.indexOf("scheduleItems")).toBeGreaterThan(PUSH_ORDER.indexOf("projects"));
  });
});
