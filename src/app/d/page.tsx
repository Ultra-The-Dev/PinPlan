import type { Metadata } from "next";
import { Suspense } from "react";
import ClientDocument from "@/components/documents/ClientDocument";

export const metadata: Metadata = { title: "Document", robots: { index: false, follow: false } };

export default function DocumentPage() {
  return (
    <div className="flex-1">
      <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading…</p>}>
        <ClientDocument />
      </Suspense>
    </div>
  );
}
