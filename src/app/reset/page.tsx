import type { Metadata } from "next";
import { Suspense } from "react";
import ResetForm from "@/components/auth/ResetForm";
import { PRODUCT_NAME } from "@/lib/plans";

export const metadata: Metadata = { title: `Reset your password — ${PRODUCT_NAME}`, robots: { index: false, follow: false } };

export default function ResetPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading…</p>}>
      <ResetForm />
    </Suspense>
  );
}
