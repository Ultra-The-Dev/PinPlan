"use client";
// Settings → Install progress: which statuses need a proof photo before they can be set (saved with the settings form).
import { DEFAULT_PHOTO_REQUIRED, STATUS_COLORS, STATUS_LABELS } from "@/lib/installProgress";
import type { InstallStatus } from "@/lib/types";

const CHOICES: InstallStatus[] = ["roughed", "installed", "tested", "verified", "issue"];

export default function InstallSettings({ value, onChange }: { value: InstallStatus[] | undefined; onChange: (v: InstallStatus[]) => void }) {
  const list = value ?? DEFAULT_PHOTO_REQUIRED;
  return (
    <section id="install" className="card scroll-mt-6 space-y-3 p-6" data-testid="install-settings">
      <div>
        <h2 className="text-lg font-semibold">Install progress</h2>
        <p className="text-sm text-slate-500">Install photo required for: techs take a photo before they can mark a device with these statuses.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((st) => {
          const on = list.includes(st);
          return (
            <label key={st} className={`chip cursor-pointer px-3 py-1.5 text-sm ring-1 ${on ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-white text-slate-500 ring-slate-200"}`}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? list.filter((x) => x !== st) : [...list, st])} />
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[st] }} />
              {STATUS_LABELS[st]}
            </label>
          );
        })}
      </div>
    </section>
  );
}
