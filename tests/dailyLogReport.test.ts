import { describe, expect, it } from "vitest";
import { dailyLogFileName, logDays, logPhotos, logsInRange, rangeSummary, reportPdfSections } from "@/lib/dailyLogReport";
import type { JobLog, Photo } from "@/lib/types";

const log = (id: string, date: string, extra: Partial<JobLog> = {}): JobLog => ({ id, projectId: "p", date, body: "", createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z`, ...extra });
const photo = (id: string, takenAt: string, extra: Partial<Photo> = {}) => ({ id, projectId: "p", imageId: `img-${id}`, width: 4, height: 3, takenAt, createdAt: takenAt, updatedAt: takenAt, ...extra }) as Photo;

describe("daily log export", () => {
  const logs = [log("c", "2026-03-04"), log("a", "2026-03-02"), log("x", "2026-03-03", { deleted: true }), log("b", "2026-03-03"), log("b2", "2026-03-03", { createdAt: "2026-03-03T07:00:00.000Z" })];

  it("picks live logs in the range, oldest first", () => {
    expect(logsInRange(logs).map((l) => l.id)).toEqual(["a", "b2", "b", "c"]);
    expect(logsInRange(logs, "2026-03-03", "2026-03-03").map((l) => l.id)).toEqual(["b2", "b"]);
    expect(logsInRange(logs, "2026-03-03").map((l) => l.id)).toEqual(["b2", "b", "c"]);
    expect(logsInRange(logs, null, "2026-03-02").map((l) => l.id)).toEqual(["a"]);
    // Swapped ends still work.
    expect(logsInRange(logs, "2026-03-04", "2026-03-03").map((l) => l.id)).toEqual(["b2", "b", "c"]);
    expect(logsInRange(logs, "2026-04-01", "2026-04-30")).toEqual([]);
  });

  it("lists a log's photos in the order taken, skipping deleted and missing ones", () => {
    const ps = [photo("p2", "2026-03-02T15:00:00.000Z"), photo("p1", "2026-03-02T09:00:00.000Z"), photo("p3", "2026-03-02T10:00:00.000Z", { deleted: true }), photo("other", "2026-03-02T11:00:00.000Z")];
    const l = log("a", "2026-03-02", { photoIds: ["p2", "p1", "p3", "gone"] });
    expect(logPhotos(l, ps).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(logPhotos(log("n", "2026-03-02", { photoIds: null }), ps)).toEqual([]);
  });

  it("names the file after the job and days", () => {
    expect(logDays([])).toBeNull();
    expect(logDays(logs.slice(0, 2))).toEqual({ first: "2026-03-02", last: "2026-03-04" });
    expect(dailyLogFileName("12-oak-st", [log("a", "2026-03-02")])).toBe("12-oak-st-daily-log-2026-03-02.pdf");
    expect(dailyLogFileName("12-oak-st", [log("a", "2026-03-02"), log("b", "2026-03-02")])).toBe("12-oak-st-daily-logs-2026-03-02.pdf");
    expect(dailyLogFileName("12-oak-st", logsInRange(logs))).toBe("12-oak-st-daily-logs-2026-03-02-to-2026-03-04.pdf");
    expect(dailyLogFileName("", [])).toBe("job-daily-logs.pdf");
  });

  it("leaves legacy logs as they were (no structured sections, no summary page)", () => {
    expect(reportPdfSections(log("a", "2026-03-02", { body: "Pulled wire" }))).toBeNull();
    expect(rangeSummary([log("a", "2026-03-02"), log("b", "2026-03-03")])).toBeNull();
  });

  it("formats the structured sections of a report for the PDF", () => {
    const l = log("a", "2026-03-02", {
      report: {
        weather: { summary: "Rain", tempHighF: 55, tempLowF: 46, precipIn: 0.83, windMph: 22, source: "auto" },
        crew: [{ name: "Ana", hours: 8, role: "Foreman" }, { name: "Ben", hours: 7.5 }, { name: " ", hours: 4 }],
        work: [{ text: "Pulled Cat6", sheetId: "s1", area: "Kitchen" }, { text: "Set boxes" }, { text: "" }],
        deliveries: ["2 boxes Cat6", ""],
        equipment: ["Lift"],
        delays: [{ reason: "Waiting on GC", hours: 1.5, ongoing: true }, { reason: "Parts" }],
        safety: { incident: true, notes: "Cut finger, first aid" },
        visitors: ["Inspector — passed rough-in"],
        signature: { name: "Ana", imageId: "sig", signedAt: "2026-03-02T22:00:00.000Z" },
      },
    });
    const s = reportPdfSections(l, (id) => (id === "s1" ? "Level 1" : null))!;
    expect(s.weather).toBe("Rain · 55° / 46°F · 0.83 in precip · wind 22 mph");
    expect(s.crew).toEqual([{ name: "Ana", role: "Foreman", hours: 8 }, { name: "Ben", role: "", hours: 7.5 }]);
    expect(s.manHours).toBe(15.5);
    expect(s.work).toEqual(["Pulled Cat6 (Level 1 · Kitchen)", "Set boxes"]);
    expect(s.deliveries).toEqual(["2 boxes Cat6"]);
    expect(s.equipment).toEqual(["Lift"]);
    expect(s.delays).toEqual(["Waiting on GC · 1.5 h lost · ongoing", "Parts"]);
    expect(s.delayHours).toBe(1.5);
    expect(s.safety).toBe("Incident: Cut finger, first aid");
    expect(s.incident).toBe(true);
    expect(s.visitors).toEqual(["Inspector — passed rough-in"]);
    expect(s.signature?.imageId).toBe("sig");
    expect(reportPdfSections(log("b", "2026-03-02", { report: { safety: { incident: false } } }))!.safety).toBe("No incidents");
    expect(reportPdfSections(log("b", "2026-03-02", { report: {} }))!.safety).toBe("");
  });

  it("sums man-hours and delay hours per day for the range summary page", () => {
    const s = rangeSummary([
      log("a", "2026-03-03", { report: { crew: [{ name: "Ana", hours: 8 }, { name: "Ben", hours: 8 }], delays: [{ reason: "Rain", hours: 2 }] } }),
      log("b", "2026-03-02", { report: { crew: [{ name: "Ana", hours: 6 }], safety: { incident: true } } }),
      log("c", "2026-03-03", { report: { crew: [{ name: "Cy", hours: 4 }] } }),
      log("d", "2026-03-04"),
      log("x", "2026-03-04", { report: { crew: [{ name: "Ana", hours: 8 }] }, deleted: true }),
    ])!;
    expect(s.rows).toEqual([
      { date: "2026-03-02", crew: 1, manHours: 6, delayHours: 0, incident: true },
      { date: "2026-03-03", crew: 3, manHours: 20, delayHours: 2, incident: false },
    ]);
    expect(s.manHours).toBe(26);
    expect(s.delayHours).toBe(2);
    expect(s.incidents).toBe(1);
  });
});
