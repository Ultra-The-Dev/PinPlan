"use client";
import { CLOSET_KINDS, LAYERS } from "./catalog";
import { downloadBlob, slug } from "./download";
import { runLengthFt } from "./geometry";
import { renderSheet, symbolDataUrl } from "./renderSheet";
import { wireColor } from "./symbols";
import { computeTakeoff } from "./takeoff";
import type { Closet, DeviceType, Layer, Marker, Project, Run, Sheet } from "./types";

interface Data {
  project: Project;
  sheets: Sheet[];
  markers: Marker[];
  runs: Run[];
  closets: Closet[];
  catalog: DeviceType[];
}


/**
 * Export every marked-up sheet as a PDF with legend and per-floor count box.
 * mode "takeoff": all layers, counts. mode "crew": selected layers, wiring schedule, no prices.
 */
export async function exportSheetsPdf(data: Data, opts: { mode: "takeoff" | "crew"; layers?: Layer[] | null; onProgress?: (s: string) => void }) {
  const { renderSheetsPdf } = await import("@/components/SheetsPdf");
  const takeoff = computeTakeoff(data);
  const types = new Map(data.catalog.map((d) => [d.id, d]));
  const layers = opts.layers ?? null;
  const show = (l: Layer) => !layers || layers.includes(l);
  const pages = [];
  for (const sheet of data.sheets) {
    opts.onProgress?.(`Rendering ${sheet.name}…`);
    const canvas = await renderSheet(sheet, data, { layers, labels: opts.mode === "crew" });
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    canvas.width = canvas.height = 0;
    const f = takeoff.floors.find((x) => x.sheetId === sheet.id)!;

    const usedTypes = new Set(data.markers.filter((m) => m.sheetId === sheet.id).map((m) => m.deviceTypeId));
    const legend: { iconDataUrl?: string; color?: string; name: string }[] = [];
    for (const d of data.catalog) {
      if (!usedTypes.has(d.id) || !show(d.category)) continue;
      legend.push({ iconDataUrl: symbolDataUrl(d), name: d.name });
    }
    const ledTypes = new Set(data.runs.filter((r) => r.sheetId === sheet.id && r.kind !== "wire").map((r) => r.deviceTypeId ?? ""));
    if (show("lighting")) for (const id of ledTypes) legend.push({ color: types.get(id)?.color ?? "#d97706", name: types.get(id)?.name ?? "LED strip" });
    if (show("wiring")) {
      const wts = new Set(data.runs.filter((r) => r.sheetId === sheet.id && r.kind === "wire").map((r) => r.wireType ?? ""));
      for (const w of wts) legend.push({ color: wireColor(w), name: `${w || "Wire"} home run` });
    }
    if (show("infrastructure"))
      for (const k of CLOSET_KINDS) if (f.closets[k.id]) legend.push({ color: k.color, name: k.name });

    const counts: { name: string; value: string; note?: string }[] = [];
    for (const d of data.catalog) {
      const n = f.counts[d.id];
      if (!n || !show(d.category)) continue;
      counts.push({ name: d.name.replace(/ \(.*\)$/, ""), value: String(n), note: f.tentative[d.id] ? `(${f.tentative[d.id]}?)` : undefined });
    }
    if (show("lighting") && (f.ledZones || f.ledTotalFt)) {
      for (const [id, ft] of Object.entries(f.ledFt)) counts.push({ name: types.get(id)?.name.replace("LED strip — ", "LED ") ?? "LED", value: `${ft} LF` });
      counts.push({ name: "LED zones", value: String(f.ledZones) });
      counts.push({ name: "LED total", value: `${f.ledTotalFt} LF` });
    }
    if (show("wiring")) for (const [w, ft] of Object.entries(f.wireFt)) counts.push({ name: `${w} cable`, value: `${ft} ft`, note: `(${f.wireRuns[w]} runs)` });

    let table: { headers: string[]; rows: string[][] } | undefined;
    if (opts.mode === "crew") {
      const closetName = (id?: string | null) => data.closets.find((c) => c.id === id)?.name ?? "—";
      const rows = data.markers
        .filter((m) => m.sheetId === sheet.id && show(types.get(m.deviceTypeId)?.category ?? "security"))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((m) => {
          const run = data.runs.find((r) => r.kind === "wire" && r.markerId === m.id);
          const len = run ? runLengthFt(run) : null;
          return [
            m.label + (m.tentative ? " ?" : ""),
            types.get(m.deviceTypeId)?.name ?? "",
            m.room || "",
            m.mount,
            m.wireType,
            closetName(m.closetId),
            len != null ? `${len} ft` : "",
            m.notes || "",
          ];
        });
      table = { headers: ["Label", "Device", "Room", "Mount", "Wire", "Home run to", "Cable", "Notes"], rows };
    }
    pages.push({ name: sheet.name, imageDataUrl, width: sheet.width, height: sheet.height, legend, counts, table });
  }
  opts.onProgress?.("Building PDF…");
  const layerNames = layers ? LAYERS.filter((l) => layers.includes(l.id)).map((l) => l.name).join(", ") : "All layers";
  const title = `${data.project.address || "Project"}${data.project.clientName ? ` — ${data.project.clientName}` : ""}`;
  const blob = await renderSheetsPdf({
    title,
    subtitle: `${opts.mode === "crew" ? `Crew wiring sheets · ${layerNames}` : "Marked-up plan"} · ${new Date().toLocaleDateString()}`,
    pages,
  });
  downloadBlob(blob, `${slug(data.project.address || "project")}-${opts.mode === "crew" ? "crew-wiring" : "marked-plans"}.pdf`);
}
