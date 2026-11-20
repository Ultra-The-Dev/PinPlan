"use client";
import { Cable, Download, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";
import PanelSchedule from "./PanelSchedule";
import PortSchedule from "./PortSchedule";
import { PANEL_KINDS } from "@/lib/catalog";
import { downloadText, slug } from "@/lib/download";
import { exportSheetsPdf } from "@/lib/exportSheets";
import { runLengthFt } from "@/lib/geometry";
import { useEditor } from "@/lib/store";
import { computeTakeoff, toCsv } from "@/lib/takeoff";
import { cableSummary, markerCables, productIdFor, productTitle } from "@/lib/products";
import { hasTrade, primaryTrade, tradeCategories, tradeClosetKinds, tradeLayers, tradeVocab } from "@/lib/trades";
import { useTrades } from "@/lib/useTrades";
import type { Layer, Marker } from "@/lib/types";

/** Takeoff → Wiring sheets, for the crew: no prices. Marked PDFs by layer plus the home-run schedule. */
export default function CrewTab() {
  const t = useT();
  const { project, sheets, markers, runs, closets, catalog, products, autoHomeRuns } = useEditor();
  // Layers follow the company's trades (low voltage only: the original list). Kept as the ones switched off, so the
  // list can change when the trades load.
  const trades = useTrades();
  const LAYERS = tradeLayers(trades);
  const vocab = tradeVocab(trades);
  const [off, setOff] = useState<Layer[]>([]);
  const layers = LAYERS.map((l) => l.id).filter((l) => !off.includes(l));
  const setLayers = (f: (ls: Layer[]) => Layer[]) => {
    const next = f(layers);
    setOff(LAYERS.map((l) => l.id).filter((l) => !next.includes(l)));
  };
  const lowVoltage = primaryTrade(trades).id === "lowvoltage";
  const oneLayerButtons: Layer[] = lowVoltage ? ["security", "network", "audio", "video", "lighting", "shades"] : tradeCategories(trades).map((c) => c.id);
  const closetLayers: Layer[] = [...new Set(tradeClosetKinds(trades).map((k) => k.category as Layer))];
  const [busy, setBusy] = useState<string | null>(null);
  const takeoff = useMemo(() => computeTakeoff({ sheets, markers, runs, closets }), [sheets, markers, runs, closets]);
  if (!project) return null;
  const typeName = (id: string) => catalog.find((d) => d.id === id)?.name ?? id;
  // What the crew installs: the device's product (its own, else the job's choice), else the device type.
  const deviceName = (m: Marker) => {
    const p = products.find((x) => x.id === productIdFor(m, project!, products));
    return p ? `${productTitle(p)} (${typeName(m.deviceTypeId)})` : typeName(m.deviceTypeId);
  };
  const closetName = (id?: string | null) => closets.find((c) => c.id === id)?.name ?? "—";
  const sheetName = (id: string) => sheets.find((s) => s.id === id)?.name ?? "";
  const order = new Map(sheets.map((s) => [s.id, s.order]));
  const schedule = markers
    .filter((m) => catalog.find((d) => d.id === m.deviceTypeId)?.kind === "device")
    .sort((a, b) => (order.get(a.sheetId)! - order.get(b.sheetId)!) || a.label.localeCompare(b.label))
    .map((m) => {
      const run = runs.find((r) => r.kind === "wire" && r.markerId === m.id);
      return { m, len: run ? runLengthFt(run) : null, drawn: !!run };
    });
  const noCloset = schedule.filter((s) => !s.m.closetId && markerCables(s.m).length > 0).length;

  function csv() {
    const rows: (string | number)[][] = [["Floor", "Label", "Device", "Room", "Mount", "Wire", "Home run to", "Cable ft", "Tentative", "Notes"]];
    for (const { m, len } of schedule) rows.push([sheetName(m.sheetId), m.label, deviceName(m), m.room, m.mount, cableSummary(markerCables(m)), closetName(m.closetId), len ?? "", m.tentative ? "yes" : "", m.notes]);
    downloadText(toCsv(rows), `${slug(project!.address)}-home-runs.csv`);
  }

  async function pdf(oneLayer?: Layer) {
    setBusy(t("Preparing…"));
    try {
      await exportSheetsPdf(
        { project: project!, sheets, markers, runs, closets, catalog },
        { mode: "crew", layers: oneLayer ? [...new Set<Layer>([oneLayer, ...closetLayers, "wiring"])] : layers, onProgress: setBusy, trades },
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
        <div>
          <h2 className="page-title">{t("Wiring sheets")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("Where each wire goes and which type — no prices. Share the PDF with the crew pulling wire.")}</p>
        </div>

        <div className="card space-y-3 p-4">
          <div className="section-title">{t("Layers in the PDF")}</div>
          <div className="flex flex-wrap gap-2">
            {LAYERS.map((l) => (
              <label key={l.id} className={`chip cursor-pointer px-3 py-1.5 text-sm ring-1 ${layers.includes(l.id) ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-white text-slate-500 ring-slate-200"}`}>
                <input type="checkbox" className="sr-only" checked={layers.includes(l.id)} onChange={() => setLayers((ls) => (ls.includes(l.id) ? ls.filter((x) => x !== l.id) : [...ls, l.id]))} />
                {t(l.name)}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={!!busy || !sheets.length} onClick={() => pdf()}>
              <FileText /> {busy ?? t("Wiring PDF (selected layers)")}
            </button>
            {oneLayerButtons.map((l) => (
              <button key={l} className="btn" disabled={!!busy || !sheets.length} onClick={() => pdf(l)}>
                {t("{layer} only", { layer: t(LAYERS.find((x) => x.id === l)?.name ?? l) })}
              </button>
            ))}
            <button className="btn" onClick={csv}>
              <Download /> {t("Home-run CSV")}
            </button>
            <button
              className="btn"
              onClick={async () => {
                const n = await autoHomeRuns();
                toast(n ? t.tn("Drew {n} home run", "Drew {n} home runs", n) : lowVoltage ? t("Place an equipment closet first") : t("Place a {closet} and assign devices to it first", { closet: t(vocab.closet) }), n ? "success" : "info");
              }}
            >
              <Cable /> {t("Auto-draw all home runs")}
            </button>
          </div>
          {noCloset > 0 && <p className="text-sm text-amber-700">{t.tn("{n} device has no home-run {closet} assigned.", "{n} devices have no home-run {closet} assigned.", noCloset, { closet: t(vocab.closet) })}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(takeoff.total.wireFt).map(([w, ft]) => (
            <div key={w} className="card p-4">
              <div className="text-xs font-medium text-slate-500">{w}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {ft}
                <span className="ml-1 text-sm font-medium text-slate-400">{t("ft")}</span>
              </div>
              <div className="text-xs text-slate-500">{t.tn("{n} home run", "{n} home runs", takeoff.total.wireRuns[w] ?? 0)}</div>
            </div>
          ))}
        </div>

        <div className="card overflow-x-auto">
          <table className="tbl min-w-[640px] whitespace-nowrap">
            <thead>
              <tr>
                <th>{t("Floor")}</th>
                <th>{t("Label")}</th>
                <th>{t("Device")}</th>
                <th>{t("Room")}</th>
                <th>{t("Cables")}</th>
                <th>{lowVoltage ? t("Home run to") : ((c) => `${c[0].toUpperCase()}${c.slice(1)}`)(t(vocab.closet))}</th>
                <th className="text-right">{t("Cable")}</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map(({ m, len, drawn }) => (
                <tr key={m.id}>
                  <td>{sheetName(m.sheetId)}</td>
                  <td className="font-medium">
                    {m.label}
                    {m.tentative && <span className="ml-1 text-amber-700">?</span>}
                  </td>
                  <td>{deviceName(m)}</td>
                  <td>{m.room}</td>
                  <td>{cableSummary(markerCables(m))}</td>
                  <td>{closetName(m.closetId)}</td>
                  <td className="text-right tabular-nums">{len != null ? t("{n} ft", { n: Math.round(len * 10) / 10 }) : drawn ? t("no scale") : "—"}</td>
                </tr>
              ))}
              {!schedule.length && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    {t("No devices placed yet.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(hasTrade(trades, "electrical") || closets.some((c) => PANEL_KINDS.includes(c.kind))) && <PanelSchedule />}
        {(hasTrade(trades, "lowvoltage") || closets.some((c) => c.kind === "equipment" || c.kind === "switch" || c.kind === "rack")) && <PortSchedule />}
      </div>
    </div>
  );
}
