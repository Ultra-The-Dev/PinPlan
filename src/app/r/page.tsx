import type { Metadata } from "next";
import { Suspense } from "react";
import ClientPhotoReport from "@/components/photos/ClientPhotoReport";

export const metadata: Metadata = { title: "Photo report", robots: { index: false, follow: false } };

export default function PhotoReportPage() {
  return (
    <main className="flex-1 overflow-auto">
      <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading photos…</p>}>
        <ClientPhotoReport />
      </Suspense>
    </main>
  );
}
