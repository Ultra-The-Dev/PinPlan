"use client";
// Find similar's card (docs/find-similar.md): what to count, Match a symbol / Read tags, the result bar ("Found 14 —
// Accept all · Review one by one · Clear"), the sensitivity slider and this floor's door / window count. In the plan's
// status slot: a card above the bottom controls, a bottom sheet on phones. Edit mode only (the overlay is off in View).
import { Check, ChevronLeft, ChevronRight, FileText, Loader2, ScanSearch, ShieldCheck, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { openingKind, sheetOpenings } from "@/lib/alarmSensors";
import { msg, useT } from "@/lib/i18n";
import type { PlanViewport } from "@/lib/planViewport";
import { useEditor } from "@/lib/store";
import type { Sheet } from "@/lib/types";
import { useMedia } from "@/lib/useMedia";
import { PHONE_QUERY, RailSlot, StatusSlot } from "../editor/overlays/PlanRail";
import AlarmSensorsSection from "./AlarmSensorsSection";
import { acceptFinds, openSensors, rememberedType, runTags, shownFinds, toggleFind, useFindSimilar, type FindMode } from "./findSimilarStore";

const MODES: { id: FindMode; label: string }[] = [
  { id: "match", label: msg("Match a symbol") },
  { id: "tags", label: msg("Read tags") },
];

export default function FindSimilarPanel({ sheet, viewport }: { sheet: Sheet; viewport: PlanViewport }) {
  const t = useT();
  const st = useFindSimilar();
  const phone = useMedia(PHONE_QUERY);
  const catalog = useEditor((s) => s.catalog);
  const markers = useEditor((s) => s.markers);
  const fileRef = useRef<HTMLInputElement>(null);
  const typeSel = useId();
  const sens = useId();
  const pre = useId();

  const types = useMemo(() => catalog.filter((d) => !d.archived && d.kind === "device").sort((a, b) => a.sort - b.sort), [catalog]);
  const type = types.find((d) => d.id === st.typeId) ?? null;

  // Pick a type to count as: the last one used, else the generic Door (an opening), else a door, else the first.
  useEffect(() => {
    if (!st.open || type || !types.length) return;
    const t = types.find((d) => d.id === rememberedType()) ?? types.find((d) => d.id === "gen-door") ?? types.find((d) => openingKind(d) === "door") ?? types[0];
    st.setType(t.id, t.name);
  }, [st, st.open, type, types]);

  // Results belong to one plan: moving to another plan starts over.
  useEffect(() => {
    if (st.sheetId && st.sheetId !== sheet.id) st.clear();
  }, [st, sheet.id]);

  const shown = shownFinds(st, markers, sheet);
  const kept = shown.filter((f) => !f.rejected).length;

  // Floor summary: devices placed on this plan, for door / window types and the type being counted.
  const summary = useMemo(() => {
    const ids = new Set(types.filter((d) => /\b(doors?|windows?)\b/i.test(d.name) || d.id === st.typeId).map((d) => d.id));
    const n = new Map<string, number>();
    for (const m of markers) if (!m.deleted && m.sheetId === sheet.id && ids.has(m.deviceTypeId)) n.set(m.deviceTypeId, (n.get(m.deviceTypeId) ?? 0) + 1);
    return types.filter((d) => ids.has(d.id) && (n.get(d.id) || d.id === st.typeId)).map((d) => ({ id: d.id, name: d.name, n: n.get(d.id) ?? 0 }));
  }, [types, markers, sheet.id, st.typeId]);

  // Doors and windows on this plan: Add sensors offers to put alarm sensors on them.
  const openings = sheetOpenings(markers, catalog, sheet.id).length;

  if (!st.open) return null;

  const goTo = (i: number) => {
    const f = shown[i];
    if (!f) return st.set({ review: null });
    st.set({ review: i });
    viewport.focus({ x: f.x, y: f.y }, 3);
  };
  const reviewing = st.review != null && shown[st.review];

  const body = (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        <ScanSearch className="h-4 w-4 shrink-0 text-brand-600" />
        <h2 className="flex-1 font-semibold text-slate-900">{t("Find similar")}</h2>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={() => st.setOpen(false)} aria-label={t("Close Find similar")} title={t("Close (suggestions stay until you clear them)")}>
          <X />
        </button>
      </div>

      {st.sensors ? (
        <AlarmSensorsSection sheet={sheet} />
      ) : (
      <>
      <div className="flex items-center gap-2">
        <label htmlFor={typeSel} className="shrink-0 text-xs font-medium text-slate-500">
          {t("Count as")}
        </label>
        <select
          id={typeSel}
          className="input h-9 min-w-0 flex-1 py-0 text-sm"
          value={st.typeId ?? ""}
          onChange={(e) => {
            const t = types.find((d) => d.id === e.target.value);
            if (t) st.setType(t.id, t.name);
          }}
          data-testid="find-type"
        >
          {types.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="seg flex" role="radiogroup" aria-label={t("How to find")}>
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={st.mode === m.id}
            className={`tab h-8 flex-1 justify-center px-2 text-xs ${st.mode === m.id ? "tab-active" : ""}`}
            onClick={() => {
              if (st.mode === m.id) return;
              st.set({ mode: m.id });
              st.clear();
            }}
          >
            {t(m.label)}
          </button>
        ))}
      </div>

      {st.mode === "tags" && !st.found.length && !st.busy && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runTags(sheet);
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor={pre} className="text-xs font-medium text-slate-500">
              {t("Tags start with")}
            </label>
            <input id={pre} className="input h-9 w-full text-sm" value={st.prefixes} onChange={(e) => st.set({ prefixes: e.target.value })} placeholder="D, DR" autoComplete="off" data-testid="find-prefixes" />
          </div>
          <button type="submit" className="btn btn-sm btn-brand h-9" data-testid="find-read-tags">
            {t("Read tags")}
          </button>
        </form>
      )}

      {st.busy && (
        <p className="flex items-center gap-2 text-slate-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> {t(st.busy.text, st.busy.vars)}
        </p>
      )}

      {!st.busy && st.mode === "match" && st.picking && (
        <p className="text-slate-600" data-testid="find-hint">
          {phone
            ? t("Tap one {name} on the plan, or drag a box around it (two fingers move the plan). Matches turned or mirrored count too.", { name: type ? type.name.toLowerCase() : t("symbol") })
            : t("Tap one {name} on the plan, or drag a box around it. Matches turned or mirrored count too.", { name: type ? type.name.toLowerCase() : t("symbol") })}
        </p>
      )}

      {st.note && !st.busy && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-900" role="status" data-testid="find-note">
          {/* Notes are English keys with their values (worker messages too, marked with msg()). */}
          {t(st.note.text, st.note.vars)}
        </p>
      )}
      {st.needPdf && !st.busy && (
        <>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void runTags(sheet, e.target.files[0])} />
          <button className="btn btn-sm self-start" onClick={() => fileRef.current?.click()}>
            <FileText /> {t("Choose the PDF")}
          </button>
        </>
      )}

      {!st.busy && st.sheetId === sheet.id && st.found.length > 0 && !reviewing && (
        <div className="flex flex-col gap-2" data-testid="find-results">
          <p className="font-semibold text-slate-900" role="status">
            {t("Found {n}", { n: shown.length })}
            {kept !== shown.length && <span className="font-normal text-slate-500"> · {t("{n} rejected", { n: shown.length - kept })}</span>}
            <span className="block text-xs font-normal text-slate-500">
              {shown.length
                ? t("Suggestions don’t count until you accept them. Tap one on the plan to reject it.")
                : st.source === "match"
                  ? t("Nothing new at this sensitivity: move the slider, or every match already has a device of this type on it.")
                  : t("Every tag already has a {name} next to it.", { name: type?.name.toLowerCase() ?? t("device") })}
            </span>
          </p>
          {st.source === "match" && (
            <div className="flex items-center gap-2">
              <label htmlFor={sens} className="shrink-0 text-xs font-medium text-slate-500">
                {t("Fewer matches")}
              </label>
              <input id={sens} type="range" min={0} max={100} step={1} value={st.sensitivity} onChange={(e) => st.set({ sensitivity: Number(e.target.value) })} className="min-w-0 flex-1 accent-brand-600" aria-label={t("Sensitivity")} data-testid="find-sensitivity" />
              <span className="shrink-0 text-xs font-medium text-slate-500">{t("More matches")}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button className="btn btn-sm btn-brand" disabled={!kept} onClick={() => void acceptFinds(sheet)} data-testid="find-accept-all">
              <Check /> {kept ? t("Accept all {n}", { n: kept }) : t("Accept all")}
            </button>
            <button className="btn btn-sm" disabled={!shown.length} onClick={() => goTo(0)} data-testid="find-review">
              {t("Review one by one")}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => st.clear()} title={t("Remove these suggestions and pick again")} data-testid="find-clear">
              {t("Clear")}
            </button>
          </div>
        </div>
      )}

      {reviewing && st.review != null && (
        <div className="flex flex-col gap-2" data-testid="find-review-bar">
          <p className="font-semibold text-slate-900" role="status">
            {t("{n} of {total}", { n: st.review + 1, total: shown.length })}
            {shown[st.review].tag ? ` · ${shown[st.review].tag}` : ""}
            {shown[st.review].rejected && <span className="font-normal text-slate-500"> · {t("rejected")}</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn btn-sm btn-icon" onClick={() => goTo(st.review! - 1)} disabled={st.review === 0} aria-label={t("Previous")}>
              <ChevronLeft />
            </button>
            <button
              className="btn btn-sm btn-brand"
              onClick={() => {
                if (shown[st.review!].rejected) toggleFind(shown[st.review!].id);
                goTo(st.review! + 1);
              }}
            >
              <Check /> {t("Keep")}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                if (!shown[st.review!].rejected) toggleFind(shown[st.review!].id);
                goTo(st.review! + 1);
              }}
            >
              <X /> {t("Reject")}
            </button>
            <button className="btn btn-sm btn-icon" onClick={() => goTo(st.review! + 1)} aria-label={t("Next")}>
              <ChevronRight />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => st.set({ review: null })}>
              {t("Done")}
            </button>
          </div>
        </div>
      )}

      {summary.length > 0 && (
        <p className="border-t border-slate-100 pt-2 text-xs text-slate-600" data-testid="find-summary">
          <span className="font-medium text-slate-500">{t("On this floor:")} </span>
          {summary.map((s, i) => (
            <span key={s.id}>
              {i > 0 && " · "}
              {s.name}: <span className="font-semibold text-slate-900 tabular-nums">{s.n}</span>
            </span>
          ))}
        </p>
      )}
      {openings > 0 && (
        <button className="btn btn-sm self-start" onClick={() => openSensors()} data-testid="find-add-sensors">
          <ShieldCheck /> {t("Add alarm sensors")}
        </button>
      )}
      </>
      )}
    </div>
  );

  // Phones: a bottom sheet. Wider: a card in the left rail (under Measure / Progress), so the middle of the plan,
  // where the symbols are, stays clear.
  if (phone)
    return (
      <StatusSlot order={85}>
        <div className="pointer-events-auto w-full rounded-t-2xl bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-pop ring-1 ring-black/5 backdrop-blur-md" data-plan-ui data-plan-sheet data-testid="find-similar">
          {body}
        </div>
      </StatusSlot>
    );
  return (
    <RailSlot side="left" order={50} shrink>
      <div className="scroll-thin pointer-events-auto max-h-full w-[22rem] max-w-full overflow-y-auto rounded-xl bg-white/95 p-3 shadow-pop ring-1 ring-black/5 backdrop-blur-md" data-plan-ui data-testid="find-similar">
        {body}
      </div>
    </RailSlot>
  );
}
