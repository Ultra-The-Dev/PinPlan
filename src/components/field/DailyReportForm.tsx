"use client";
// The structured parts of the daily log editor (weather, crew & hours, work, deliveries, equipment, delays, safety,
// visitors, signature) as collapsible sections, plus the small pieces the log list uses (weather icon, badges).
// Rules live in src/lib/dailyReport.ts; DailyLogs.tsx owns the log and saves it.
import {
  ChevronDown,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Plus,
  RefreshCw,
  Sun,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";
import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { parseHours, WEATHER_CHOICES, weatherKind, weatherLine, type CrewRow, type DailyWeather, type DelayRow, type WorkRow } from "@/lib/dailyReport";
import type { Sheet, TradeId } from "@/lib/types";
import { msg, useT } from "@/lib/i18n";

/** Example text for the work and delivery lines, in the company's primary trade's words. */
const TRADE_EXAMPLES: Record<TradeId, { work: string; delivery: string }> = {
  lowvoltage: { work: msg("e.g. Pulled Cat6 to 12 drops"), delivery: msg("e.g. 4 boxes Cat6 from ADI") },
  electrical: { work: msg("e.g. Roughed in 14 boxes on the 2nd floor"), delivery: msg("e.g. 10 rolls 12/2 NM-B") },
  fire: { work: msg("e.g. Mounted 18 smoke detectors, 2nd floor"), delivery: msg("e.g. 2 boxes of detector bases") },
  hvac: { work: msg("e.g. Set the RTU and ran the supply trunk"), delivery: msg("e.g. 6 sticks of 8\" duct") },
  plumbing: { work: msg("e.g. Roughed in the 2nd floor bathrooms"), delivery: msg("e.g. 20 sticks of 3/4\" PEX") },
  solar: { work: msg("e.g. Mounted rails and 24 panels on the south roof"), delivery: msg("e.g. 1 pallet of panels") },
  general: { work: msg("e.g. Framed the kitchen walls"), delivery: msg("e.g. 40 sheets of drywall") },
};
export const tradeExamples = (trade: TradeId | string | null | undefined) => TRADE_EXAMPLES[(trade ?? "lowvoltage") as TradeId] ?? TRADE_EXAMPLES.lowvoltage;

const KIND_ICON: Record<string, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  wind: Wind,
};

export function WeatherIcon({ summary, className = "h-4 w-4" }: { summary?: string | null; className?: string }) {
  const k = weatherKind(summary);
  // A lookup, not a component made during render.
  return createElement((k && KIND_ICON[k]) || Cloud, { className, "aria-hidden": true });
}

/** A collapsible form section with a one-line summary of what's in it. */
export function Section({ title, icon: Icon, summary, open, onToggle, children, missing }: { title: string; icon: LucideIcon; summary?: string; open: boolean; onToggle: () => void; children: ReactNode; missing?: boolean }) {
  const t = useT();
  return (
    <section className="rounded-xl ring-1 ring-slate-200">
      <button type="button" className="flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left" aria-expanded={open} onClick={onToggle}>
        <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        {missing && !open && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title={t("Recommended")} />}
        <span className="min-w-0 flex-1 truncate text-right text-xs text-slate-500">{summary}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <div className="space-y-2.5 border-t border-slate-100 px-3 pt-2.5 pb-3">{children}</div>}
    </section>
  );
}

const numOrNull = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export type WeatherStatus = "idle" | "loading" | "offline" | "nolocation" | "unavailable" | "later";

export function WeatherFields({ weather, onChange, status, onAutoFill, onLater, canAuto }: { weather: DailyWeather; onChange: (w: DailyWeather) => void; status: WeatherStatus; onAutoFill: () => void; onLater: () => void; canAuto: boolean }) {
  // Anything typed by hand makes it manual (no longer labelled auto / forecast).
  const set = (patch: Partial<DailyWeather>) => onChange({ ...weather, ...patch, source: "manual", forecast: undefined });
  const line = weatherLine(weather);
  const t = useT();
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {line ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-slate-700" data-testid="weather-line">
            <WeatherIcon summary={weather.summary} />
            {line}
            {weather.source === "auto" && <span className="chip bg-sky-50 text-sky-700">{weather.forecast ? t("Forecast") : t("Auto")}</span>}
          </span>
        ) : (
          <span className="text-sm text-slate-500">{t("No weather yet.")}</span>
        )}
        <div className="flex-1" />
        {canAuto && status !== "offline" && status !== "later" && (
          <button type="button" className="btn btn-sm" onClick={onAutoFill} disabled={status === "loading"}>
            <RefreshCw className={status === "loading" ? "animate-spin" : ""} /> {status === "loading" ? t("Getting weather…") : t("Auto-fill")}
          </button>
        )}
      </div>
      {status === "offline" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          <CloudOff className="h-4 w-4" aria-hidden /> {t("You’re offline — type it below, or leave it and it fills in when you’re back online.")}
          <button type="button" className="btn btn-sm ml-auto" onClick={onLater}>
            {t("Fill weather later")}
          </button>
        </div>
      )}
      {status === "later" && <p className="text-xs text-slate-500">{t("Weather will fill in when you’re back online with this log open.")}</p>}
      {status === "nolocation" && <p className="text-xs text-slate-500">{t("Set the job’s location (or add a photo with GPS) to fill the weather automatically. You can type it here meanwhile.")}</p>}
      {status === "unavailable" && <p className="text-xs text-slate-500">{t("Couldn’t get the weather for this day — type it below.")}</p>}
      <div className="flex flex-wrap gap-1.5">
        {WEATHER_CHOICES.map((c) => (
          <button key={c} type="button" className={`btn btn-sm ${weather.summary === c ? "btn-on" : ""}`} aria-pressed={weather.summary === c} onClick={() => set({ summary: weather.summary === c ? "" : c })}>
            <WeatherIcon summary={c} className="h-3.5 w-3.5" /> {t(c)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumField label={t("High °F")} value={weather.tempHighF} onChange={(v) => set({ tempHighF: v })} />
        <NumField label={t("Low °F")} value={weather.tempLowF} onChange={(v) => set({ tempLowF: v })} />
        <NumField label={t("Precip (in)")} value={weather.precipIn} onChange={(v) => set({ precipIn: v })} />
        <NumField label={t("Wind (mph)")} value={weather.windMph} onChange={(v) => set({ windMph: v })} />
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [seen, setSeen] = useState(value);
  // Follow values set from outside (auto-fill) without fighting the user's typing.
  if (seen !== value) {
    setSeen(value);
    if (numOrNull(text) !== (value ?? null)) setText(value == null ? "" : String(value));
  }
  return (
    <label className="text-sm">
      <span className="label">{label}</span>
      <input
        className="input"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = numOrNull(e.target.value);
          setSeen(v);
          onChange(v);
        }}
      />
    </label>
  );
}

/** Hours box that takes "7,5" as well as "7.5"; the number is clamped to 0–24. */
export function HoursInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(value ? String(value) : "");
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if ((parseHours(text) ?? 0) !== value) setText(value ? String(value) : "");
  }
  const parsed = parseHours(text);
  const over = text.trim() !== "" && parsed !== null && Number(text.trim().replace(",", ".")) > 24;
  const t = useT();
  return (
    <div className="relative">
      <input
        className={`input pr-6 text-right tabular-nums ${over || (text.trim() && parsed === null) ? "border-amber-400" : ""}`}
        inputMode="decimal"
        aria-label={label}
        placeholder="0"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseHours(e.target.value) ?? 0;
          setSeen(n);
          onChange(n);
        }}
        onBlur={() => {
          if (text.trim() && parsed !== null && String(parsed) !== text.trim()) setText(String(parsed));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-slate-400">{t("h")}</span>
    </div>
  );
}

export function CrewRows({ crew, onChange, suggestions }: { crew: CrewRow[]; onChange: (c: CrewRow[]) => void; suggestions: string[] }) {
  const listId = "crew-names";
  const lastRef = useRef<HTMLInputElement>(null);
  const [focusNew, setFocusNew] = useState(false);
  useEffect(() => {
    if (focusNew) lastRef.current?.focus();
  }, [focusNew, crew.length]);
  const set = (i: number, patch: Partial<CrewRow>) => onChange(crew.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const taken = new Set(crew.map((c) => c.name.trim().toLowerCase()));
  const quick = suggestions.filter((s) => !taken.has(s.toLowerCase())).slice(0, 8);
  const t = useT();
  return (
    <div className="space-y-2">
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {crew.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_5.5rem_2rem] items-center gap-2 sm:grid-cols-[1fr_9rem_5.5rem_2rem]">
          <input
            ref={i === crew.length - 1 ? lastRef : undefined}
            className="input"
            list={listId}
            placeholder={t("Name")}
            aria-label={t("Crew member {n} name", { n: i + 1 })}
            autoComplete="off"
            value={c.name}
            onChange={(e) => set(i, { name: e.target.value })}
          />
          <input className="input hidden sm:block" placeholder={t("Role (optional)")} aria-label={t("Crew member {n} role", { n: i + 1 })} value={c.role ?? ""} onChange={(e) => set(i, { role: e.target.value || null })} />
          <HoursInput label={t("Crew member {n} hours", { n: i + 1 })} value={c.hours} onChange={(n) => set(i, { hours: n })} />
          <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-400" aria-label={c.name ? t("Remove {name}", { name: c.name }) : t("Remove crew member")} onClick={() => onChange(crew.filter((_, k) => k !== i))}>
            <X />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            onChange([...crew, { name: "", hours: 8, role: null }]);
            setFocusNew(true);
          }}
        >
          <Plus /> {t("Add person")}
        </button>
        {quick.map((s) => (
          <button key={s} type="button" className="btn btn-sm btn-ghost text-brand-700" title={t("Add {name} at 8 h", { name: s })} onClick={() => onChange([...crew, { name: s, hours: 8, role: null }])}>
            <Plus /> {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Editable list of one-line entries; Enter in the last one adds another. */
export function LineList({ items, onChange, placeholder, addLabel }: { items: string[]; onChange: (xs: string[]) => void; placeholder: string; addLabel: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    if (focus !== null) refs.current[focus]?.focus();
  }, [focus, items.length]);
  const add = () => {
    onChange([...items, ""]);
    setFocus(items.length);
  };
  const t = useT();
  return (
    <div className="space-y-2">
      {items.map((x, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="input"
            placeholder={placeholder}
            aria-label={`${placeholder} ${i + 1}`}
            value={x}
            onChange={(e) => onChange(items.map((y, k) => (k === i ? e.target.value : y)))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (i === items.length - 1 && x.trim()) add();
                else setFocus(i + 1);
              }
            }}
          />
          <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-400" aria-label={t("Remove")} onClick={() => onChange(items.filter((_, k) => k !== i))}>
            <X />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={add}>
        <Plus /> {addLabel}
      </button>
    </div>
  );
}

export function WorkRows({ work, onChange, sheets, placeholder }: { work: WorkRow[]; onChange: (w: WorkRow[]) => void; sheets: Sheet[]; placeholder?: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    if (focus !== null) refs.current[focus]?.focus();
  }, [focus, work.length]);
  const set = (i: number, patch: Partial<WorkRow>) => onChange(work.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  const add = () => {
    onChange([...work, { text: "", sheetId: null, area: null }]);
    setFocus(work.length);
  };
  const t = useT();
  return (
    <div className="space-y-2.5">
      {work.map((w, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="input"
              placeholder={placeholder ?? t("e.g. Pulled Cat6 to 12 drops")}
              aria-label={t("Work line {n}", { n: i + 1 })}
              value={w.text}
              onChange={(e) => set(i, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (i === work.length - 1 && w.text.trim()) add();
                  else setFocus(i + 1);
                }
              }}
            />
            <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-400" aria-label={t("Remove work line")} onClick={() => onChange(work.filter((_, k) => k !== i))}>
              <X />
            </button>
          </div>
          <div className="mr-10 grid grid-cols-2 gap-2">
            {sheets.length > 0 ? (
              <select className="input h-9 text-xs" aria-label={t("Sheet for work line {n}", { n: i + 1 })} value={w.sheetId ?? ""} onChange={(e) => set(i, { sheetId: e.target.value || null })}>
                <option value="">{t("Sheet (optional)")}</option>
                {sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span />
            )}
            <input className="input h-9 text-xs" placeholder={t("Area / room (optional)")} aria-label={t("Area for work line {n}", { n: i + 1 })} value={w.area ?? ""} onChange={(e) => set(i, { area: e.target.value || null })} />
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={add}>
        <Plus /> {t("Add work")}
      </button>
    </div>
  );
}

export function DelayRows({ delays, onChange }: { delays: DelayRow[]; onChange: (d: DelayRow[]) => void }) {
  const set = (i: number, patch: Partial<DelayRow>) => onChange(delays.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const t = useT();
  return (
    <div className="space-y-2.5">
      {delays.map((d, i) => (
        <div key={i} className="space-y-1.5">
          <div className="grid grid-cols-[1fr_5.5rem_2rem] items-center gap-2">
            <input className="input" placeholder={t("Reason, e.g. Waiting on drywall")} aria-label={t("Delay {n} reason", { n: i + 1 })} value={d.reason} onChange={(e) => set(i, { reason: e.target.value })} />
            <HoursInput label={t("Delay {n} hours lost", { n: i + 1 })} value={d.hours ?? 0} onChange={(n) => set(i, { hours: n || null })} />
            <button type="button" className="btn btn-sm btn-icon btn-ghost text-slate-400" aria-label={t("Remove delay")} onClick={() => onChange(delays.filter((_, k) => k !== i))}>
              <X />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!d.ongoing} onChange={(e) => set(i, { ongoing: e.target.checked || undefined })} />
            {t("Still ongoing (carry over to tomorrow)")}
          </label>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...delays, { reason: "", hours: null }])}>
        <Plus /> {t("Add delay")}
      </button>
    </div>
  );
}

export function SafetyFields({ safety, onChange }: { safety: { incident: boolean; notes?: string | null } | undefined; onChange: (s: { incident: boolean; notes?: string | null }) => void }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("Safety incident")}>
        <button type="button" className={`btn h-11 ${safety && !safety.incident ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-50" : ""}`} aria-pressed={!!safety && !safety.incident} onClick={() => onChange({ incident: false, notes: safety?.notes ?? null })}>
          {t("No incidents")}
        </button>
        <button type="button" className={`btn h-11 ${safety?.incident ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-50" : ""}`} aria-pressed={!!safety?.incident} onClick={() => onChange({ incident: true, notes: safety?.notes ?? null })}>
          {t("Incident")}
        </button>
      </div>
      <textarea
        className="input min-h-16"
        aria-label={t("Safety notes")}
        placeholder={safety?.incident ? t("What happened, who was involved, first aid / follow-up…") : t("Toolbox talk, hazards, PPE notes (optional)")}
        value={safety?.notes ?? ""}
        onChange={(e) => onChange({ incident: safety?.incident ?? false, notes: e.target.value })}
      />
    </div>
  );
}
