import type { Metadata } from "next";
import { Suspense } from "react";
import PublicChangeOrder from "@/components/changeOrders/PublicChangeOrder";

export const metadata: Metadata = { title: "Change order", robots: { index: false, follow: false } };

export default function ChangeOrderPage() {
  return (
    <div className="flex-1">
      <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading your change order…</p>}>
        <PublicChangeOrder />
      </Suspense>
    </div>
  );
}
