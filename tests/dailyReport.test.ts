import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addDays,
  cleanReport,
  copyFromPrevious,
  crewSuggestions,
  duplicateCrewNames,
  editAccess,
  emptyReport,
  isStructured,
  mergeCrew,
  openMeteoUrl,
  parseHours,
  previousLog,
  reportCompleteness,
  reportHasContent,
  totals,
  weatherCodeText,
  weatherFromOpenMeteo,
  weatherKind,
  weatherLine,
  weekStartOf,
  weeklyHours,
  weeklyHoursCsv,
} from "@/lib/dailyReport";
import type { DailyReport, JobLog } from "@/lib/types";

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures/open-meteo-daily.json"), "utf8"));
const log = (id: string, date: string, report?: DailyReport | null, extra: Partial<JobLog> = {}): JobLog => ({
  id, projectId: "p", date, body: "", createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z`, report, ...extra,
});

describe("daily report basics", () => {
  it("knows structured logs from the older free-text ones", () => {
    expect(isStructured(log("a", "2026-11-19"))).toBe(false);
    expect(isStructured(log("a", "2026-11-19", null))).toBe(false);
    expect(isStructured(log("a", "2026-11-19", emptyReport()))).toBe(true);
    expect(isStructured({ report: [] as unknown as DailyReport })).toBe(false);
  });

  it("parses hours with a comma or dot and clamps them to 0–24", () => {
    expect(parseHours("8")).toBe(8);
    expect(parseHours("7,5")).toBe(7.5);
    expect(parseHours(" 10.25 ")).toBe(10.25);
    expect(parseHours("30")).toBe(24);
    expect(parseHours("-2")).toBe(0);
    expect(parseHours("")).toBeNull();
    expect(parseHours("abc")).toBeNull();
    expect(parseHours(".")).toBeNull();
    expect(parseHours(6)).toBe(6);
  });

  it("merges duplicate crew names, adding hours (max 24) and keeping the first role", () => {
    const m = mergeCrew([
      { name: "Ana Ruiz", hours: 8, role: "Foreman" },
      { name: " ana  ruiz ", hours: 4, role: "Tech" },
      { name: "", hours: 3 },
      { name: "Ben", hours: 20 },
      { name: "BEN", hours: 10 },
    ]);
    expect(m.crew).toEqual([
      { name: "Ana Ruiz", hours: 12, role: "Foreman" },
      { name: "Ben", hours: 24, role: null },
    ]);
    expect(m.duplicates).toEqual(["Ana Ruiz", "Ben"]);
    expect(duplicateCrewNames([{ name: "A", hours: 1 }, { name: "B", hours: 1 }])).toEqual([]);
  });

  it("cleans a report for saving", () => {
    const { report, duplicates } = cleanReport({
      weather: { summary: " Rain ", tempHighF: 50, tempLowF: null, source: "manual" },
      crew: [{ name: "Ana", hours: 8 }, { name: "ana", hours: 2 }],
      work: [{ text: " Pulled Cat6 ", sheetId: "s1", area: " " }, { text: "  " }],
      deliveries: ["", " 2 boxes Cat6 "],
      delays: [{ reason: "Waiting on GC", hours: 30, ongoing: true }, { reason: "" }],
      safety: { incident: false, notes: "  " },
    });
    expect(duplicates).toEqual(["Ana"]);
    expect(report.weather).toEqual({ summary: "Rain", tempHighF: 50, source: "manual" });
    expect(report.crew).toEqual([{ name: "Ana", hours: 10, role: null }]);
    expect(report.work).toEqual([{ text: "Pulled Cat6", sheetId: "s1", area: null }]);
    expect(report.deliveries).toEqual(["2 boxes Cat6"]);
    expect(report.delays).toEqual([{ reason: "Waiting on GC", hours: 24, ongoing: true }]);
    expect(report.safety).toEqual({ incident: false, notes: null });
    expect(report.signature).toBeNull();
    expect(cleanReport(emptyReport()).report.weather).toEqual({});
  });

  it("says whether there's anything to save", () => {
    expect(reportHasContent(null)).toBe(false);
    expect(reportHasContent(emptyReport())).toBe(false);
    expect(reportHasContent({ ...emptyReport(), crew: [{ name: "", hours: 8 }] })).toBe(false);
    expect(reportHasContent({ ...emptyReport(), crew: [{ name: "Ana", hours: 0 }] })).toBe(true);
    expect(reportHasContent({ ...emptyReport(), safety: { incident: false } })).toBe(true);
    expect(reportHasContent({ weather: { tempHighF: 40 } })).toBe(true);
  });
});

describe("copy from yesterday", () => {
  const prev: DailyReport = {
    weather: { summary: "Rain", tempHighF: 50 },
    crew: [{ name: "Ana", hours: 8, role: "Foreman" }, { name: "Ben", hours: 6.5 }],
    work: [{ text: "Rough-in 2nd floor" }],
    deliveries: ["Cat6"],
    equipment: ["Scissor lift", " "],
    delays: [{ reason: "Waiting on inspection", hours: 2, ongoing: true }, { reason: "Rain", hours: 1 }],
    safety: { incident: true, notes: "Cut finger" },
    visitors: ["GC"],
    signature: { name: "Ana", imageId: "img", signedAt: "2026-11-18T17:00:00.000Z" },
  };

  it("brings the crew (with hours), equipment and the ongoing delays — nothing else", () => {
    const r = copyFromPrevious(log("y", "2026-11-18", prev));
    expect(r.crew).toEqual([{ name: "Ana", hours: 8, role: "Foreman" }, { name: "Ben", hours: 6.5, role: null }]);
    expect(r.equipment).toEqual(["Scissor lift"]);
    expect(r.delays).toEqual([{ reason: "Waiting on inspection", hours: null, ongoing: true }]);
    expect(r.work).toEqual([]);
    expect(r.weather).toEqual({});
    expect(r.deliveries).toEqual([]);
    expect(r.visitors).toEqual([]);
    expect(r.safety).toBeUndefined();
    expect(r.signature).toBeNull();
  });

  it("gives an empty report from a legacy log or nothing", () => {
    expect(copyFromPrevious(log("y", "2026-11-18"))).toEqual(emptyReport());
    expect(copyFromPrevious(null)).toEqual(emptyReport());
  });

  it("finds the previous day's log, preferring one with a report", () => {
    const logs = [
      log("old", "2026-11-10", prev),
      log("legacy", "2026-11-17"),
      log("y", "2026-11-17", prev),
      log("today", "2026-11-19", prev),
      log("gone", "2026-11-18", prev, { deleted: true }),
    ];
    expect(previousLog(logs, "2026-11-19")?.id).toBe("y");
    expect(previousLog(logs, "2026-11-17")?.id).toBe("old");
    expect(previousLog([log("legacy", "2026-11-17")], "2026-11-19")?.id).toBe("legacy");
    expect(previousLog(logs, "2026-11-01")).toBeNull();
  });
});

describe("totals and weekly hours", () => {
  it("adds up crew, man-hours and delay hours", () => {
    expect(totals(null)).toEqual({ crew: 0, manHours: 0, delayHours: 0 });
    expect(
      totals({
        crew: [{ name: "Ana", hours: 8 }, { name: "Ben", hours: 7.5 }, { name: "", hours: 9 }, { name: "Cy", hours: 40 }],
        delays: [{ reason: "Rain", hours: 1.5 }, { reason: "Parts", hours: null }, { reason: "", hours: 3 }],
      }),
    ).toEqual({ crew: 3, manHours: 39.5, delayHours: 1.5 });
  });

  it("finds the Monday of a week", () => {
    expect(weekStartOf("2026-11-19")).toBe("2026-11-16"); // Thursday
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("returns hours per person per day with totals", () => {
    const logs = [
      log("a", "2026-11-16", { crew: [{ name: "Ana", hours: 8 }, { name: "Ben", hours: 8 }] }),
      log("b", "2026-11-16", { crew: [{ name: "ana", hours: 2 }] }),
      log("c", "2026-11-18", { crew: [{ name: "Ben", hours: 7.5 }] }),
      log("d", "2026-11-23", { crew: [{ name: "Ana", hours: 8 }] }), // next week
      log("e", "2026-11-17", { crew: [{ name: "Ana", hours: 8 }] }, { deleted: true }),
      log("f", "2026-11-17"), // legacy
    ];
    const w = weeklyHours(logs, "2026-11-16");
    expect(w.days).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(w.rows).toEqual([
      { name: "Ana", hours: [10, 0, 0, 0, 0, 0, 0], total: 10 },
      { name: "Ben", hours: [8, 0, 7.5, 0, 0, 0, 0], total: 15.5 },
    ]);
    expect(w.dayTotals).toEqual([18, 0, 7.5, 0, 0, 0, 0]);
    expect(w.total).toBe(25.5);
    const csv = weeklyHoursCsv(w).trim().split("\n");
    expect(csv[0]).toBe("Name,2026-11-16,2026-11-17,2026-11-18,2026-11-19,2026-11-20,2026-11-21,2026-11-22,Total");
    expect(csv[2]).toBe("Ben,8,0,7.5,0,0,0,0,15.5");
    expect(csv[3]).toBe("Total,18,0,7.5,0,0,0,0,25.5");
    expect(weeklyHoursCsv(weeklyHours([log("x", "2026-11-16", { crew: [{ name: 'Smith, "J"', hours: 1 }] })], "2026-11-16"))).toContain('"Smith, ""J"""');
  });
});

describe("weather", () => {
  it("maps an Open-Meteo daily response (saved fixture) to report weather", () => {
    expect(weatherFromOpenMeteo(fixture, "2026-11-18")).toEqual({ summary: "Rain", tempHighF: 55, tempLowF: 46, precipIn: 0.83, windMph: 22, source: "auto" });
    expect(weatherFromOpenMeteo(fixture, "2026-11-16")).toEqual({ summary: "Clear", tempHighF: 58, tempLowF: 41, precipIn: 0, windMph: 9, source: "auto" });
    expect(weatherFromOpenMeteo(fixture, "2026-11-20", "2026-11-19")).toEqual({ summary: "Light snow", tempHighF: 33, tempLowF: 28, precipIn: 1.24, windMph: 18, source: "auto", forecast: true });
    expect(weatherFromOpenMeteo(fixture, "2026-11-21")?.summary).toBe("Thunderstorms");
    // A day with no data, a day not in the response, and junk.
    expect(weatherFromOpenMeteo(fixture, "2026-11-22")).toBeNull();
    expect(weatherFromOpenMeteo(fixture, "2026-12-01")).toBeNull();
    expect(weatherFromOpenMeteo(null, "2026-11-18")).toBeNull();
    expect(weatherFromOpenMeteo({ daily: { time: "x" } }, "2026-11-18")).toBeNull();
  });

  it("accepts the older weathercode key and converts metric responses", () => {
    const metric = { daily_units: { temperature_2m_max: "°C", temperature_2m_min: "°C", precipitation_sum: "mm", wind_speed_10m_max: "km/h" }, daily: { time: ["2026-01-02"], weathercode: [45], temperature_2m_max: [10], temperature_2m_min: [0], precipitation_sum: [25.4], wind_speed_10m_max: [16.09344] } };
    expect(weatherFromOpenMeteo(metric, "2026-01-02")).toEqual({ summary: "Fog", tempHighF: 50, tempLowF: 32, precipIn: 1, windMph: 10, source: "auto" });
    expect(weatherCodeText(999)).toBeNull();
    expect(weatherCodeText(null)).toBeNull();
  });

  it("builds the forecast / archive URL by date", () => {
    const recent = openMeteoUrl(40.7128, -74.006, "2026-11-18", "2026-11-19")!;
    expect(recent).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
    const q = new URL(recent).searchParams;
    expect(q.get("start_date")).toBe("2026-11-18");
    expect(q.get("end_date")).toBe("2026-11-18");
    expect(q.get("timezone")).toBe("auto");
    expect(q.get("temperature_unit")).toBe("fahrenheit");
    expect(q.get("wind_speed_unit")).toBe("mph");
    expect(q.get("precipitation_unit")).toBe("inch");
    expect(q.get("daily")).toContain("weather_code");
    expect(openMeteoUrl(40.7, -74, "2026-08-21", "2026-11-19")).toMatch(/^https:\/\/api\.open-meteo\.com/); // 90 days back
    expect(openMeteoUrl(40.7, -74, "2026-08-20", "2026-11-19")).toMatch(/^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?/);
    expect(openMeteoUrl(40.7, -74, "2026-11-25", "2026-11-19")).toMatch(/forecast/);
    expect(openMeteoUrl(40.7, -74, "2026-12-20", "2026-11-19")).toBeNull(); // past the forecast
    expect(openMeteoUrl(NaN, -74, "2026-11-19", "2026-11-19")).toBeNull();
  });

  it("writes a one-line summary and picks an icon", () => {
    expect(weatherLine({ summary: "Rain", tempHighF: 55, tempLowF: 46, precipIn: 0.83, windMph: 22 })).toBe("Rain · 55° / 46°F · 0.83 in precip · wind 22 mph");
    expect(weatherLine({ summary: "Clear", tempHighF: 58, tempLowF: null, precipIn: 0, forecast: true })).toBe("Clear · High 58°F · forecast");
    expect(weatherLine({})).toBe("");
    expect(weatherLine(undefined)).toBe("");
    expect(weatherKind("Thunderstorms with hail")).toBe("storm");
    expect(weatherKind("Light snow")).toBe("snow");
    expect(weatherKind("Light rain")).toBe("rain");
    expect(weatherKind("Partly cloudy")).toBe("partly");
    expect(weatherKind("Overcast")).toBe("cloudy");
    expect(weatherKind("Clear")).toBe("clear");
    expect(weatherKind("")).toBeNull();
  });
});

describe("completeness and editing rules", () => {
  it("lists the recommended sections still missing", () => {
    expect(reportCompleteness(emptyReport())).toEqual(["weather", "crew", "work", "safety", "signature"]);
    expect(reportCompleteness(null)).toEqual(["weather", "crew", "work", "safety", "signature"]);
    expect(
      reportCompleteness({
        weather: { tempHighF: 50 },
        crew: [{ name: "Ana", hours: 8 }],
        work: [{ text: "Trim-out" }],
        safety: { incident: false },
        signature: { name: "Ana", imageId: "i", signedAt: "2026-11-19T17:00:00.000Z" },
      }),
    ).toEqual([]);
    // A crew row without hours doesn't count yet.
    expect(reportCompleteness({ crew: [{ name: "Ana", hours: 0 }], safety: { incident: true } })).toEqual(["weather", "crew", "work", "signature"]);
  });

  it("lets anyone edit unsigned logs, and only the author or the office edit signed ones", () => {
    const sig = { name: "Ana Ruiz", imageId: "i", signedAt: "2026-11-19T17:00:00.000Z" };
    const signed = { author: "ana", report: { signature: sig } };
    expect(editAccess({ author: "x", report: null }, { role: "tech", me: "ben" })).toBe("edit");
    expect(editAccess(signed, { role: "admin", me: "ben" })).toBe("confirm");
    expect(editAccess(signed, { role: null, me: "ben" })).toBe("confirm");
    expect(editAccess(signed, { role: "tech", me: "Ana" })).toBe("confirm");
    expect(editAccess(signed, { role: "tech", me: "ana ruiz" })).toBe("confirm");
    expect(editAccess(signed, { role: "tech", me: "ben" })).toBe("denied");
    expect(editAccess(signed, { role: "tech", me: "" })).toBe("denied");
  });

  it("suggests team members then recent crew", () => {
    const logs = [log("a", "2026-11-17", { crew: [{ name: "Cy", hours: 8 }, { name: "ana", hours: 8 }] }), log("b", "2026-11-18", { crew: [{ name: "Dee", hours: 8 }] })];
    expect(crewSuggestions(["Ana", "Ben", " "], logs)).toEqual(["Ana", "Ben", "Dee", "Cy"]);
  });
});

describe("shared Open-Meteo fixture", () => {
  it("is the same file the iOS core tests read", () => {
    const ios = readFileSync(path.resolve(__dirname, "../ios/PinPlanCore/Tests/PinPlanCoreTests/Fixtures/open-meteo-daily.json"), "utf8");
    expect(JSON.parse(ios)).toEqual(fixture);
  });
});
