"use client";
// Add / edit a schedule phase: dates, crew, hours, progress, colour, dependencies (cycles can't be picked), sheets, notes.
// Office edits everything; a tech on the crew can update progress and notes only (canEditSchedule in schedule.ts).
import { Link2, Plus, Trash, X } from "lucide-react";
import { useMemo, useState } from "react";
import { addWorkdays, durationDays, isDay, rollToWorkday, wouldCycle, type ScheduleAccess } from "@/lib/schedule";
import type { ScheduleDep, ScheduleItem, Sheet } from "@/lib/types";
import { Avatar, DEFAULT_BAR, fmtRange, SWATCHES } from "./shared";

export default function ScheduleItemEditor(props: {
  item: ScheduleItem;
  isNew: boolean;
  /** Every item of the job (live and deleted, for dependency warnings). */
  all: ScheduleItem[];
  names: string[];
  sheets: Sheet[];
  phases: { phase: string; name: string; color: string }[];
  access: ScheduleAccess;
  onSave: (item: ScheduleItem) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { all, access } = props;
  const [f, setF] = useState<ScheduleItem>(() => ({ ...props.item, crew: [...(props.item.crew ?? [])], dependsOn: [...(props.item.dependsOn ?? [])], sheetIds: [...(props.item.sheetIds ?? [])] }));
  const [extraName, setExtraName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = access === "all";
  const canSave = access !== "none";
  const set = (p: Partial<ScheduleItem>) => setF((cur) => ({ ...cur, ...p }));
  const wd = f.workdaysOnly !== false;
  const dur = isDay(f.start) && isDay(f.end) && f.end >= f.start ? durationDays(f) : 0;

  const others = useMemo(() => all.filter((i) => i.id !== f.id && !i.deleted).sort((a, b) => a.start.localeCompare(b.start)), [all, f.id]);
  // Picking a dependency must not loop back: check against the draft's own (unsaved) dependencies too.
  const draftAll = useMemo(() => all.map((i) => (i.id === f.id ? f : i)), [all, f]);
  const deps = new Map((f.dependsOn ?? []).map((d) => [d.id, d]));
  const missing = (f.dependsOn ?? []).filter((d) => !all.some((i) => i.id === d.id && !i.deleted));
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of [...props.names, ...(f.crew ?? [])]) if (n.trim() && !m.has(n.trim().toLowerCase())) m.set(n.trim().toLowerCase(), n.trim());
    return [...m.values()];
  }, [props.names, f.crew]);
  const onCrew = (n: string) => (f.crew ?? []).some((c) => c.toLowerCase() === n.toLowerCase());

  function toggleCrew(n: string) {
    set({ crew: onCrew(n) ? (f.crew ?? []).filter((c) => c.toLowerCase() !== n.toLowerCase()) : [...(f.crew ?? []), n] });
  }
  function toggleDep(id: string) {
    if (deps.has(id)) set({ dependsOn: (f.dependsOn ?? []).filter((d) => d.id !== id) });
    else set({ dependsOn: [...(f.dependsOn ?? []), { id }] });
  }
  function setLag(id: string, lag: number) {
    set({ dependsOn: (f.dependsOn ?? []).map((d): ScheduleDep => (d.id === id ? { id, ...(lag ? { lagDays: lag } : {}) } : d)) });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return props.onClose();
    if (!f.name.trim()) return setError("Give the phase a name.");
    if (!isDay(f.start) || !isDay(f.end)) return setError("Pick a start and an end date.");
    if (f.end < f.start) return setError("The end date can’t be before the start date.");
    for (const d of f.dependsOn ?? []) if (wouldCycle(draftAll.map((i) => (i.id === f.id ? { ...f, dependsOn: [] } : i)), f.id, d.id)) return setError("Those dependencies would loop back on themselves.");
    const progress = Math.min(100, Math.max(0, Math.round(Number(f.progress) || 0)));
    const hours = Number(f.hoursPlanned);
    props.onSave({ ...f, name: f.name.trim(), progress, hoursPlanned: hours > 0 ? hours : null, notes: f.notes?.trim() ? f.notes : null });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={props.onClose}>
      <form
        role="dialog"
        aria-label={props.isNew ? "Add phase" : `Edit ${f.name}`}
        className="card animate-in flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-b-none shadow-pop sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{props.isNew ? "Add phase" : f.name || "Phase"}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {access === "progress" ? "You’re on this crew: update progress and notes." : access === "none" ? "View only — the office plans the schedule." : dur ? `${fmtRange(f.start, f.end)} · ${dur} ${wd ? "workday" : "day"}${dur === 1 ? "" : "s"}` : "Dates, crew and what it waits on."}
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-2" onClick={props.onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="label" htmlFor="si-name">
              Name
            </label>
            <input id="si-name" className="input" value={f.name} disabled={!full} autoFocus={props.isNew} placeholder="Rough-in" list="si-phases" onChange={(e) => {
              const p = props.phases.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
              set({ name: e.target.value, ...(p ? { phase: p.phase, color: f.color ?? p.color } : {}) });
            }} />
            <datalist id="si-phases">
              {props.phases.map((p) => (
                <option key={p.phase} value={p.name} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="si-start">
                Start
              </label>
              <input id="si-start" type="date" className="input" value={f.start} disabled={!full} onChange={(e) => {
                const s = e.target.value;
                // Keep the length when the start moves.
                if (isDay(s) && dur) set({ start: s, end: addWorkdays(rollToWorkday(s, wd), dur - 1, wd) });
                else set({ start: s });
              }} />
            </div>
            <div>
              <label className="label" htmlFor="si-end">
                End
              </label>
              <input id="si-end" type="date" className="input" value={f.end} min={f.start} disabled={!full} onChange={(e) => set({ end: e.target.value })} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label" htmlFor="si-dur">
                {wd ? "Workdays" : "Days"}
              </label>
              <input id="si-dur" type="number" inputMode="numeric" min={1} className="input" value={dur || ""} disabled={!full || !isDay(f.start)} onChange={(e) => {
                const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                set({ end: addWorkdays(rollToWorkday(f.start, wd), n - 1, wd) });
              }} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={wd} disabled={!full} onChange={(e) => set({ workdaysOnly: e.target.checked })} />
            Weekdays only (skip Saturday and Sunday)
          </label>

          <div>
            <span className="label">Crew</span>
            <div className="flex flex-wrap gap-1.5">
              {names.map((n) => (
                <button
                  type="button"
                  key={n}
                  disabled={!full}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full pr-3 pl-1 text-xs font-medium ring-1 transition disabled:opacity-60 ${onCrew(n) ? "bg-brand-50 text-brand-700 ring-brand-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                  aria-pressed={onCrew(n)}
                  onClick={() => toggleCrew(n)}
                >
                  <Avatar name={n} />
                  {n}
                </button>
              ))}
              {full && (
                <span className="inline-flex items-center gap-1">
                  <input className="input h-8 w-32 text-xs" placeholder="Add a name" value={extraName} onChange={(e) => setExtraName(e.target.value)} onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (extraName.trim()) toggleCrew(extraName.trim());
                      setExtraName("");
                    }
                  }} aria-label="Add a crew member by name" />
                  <button type="button" className="btn btn-sm btn-icon" aria-label="Add to crew" disabled={!extraName.trim()} onClick={() => {
                    toggleCrew(extraName.trim());
                    setExtraName("");
                  }}>
                    <Plus />
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="si-hours">
                Planned hours (crew total)
              </label>
              <input id="si-hours" type="number" inputMode="decimal" min={0} step="0.5" className="input" value={f.hoursPlanned ?? ""} disabled={!full} onChange={(e) => set({ hoursPlanned: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label className="label" htmlFor="si-progress">
                Progress · {Math.round(f.progress ?? 0)}%
              </label>
              <input id="si-progress" type="range" min={0} max={100} step={5} className="h-10 w-full accent-brand-600" value={f.progress ?? 0} disabled={!canSave} onChange={(e) => set({ progress: Number(e.target.value) })} />
            </div>
          </div>
          {canSave && (
            <div className="-mt-2 flex flex-wrap gap-1.5">
              {[0, 25, 50, 75, 100].map((v) => (
                <button type="button" key={v} className={`btn btn-sm ${Math.round(f.progress ?? 0) === v ? "btn-on" : ""}`} onClick={() => set({ progress: v })}>
                  {v === 100 ? "Done" : `${v}%`}
                </button>
              ))}
            </div>
          )}

          {full && (
            <div>
              <span className="label">Colour</span>
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`h-7 w-7 rounded-full ring-offset-2 transition ${(f.color || DEFAULT_BAR) === c ? "ring-2 ring-slate-800" : "ring-1 ring-slate-200"}`}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                    aria-pressed={(f.color || DEFAULT_BAR) === c}
                    onClick={() => set({ color: c })}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="label flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" /> Starts after (finish-to-start)
            </span>
            {missing.length > 0 && (
              <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Waits on {missing.length === 1 ? "a phase that was deleted" : `${missing.length} phases that were deleted`} — ignored.{" "}
                {full && (
                  <button type="button" className="font-medium underline" onClick={() => set({ dependsOn: (f.dependsOn ?? []).filter((d) => !missing.includes(d)) })}>
                    Remove
                  </button>
                )}
              </div>
            )}
            {others.length === 0 ? (
              <p className="text-xs text-slate-500">No other phases yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                {others.map((o) => {
                  const on = deps.has(o.id);
                  const loops = !on && wouldCycle(draftAll, f.id, o.id);
                  return (
                    <li key={o.id} className="flex items-center gap-2 px-3 py-1.5">
                      <label className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${loops ? "text-slate-400" : ""}`}>
                        <input type="checkbox" checked={on} disabled={!full || loops} onChange={() => toggleDep(o.id)} />
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: o.color || DEFAULT_BAR }} />
                        <span className="truncate">{o.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">{loops ? "would loop" : fmtRange(o.start, o.end)}</span>
                      </label>
                      {on && (
                        <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                          + lag
                          <input
                            type="number"
                            inputMode="numeric"
                            className="input h-7 w-14 px-2 text-xs"
                            value={deps.get(o.id)?.lagDays ?? 0}
                            disabled={!full}
                            onChange={(e) => setLag(o.id, Math.round(Number(e.target.value) || 0))}
                            aria-label={`Lag days after ${o.name}`}
                          />
                          d
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {props.sheets.length > 0 && (
            <div>
              <span className="label">Sheets / areas</span>
              <div className="flex flex-wrap gap-1.5">
                {props.sheets.map((s) => {
                  const on = (f.sheetIds ?? []).includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      disabled={!full}
                      className={`chip h-7 px-2.5 ring-1 disabled:opacity-60 ${on ? "bg-brand-50 text-brand-700 ring-brand-300" : "bg-white text-slate-600 ring-slate-200"}`}
                      aria-pressed={on}
                      onClick={() => set({ sheetIds: on ? (f.sheetIds ?? []).filter((x) => x !== s.id) : [...(f.sheetIds ?? []), s.id] })}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="label" htmlFor="si-notes">
              Notes
            </label>
            <textarea id="si-notes" className="input" rows={3} value={f.notes ?? ""} disabled={!canSave} placeholder="Materials, access, inspector’s name…" onChange={(e) => set({ notes: e.target.value })} />
          </div>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {full && !props.isNew && props.onDelete && (
            <button type="button" className="btn btn-danger btn-icon" onClick={props.onDelete} aria-label="Delete phase" title="Delete phase">
              <Trash />
            </button>
          )}
          <div className="flex-1" />
          <button type="button" className="btn" onClick={props.onClose}>
            {canSave ? "Cancel" : "Close"}
          </button>
          {canSave && (
            <button type="submit" className="btn btn-brand">
              {props.isNew ? "Add phase" : "Save"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
