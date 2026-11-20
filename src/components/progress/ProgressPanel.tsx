"use client";
// Crew tab: install progress by floor, category or closet; open issues (tap to see it on the plan); office bulk verify;
// and the as-built PDF. No prices.
import { AlertTriangle, BadgeCheck, FileDown, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER, canSetInstall, issues, progress, progressMarkers, progressTotals, statusOf, type ProgressBy, type ProgressCounts } from "@/lib/installProgress";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { toast } from "@/lib/toast";
import { useTrades } from "@/lib/useTrades";
import { bulkVerify } from "./actions";

const BY: { id: ProgressBy; name: string }[] = [
  { id: "sheet", name: "Floor" },
  { id: "category", name: "Category" },
  { id: "closet", name: "Closet" },
];

export function StatusBar({ c, className = "h-2.5" }: { c: ProgressCounts; className?: string }) {
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${className}`} role="img" aria-label={`${c.pct}% tested`}>
      {c.total > 0 &&
        STATUS_ORDER.filter((s) => c.counts[s] > 0).map((s) => (
          <div key={s} style={{ width: `${(c.counts[s] / c.total) * 100}%`, background: STATUS_COLORS[s] }} title={`${STATUS_LABELS[s]}: ${c.counts[s]}`} />
        ))}
    </div>
  );
}

export default function ProgressPanel() {
  const { project, sheets, markers, runs, closets, catalog, focusOn } = useEditor();
  const trades = useTrades();
  const role = useRole();
  const router = useRouter();
  const [by, setBy] = useState<ProgressBy>("sheet");
  const [busy, setBusy] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const rows = useMemo(() => progress(markers, runs, sheets, catalog, { by, closets, trades }), [markers, runs, sheets, catalog, by, closets, trades]);
  const total = useMemo(() => progressTotals(markers, catalog), [markers, catalog]);
  const open = useMemo(() => issues(markers.filter((m) => !m.tentative), runs.filter((r) => !r.tentative)), [markers, runs]);
  const ready = useMemo(() => progressMarkers(markers, catalog).filter((m) => statusOf(m) === "tested"), [markers, catalog]);
  if (!project) return null;
  const office = canSetInstall(role, "verified");
  const sheetName = (id: string) => sheets.find((s) => s.id === id)?.name ?? "";
  const show = (table: "markers" | "runs", id: string) => {
    focusOn(table, id);
    router.replace(`/project?id=${project.id}&tab=plan`);
  };

  async function asBuilt() {
    setBusy("Preparing…");
    try {
      const { exportAsBuiltPdf } = await import("./asBuilt");
      const s = useEditor.getState();
      await exportAsBuiltPdf({ project: project!, sheets, markers, runs, closets, catalog }, { trades, business: s.settings?.business.name, onProgress: setBusy });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-4 p-4" data-testid="progress-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Install progress</h3>
          <p className="text-sm text-slate-500">Tap devices through rough-in → installed → tested on the plan (Progress → Walk). Quotes and counts don&apos;t change.</p>
        </div>
        <button className="btn btn-primary" onClick={asBuilt} disabled={!!busy || !sheets.length} data-testid="asbuilt-pdf">
          <FileDown /> {busy ?? "As-built PDF"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-3xl font-semibold text-emerald-800 tabular-nums" data-testid="progress-pct">
            {total.pct}%
          </div>
          <div className="text-xs text-slate-500">
            {total.done} of {total.total} devices tested
          </div>
        </div>
        <div className="min-w-[200px] flex-1">
          <StatusBar c={total} className="h-3" />
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="flex items-center gap-1 text-xs text-slate-600">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                {STATUS_LABELS[s]} <span className="font-semibold tabular-nums">{total.counts[s]}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Group progress by">
        {BY.map((b) => (
          <button key={b.id} role="tab" aria-selected={by === b.id} className={`tab ${by === b.id ? "tab-active" : ""}`} onClick={() => setBy(b.id)}>
            {b.name}
          </button>
        ))}
      </div>
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{r.name}</span>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                  {r.total ? (
                    <>
                      {r.done}/{r.total} · <span className="font-semibold text-slate-800">{r.pct}%</span>
                    </>
                  ) : null}
                  {r.runs.total ? <span className="ml-2">wire runs {r.runs.done}/{r.runs.total}</span> : null}
                </span>
              </div>
              {r.total > 0 && <StatusBar c={r} />}
              {r.runs.total > 0 && <StatusBar c={r.runs} className={`h-1.5 ${r.total ? "mt-1 opacity-80" : ""}`} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No devices placed yet.</p>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="text-sm font-semibold">Issues ({open.length})</span>
        </div>
        {open.length ? (
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200" data-testid="progress-issues">
            {open.map((i) => (
              <li key={i.id}>
                <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => show(i.table, i.id)}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS.issue }} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{i.label}</span>
                    {i.note ? <span className="text-sm text-slate-600"> — {i.note}</span> : null}
                    <span className="block text-xs text-slate-400">{[sheetName(i.sheetId), i.by, i.at ? new Date(i.at).toLocaleDateString() : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No issues reported.</p>
        )}
      </div>

      {office && ready.length > 0 && (
        <div className="rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-emerald-700" />
            <span className="flex-1 text-sm font-semibold">Ready to verify ({ready.length})</span>
            <button className="btn btn-sm" onClick={() => setVerifyOpen((o) => !o)}>
              {verifyOpen ? "Hide" : "Review"}
            </button>
          </div>
          {verifyOpen && (
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.length === ready.length} onChange={(e) => setPicked(e.target.checked ? ready.map((m) => m.id) : [])} />
                Select all
              </label>
              <ul className="max-h-64 divide-y divide-emerald-100 overflow-y-auto rounded-lg bg-white ring-1 ring-emerald-100">
                {ready.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm">
                      <input type="checkbox" checked={picked.includes(m.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))} />
                      <span className="font-medium">{m.label}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{[m.room, sheetName(m.sheetId)].filter(Boolean).join(" · ")}</span>
                      {m.install?.by && <span className="text-xs text-slate-400">{m.install.by}</span>}
                    </label>
                  </li>
                ))}
              </ul>
              <button
                className="btn btn-brand"
                disabled={!picked.length || !!busy}
                onClick={async () => {
                  setBusy("Verifying…");
                  try {
                    const n = await bulkVerify(ready.filter((m) => picked.includes(m.id)));
                    toast(`Verified ${n} device${n === 1 ? "" : "s"}`, "success");
                    setPicked([]);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <BadgeCheck /> Mark {picked.length || ""} verified
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
