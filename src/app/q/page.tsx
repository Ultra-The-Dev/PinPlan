import type { Metadata } from "next";
import { Suspense } from "react";
import PublicRfi from "@/components/rfis/PublicRfi";

export const metadata: Metadata = { title: "Request for information", robots: { index: false, follow: false } };

export default function RfiAnswerPage() {
  return (
    <main className="flex-1 overflow-auto">
      <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading…</p>}>
        <PublicRfi />
      </Suspense>
    </main>
  );
}
