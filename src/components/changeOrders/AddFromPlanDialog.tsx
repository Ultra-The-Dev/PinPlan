"use client";
// "Add from plan": devices that are tentative (?) or were placed after the last proposal / estimate went out, grouped
// by sheet, ready to price as change order lines.
import { Check, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { planCandidates } from "@/lib/changeOrders";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import type { ChangeOrder, DeviceType, Marker, Project, Sheet } from "@/lib/types";
import Modal from "../ui/Modal";

const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** When the job was last priced for the client: the newest sent quote, Billdu document or proposal. */
async function lastPricedAt(project: Project, signedIn: boolean): Promise<string | null> {
  const dates: string[] = [];
  for (const d of project.billduDocs ?? []) if (d.createdAt) dates.push(d.createdAt);
  try {
    const docs = await db().salesDocs.where("projectId").equals(project.id).toArray();
    for (const d of docs) if (!d.deleted && d.kind === "quote" && d.status !== "draft") dates.push(d.sentAt || d.issueDate || d.createdAt);
  } catch {
    /* no documents table yet */
  }
  if (supabaseConfigured && signedIn) {
    try {
      const { listProposals } = await import("@/lib/proposalCloud");
      for (const p of await listProposals(project.id)) if (p.snapshot?.kind !== "review") dates.push(p.created_at);
    } catch {
      /* offline: the local dates are enough */
    }
  }
  const valid = dates.filter((d) => Number.isFinite(Date.parse(d)));
  return valid.length ? valid.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
}

export default function AddFromPlanDialog(props: {
  project: Project;
  sheets: Sheet[];
  markers: Marker[];
  catalog: DeviceType[];
  cos: ChangeOrder[];
  current: ChangeOrder;
  onAdd: (markers: Marker[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { project, sheets, markers, catalog, cos, current } = props;
  const signedIn = useSyncStatus((s) => s.signedIn);
  const [since, setSince] = useState<string | null>(null);
  const [sinceLoaded, setSinceLoaded] = useState(false);
  const [picked, setPicked] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void lastPricedAt(project, signedIn).then((d) => {
      if (cancelled) return;
      setSince(d);
      setSinceLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [project, signedIn]);

  const already = useMemo(() => new Set(current.markerIds ?? []), [current.markerIds]);
  const groups = useMemo(
    () => planCandidates(markers, sheets, since, cos, current.id).map((g) => ({ ...g, items: g.items.filter((i) => !already.has(i.marker.id)) })).filter((g) => g.items.length),
    [markers, sheets, since, cos, current.id, already],
  );
  // Preselect everything not already on another change order.
  const defaults = useMemo(() => new Set(groups.flatMap((g) => g.items.filter((i) => !i.onCo).map((i) => i.marker.id))), [groups]);
  const sel = picked ?? defaults;
  const typeName = (id: string) => catalog.find((d) => d.id === id)?.name ?? t("Device");
  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(sel);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setPicked(next);
  };
  const chosen = markers.filter((m) => sel.has(m.id));

  return (
    <Modal onClose={props.onClose} labelledBy="co-add-from-plan-title" className="fixed inset-0 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="card animate-in flex max-h-[88vh] w-full max-w-lg flex-col rounded-b-none shadow-pop sm:rounded-b-xl">
        <div className="flex items-start gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0 flex-1">
            <h2 id="co-add-from-plan-title" className="text-base font-semibold">
              {t("Add from plan")}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{t("Tentative (?) devices, and devices placed after the job was last priced.")}</p>
          </div>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-1" onClick={props.onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm">
          <label htmlFor="co-since" className="text-slate-500">
            {t("New since")}
          </label>
          <input
            id="co-since"
            type="date"
            className="input h-8 w-auto py-0"
            value={dayOf(since)}
            onChange={(e) => {
              setPicked(null);
              setSince(e.target.value ? `${e.target.value}T23:59:59.999Z` : null);
            }}
          />
          {sinceLoaded && !since && <span className="text-xs text-slate-500">{t("No proposal or quote sent yet — showing tentative devices")}</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              <MapPin className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              {t("No tentative or new devices on the plan. Mark devices with “?” (tentative) or place them after the estimate, then come back.")}
            </div>
          ) : (
            groups.map((g) => {
              const ids = g.items.map((i) => i.marker.id);
              const all = ids.every((id) => sel.has(id));
              return (
                <section key={g.sheet.id} className="border-b border-slate-100 last:border-0">
                  <label className="sticky top-0 flex items-center gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={all} onChange={(e) => toggle(ids, e.target.checked)} aria-label={t("All on {sheet}", { sheet: g.sheet.name })} />
                    {g.sheet.name}
                    <span className="font-normal text-slate-400">{g.items.length}</span>
                  </label>
                  <ul>
                    {g.items.map((i) => (
                      <li key={i.marker.id}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-slate-50">
                          <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={sel.has(i.marker.id)} onChange={(e) => toggle([i.marker.id], e.target.checked)} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {i.marker.label || typeName(i.marker.deviceTypeId)} <span className="font-normal text-slate-500">· {typeName(i.marker.deviceTypeId)}</span>
                            </div>
                            {i.marker.room && <div className="truncate text-xs text-slate-500">{i.marker.room}</div>}
                          </div>
                          {i.tentative && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">{t("? tentative")}</span>}
                          {i.isNew && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">{t("new")}</span>}
                          {i.onCo && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{t("on {code}", { code: i.onCo })}</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 p-3">
          <span className="mr-auto text-sm text-slate-500">{t("{n} selected", { n: chosen.length })}</span>
          <button className="btn" onClick={props.onClose}>
            {t("Cancel")}
          </button>
          <button className="btn btn-brand" disabled={!chosen.length} onClick={() => props.onAdd(chosen)}>
            <Check /> {chosen.length ? t.tn("Add {n} device", "Add {n} devices", chosen.length) : t("Add devices")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
