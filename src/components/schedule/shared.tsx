"use client";
// Small pieces shared by the job schedule, the crew board and the My Tasks strip.
import { memberInitials } from "@/lib/teamLogic";
import { dayNum } from "@/lib/schedule";
import { TONE_HEX } from "@/lib/statusStyle";
import { fmtDate } from "@/lib/i18n";

/** Bars without a colour of their own: action blue (Blueprint Ink, docs/brand.md). */
export const DEFAULT_BAR = "#0B6FE0";

/** Phase colours offered in the editor (Blueprint Ink tones where one fits, src/lib/statusStyle.ts). */
export const SWATCHES = [TONE_HEX.info, TONE_HEX.warn, "#7c3aed", TONE_HEX.ok, "#16a34a", TONE_HEX.bad, "#0F2340", "#526580"];

/** A stable colour per job (crew board chips). */
const JOB_COLORS = ["#0B6FE0", "#7c3aed", "#0B7F72", TONE_HEX.warn, "#db2777", "#16a34a", "#0891b2", "#9333ea", "#65a30d", "#0F2340"];
export function jobColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return JOB_COLORS[h % JOB_COLORS.length];
}

const AVATAR_COLORS = ["bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];
function avatarClass(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const s = size === "md" ? "h-7 w-7 text-[11px]" : "h-5 w-5 text-[9px]";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white ${s} ${avatarClass(name)}`} title={name} aria-label={name}>
      {memberInitials({ name })}
    </span>
  );
}

export function CrewAvatars({ crew, max = 3 }: { crew?: string[]; max?: number }) {
  const list = crew ?? [];
  if (!list.length) return null;
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {list.slice(0, max).map((n) => (
        <Avatar key={n} name={n} />
      ))}
      {list.length > max && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1 text-[9px] font-semibold text-slate-600 ring-2 ring-white">+{list.length - max}</span>}
    </span>
  );
}

const dateOf = (day: string) => new Date(dayNum(day) * 86_400_000);
/** "Mon, Nov 23" (shown in UTC so the stored day is exactly the day shown). */
export const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  fmtDate(dateOf(day), { ...opts, timeZone: "UTC" });
export const fmtRange = (a: string, b: string) => (a === b ? fmtDay(a) : `${fmtDay(a, { month: "short", day: "numeric" })} – ${fmtDay(b, { month: "short", day: "numeric" })}`);

export function ProgressBar({ value, color = DEFAULT_BAR }: { value: number; color?: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </span>
  );
}
