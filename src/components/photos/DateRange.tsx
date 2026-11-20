"use client";
import { useT } from "@/lib/i18n";
/** From / To day pickers (local days, inclusive). Used by the job Photos tab and the company photo feed. */
export default function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
      <label className="flex items-center gap-1.5">
        {t("From")}
        <input type="date" className="input h-9 w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="flex items-center gap-1.5">
        {t("To")}
        <input type="date" className="input h-9 w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </label>
    </div>
  );
}
