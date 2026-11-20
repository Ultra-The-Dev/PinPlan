import type { Metadata } from "next";
import { Suspense } from "react";
import ClientProposal from "@/components/ClientProposal";

export const metadata: Metadata = { title: "Quote", robots: { index: false, follow: false } };

export default function ProposalPage() {
  return (
    <div className="flex-1">
      <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading…</p>}>
        <ClientProposal />
      </Suspense>
    </div>
  );
}
