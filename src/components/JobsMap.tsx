"use client";
// Jobs on a map (OpenStreetMap tiles via Leaflet, no API key). A job's location comes from its first geotagged
// photo, or is set on its Job tab.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import type { Project, ProjectStatus } from "@/lib/types";

const COLOR: Record<ProjectStatus, string> = { estimate: "#d97706", approved: "#c2410c", installed: "#059669" };

export default function JobsMap() {
  const el = useRef<HTMLDivElement>(null);
  const [jobs, setJobs] = useState<Project[] | null>(null);
  useEffect(() => {
    void db()
      .projects.toArray()
      .then((ps) => setJobs(ps.filter((p) => !p.deleted)));
  }, []);
  const placed = (jobs ?? []).filter((j) => j.lat != null && j.lng != null);
  useEffect(() => {
    if (!el.current || !jobs) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    const pts: L.LatLngExpression[] = [];
    for (const j of jobs.filter((x) => x.lat != null && x.lng != null)) {
      const ll: L.LatLngExpression = [j.lat!, j.lng!];
      pts.push(ll);
      const m = L.circleMarker(ll, { radius: 9, color: "#fff", weight: 2, fillColor: COLOR[j.status], fillOpacity: 1 }).addTo(map);
      const a = document.createElement("a");
      a.href = `/project?id=${j.id}`;
      a.textContent = j.address || j.clientName || "Job";
      a.style.fontWeight = "600";
      const div = document.createElement("div");
      div.append(a, document.createElement("br"), `${j.clientName ?? ""} · ${j.status}`);
      m.bindPopup(div);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    else map.setView([40.73, -73.95], 9);
    return () => {
      map.remove();
    };
  }, [jobs]);
  const unplaced = (jobs ?? []).filter((j) => j.lat == null || j.lng == null);
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">Map</h1>
          <p className="mt-1 text-sm text-slate-500">
            {placed.length} job{placed.length === 1 ? "" : "s"} on the map · location comes from the first photo with GPS, or set it on the job’s Job tab.
          </p>
        </div>
        <div className="flex gap-3 text-xs text-slate-500">
          {(Object.keys(COLOR) as ProjectStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 capitalize">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[s] }} />
              {s}
            </span>
          ))}
        </div>
      </div>
      <div ref={el} className="card min-h-[420px] flex-1 overflow-hidden" />
      {unplaced.length > 0 && (
        <p className="text-sm text-slate-500">
          Not on the map yet:{" "}
          {unplaced.slice(0, 8).map((j, i) => (
            <span key={j.id}>
              {i > 0 && ", "}
              <Link className="text-brand-600 hover:underline" href={`/project?id=${j.id}&tab=info`}>
                {j.address || j.clientName || "Untitled job"}
              </Link>
            </span>
          ))}
          {unplaced.length > 8 ? ` and ${unplaced.length - 8} more` : ""}
        </p>
      )}
    </div>
  );
}
