"use client";
import dynamic from "next/dynamic";
import AppHeader from "@/components/AppHeader";
import JobsViewToggle from "@/components/nav/JobsViewToggle";
import { useT } from "@/lib/i18n";

// Leaflet needs the browser.
const JobsMap = dynamic(() => import("@/components/JobsMap"), { ssr: false, loading: () => <LoadingMap /> });

function LoadingMap() {
  const t = useT();
  return <p className="p-6 text-slate-500">{t("Loading map…")}</p>;
}

/** Jobs → Map (the List | Map toggle switches between this page and the jobs list). */
export default function MapPage() {
  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col overflow-auto">
        <div className="mx-auto w-full max-w-6xl shrink-0 px-4 pt-4 sm:px-6">
          <JobsViewToggle />
        </div>
        <div className="min-h-0 flex-1">
          <JobsMap />
        </div>
      </main>
    </>
  );
}
