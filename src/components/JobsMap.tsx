"use client";
// Jobs on a map (OpenStreetMap tiles via Leaflet, no API key). A job's location comes from its first geotagged
// photo, or is set on its Job tab. Filter by status and label; the list beside the map flies to a job's pin.
import { PROJECT_STATUS_HEX } from "@/lib/statusStyle";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db";
import { filterJobs, isPlaced, jobLabelList, jobTitle, labelOptions, statusCounts } from "@/lib/jobFilters";
import type { Project, ProjectStatus } from "@/lib/types";

const COLOR: Record<ProjectStatus, string> = { ...PROJECT_STATUS_HEX };
const STATUSES = Object.keys(COLOR) as ProjectStatus[];

/** Popup body built with DOM nodes (job text is user input, so never innerHTML). */
function popup(j: Project): HTMLElement {
  const div = document.createElement("div");
  div.style.minWidth = "160px";
  const title = document.createElement("div");
  title.textContent = jobTitle(j, "Job");
  title.style.fontWeight = "600";
  const sub = document.createElement("div");
  sub.textContent = [j.address ? j.clientName : "", j.status].filter(Boolean).join(" · ");
  sub.style.color = "#64748b";
  div.append(title, sub);
  const labels = jobLabelList(j);
  if (labels.length) {
    const l = document.createElement("div");
    l.textContent = labels.join(" · ");
    l.style.marginTop = "2px";
    l.style.fontSize = "11px";
    div.append(l);
  }
  const a = document.createElement("a");
  a.href = `/project?id=${encodeURIComponent(j.id)}`;
  a.textContent = "Open job →";
  a.style.display = "inline-block";
  a.style.marginTop = "6px";
  a.style.fontWeight = "600";
  div.append(a);
  return div;
}

export default function JobsMap() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, L.CircleMarker>());
  const [jobs, setJobs] = useState<Project[] | null>(null);
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    void db()
      .projects.toArray()
      .then((ps) => setJobs(ps.filter((p) => !p.deleted)));
  }, []);
  const live = useMemo(() => jobs ?? [], [jobs]);
  const labels = useMemo(() => labelOptions(live), [live]);
  // Status badges count jobs under the current label filter, so they match what picking that status would show.
  const counts = useMemo(() => statusCounts(filterJobs(live, { label })), [live, label]);
  const shown = useMemo(() => filterJobs(live, { statuses, label }), [live, statuses, label]);
  const placed = useMemo(() => shown.filter(isPlaced).sort((a, b) => jobTitle(a).localeCompare(jobTitle(b))), [shown]);
  const unplaced = shown.filter((j) => !isPlaced(j));
  const filtered = statuses.length > 0 || !!label;
  const loaded = jobs !== null;

  // Create the map once.
  useEffect(() => {
    if (!el.current || !loaded) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    map.setView([40.73, -73.95], 9);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
    };
  }, [loaded]);

  // Redraw pins whenever the filtered set changes, and fit them.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    const pts: L.LatLngExpression[] = [];
    for (const j of placed) {
      const ll: L.LatLngExpression = [j.lat!, j.lng!];
      pts.push(ll);
      const m = L.circleMarker(ll, { radius: 9, color: "#fff", weight: 2, fillColor: COLOR[j.status] ?? "#64748b", fillOpacity: 1 }).addTo(layer);
      m.bindPopup(popup(j));
      m.on("click", () => setSelected(j.id));
      markersRef.current.set(j.id, m);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }, [placed]);

  const flyTo = (j: Project) => {
    const map = mapRef.current;
    const m = markersRef.current.get(j.id);
    if (!map || !m) return;
    setSelected(j.id);
    const ll = L.latLng(j.lat!, j.lng!);
    if (map.getZoom() >= 16 && map.getBounds().pad(-0.2).contains(ll)) {
      m.openPopup();
      return;
    }
    map.once("moveend", () => m.openPopup());
    map.flyTo(ll, Math.max(map.getZoom(), 16), { duration: 0.6 });
  };
  const toggleStatus = (s: ProjectStatus) => setStatuses((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));
  const chip = (on: boolean) => `chip px-2.5 py-1 ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="page-title">Map</h1>
        <p className="mt-1 text-sm text-slate-500">
          {placed.length} job{placed.length === 1 ? "" : "s"} on the map{filtered ? " (filtered)" : ""} · location comes from the first photo with GPS, or set it on the job’s Job tab.
        </p>
      </div>
      {loaded && live.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter jobs">
          {STATUSES.map((s) => (
            <button key={s} className={`${chip(statuses.includes(s))} capitalize`} aria-pressed={statuses.includes(s)} onClick={() => toggleStatus(s)}>
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: COLOR[s] }} />
              {s} <span className="opacity-60">{counts[s]}</span>
            </button>
          ))}
          {labels.length > 0 && <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />}
          {labels.slice(0, 16).map((l) => (
            <button key={l} className={chip(label === l)} aria-pressed={label === l} onClick={() => setLabel((x) => (x === l ? "" : l))}>
              {l}
            </button>
          ))}
          {filtered && (
            <button className="chip px-2.5 py-1 text-brand-600 hover:underline" onClick={() => { setStatuses([]); setLabel(""); }}>
              Clear
            </button>
          )}
        </div>
      )}
      <div className="grid min-h-[420px] flex-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div ref={el} className="card relative z-0 min-h-[420px] overflow-hidden" />
        <div className="card flex max-h-[60vh] min-h-0 flex-col overflow-hidden lg:max-h-none">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">On the map · {placed.length}</div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {placed.map((j) => (
              <li key={j.id}>
                <button className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${selected === j.id ? "bg-slate-100" : ""}`} onClick={() => flyTo(j)}>
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[j.status] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{jobTitle(j)}</span>
                    <span className="block truncate text-xs text-slate-500">{[j.address ? j.clientName : "", j.status, ...jobLabelList(j)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
            {loaded && placed.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">{filtered ? "No placed jobs match these filters." : "No jobs on the map yet."}</li>}
          </ul>
        </div>
      </div>
      {unplaced.length > 0 && (
        <p className="text-sm text-slate-500">
          Not on the map yet:{" "}
          {unplaced.slice(0, 8).map((j, i) => (
            <span key={j.id}>
              {i > 0 && ", "}
              <Link className="text-brand-600 hover:underline" href={`/project?id=${j.id}&tab=info`}>
                {jobTitle(j)}
              </Link>
            </span>
          ))}
          {unplaced.length > 8 ? ` and ${unplaced.length - 8} more` : ""}
        </p>
      )}
    </div>
  );
}
