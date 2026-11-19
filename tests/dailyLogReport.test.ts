import { describe, expect, it } from "vitest";
import { dailyLogFileName, logDays, logPhotos, logsInRange } from "@/lib/dailyLogReport";
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
});
