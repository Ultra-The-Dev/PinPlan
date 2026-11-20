import type { Metadata } from "next";
import { Suspense } from "react";
import { T } from "@/lib/i18n/T";
import JoinTeam from "@/components/JoinTeam";
import { PRODUCT_NAME } from "@/lib/plans";

export const metadata: Metadata = { title: `Join your team — ${PRODUCT_NAME}`, robots: { index: false, follow: false } };

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-500"><T>Loading…</T></p>}>
      <JoinTeam />
    </Suspense>
  );
}
