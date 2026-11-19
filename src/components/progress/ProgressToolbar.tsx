"use client";
// Progress controls over the plan (HTML overlay, screen px): the Progress toggle, walk mode with the status a tap
// sets, filters and a "12/40 tested" counter, in the plan's left rail (under Measure); on phones the walk / filter
// options open as a bottom sheet. Plus the undo snackbar and the photo-required prompt (status slot, with its camera
// input) and the device install sheet (long-press / right-click a device in walk mode). Walk mode owns plan taps:
// starting it closes Measure, Markups, the Link tool, a task drop and device tools (claimPlanInput).
import { Camera, ChevronDown, ChevronUp, CircleDot, Footprints, Info, ListFilter, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { categoryOf } from "@/lib/catalog";
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER, canSetInstall, countAtLeast } from "@/lib/installProgress";
import { claimPlanInput } from "@/lib/planOverlays";
import type { PlanViewport } from "@/lib/planViewport";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import type { InstallStatus, Sheet } from "@/lib/types";
import { useMedia } from "@/lib/useMedia";
import { PHONE_QUERY, RailSlot, StatusSlot } from "../editor/overlays/PlanRail";
import { itemLabel, findItem, saveProofPhoto, setInstall } from "./actions";
import DeviceInstallSheet from "./DeviceInstallSheet";
import { photoInput, showSnack, useProgressUi, type WalkTarget } from "./progressStore";
import { walkHit } from "./walk";

const TARGETS: { id: WalkTarget; name: string }[] = [
  { id: "next", name: "Next step" },
  { id: "roughed", name: "Roughed" },
  { id: "installed", name: "Installed" },
  { id: "tested", name: "Tested" },
  { id: "issue", name: "Issue" },
  { id: "verified", name: "Verified" },
];

export default function ProgressToolbar({ sheet, viewport }: { sheet: Sheet; viewport: PlanViewport }) {
  const ui = useProgressUi();
  const role = useRole();
  const markers = useEditor((s) => s.markers);
  const catalog = useEditor((s) => s.catalog);
  // The counter follows walk mode's target ("3/40 installed"); otherwise devices tested.
  const counted: InstallStatus = ui.walk && ui.target !== "next" ? ui.target : "tested";
  const totals = useMemo(() => {
    const c = countAtLeast(markers.filter((m) => m.sheetId === sheet.id), catalog, counted);
    return { ...c, pct: c.total ? Math.round((c.n / c.total) * 100) : 0 };
  }, [markers, catalog, sheet.id, counted]);
  const cats = useMemo(() => {
    const ids = new Set(markers.filter((m) => m.sheetId === sheet.id && !m.tentative).map((m) => catalog.find((d) => d.id === m.deviceTypeId)?.category ?? "general"));
    return [...ids].map((id) => ({ id, name: categoryOf(id).name }));
  }, [markers, catalog, sheet.id]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const targets = TARGETS.filter((t) => t.id !== "verified" || canSetInstall(role, "verified"));
  const filtered = ui.statuses.length > 0 || !!ui.category;

  const phone = useMedia(PHONE_QUERY);

  useWalkGestures(viewport, sheet);

  return (
    <>
      <RailSlot side="left" order={30}>
      <div className={`pointer-events-auto max-w-full ${ui.on ? "w-[340px]" : ""}`} data-plan-ui data-testid="progress-toolbar">
        {!ui.on ? (
          <button className="btn h-10 rounded-xl bg-white/95 shadow-pop backdrop-blur" onClick={() => ui.set({ on: true, folded: false })} aria-pressed={false}>
            <CircleDot /> Progress
          </button>
        ) : (
          <div className="rounded-xl bg-white/95 p-1.5 shadow-pop ring-1 ring-black/5 backdrop-blur">
            <div className="flex items-center gap-1.5">
              <button className="btn btn-sm btn-on" onClick={() => ui.set({ on: false, walk: false })} aria-pressed title="Hide progress">
                <CircleDot /> Progress
              </button>
              <button className={`btn btn-sm ${ui.walk ? "btn-brand" : ""}`} onClick={() => {
                  // Start without a selection, so only a long-press from now on opens a device's sheet. Walking owns
                  // plan taps: other tools close and the editor goes back to Select.
                  if (!ui.walk) {
                    claimPlanInput("walk");
                    useEditor.getState().select(null);
                  }
                  ui.set({ walk: !ui.walk, folded: false });
                }} aria-pressed={ui.walk} data-testid="walk-toggle">
                <Footprints /> Walk
              </button>
              <div className="min-w-0 flex-1 text-right text-xs leading-tight" data-testid="progress-counter">
                <span className="font-semibold text-slate-900 tabular-nums">
                  {totals.n}/{totals.total}
                </span>{" "}
                <span className="text-slate-500">{STATUS_LABELS[counted].toLowerCase()}</span>
                <div className="mt-0.5 ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full transition-[width]" style={{ width: `${totals.pct}%`, background: STATUS_COLORS[counted] }} />
                </div>
              </div>
              <button
                className={`btn btn-sm btn-icon btn-ghost ${filtered ? "text-brand-700" : ""}`}
                onClick={() => {
                  setFiltersOpen((o) => !o);
                  ui.set({ folded: false });
                }}
                aria-expanded={filtersOpen}
                aria-label={filtered ? "Progress filters (on)" : "Progress filters"}
                title="Filter by status or category"
              >
                <ListFilter />
              </button>
              {(ui.walk || filtersOpen) && (
                <button className="btn btn-sm btn-icon btn-ghost" onClick={() => ui.set({ folded: !ui.folded })} aria-label={ui.folded ? "Show progress options" : "Hide progress options"}>
                  {ui.folded ? <ChevronDown /> : <ChevronUp />}
                </button>
              )}
            </div>
            {!ui.folded && (ui.walk || filtersOpen) && (
              <OptionsShell phone={phone} onClose={() => (setFiltersOpen(false), ui.set({ folded: true }))}>
              <div className="space-y-1.5">
                {ui.walk && (
                  <div className="scroll-thin -mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5" role="radiogroup" aria-label="A tap marks devices" title="Tap a device to mark it. Long-press (or right-click) for photos, tests and history.">
                    {targets.map((t) => {
                      const on = ui.target === t.id;
                      const color = t.id === "next" ? "#0f172a" : STATUS_COLORS[t.id];
                      return (
                        <button
                          key={t.id}
                          role="radio"
                          aria-checked={on}
                          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ring-1 transition ${on ? "text-white" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
                          style={on ? { background: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
                          onClick={() => ui.set({ target: t.id })}
                        >
                          {t.id !== "next" && <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/70" style={{ background: STATUS_COLORS[t.id as InstallStatus] }} />}
                          {t.id === "next" ? t.name : `Mark ${t.name}`}
                        </button>
                      );
                    })}
                  </div>
                )}
                {filtersOpen && (
                  <div className="space-y-2 rounded-lg bg-slate-50 p-2">
                    <div className="flex flex-wrap gap-1">
                      {STATUS_ORDER.map((s) => {
                        const on = ui.statuses.includes(s);
                        return (
                          <button
                            key={s}
                            className={`chip h-7 px-2 ring-1 ${on ? "bg-white text-slate-900 ring-slate-400" : "bg-white/60 text-slate-500 ring-slate-200"}`}
                            onClick={() => ui.set({ statuses: on ? ui.statuses.filter((x) => x !== s) : [...ui.statuses, s] })}
                            aria-pressed={on}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                            {STATUS_LABELS[s]}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <select className="input h-9" value={ui.category ?? ""} onChange={(e) => ui.set({ category: e.target.value || null })} aria-label="Category">
                        <option value="">All categories</option>
                        {cats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {filtered && (
                        <button className="btn btn-sm btn-ghost h-9" onClick={() => ui.set({ statuses: [], category: null })}>
                          <X /> Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </OptionsShell>
            )}
          </div>
        )}
      </div>
      </RailSlot>
      <StatusSlot order={40}>
        <Snackbar />
      </StatusSlot>
      <PhotoPrompt />
      {ui.sheet && <DeviceInstallSheet item={ui.sheet} onClose={() => ui.set({ sheet: null })} />}
    </>
  );
}

/** Walk / filter options: under the Progress bar on sm+, a bottom sheet on phones (the rail stays one line there). */
function OptionsShell({ phone, onClose, children }: { phone: boolean; onClose: () => void; children: ReactNode }) {
  if (!phone) return <div className="mt-1.5">{children}</div>;
  return (
    <StatusSlot order={90}>
      <div className="pointer-events-auto w-full rounded-t-2xl bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-pop ring-1 ring-black/5 backdrop-blur-md" data-plan-ui data-plan-sheet data-testid="progress-options">
        <div className="mb-1.5 flex items-center gap-2 pl-1">
          <span className="flex-1 text-sm font-semibold text-slate-900">Progress</span>
          <button className="btn btn-sm btn-icon btn-ghost" onClick={onClose} aria-label="Hide progress options">
            <ChevronDown />
          </button>
        </div>
        {children}
      </div>
    </StatusSlot>
  );
}

/** Long-press selects a device (the plan's own gesture): in walk mode that opens its install sheet instead. Right-click too. */
function useWalkGestures(viewport: PlanViewport, sheet: Sheet) {
  const selection = useEditor((s) => s.selection);
  const walking = useProgressUi((s) => s.on && s.walk);
  useEffect(() => {
    if (!walking || !selection || selection.table === "closets") return;
    useProgressUi.getState().set({ sheet: { table: selection.table, id: selection.id } });
    useEditor.getState().select(null);
  }, [walking, selection]);
  useEffect(() => {
    if (!walking) return;
    const el = document.querySelector<HTMLElement>("[data-plan-canvas]");
    if (!el) return;
    const down = (e: PointerEvent) => useProgressUi.getState().set({ lastButton: e.pointerType === "mouse" ? e.button : 0 });
    const menu = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const ref = walkHit({ screen: { x: e.clientX - r.left, y: e.clientY - r.top }, hit: null }, { sheet, viewport });
      if (!ref) return;
      e.preventDefault();
      useProgressUi.getState().set({ sheet: ref, lastButton: 0 });
    };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("contextmenu", menu);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("contextmenu", menu);
    };
  }, [walking, viewport, sheet]);
}

function Snackbar() {
  const snack = useProgressUi((s) => s.snack);
  if (!snack) return null;
  const undo = async () => {
    const st = useEditor.getState();
    const last = st.past[st.past.length - 1];
    useProgressUi.getState().set({ snack: null });
    if (!last?.some((c) => c.table === snack.ref.table && (c.after?.id ?? c.before?.id) === snack.ref.id)) {
      toast("Something else changed since — use the plan's undo", "info");
      return;
    }
    await st.undo();
  };
  return (
    <div
      className="pointer-events-auto flex max-w-full items-center gap-1 rounded-xl bg-ink/95 py-1 pr-1 pl-3.5 text-sm text-white shadow-pop"
      data-plan-ui
      role="status"
      data-testid="progress-snack"
    >
      <span className="min-w-0 truncate">
        <span className="font-semibold">{snack.label}</span> → {snack.text}
      </span>
      <button className="ml-2 flex h-9 items-center gap-1 rounded-lg bg-white/15 px-3 text-xs font-semibold hover:bg-white/25" onClick={undo}>
        <Undo2 className="h-3.5 w-3.5" /> Undo
      </button>
      <button className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/15" onClick={() => useProgressUi.getState().set({ sheet: snack.ref, snack: null })} aria-label="Details">
        <Info className="h-4 w-4" />
      </button>
    </div>
  );
}

function PhotoPrompt() {
  const pending = useProgressUi((s) => s.pendingPhoto);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    const p = useProgressUi.getState().pendingPhoto;
    if (!file || !p) return;
    setBusy(true);
    try {
      const photoId = await saveProofPhoto(file, p);
      if (!photoId) return;
      if (await setInstall(p, p.to, { photoId })) showSnack(p, itemLabel(findItem(p)), `${STATUS_LABELS[p.to]} (photo)`);
      useProgressUi.getState().set({ pendingPhoto: null });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input
        ref={(el) => {
          photoInput.current = el;
        }}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="progress-photo-input"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {pending && (
        <StatusSlot order={41}>
        <div className="pointer-events-auto flex w-[min(420px,100%)] items-center gap-2 rounded-xl bg-white p-2 pl-3.5 text-sm shadow-pop ring-1 ring-slate-200" data-plan-ui>
          <span className="min-w-0 flex-1">
            Photo needed to mark <span className="font-semibold">{pending.label}</span> {STATUS_LABELS[pending.to].toLowerCase()}
          </span>
          <button className="btn btn-brand h-11 px-4" onClick={() => photoInput.current?.click()} disabled={busy}>
            <Camera /> {busy ? "Saving…" : "Take photo"}
          </button>
          <button className="btn btn-icon btn-ghost h-11 w-11" onClick={() => useProgressUi.getState().set({ pendingPhoto: null })} aria-label="Cancel">
            <X />
          </button>
        </div>
        </StatusSlot>
      )}
    </>
  );
}
