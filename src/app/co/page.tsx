import type { Metadata } from "next";
import { Suspense } from "react";
import PublicChangeOrder from "@/components/changeOrders/PublicChangeOrder";

export const metadata: Metadata = { title: "Change order", robots: { index: false, follow: false } };

export default function ChangeOrderPage() {
  return (
    <main className="flex-1 overflow-auto">
      <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading your change order…</p>}>
        <PublicChangeOrder />
      </Suspense>
    </main>
  );
}
