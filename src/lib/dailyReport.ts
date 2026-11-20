// Structured daily reports: the pure rules behind the daily log editor, its list badges, the weekly hours view and the
// PDF. A report lives on the existing JobLog row (`report`, JSON); logs without one are the older free-text logs and
// still read and print as before. Mirrored in PinPlanCore/DailyReportLogic.swift (same Open-Meteo fixture in tests).
import { msg } from "./i18n/msg";
import type { DailyReport, JobLog } from "./types";

export type DailyWeather = NonNullable<DailyReport["weather"]>;
export type CrewRow = NonNullable<DailyReport["crew"]>[number];
export type WorkRow = NonNullable<DailyReport["work"]>[number];
export type DelayRow = NonNullable<DailyReport["delays"]>[number];

/** A blank report. Safety and signature stay unset until someone answers them (they count as missing until then). */
export function emptyReport(): DailyReport {
  return { weather: {}, crew: [], work: [], deliveries: [], equipment: [], delays: [], visitors: [], signature: null };
}

/** A structured log (has a report). Older logs are a title and free text only. */
export function isStructured(log: Pick<JobLog, "report">): boolean {
  return !!log.report && typeof log.report === "object" && !Array.isArray(log.report);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Hours for one person on one day: 0–24, two decimals. */
export function clampHours(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return round2(Math.min(24, Math.max(0, n)));
}

/** What someone typed in an hours box ("7,5", "8", " 10.25 ") → hours clamped to 0–24, or null when it isn't a number. */
export function parseHours(input: string | number | null | undefined): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? clampHours(input) : null;
  const t = (input ?? "").trim().replace(",", ".");
  if (!t || !/^-?\d*\.?\d*$/.test(t) || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? clampHours(n) : null;
}

const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Merge crew rows with the same name (case and spacing ignored): hours add up (still max 24), the first role wins.
 *  Rows without a name are dropped. `duplicates` lists the merged names so the editor can warn. */
export function mergeCrew(crew: CrewRow[]): { crew: CrewRow[]; duplicates: string[] } {
  const out: CrewRow[] = [];
  const at = new Map<string, number>();
  const dupes: string[] = [];
  for (const c of crew) {
    const name = (c.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    const k = nameKey(name);
    const i = at.get(k);
    if (i === undefined) {
      at.set(k, out.length);
      out.push({ name, hours: clampHours(c.hours), role: c.role?.trim() || null });
    } else {
      const prev = out[i];
      out[i] = { ...prev, hours: clampHours(prev.hours + clampHours(c.hours)), role: prev.role || c.role?.trim() || null };
      if (!dupes.includes(prev.name)) dupes.push(prev.name);
    }
  }
  return { crew: out, duplicates: dupes };
}

/** Names that appear more than once in the crew (for a live warning while editing). */
export function duplicateCrewNames(crew: CrewRow[]): string[] {
  return mergeCrew(crew).duplicates;
}

const cleanList = (xs: string[] | undefined) => (xs ?? []).map((x) => x.trim()).filter(Boolean);
const num = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : null);

/** Tidy a report for saving: trim text, drop empty rows, merge duplicate crew, clamp hours. */
export function cleanReport(r: DailyReport): { report: DailyReport; duplicates: string[] } {
  const { crew, duplicates } = mergeCrew(r.crew ?? []);
  const w = r.weather ?? {};
  const weather: DailyWeather = {};
  if (w.summary?.trim()) weather.summary = w.summary.trim();
  for (const k of ["tempHighF", "tempLowF", "precipIn", "windMph"] as const) if (num(w[k]) !== null) weather[k] = num(w[k]);
  if (Object.keys(weather).length) {
    if (w.source) weather.source = w.source;
    if (w.forecast) weather.forecast = true;
  }
  const report: DailyReport = {
    weather,
    crew,
    work: (r.work ?? []).map((x) => ({ text: (x.text ?? "").trim(), sheetId: x.sheetId || null, area: x.area?.trim() || null })).filter((x) => x.text),
    deliveries: cleanList(r.deliveries),
    equipment: cleanList(r.equipment),
    delays: (r.delays ?? [])
      .map((d) => ({ reason: (d.reason ?? "").trim(), hours: d.hours == null ? null : clampHours(d.hours), ...(d.ongoing ? { ongoing: true } : {}) }))
      .filter((d) => d.reason),
    visitors: cleanList(r.visitors),
    signature: r.signature ?? null,
  };
  if (r.safety) report.safety = { incident: !!r.safety.incident, notes: r.safety.notes?.trim() || null };
  return { report, duplicates };
}

/** Anything worth saving in the report (so a log with no title or notes can still be saved). */
export function reportHasContent(r: DailyReport | null | undefined): boolean {
  if (!r) return false;
  const w = r.weather ?? {};
  return (
    !!w.summary?.trim() ||
    [w.tempHighF, w.tempLowF, w.precipIn, w.windMph].some((x) => num(x) !== null) ||
    (r.crew ?? []).some((c) => c.name?.trim()) ||
    (r.work ?? []).some((x) => x.text?.trim()) ||
    cleanList(r.deliveries).length > 0 ||
    cleanList(r.equipment).length > 0 ||
    (r.delays ?? []).some((d) => d.reason?.trim()) ||
    !!r.safety ||
    cleanList(r.visitors).length > 0 ||
    !!r.signature
  );
}

/** Start today's report from the previous one: the crew (names, roles and hours), the equipment on site and the delays
 *  still ongoing (hours lost start empty). Work, weather, deliveries, visitors, safety and the signature are per day. */
export function copyFromPrevious(prev: Pick<JobLog, "report"> | null | undefined): DailyReport {
  const out = emptyReport();
  const r = prev && isStructured(prev) ? prev.report! : null;
  if (!r) return out;
  out.crew = mergeCrew(r.crew ?? []).crew;
  out.equipment = cleanList(r.equipment);
  out.delays = (r.delays ?? []).filter((d) => d.ongoing && d.reason?.trim()).map((d) => ({ reason: d.reason.trim(), hours: null, ongoing: true }));
  return out;
}

/** The log to copy from for `date`: the latest live log on an earlier day, preferring one with a report. */
export function previousLog(logs: JobLog[], date: string, excludeId?: string): JobLog | null {
  const before = logs
    .filter((l) => !l.deleted && l.id !== excludeId && l.date < date)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return before.find(isStructured) ?? before[0] ?? null;
}

/** Crew on site (named rows), man-hours and hours lost to delays. */
export function totals(r: DailyReport | null | undefined): { crew: number; manHours: number; delayHours: number } {
  if (!r) return { crew: 0, manHours: 0, delayHours: 0 };
  const named = (r.crew ?? []).filter((c) => c.name?.trim());
  return {
    crew: new Set(named.map((c) => nameKey(c.name))).size,
    manHours: round2(named.reduce((n, c) => n + clampHours(c.hours), 0)),
    delayHours: round2((r.delays ?? []).filter((d) => d.reason?.trim()).reduce((n, d) => n + clampHours(d.hours), 0)),
  };
}

/** "16 h", "7.5 h" */
export function hoursText(n: number): string {
  return `${Number.isInteger(n) ? n : round2(n)} h`;
}

// --- Weather (Open-Meteo, no API key) ---

/** WMO weather interpretation codes (as used by Open-Meteo) → plain words. */
export function weatherCodeText(code: number | null | undefined): string | null {
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  const T: Record<number, string> = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy rain showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorms",
    96: "Thunderstorms with hail",
    99: "Thunderstorms with hail",
  };
  return T[code] ?? null;
}

/** Quick picks for typing the weather by hand. */
export const WEATHER_CHOICES = ["Clear", "Partly cloudy", "Overcast", "Fog", "Light rain", "Rain", "Heavy rain", "Snow", "Thunderstorms", "Windy"];

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm" | "wind";
/** Which icon to show for a weather summary. */
export function weatherKind(summary: string | null | undefined): WeatherKind | null {
  const s = (summary ?? "").toLowerCase();
  if (!s.trim()) return null;
  if (/thunder|storm|lightning/.test(s)) return "storm";
  if (/snow|sleet|freezing|ice|hail/.test(s)) return "snow";
  if (/drizzle/.test(s)) return "drizzle";
  if (/rain|shower/.test(s)) return "rain";
  if (/fog|mist|haze/.test(s)) return "fog";
  if (/partly|mostly clear|some clouds/.test(s)) return "partly";
  if (/overcast|cloud/.test(s)) return "cloudy";
  if (/wind|gust/.test(s)) return "wind";
  if (/clear|sun|fair/.test(s)) return "clear";
  return "cloudy";
}

interface OpenMeteoDaily {
  daily_units?: Record<string, string>;
  daily?: Record<string, (number | string | null)[] | undefined>;
}

const at = (xs: unknown, i: number): number | null => {
  const v = Array.isArray(xs) ? xs[i] : null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** One day of an Open-Meteo `daily` response → report weather (°F, inches, mph; converted if the response is metric).
 *  Null when the day isn't in the response or has no data. `today` (YYYY-MM-DD) marks future days as a forecast. */
export function weatherFromOpenMeteo(json: unknown, date: string, today?: string): DailyWeather | null {
  const j = (json ?? {}) as OpenMeteoDaily;
  const d = j.daily;
  if (!d || !Array.isArray(d.time)) return null;
  const i = d.time.indexOf(date);
  if (i < 0) return null;
  const u = j.daily_units ?? {};
  const code = at(d.weather_code ?? d.weathercode, i);
  let hi = at(d.temperature_2m_max, i);
  let lo = at(d.temperature_2m_min, i);
  let precip = at(d.precipitation_sum, i);
  let wind = at(d.wind_speed_10m_max ?? d.windspeed_10m_max, i);
  if (code === null && hi === null && lo === null && precip === null && wind === null) return null;
  const toF = (c: number | null) => (c === null ? null : (c * 9) / 5 + 32);
  if (/C/.test(u.temperature_2m_max ?? "")) hi = toF(hi);
  if (/C/.test(u.temperature_2m_min ?? "")) lo = toF(lo);
  if (/mm/.test(u.precipitation_sum ?? "") && precip !== null) precip = precip / 25.4;
  const wu = u.wind_speed_10m_max ?? u.windspeed_10m_max ?? "";
  if (wind !== null && /km/.test(wu)) wind = wind / 1.609344;
  else if (wind !== null && /m\/s/.test(wu)) wind = wind * 2.236936;
  const out: DailyWeather = {
    summary: weatherCodeText(code) ?? undefined,
    tempHighF: hi === null ? null : Math.round(hi),
    tempLowF: lo === null ? null : Math.round(lo),
    precipIn: precip === null ? null : round2(precip),
    windMph: wind === null ? null : Math.round(wind),
    source: "auto",
  };
  if (!out.summary) delete out.summary;
  if (today && date > today) out.forecast = true;
  return out;
}

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;

/** Whole days from `a` to `b` (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round(dayNum(b) - dayNum(a));
}

/** YYYY-MM-DD `n` days after `d`. */
export function addDays(d: string, n: number): string {
  return new Date((dayNum(d) + n) * 86_400_000).toISOString().slice(0, 10);
}

/** Open-Meteo URL for one day at a place: the forecast API for the last 90 days and the next 15, the historical archive
 *  for older days, and null beyond the forecast range. Imperial units, the job's own time zone. */
export function openMeteoUrl(lat: number, lng: number, date: string, today: string): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ahead = daysBetween(today, date);
  if (ahead > 15) return null;
  const base = ahead >= -90 ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    start_date: date,
    end_date: date,
  });
  return `${base}?${q}`;
}

/** "Light rain · 55° / 46°F · 0.83 in precip · wind 22 mph" (+ " · forecast"). Empty when nothing is filled in. */
export function weatherLine(w: DailyWeather | null | undefined): string {
  if (!w) return "";
  const hi = num(w.tempHighF);
  const lo = num(w.tempLowF);
  const temp = hi !== null && lo !== null ? `${hi}° / ${lo}°F` : hi !== null ? `High ${hi}°F` : lo !== null ? `Low ${lo}°F` : "";
  const p = num(w.precipIn);
  const wind = num(w.windMph);
  const parts = [w.summary?.trim(), temp, p !== null && p > 0 ? `${p} in precip` : "", wind !== null ? `wind ${wind} mph` : ""].filter(Boolean);
  if (!parts.length) return "";
  if (w.forecast) parts.push("forecast");
  return parts.join(" · ");
}

// --- Weekly hours ---

/** Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  const dow = new Date(dayNum(date) * 86_400_000).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export interface WeeklyHours {
  /** The seven days, Monday first. */
  days: string[];
  rows: { name: string; hours: number[]; total: number }[];
  dayTotals: number[];
  total: number;
}

/** Hours per person per day for the week starting `weekStart` (several logs on a day add up; names merge ignoring case). */
export function weeklyHours(logs: JobLog[], weekStart: string): WeeklyHours {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const rows = new Map<string, { name: string; hours: number[]; total: number }>();
  for (const l of logs) {
    if (l.deleted || !isStructured(l)) continue;
    const di = days.indexOf(l.date);
    if (di < 0) continue;
    for (const c of l.report!.crew ?? []) {
      const name = (c.name ?? "").trim().replace(/\s+/g, " ");
      if (!name) continue;
      const k = nameKey(name);
      const row = rows.get(k) ?? { name, hours: [0, 0, 0, 0, 0, 0, 0], total: 0 };
      row.hours[di] = round2(row.hours[di] + clampHours(c.hours));
      rows.set(k, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const r of list) r.total = round2(r.hours.reduce((a, b) => a + b, 0));
  const dayTotals = days.map((_, i) => round2(list.reduce((n, r) => n + r.hours[i], 0)));
  return { days, rows: list, dayTotals, total: round2(dayTotals.reduce((a, b) => a + b, 0)) };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The weekly hours table as CSV (Name, the seven dates, Total; a totals row at the end). */
export function weeklyHoursCsv(w: WeeklyHours): string {
  const head = ["Name", ...w.days, "Total"];
  const lines = [head, ...w.rows.map((r) => [r.name, ...r.hours, r.total]), ["Total", ...w.dayTotals, w.total]];
  return lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n";
}

// --- Completeness and editing rules ---

export type ReportSection = "weather" | "crew" | "work" | "safety" | "signature";
export const SECTION_LABELS: Record<ReportSection, string> = {
  weather: msg("Weather"),
  crew: msg("Crew & hours"),
  work: msg("Work performed"),
  safety: msg("Safety"),
  signature: msg("Signature"),
};

/** Recommended sections still empty, in form order. */
export function reportCompleteness(r: DailyReport | null | undefined): ReportSection[] {
  const out: ReportSection[] = [];
  const w = r?.weather ?? {};
  if (!w.summary?.trim() && num(w.tempHighF) === null && num(w.tempLowF) === null) out.push("weather");
  if (!(r?.crew ?? []).some((c) => c.name?.trim() && clampHours(c.hours) > 0)) out.push("crew");
  if (!(r?.work ?? []).some((x) => x.text?.trim())) out.push("work");
  if (!r?.safety) out.push("safety");
  if (!r?.signature) out.push("signature");
  return out;
}

/** Can this person edit the log? Unsigned logs: anyone (techs included). Signed logs: the author or the office (owner,
 *  admin, or working alone), after confirming that editing clears the signature. */
export function editAccess(
  log: Pick<JobLog, "author" | "report">,
  who: { role: "owner" | "admin" | "tech" | null | undefined; me: string | (string | null | undefined)[] | null | undefined },
): "edit" | "confirm" | "denied" {
  const sig = log.report?.signature;
  if (!sig) return "edit";
  if (who.role !== "tech") return "confirm";
  // `me` can be several names for the same person (the name on this device and the name on the team).
  const mine = new Set((Array.isArray(who.me) ? who.me : [who.me]).map((m) => nameKey(typeof m === "string" ? m : "")).filter(Boolean));
  const author = nameKey(typeof log.author === "string" ? log.author : "");
  const signer = nameKey(typeof sig.name === "string" ? sig.name : "");
  if ((author && mine.has(author)) || (signer && mine.has(signer))) return "confirm";
  return "denied";
}

/** Names to offer in the crew picker: team members first, then people on recent reports. */
export function crewSuggestions(members: string[], logs: JobLog[], limit = 30): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (n: string | null | undefined) => {
    const name = (n ?? "").trim().replace(/\s+/g, " ");
    if (!name || seen.has(nameKey(name))) return;
    seen.add(nameKey(name));
    out.push(name);
  };
  members.forEach(add);
  const recent = logs.filter((l) => !l.deleted && isStructured(l)).sort((a, b) => b.date.localeCompare(a.date));
  for (const l of recent) for (const c of l.report!.crew ?? []) add(c.name);
  return out.slice(0, limit);
}
