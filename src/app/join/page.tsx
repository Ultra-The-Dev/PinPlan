import type { Metadata } from "next";
import { Suspense } from "react";
import JoinTeam from "@/components/JoinTeam";
import { PRODUCT_NAME } from "@/lib/plans";

export const metadata: Metadata = { title: `Join your team — ${PRODUCT_NAME}`, robots: { index: false, follow: false } };

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading…</p>}>
      <JoinTeam />
    </Suspense>
  );
}
