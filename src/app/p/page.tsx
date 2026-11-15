import type { Metadata } from "next";
import { Suspense } from "react";
import ClientProposal from "@/components/ClientProposal";

export const metadata: Metadata = { title: "Proposal", robots: { index: false, follow: false } };

export default function ProposalPage() {
  return (
    <main className="flex-1 overflow-auto">
      <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading your proposal…</p>}>
        <ClientProposal />
      </Suspense>
    </main>
  );
}
