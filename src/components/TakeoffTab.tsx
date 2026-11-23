"use client";
import { Cable, Camera, Download, FileText, Flame, Lightbulb, Plug, Speaker, ToggleRight, Tv, Wifi, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { openingsSummary, type OpeningsCount } from "@/lib/alarmSensors";
import { CLOSET_KINDS } from "@/lib/catalog";
import { allCategoriesFor, hasTrade, primaryTrade, tradeCategory, tradeClosetKinds, tradeVocab } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import { downloadText, slug } from "@/lib/download";
import { exportSheetsPdf } from "@/lib/exportSheets";
import { db } from "@/lib/db";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { computeTakeoff, countOf, takeoffCsv, type TakeoffBucket } from "@/lib/takeoff";
import { toast } from "@/lib/toast";
import { pinLabel, sumQty } from "@/lib/markerCount";
import { msg, t as tr, useT } from "@/lib/i18n";
import OrderList from "./OrderList";
import PlanReviewPanel from "./PlanReviewPanel";
import { CLIENT_LAYERS } from "@/lib/proposalCloud";
import { useJobNav } from "./nav/useJobNav";
import { tourAnchor } from "@/lib/tour/anchors";

// Wiring sheets (home-run schedule and crew PDFs, no prices) used to be the Crew tab.
const CrewTab = dynamic(() => import("./CrewTab"), { loading: () => <div className="p-6 text-slate-500">{tr("Loading…")}</div> });

const VIEWS = [
  { id: "counts", label: msg("Counts") },
  { id: "wiring", label: msg("Wiring sheets") },
] as const;

/** Takeoff: the counts, plus the wiring sheets for the crew (?view=wiring). */
export default function TakeoffTab({ view: asked }: { view?: string | null }) {
  const t = useT();
  const { setParam } = useJobNav();
  const view = asked === "wiring" ? "wiring" : "counts";
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 justify-center border-b border-slate-200 bg-white px-3 py-2">
        <div className="seg" role="tablist" aria-label={t("Takeoff view")}>
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={`tab ${view === v.id ? "tab-active" : ""}`} onClick={() => setParam("view", v.id === "counts" ? null : v.id)}>
              {t(v.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">{view === "wiring" ? <CrewTab /> : <TakeoffCounts />}</div>
    </div>
  );
}

/** Openings: "Doors 14 · Windows 22" per floor and in total, and the alarm sensors on them once there are any
 *  (docs/find-similar.md, "Alarm sensors from openings"). Only from placed devices. */
function OpeningsCard({ takeoff, catalog }: { takeoff: ReturnType<typeof computeTakeoff>; catalog: Parameters<typeof openingsSummary>[1] }) {
  const t = useT();
  const s = useMemo(() => openingsSummary(takeoff, catalog), [takeoff, catalog]);
  if (!s.hasOpenings && !s.hasSensors) return null;
  const n = (v: number) => <span className="font-semibold text-slate-900 tabular-nums">{v}</span>;
  const line = (c: OpeningsCount) => (
    <>
      <span className="whitespace-nowrap">
        {t("Doors")} {n(c.doors)} · {t("Windows")} {n(c.windows)}
      </span>
      {s.hasSensors && (
        <span className="block text-xs text-slate-500 sm:ml-3 sm:inline">
          {t("Door contacts")} {n(c.doorContacts)} · {t("Window contacts")} {n(c.windowContacts)} · {t("Glass-break")} {n(c.glassBreaks)}
        </span>
      )}
    </>
  );
  const rows = s.floors.filter((f) => Object.values(f.counts).some(Boolean));
  return (
    <section className="card mb-5 p-4" data-testid="takeoff-openings">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{t("Openings")}</h3>
      <ul className="space-y-1.5 text-sm text-slate-600">
        {rows.length > 1 &&
          rows.map((f) => (
            <li key={f.sheetId} className="flex flex-col gap-x-3 sm:flex-row">
              <span className="w-32 shrink-0 truncate font-medium text-slate-700">{f.name}</span>
              <span>{line(f.counts)}</span>
            </li>
          ))}
        <li className="flex flex-col gap-x-3 sm:flex-row">
          <span className="w-32 shrink-0 font-semibold text-slate-900">{t("Total")}</span>
          <span>{line(s.total)}</span>
        </li>
      </ul>
    </section>
  );
}

function TakeoffCounts() {
  const t = useT();
  const st = useEditor();
  const { project, sheets, markers, runs, closets, catalog } = st;
  const takeoff = useMemo(() => computeTakeoff({ sheets, markers, runs, closets }), [sheets, markers, runs, closets]);
  const [busy, setBusy] = useState<string | null>(null);
  const [clientBusy, setClientBusy] = useState<string | null>(null);
  const [withMarkups, setWithMarkups] = useState(true);
  // Plan reviews go to the client: office work, like proposals.
  const office = can(useRole(), "prices");
  const trades = useTrades();
  if (!project) return null;
  // Low voltage keeps its original layout; other trades get their own summary cards and wording.
  const lowVoltage = primaryTrade(trades).id === "lowvoltage";
  const lvEnabled = hasTrade(trades, "lowvoltage");
  const vocab = tradeVocab(trades);
  const categories = allCategoriesFor(trades);
  const closetKinds = [...tradeClosetKinds(trades), ...CLOSET_KINDS.filter((k) => !tradeClosetKinds(trades).some((x) => x.id === k.id) && cols0(takeoff).some((b) => b.closets[k.id]))];
  const cols: { name: string; b: TakeoffBucket }[] = [...takeoff.floors.map((f) => ({ name: f.name, b: f })), { name: "Total", b: takeoff.total }];

  const cell = (v: number, tent = 0, unit = "") =>
    v || tent ? (
      <>
        {v ? `${v}${unit}` : "—"}
        {tent ? <span className="ml-1 text-xs text-amber-700">({t("{n} optional", { n: `${tent}${unit}` })})</span> : null}
      </>
    ) : (
      <span className="text-slate-300">—</span>
    );

  const deviceRows = catalog.filter((d) => d.kind === "device" && cols.some((c) => c.b.counts[d.id]));
  const ledRows = catalog.filter((d) => d.kind === "led" && cols.some((c) => c.b.ledFt[d.id] || c.b.ledTentativeFt[d.id]));
  const wireTypes = Array.from(new Set(cols.flatMap((c) => Object.keys(c.b.wireRuns))));
  const tentativeList = markers.filter((m) => m.tentative);
  const inCategory = (cat: string) => catalog.filter((d) => d.category === cat && d.kind === "device").map((d) => d.id);
  const catCount = (cat: string) => countOf(takeoff.total, inCategory(cat));
  const catTentative = (cat: string) => inCategory(cat).reduce((n, id) => n + (takeoff.total.tentative[id] ?? 0), 0);
  const circuitCount = new Set(runs.filter((r) => r.kind === "wire" && r.circuit).map((r) => `${r.closetId ?? ""}|${r.circuit?.number?.trim() || r.id}`)).size;
  const wireFt = Math.round(Object.values(takeoff.total.wireFt).reduce((a, b) => a + b, 0));
  const wireRunCount = Object.values(takeoff.total.wireRuns).reduce((a, b) => a + b, 0);

  async function pdf() {
    setBusy(t("Preparing…"));
    try {
      // Plan markups (redlines) on top, if asked; private ones never print.
      const markups = withMarkups ? await db().planMarkups.where("projectId").equals(project!.id).toArray() : null;
      await exportSheetsPdf({ project: project!, sheets, markers, runs, closets, catalog }, { mode: "takeoff", onProgress: setBusy, trades, markups });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function clientPdf() {
    setClientBusy(t("Preparing…"));
    try {
      await exportSheetsPdf({ project: project!, sheets, markers, runs, closets, catalog }, { mode: "client", layers: CLIENT_LAYERS, onProgress: setClientBusy, business: st.settings?.business.name, trades });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setClientBusy(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="page-title">{t("Takeoff")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("Counts come from the devices and wire you've drawn.")} <span className="chip bg-amber-50 text-amber-700">n?</span> = {t("optional, listed separately.")}</p>
          </div>
          <button className="btn" onClick={() => downloadText(takeoffCsv(takeoff, catalog), `${slug(project.address)}-takeoff.csv`)}>
            <Download /> CSV
          </button>
          <label className="flex h-9 cursor-pointer items-center gap-1.5 text-sm text-slate-600 pointer-coarse:h-11" title={t("Draw plan markups (redlines, clouds, notes) on the PDF. Private markups never print.")}>
            <input type="checkbox" className="accent-brand-600" checked={withMarkups} onChange={(e) => setWithMarkups(e.target.checked)} data-testid="pdf-markups" />
            {t("Include markups")}
          </label>
          <button className="btn btn-brand" disabled={!!busy || !sheets.length} onClick={pdf}>
            <FileText /> {busy ?? t("Marked-up plans PDF")}
          </button>
        </div>

        {office && (
        <div className="mb-5">
          <PlanReviewPanel onPdf={() => void clientPdf()} pdfBusy={clientBusy} />
        </div>
        )}

        {lowVoltage ? (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard icon={Camera} label={t("Cameras")} value={countOf(takeoff.total, ["cam-indoor", "cam-outdoor"])} sub={t("{n} outdoor", { n: takeoff.total.counts["cam-outdoor"] ?? 0 })} color="text-red-600 bg-red-50" />
          <SummaryCard icon={Wifi} label={t("Wi-Fi APs")} value={takeoff.total.counts["wap"] ?? 0} color="text-blue-600 bg-blue-50" />
          <SummaryCard icon={Speaker} label={t("Speakers")} value={takeoff.total.counts["speaker"] ?? 0} sub={takeoff.total.tentative["speaker"] ? t("{n} optional", { n: takeoff.total.tentative["speaker"] }) : undefined} color="text-violet-600 bg-violet-50" />
          <SummaryCard icon={Tv} label={t("TVs")} value={takeoff.total.counts["tv"] ?? 0} color="text-cyan-600 bg-cyan-50" />
          <SummaryCard icon={Lightbulb} label="LED" value={`${takeoff.total.ledTotalFt}`} unit={t("LF")} sub={t.tn("{n} zone", "{n} zones", takeoff.total.ledZones)} color="text-amber-600 bg-amber-50" />
          <SummaryCard icon={Cable} label={t("Cable")} value={`${Math.round(Object.values(takeoff.total.wireFt).reduce((a, b) => a + b, 0))}`} unit={t("ft")} sub={t.tn("{n} wire run", "{n} wire runs", Object.values(takeoff.total.wireRuns).reduce((a, b) => a + b, 0))} color="text-slate-600 bg-slate-100" />
        </div>
        ) : primaryTrade(trades).id === "electrical" ? (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard icon={Plug} label={t(tradeCategory("power", trades).name)} value={catCount("power")} sub={catTentative("power") ? t("{n} optional", { n: catTentative("power") }) : undefined} color="text-orange-700 bg-orange-50" />
          <SummaryCard icon={ToggleRight} label={t("Switches")} value={catCount("switching")} color="text-indigo-600 bg-indigo-50" />
          <SummaryCard icon={Lightbulb} label={t("Fixtures")} value={catCount("lighting")} sub={takeoff.total.ledTotalFt ? t("+ {n} LF linear", { n: takeoff.total.ledTotalFt }) : undefined} color="text-amber-600 bg-amber-50" />
          <SummaryCard icon={Flame} label={t("Life safety")} value={catCount("fire")} color="text-rose-600 bg-rose-50" />
          <SummaryCard icon={Zap} label={t("Circuits")} value={circuitCount} sub={t.tn("{n} panel", "{n} panels", closets.filter((c) => c.kind === "panel" || c.kind === "subpanel").length)} color="text-slate-700 bg-slate-100" />
          <SummaryCard icon={Cable} label={t("Wire")} value={`${wireFt}`} unit={t("ft")} sub={t.tn("{n} wire run", "{n} wire runs", wireRunCount)} color="text-slate-600 bg-slate-100" />
        </div>
        ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {primaryTrade(trades).categories.slice(0, 4).map((c) => (
            <SummaryCard key={c.id} icon={Zap} label={t(c.name)} value={catCount(c.id)} sub={catTentative(c.id) ? t("{n} optional", { n: catTentative(c.id) }) : undefined} color="text-slate-700 bg-slate-100" />
          ))}
          <SummaryCard icon={Cable} label={t(vocab.wire)} value={`${wireFt}`} unit={t("ft")} sub={t("{n} {runs}", { n: wireRunCount, runs: t(vocab.runs).toLowerCase() })} color="text-slate-600 bg-slate-100" />
        </div>
        )}

        <OpeningsCard takeoff={takeoff} catalog={catalog} />

        <div className="card overflow-x-auto" {...tourAnchor("takeoff-table")}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Item")}</th>
                {cols.map((c) => (
                  <th key={c.name} className={`text-right ${c.name === "Total" ? "bg-slate-50" : ""}`}>
                    {c.name === "Total" ? t("Total") : c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const rows = deviceRows.filter((d) => d.category === cat.id);
                if (!rows.length) return null;
                return [
                  <tr key={cat.id}>
                    <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold" style={{ color: cat.color }}>
                      {t(cat.name)}
                    </td>
                  </tr>,
                  ...rows.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      {cols.map((c) => (
                        <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                          {cell(c.b.counts[d.id] ?? 0, c.b.tentative[d.id] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  )),
                ];
              })}
              {(lvEnabled || ledRows.length > 0) && (
              <tr>
                <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold text-amber-700">
                  {lvEnabled ? "LED" : t("Linear lighting (LF)")}
                </td>
              </tr>
              )}
              {ledRows.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  {cols.map((c) => (
                    <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                      {cell(c.b.ledFt[d.id] ?? 0, c.b.ledTentativeFt[d.id] ?? 0, ` ${t("LF")}`)}
                    </td>
                  ))}
                </tr>
              ))}
              {lvEnabled && (
              <>
              <tr>
                <td>{t("Stair steps")}</td>
                {cols.map((c) => (
                  <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                    {cell(c.b.stairSteps)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>{t("LED zones")}</td>
                {cols.map((c) => (
                  <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                    {cell(c.b.ledZones)}
                  </td>
                ))}
              </tr>
              <tr className="font-semibold">
                <td>{t("LED total")}</td>
                {cols.map((c) => (
                  <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50" : ""}`}>
                    {cell(c.b.ledTotalFt, 0, ` ${t("LF")}`)}
                  </td>
                ))}
              </tr>
              </>
              )}
              {wireTypes.length > 0 && (
                <tr>
                  <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold text-blue-700">
                    {lowVoltage ? t("Wire (home runs)") : t("{wire} ({runs})", { wire: t(vocab.wire), runs: t(vocab.runs).toLowerCase() })}
                  </td>
                </tr>
              )}
              {wireTypes.map((w) => (
                <tr key={w}>
                  <td>{w}</td>
                  {cols.map((c) => (
                    <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                      {c.b.wireRuns[w] ? t.tn("{ft} ft · {n} run", "{ft} ft · {n} runs", c.b.wireRuns[w], { ft: c.b.wireFt[w] ?? 0 }) : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td colSpan={cols.length + 1} className="bg-slate-50 text-xs font-semibold text-green-700">
                  {lowVoltage ? t("Infrastructure") : t("Panels & equipment")}
                </td>
              </tr>
              {closetKinds.map((k) => (
                <tr key={k.id}>
                  <td>{t(k.name)}</td>
                  {cols.map((c) => (
                    <td key={c.name} className={`text-right tabular-nums ${c.name === "Total" ? "bg-slate-50 font-semibold" : ""}`}>
                      {cell(c.b.closets[k.id] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {takeoff.total.unmeasuredRuns > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {t.tn("{n} run has no length yet. Set each sheet's scale or type the LF on the run.", "{n} runs have no length yet. Set each sheet's scale or type the LF on the run.", takeoff.total.unmeasuredRuns)}
          </p>
        )}

        <h3 className="mb-2 mt-6 font-semibold">{t.tn("Optional item ({n})", "Optional items ({n})", sumQty(tentativeList))}</h3>
        {tentativeList.length ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("Label")}</th>
                  <th>{t("Device")}</th>
                  <th>{t("Floor")}</th>
                  <th>{t("Room")}</th>
                  <th>{t("Notes")}</th>
                </tr>
              </thead>
              <tbody>
                {tentativeList.map((m) => (
                  <tr key={m.id}>
                    <td>{pinLabel(m)}</td>
                    <td>{catalog.find((d) => d.id === m.deviceTypeId)?.name}</td>
                    <td>{sheets.find((s) => s.id === m.sheetId)?.name}</td>
                    <td>{m.room}</td>
                    <td>{m.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("None. To make a device optional, select it on the plan and tick Optional item.")}</p>
        )}
        <OrderList />
      </div>
    </div>
  );
}

function cols0(t: { floors: TakeoffBucket[]; total: TakeoffBucket }): TakeoffBucket[] {
  return [...t.floors, t.total];
}

function SummaryCard({ icon: Icon, label, value, unit, sub, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; unit?: string; sub?: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      <div className="h-4 text-xs text-slate-500">{sub}</div>
    </div>
  );
}
