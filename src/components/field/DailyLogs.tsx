"use client";
// Daily logs: a structured daily report for each day on site (weather, crew & hours, work, deliveries, equipment,
// delays, safety, visitors, photos, notes, signature). Older logs are a title and free text and still show as before.
import { BadgeCheck, CalendarRange, Copy, Hammer, ImagePlus, Images, FileDown, Hourglass, Pencil, Plus, ShieldAlert, ShieldCheck, Signature, Sparkles, StickyNote, Trash, Truck, UserCheck, Users, Wrench, CloudSun, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { dailyLogFileName, logDays, logPhotos, logsInRange, rangeSummary, reportPdfSections } from "@/lib/dailyLogReport";
import {
  cleanReport,
  copyFromPrevious,
  crewSuggestions,
  duplicateCrewNames,
  editAccess,
  emptyReport,
  hoursText,
  isStructured,
  previousLog,
  reportCompleteness,
  reportHasContent,
  SECTION_LABELS,
  totals,
  weatherLine,
  type DailyWeather,
} from "@/lib/dailyReport";
import { db, newId, nowIso, saveImage } from "@/lib/db";
import { downloadBlob, slug } from "@/lib/download";
import { localDay, todayLog } from "@/lib/fieldDocs";
import { importPhoto, renderPhoto } from "@/lib/photos";
import { useEditor } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useRole, useTeam } from "@/lib/team";
import { memberLabel } from "@/lib/teamLogic";
import { toast } from "@/lib/toast";
import type { DailyReport, JobLog, Photo } from "@/lib/types";
import { useBlobUrl } from "@/lib/useImage";
import { fetchDailyWeather, isOnline } from "@/lib/weather";
import SignaturePad from "../SignaturePad";
import PhotoViewer from "../photos/PhotoViewer";
import type { DailyLogPdfEntry } from "./DailyLogPdf";
import { CrewRows, DelayRows, LineList, SafetyFields, Section, tradeExamples, WeatherFields, WeatherIcon, WorkRows, type WeatherStatus } from "./DailyReportForm";
import { useMe } from "@/lib/useMe";
import { useTrades } from "@/lib/useTrades";
import WeeklyHours from "./WeeklyHours";
import { AI_ENABLED } from "@/lib/features";
import { fmtDate, fmtTime, t, useT } from "@/lib/i18n";

const today = () => localDay(new Date().toISOString());
const dayText = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
// On screen (the PDF above keeps its own formatting): in the active language.
const dayTextUi = (d: string) => fmtDate(`${d}T12:00:00`, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const shortDayUi = (d: string) => fmtDate(`${d}T12:00:00`, { month: "short", day: "numeric", year: "numeric" });
const timeUi = (iso: string) => fmtTime(iso);

const toDataUrl = (b: Blob) =>
  new Promise<string>((r, j) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result));
    fr.onerror = () => j(fr.error);
    fr.readAsDataURL(b);
  });

/** Build and download a branded PDF of the given logs, each with its photos (mark-up drawn in). */
function useLogPdf() {
  const { project, settings, photos, sheets } = useEditor();
  const [busy, setBusy] = useState<string | null>(null);
  async function download(logs: JobLog[]) {
    if (!project || !settings || !logs.length || busy) return;
    try {
      const total = logs.reduce((n, l) => n + logPhotos(l, photos).length, 0);
      let done = 0;
      const entries: DailyLogPdfEntry[] = [];
      const sheetName = (id: string) => sheets.find((s) => s.id === id && !s.deleted)?.name;
      for (const l of logs) {
        const ps: DailyLogPdfEntry["photos"] = [];
        for (const p of logPhotos(l, photos)) {
          setBusy(t("Preparing photo {n} of {total}…", { n: ++done, total }));
          // A photo whose image isn't on this device (or can't be drawn) is left out rather than failing the PDF.
          try {
            const rec = await db().images.get(p.imageId);
            if (!rec) continue;
            const blob = await renderPhoto(rec.blob, p.annotations, 1400);
            ps.push({ src: await toDataUrl(blob), width: p.width, height: p.height, caption: p.caption, meta: [time(p.takenAt), p.takenBy, p.room, ...(p.tags ?? [])].filter(Boolean).join(" · ") });
          } catch {
            continue;
          }
        }
        const sections = reportPdfSections(l, sheetName);
        let report: DailyLogPdfEntry["report"] = null;
        if (sections) {
          let signatureSrc: string | null = null;
          if (sections.signature) {
            const rec = await db()
              .images.get(sections.signature.imageId)
              .catch(() => undefined);
            if (rec) signatureSrc = await toDataUrl(rec.blob);
          }
          const signedAt = sections.signature ? new Date(sections.signature.signedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
          report = { ...sections, signatureSrc, signedAt };
        }
        entries.push({ day: dayText(l.date), title: l.title, author: l.author, body: l.body, photos: ps, report });
      }
      setBusy(t("Building the PDF…"));
      const d = logDays(logs)!;
      const range = d.first === d.last ? shortDay(d.first) : `${shortDay(d.first)} – ${shortDay(d.last)}`;
      const sum = logs.length > 1 ? rangeSummary(logs) : null;
      const summary = sum ? { ...sum, rows: sum.rows.map((r) => ({ ...r, day: shortDay(r.date) })) } : null;
      const { renderDailyLogPdf } = await import("./DailyLogPdf");
      const out = await renderDailyLogPdf({ title: logs.length === 1 ? "Daily log" : "Daily logs", business: settings.business, clientName: project.clientName, address: project.address, dateRange: range, logs: entries, summary });
      downloadBlob(out, dailyLogFileName(slug(project.address || project.clientName || "job"), logs));
    } catch (e) {
      toast(t("PDF failed: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(null);
    }
  }
  return { busy, download };
}

/** Pick a date range and download those logs as one PDF. */
function RangeExport({ logs, busy, onDownload, onClose }: { logs: JobLog[]; busy: string | null; onDownload: (list: JobLog[]) => void; onClose: () => void }) {
  const days = logDays(logs);
  const [from, setFrom] = useState(days?.first ?? "");
  const [to, setTo] = useState(days?.last ?? "");
  const picked = logsInRange(logs, from, to);
  const t = useT();
  return (
    <div className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="label">{t("From")}</span>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="label">{t("To")}</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500" aria-live="polite">{busy ?? t.tn("{n} log with its photos and mark-up", "{n} logs with their photos and mark-up", picked.length)}</span>
        <div className="flex-1" />
        <button className="btn btn-sm" onClick={onClose}>
          {t("Close")}
        </button>
        <button className="btn btn-sm btn-brand" disabled={!picked.length || !!busy} onClick={() => onDownload(picked)}>
          <FileDown /> {t("Download PDF")}
        </button>
      </div>
    </div>
  );
}

function Thumb({ photo, onClick, selected }: { photo: Photo; onClick: () => void; selected?: boolean }) {
  const url = useBlobUrl(photo.imageId);
  const t = useT();
  return (
    <button
      onClick={onClick}
      className={`relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100 ${selected === undefined ? "ring-1 ring-slate-200" : selected ? "ring-2 ring-brand-500" : "opacity-60 ring-1 ring-slate-200"}`}
      aria-label={selected === undefined ? (photo.caption ? t("Open photo: {caption}", { caption: photo.caption }) : t("Open photo")) : photo.caption ? t("Include photo in this log: {caption}", { caption: photo.caption }) : t("Include photo in this log")}
      aria-pressed={selected}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

/** Small JPEGs of photos for the AI summary (keeps the request light). */
async function photoPayload(photos: Photo[]) {
  const out: { data: string; caption: string }[] = [];
  for (const p of photos.slice(0, 8)) {
    const rec = await db().images.get(p.imageId);
    if (!rec) continue;
    const bmp = await createImageBitmap(rec.blob);
    const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    out.push({ data: c.toDataURL("image/jpeg", 0.7).split(",")[1], caption: [p.caption, p.room, ...(p.tags ?? [])].filter(Boolean).join(" · ") });
  }
  return out;
}

type SectionId = "weather" | "crew" | "work" | "deliveries" | "equipment" | "delays" | "safety" | "visitors" | "photos" | "notes" | "signature";

const hasWeather = (w: DailyWeather | undefined) => !!weatherLine(w);

function SignedImage({ imageId }: { imageId: string }) {
  const url = useBlobUrl(imageId);
  const t = useT();
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={t("Signature")} className="h-20 max-w-full rounded-lg bg-white object-contain ring-1 ring-slate-200" /> : <div className="h-20 w-48 rounded-lg bg-slate-50 ring-1 ring-slate-200" />;
}

// ---------------- drafts kept on this device while a log is being written ----------------

const DRAFT_PREFIX = "pinplan.logDraft.";
interface LogDraft {
  log: JobLog;
  report: DailyReport;
  savedAt: string;
}
function readDraft(id: string): LogDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + id);
    const d = raw ? (JSON.parse(raw) as LogDraft) : null;
    return d && d.log?.id === id && d.report ? d : null;
  } catch {
    return null;
  }
}
function writeDraft(d: LogDraft) {
  try {
    localStorage.setItem(DRAFT_PREFIX + d.log.id, JSON.stringify(d));
  } catch {
    /* storage full or unavailable: the log still saves normally */
  }
}
function clearDraft(id: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + id);
  } catch {
    /* storage unavailable */
  }
}
/** This job's drafts on this device, newest first. */
function projectDrafts(projectId: string): LogDraft[] {
  const out: LogDraft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(DRAFT_PREFIX)) continue;
      const d = readDraft(k.slice(DRAFT_PREFIX.length));
      if (d && d.log.projectId === projectId) out.push(d);
    }
  } catch {
    /* storage unavailable */
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
/** What counts as an edit: weather filled in automatically doesn't. */
const editKey = (l: JobLog, r: DailyReport) =>
  JSON.stringify({ ...l, updatedAt: null, report: null, r: { ...r, weather: r.weather?.source === "auto" ? null : (r.weather ?? null) } });

function Editor({ log, isNew, onDone }: { log: JobLog; isNew: boolean; onDone: () => void }) {
  const { saveRow, photos, project, sheets, jobLogs } = useEditor();
  const { online } = useSyncStatus();
  const { me: meName } = useMe();
  const examples = tradeExamples(useTrades()[0]);
  const members = useTeam((s) => s.members);
  const t = useT();
  // Unsaved changes from earlier (closed tab, crash, or "Close") come back.
  const [draft] = useState(() => readDraft(log.id));
  const [l, setL] = useState(() => draft?.log ?? log);
  const [r, setR] = useState<DailyReport>(() => draft?.report ?? { ...emptyReport(), ...(log.report ?? {}) });
  const [original] = useState(() => editKey(log, { ...emptyReport(), ...(log.report ?? {}) }));
  const dirty = editKey(l, r) !== original;
  const [savedAt, setSavedAt] = useState<string | null>(draft?.savedAt ?? null);
  const done = useRef(false);
  // Autosave a draft on this device a moment after each change.
  useEffect(() => {
    if (done.current) return;
    if (!dirty) {
      clearDraft(l.id);
      return;
    }
    const timer = window.setTimeout(() => {
      if (done.current) return;
      const at = nowIso();
      writeDraft({ log: l, report: r, savedAt: at });
      setSavedAt(at);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [l, r, dirty]);
  // Leaving the page with unsaved changes asks first (the draft is kept either way).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      writeDraft({ log: l, report: r, savedAt: nowIso() });
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, l, r]);
  useEffect(() => {
    if (draft) toast(t("Picked up your unsaved changes from {time}", { time: timeUi(draft.savedAt) }), "info");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the editor opens
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A signature drawn in this session (PNG data URL); stored as an image when the log is saved.
  const [sig, setSig] = useState<string | null>(null);
  const [sigName, setSigName] = useState(() => log.report?.signature?.name || log.author || meName);
  const [wx, setWx] = useState<WeatherStatus>("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const weatherReq = useRef(0);
  // This day's photos, plus any already linked to the log from another day.
  const dayPhotos = useMemo(() => photos.filter((p) => !p.deleted && (localDay(p.takenAt) === l.date || (l.photoIds ?? []).includes(p.id))), [photos, l.date, l.photoIds]);
  const chosen = new Set(l.photoIds ?? []);
  const toggle = (id: string) => setL((x) => ({ ...x, photoIds: chosen.has(id) ? (x.photoIds ?? []).filter((y) => y !== id) : [...(x.photoIds ?? []), id] }));
  const patch = (p: Partial<DailyReport>) => setR((x) => ({ ...x, ...p }));

  const [open, setOpen] = useState<Record<SectionId, boolean>>(() => {
    const x = log.report ?? {};
    return {
      weather: true,
      crew: true,
      work: true,
      deliveries: !!x.deliveries?.length,
      equipment: !!x.equipment?.length,
      delays: !!x.delays?.length,
      safety: true,
      visitors: !!x.visitors?.length,
      photos: true,
      notes: true,
      signature: true,
    };
  });
  const flip = (k: SectionId) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const hasLocation = project?.lat != null && project?.lng != null;
  /** Fill the weather for `date` from Open-Meteo. Typed-in weather is kept unless `replace`. */
  async function fillWeather(date: string, replace = false) {
    if (!project || project.lat == null || project.lng == null) return setWx("nolocation");
    if (!isOnline()) return setWx("offline");
    const req = ++weatherReq.current;
    setWx("loading");
    const w = await fetchDailyWeather(project.lat, project.lng, date, today());
    if (req !== weatherReq.current) return;
    if (!w) return setWx(isOnline() ? "unavailable" : "offline");
    setR((x) => (replace || !hasWeather(x.weather) || x.weather?.source === "auto" ? { ...x, weather: w } : x));
    setWx("idle");
  }
  // New reports (and reports saved without weather) fill it on open; older free-text logs only on request.
  const autoWeather = isNew || (isStructured(log) && !hasWeather(log.report?.weather));
  useEffect(() => {
    if (autoWeather) void Promise.resolve().then(() => fillWeather(log.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the editor opens
  }, []);
  // Back online with the weather still to do ("Fill weather later").
  useEffect(() => {
    if (online && (wx === "offline" || wx === "later") && !hasWeather(r.weather)) void Promise.resolve().then(() => fillWeather(l.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the connection comes back
  }, [online]);

  const suggestions = useMemo(() => crewSuggestions(members.map(memberLabel), jobLogs), [members, jobLogs]);
  const prev = previousLog(jobLogs, l.date, l.id);
  const prevLabel = prev ? (prev.date === addDaysLocal(l.date, -1) ? t("Copy from yesterday") : t("Copy from {date}", { date: shortDayUi(prev.date) })) : t("Copy from yesterday");
  function copyPrev() {
    if (!prev) return;
    const c = copyFromPrevious(prev);
    if (!c.crew?.length && !c.equipment?.length && !c.delays?.length) return toast(t("Nothing to copy from {date}", { date: shortDayUi(prev.date) }), "info");
    setR((x) => {
      const crew = (x.crew ?? []).filter((m) => m.name.trim());
      const have = new Set(crew.map((m) => m.name.trim().toLowerCase()));
      const delays = (x.delays ?? []).filter((d) => d.reason.trim());
      const reasons = new Set(delays.map((d) => d.reason.trim().toLowerCase()));
      return {
        ...x,
        crew: [...crew, ...(c.crew ?? []).filter((m) => !have.has(m.name.toLowerCase()))],
        equipment: [...new Set([...(x.equipment ?? []).map((e) => e.trim()).filter(Boolean), ...(c.equipment ?? [])])],
        delays: [...delays, ...(c.delays ?? []).filter((d) => !reasons.has(d.reason.toLowerCase()))],
      };
    });
    setOpen((o) => ({ ...o, crew: true, equipment: o.equipment || !!c.equipment?.length, delays: o.delays || !!c.delays?.length }));
    const nCrew = c.crew?.length ?? 0;
    const nEquip = c.equipment?.length ?? 0;
    const nDelays = c.delays?.length ?? 0;
    const items = [nCrew ? t.tn("{n} person", "{n} people", nCrew) : "", nEquip ? t.tn("{n} equipment item", "{n} equipment items", nEquip) : "", nDelays ? t.tn("{n} ongoing delay", "{n} ongoing delays", nDelays) : ""];
    toast(t("Copied {items} from {date}", { items: items.filter(Boolean).join(", "), date: shortDayUi(prev.date) }), "success");
  }

  async function aiDraft() {
    const list = dayPhotos.filter((p) => chosen.size === 0 || chosen.has(p.id));
    if (!list.length) return toast(t("Add photos from this day first"), "info");
    setBusy(t("Writing…"));
    try {
      const r = await apiFetch("/api/photos/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: l.date, address: project?.address, photos: await photoPayload(list), notes: l.body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("Server returned {status}", { status: r.status }));
      setL((x) => ({ ...x, title: x.title || j.title, body: j.body }));
    } catch (e) {
      toast(t("AI summary: {error}", { error: (e as Error).message }), "error");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const author = l.author || meName;
      const { report: cleaned, duplicates } = cleanReport(r);
      if (sig) {
        // Ink on white (the pad gives a transparent PNG, which disappears on a dark background on the iPad).
        const bmp = await createImageBitmap(await (await fetch(sig)).blob());
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        const blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error(t("Couldn't save the signature")))), "image/jpeg", 0.9));
        const imageId = await saveImage(blob, c.width, c.height);
        cleaned.signature = { name: sigName.trim() || author, imageId, signedAt: nowIso() };
      }
      // Older free-text logs stay as they were unless something structured was added.
      const report = isNew || isStructured(log) || reportHasContent(cleaned) ? cleaned : log.report;
      if (duplicates.length) toast(t("Merged duplicate crew: {names} (hours added together)", { names: duplicates.join(", ") }), "info");
      await saveRow("jobLogs", { ...l, title: l.title?.trim() || null, body: l.body.trim(), author, report });
      done.current = true;
      clearDraft(l.id);
      onDone();
    } catch (e) {
      toast(t("Couldn't save the log: {error}", { error: (e as Error).message }), "error");
    } finally {
      setSaving(false);
    }
  }

  const tot = totals(r);
  const dupes = duplicateCrewNames(r.crew ?? []);
  const signedNow = r.signature ?? (sig ? { name: sigName, imageId: "", signedAt: "" } : null);
  const missing = reportCompleteness({ ...r, signature: signedNow });
  const canSave = !!l.body.trim() || !!l.title?.trim() || reportHasContent(r) || !!sig;
  const lines = (xs: string[] | undefined) => (xs ?? []).filter((x) => x.trim()).length;
  const delayCount = (r.delays ?? []).filter((d) => d.reason.trim()).length;
  const workCount = (r.work ?? []).filter((w) => w.text.trim()).length;

  return (
    <div className="card space-y-3 p-4" aria-label={isNew ? t("New daily log") : t("Edit daily log")}>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="text-sm">
          <span className="label">{t("Day")}</span>
          <input
            type="date"
            className="input"
            value={l.date}
            onChange={(e) => {
              const date = e.target.value;
              setL({ ...l, date });
              // Follow the new day unless the weather was typed in by hand.
              if (date && (!hasWeather(r.weather) || r.weather?.source === "auto")) void fillWeather(date, true);
            }}
          />
        </label>
        <label className="text-sm">
          <span className="label">{t("Title")}</span>
          <input className="input" placeholder={t("e.g. Rough-in, 2nd floor")} value={l.title ?? ""} onChange={(e) => setL({ ...l, title: e.target.value })} />
        </label>
      </div>

      <Section title={t("Weather")} icon={CloudSun} summary={weatherLine(r.weather) || (wx === "loading" ? t("Getting weather…") : "")} open={open.weather} onToggle={() => flip("weather")} missing={missing.includes("weather")}>
        <WeatherFields
          weather={r.weather ?? {}}
          onChange={(w) => patch({ weather: w })}
          status={wx}
          canAuto={hasLocation}
          onAutoFill={() => void fillWeather(l.date, true)}
          onLater={() => {
            setWx("later");
            setOpen((o) => ({ ...o, weather: false }));
          }}
        />
      </Section>

      <Section title={t("Crew & hours")} icon={Users} summary={tot.crew ? `${t.tn("{n} person", "{n} people", tot.crew)} · ${hoursText(tot.manHours)}` : ""} open={open.crew} onToggle={() => flip("crew")} missing={missing.includes("crew")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500" data-testid="crew-total">
            {tot.crew ? `${t.tn("{n} person", "{n} people", tot.crew)} · ${t.tn("{n} man-hour", "{n} man-hours", tot.manHours)}` : t("Who was on site and how long.")}
          </span>
          <div className="flex-1" />
          <button type="button" className="btn btn-sm" disabled={!prev} onClick={copyPrev} title={prev ? t("Crew, equipment and ongoing delays from {date}", { date: shortDayUi(prev.date) }) : t("No earlier log to copy from")}>
            <Copy /> {prevLabel}
          </button>
        </div>
        <CrewRows crew={r.crew ?? []} onChange={(crew) => patch({ crew })} suggestions={suggestions} />
        {dupes.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700" role="status">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {t.tn("{names} is listed more than once — the hours are added together when you save.", "{names} are listed more than once — the hours are added together when you save.", dupes.length, { names: dupes.join(", ") })}
          </p>
        )}
      </Section>

      <Section title={t("Work performed")} icon={Hammer} summary={workCount ? t.tn("{n} line", "{n} lines", workCount) : ""} open={open.work} onToggle={() => flip("work")} missing={missing.includes("work")}>
        <WorkRows work={r.work ?? []} onChange={(work) => patch({ work })} sheets={sheets.filter((s) => !s.deleted)} placeholder={t(examples.work)} />
      </Section>

      <Section title={t("Materials delivered")} icon={Truck} summary={lines(r.deliveries) ? t.tn("{n} delivery", "{n} deliveries", lines(r.deliveries)) : ""} open={open.deliveries} onToggle={() => flip("deliveries")}>
        <LineList items={r.deliveries ?? []} onChange={(deliveries) => patch({ deliveries })} placeholder={t(examples.delivery)} addLabel={t("Add delivery")} />
      </Section>

      <Section title={t("Equipment")} icon={Wrench} summary={lines(r.equipment) ? t.tn("{n} item", "{n} items", lines(r.equipment)) : ""} open={open.equipment} onToggle={() => flip("equipment")}>
        <LineList items={r.equipment ?? []} onChange={(equipment) => patch({ equipment })} placeholder={t("e.g. Scissor lift")} addLabel={t("Add equipment")} />
      </Section>

      <Section title={t("Delays")} icon={Hourglass} summary={delayCount ? `${t.tn("{n} delay", "{n} delays", delayCount)}${tot.delayHours ? ` · ${t("{hours} lost", { hours: hoursText(tot.delayHours) })}` : ""}` : ""} open={open.delays} onToggle={() => flip("delays")}>
        <DelayRows delays={r.delays ?? []} onChange={(delays) => patch({ delays })} />
      </Section>

      <Section title={t("Safety")} icon={r.safety?.incident ? ShieldAlert : ShieldCheck} summary={r.safety ? (r.safety.incident ? t("Incident") : t("No incidents")) : ""} open={open.safety} onToggle={() => flip("safety")} missing={missing.includes("safety")}>
        <SafetyFields safety={r.safety} onChange={(safety) => patch({ safety })} />
      </Section>

      <Section title={t("Visitors & inspections")} icon={UserCheck} summary={lines(r.visitors) ? t.tn("{n} visitor", "{n} visitors", lines(r.visitors)) : ""} open={open.visitors} onToggle={() => flip("visitors")}>
        <LineList items={r.visitors ?? []} onChange={(visitors) => patch({ visitors })} placeholder={t("e.g. City inspector — rough-in passed")} addLabel={t("Add visitor")} />
      </Section>

      <Section title={t("Photos")} icon={Images} summary={chosen.size ? t.tn("{n} photo", "{n} photos", chosen.size) : ""} open={open.photos} onToggle={() => flip("photos")}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{t("Photos from this day — tap to include them.")}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const input = e.currentTarget;
              if (!project || !input.files) return;
              const files = [...input.files];
              // Clear now so picking the same file again still fires a change.
              input.value = "";
              for (const f of files) {
                try {
                  const p = await importPhoto(f, { projectId: project.id, author: meName });
                  await saveRow("photos", p);
                  // Keep the log's day; the photo is linked even if it was taken on another day.
                  setL((x) => ({ ...x, photoIds: [...(x.photoIds ?? []), p.id] }));
                } catch (err) {
                  toast(`${f.name}: ${(err as Error).message}`, "error");
                }
              }
            }}
          />
          <div className="flex-1" />
          <button type="button" className="btn btn-sm btn-ghost text-brand-600" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> {t("Add")}
          </button>
        </div>
        {dayPhotos.length ? (
          <div className="flex flex-wrap gap-1.5">
            {dayPhotos.map((p) => (
              <Thumb key={p.id} photo={p} selected={chosen.has(p.id)} onClick={() => toggle(p.id)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">{t("No photos taken on this day yet.")}</p>
        )}
      </Section>

      <Section title={t("Notes")} icon={StickyNote} summary={l.body.trim().slice(0, 48)} open={open.notes} onToggle={() => flip("notes")}>
        <textarea className="input min-h-24" aria-label={t("Notes")} placeholder={t("Anything else: issues, what's next, instructions for tomorrow…")} value={l.body} onChange={(e) => setL({ ...l, body: e.target.value })} />
      </Section>

      <Section title={t("Signature")} icon={Signature} summary={r.signature ? t("Signed by {name}", { name: r.signature.name }) : sig ? t("Signed") : ""} open={open.signature} onToggle={() => flip("signature")} missing={missing.includes("signature")}>
        {r.signature ? (
          <div className="flex flex-wrap items-end gap-3">
            <SignedImage imageId={r.signature.imageId} />
            <div className="text-xs text-slate-500">
              <div className="font-medium text-slate-700">{r.signature.name}</div>
              {fmtDate(r.signature.signedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
            <button type="button" className="btn btn-sm ml-auto" onClick={() => patch({ signature: null })}>
              {t("Sign again")}
            </button>
          </div>
        ) : (
          <>
            <label className="block text-sm">
              <span className="label">{t("Foreman")}</span>
              <input className="input" value={sigName} onChange={(e) => setSigName(e.target.value)} placeholder={t("Name")} autoComplete="name" />
            </label>
            <SignaturePad onChange={setSig} />
          </>
        )}
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 space-y-2 rounded-b-xl border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
        {missing.length > 0 && (
          <p className="text-xs text-slate-500">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" /> {t("Not filled in yet: {sections}", { sections: missing.map((m) => t(SECTION_LABELS[m])).join(", ") })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {AI_ENABLED && (
          <button className="btn btn-sm" disabled={!!busy} onClick={() => void aiDraft()} title={t("Draft the log from this day's photos (AI)")}>
            <Sparkles /> {busy ?? t("Draft from photos")}
          </button>
          )}
          {dirty && (
            <span className="inline-flex items-center gap-1.5 self-center text-xs text-slate-500" role="status">
              <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200">{t("Draft")}</span>
              {savedAt ? t("kept on this device · {time}", { time: timeUi(savedAt) }) : t("not saved yet")}
            </span>
          )}
          <div className="flex-1" />
          {dirty && (
            <button
              className="btn btn-sm btn-ghost text-slate-500"
              onClick={() => {
                if (!confirm(t("Throw away your changes to this log?"))) return;
                done.current = true;
                clearDraft(l.id);
                onDone();
              }}
            >
              {t("Discard")}
            </button>
          )}
          <button
            className="btn btn-sm"
            onClick={() => {
              // Closing keeps the draft (it shows as "Draft" in the list); flush it now in case the timer hasn't run.
              if (dirty) writeDraft({ log: l, report: r, savedAt: nowIso() });
              done.current = true;
              onDone();
            }}
          >
            {dirty ? t("Close") : t("Cancel")}
          </button>
          <button className="btn btn-sm btn-brand" disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? t("Saving…") : t("Save log")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** YYYY-MM-DD `n` days from `d` (calendar days, no time zone drift). */
function addDaysLocal(d: string, n: number): string {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return localDay(x.toISOString());
}

/** One-line badges for a structured log in the list: weather, crew and man-hours, delays, safety, signature. */
function ReportBadges({ log }: { log: JobLog }) {
  const t = useT();
  if (!isStructured(log)) return null;
  const r = log.report!;
  const tot = totals(r);
  const w = r.weather;
  const temp = w?.tempHighF != null ? `${w.tempHighF}°${w.tempLowF != null ? ` / ${w.tempLowF}°` : ""}` : "";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {hasWeather(w) && (
        <span className="chip bg-sky-50 text-sky-800" title={weatherLine(w)}>
          <WeatherIcon summary={w?.summary} className="h-3.5 w-3.5" /> {[w?.summary, temp].filter(Boolean).join(" · ")}
        </span>
      )}
      {tot.manHours > 0 && (
        <span className="chip bg-brand-50 text-brand-700" data-testid="log-manhours">
          <Users className="h-3.5 w-3.5" aria-hidden /> {tot.crew ? t.tn("{n} person", "{n} people", tot.crew) : ""} · {t.tn("{n} man-hour", "{n} man-hours", tot.manHours)}
        </span>
      )}
      {tot.delayHours > 0 && (
        <span className="chip bg-amber-50 text-amber-800">
          <Hourglass className="h-3.5 w-3.5" aria-hidden /> {t("{hours} delay", { hours: hoursText(tot.delayHours) })}
        </span>
      )}
      {r.safety?.incident && (
        <span className="chip bg-red-50 text-red-700">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> {t("Incident")}
        </span>
      )}
      {r.signature && (
        <span className="chip bg-emerald-50 text-emerald-700" title={t("Signed by {name}", { name: r.signature.name })}>
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> {t("Signed")}
        </span>
      )}
    </div>
  );
}

export default function DailyLogs() {
  const { project, jobLogs, photos, removeRows } = useEditor();
  const role = useRole();
  // Who I am for signed logs: the name on this device and my name on the team (logs from the iPad use the team name).
  const { names: me } = useMe();
  const params = useSearchParams();
  const t = useT();
  const [editing, setEditing] = useState<JobLog | null>(null);
  const [viewer, setViewer] = useState<{ list: Photo[]; id: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [weekly, setWeekly] = useState(false);
  const { busy, download } = useLogPdf();
  // Drafts on this device (re-read whenever the editor closes).
  const [drafts, setDrafts] = useState<LogDraft[]>(() => (project ? projectDrafts(project.id) : []));
  const refreshDrafts = () => project && setDrafts(projectDrafts(project.id));
  const live = jobLogs.filter((l) => !l.deleted);
  const day = today();
  const todays = project ? todayLog(live, project.id, day, me) : null;
  // A draft of a new log for today that was never saved.
  const newDraftToday = drafts.find((d) => d.log.date === day && !live.some((l) => l.id === d.log.id));

  const startNew = () => {
    if (!project) return;
    const now = nowIso();
    setWeekly(false);
    setEditing({ id: newId(), projectId: project.id, date: day, title: "", body: "", photoIds: [], report: emptyReport(), createdAt: now, updatedAt: now });
  };
  const edit = (l: JobLog) => {
    const access = editAccess(l, { role, me });
    if (access === "denied") return toast(t("Signed by {name} — only they or the office can change it", { name: l.report?.signature?.name ?? l.author ?? "" }), "info");
    if (access === "confirm" && !confirm(t("This log is signed. Editing it clears the signature — sign again when you're done. Continue?"))) return;
    setEditing(access === "confirm" ? { ...l, report: { ...l.report, signature: null } } : l);
  };
  /** One log a day: continue today's (or its unsaved draft) instead of starting a second one. */
  const openToday = () => {
    if (todays?.log && todays.status === "continue") return edit(todays.log);
    if (newDraftToday) return setEditing(newDraftToday.log);
    startNew();
  };
  // Field → Today's "Start / Continue" links here with &log=today.
  const askedToday = params.get("log") === "today";
  const handled = useRef(false);
  useEffect(() => {
    if (!askedToday || handled.current || !project) return;
    handled.current = true;
    const timer = window.setTimeout(openToday, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, [askedToday, project]);

  if (!project) return null;
  const continueLabel = todays?.status === "continue" || newDraftToday ? t("Continue today’s log") : null;
  return (
    <div className="space-y-4">
      {editing ? (
        // Keyed: picking "edit" on another log while one is open must load that log, not keep the old draft.
        <Editor
          key={editing.id}
          log={editing}
          isNew={!jobLogs.some((x) => x.id === editing.id)}
          onDone={() => {
            setEditing(null);
            refreshDrafts();
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {continueLabel ? (
            <>
              <button className="btn btn-brand" onClick={openToday}>
                <Pencil /> {continueLabel}
              </button>
              <button className="btn" onClick={startNew} title={t("Another log for today or a log for another day")}>
                <Plus /> {t("New log")}
              </button>
            </>
          ) : (
            <button className="btn btn-brand" onClick={startNew}>
              <Plus /> {todays?.status === "signed" ? t("New daily log") : t("Start today’s log")}
            </button>
          )}
          {live.length > 0 && (
            <button className="btn" onClick={() => setWeekly((x) => !x)} aria-expanded={weekly}>
              <CalendarRange /> {t("Weekly hours")}
            </button>
          )}
          {live.length > 0 && (
            <button className="btn" onClick={() => setExporting((x) => !x)} aria-expanded={exporting}>
              <FileDown /> {t("Download PDF")}
            </button>
          )}
        </div>
      )}
      {weekly && !editing && <WeeklyHours logs={live} today={today()} job={project.address || project.clientName} onClose={() => setWeekly(false)} />}
      {exporting && !editing && live.length > 0 && <RangeExport logs={live} busy={busy} onDownload={(list) => void download(list)} onClose={() => setExporting(false)} />}
      {busy && !exporting && (
        <p className="text-sm text-slate-500" role="status">
          {busy}
        </p>
      )}
      {live.length === 0 && !editing && <p className="text-sm text-slate-500">{t("Keep a daily report for each day on site — weather, crew and hours, work done, deliveries, delays and safety — signed, with that day’s photos.")}</p>}
      {!editing &&
        drafts
          .filter((d) => !live.some((l) => l.id === d.log.id))
          .map((d) => (
            <article key={d.log.id} className="card flex flex-wrap items-center gap-3 p-4 ring-1 ring-amber-200">
              <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200">{t("Draft")}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{dayTextUi(d.log.date)}</div>
                <div className="text-xs text-slate-500">{t("Not saved yet · kept on this device since {time}", { time: timeUi(d.savedAt) })}</div>
              </div>
              <button
                className="btn btn-sm btn-ghost text-slate-500"
                onClick={() => {
                  if (!confirm(t("Throw away this draft?"))) return;
                  clearDraft(d.log.id);
                  refreshDrafts();
                }}
              >
                {t("Discard")}
              </button>
              <button className="btn btn-sm btn-brand" onClick={() => setEditing(d.log)}>
                <Pencil /> {t("Continue")}
              </button>
            </article>
          ))}
      {live
        .filter((l) => l.id !== editing?.id)
        .map((l) => {
          const ps = (l.photoIds ?? []).map((id) => photos.find((p) => p.id === id && !p.deleted)).filter((p): p is Photo => !!p);
          const work = (l.report?.work ?? []).filter((w) => w.text?.trim());
          return (
            <article key={l.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-500">
                    {dayTextUi(l.date)}
                    {l.author ? ` · ${l.author}` : ""}
                  </div>
                  {l.title && <h3 className="mt-0.5 font-semibold">{l.title}</h3>}
                </div>
                {drafts.some((d) => d.log.id === l.id) && (
                  <button className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100" onClick={() => edit(l)} title={t("You have unsaved changes to this log on this device")}>
                    {t("Draft")}
                  </button>
                )}
                <button className="btn btn-sm btn-icon btn-ghost" aria-label={t("Download log as PDF")} title={t("Download PDF")} disabled={!!busy} onClick={() => void download([l])}>
                  <FileDown />
                </button>
                <button className="btn btn-sm btn-icon btn-ghost" aria-label={t("Edit log")} onClick={() => edit(l)}>
                  <Pencil />
                </button>
                <button
                  className="btn btn-sm btn-icon btn-ghost text-slate-400 hover:text-red-600"
                  aria-label={t("Delete log")}
                  onClick={() => {
                    // A signed report is locked like an edit: only its author/signer or the office can delete it.
                    if (editAccess(l, { role, me }) === "denied") return toast(t("Signed by {name} — only they or the office can delete it", { name: l.report?.signature?.name ?? l.author ?? "" }), "info");
                    if (confirm(l.report?.signature ? t("Delete this signed log?") : t("Delete this log?"))) void removeRows("jobLogs", [l.id]);
                  }}
                >
                  <Trash />
                </button>
              </div>
              <ReportBadges log={l} />
              {work.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                  {work.slice(0, 3).map((w, i) => (
                    <li key={i}>{w.text}</li>
                  ))}
                  {work.length > 3 && <li className="list-none text-xs text-slate-500">{t("+{n} more", { n: work.length - 3 })}</li>}
                </ul>
              )}
              {l.body && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{l.body}</p>}
              {ps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ps.map((p) => (
                    <Thumb key={p.id} photo={p} onClick={() => setViewer({ list: ps, id: p.id })} />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      {viewer && <PhotoViewer photos={viewer.list} startId={viewer.id} onClose={() => setViewer(null)} />}
    </div>
  );
}
