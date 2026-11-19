"use client";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";

// Leaflet needs the browser.
const JobsMap = dynamic(() => import("@/components/JobsMap"), { ssr: false, loading: () => <p className="p-6 text-slate-500">Loading map…</p> });

export default function MapPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <JobsMap />
      </main>
    </>
  );
}
