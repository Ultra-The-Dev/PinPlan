import type { Metadata } from "next";
import { Suspense } from "react";
import JoinTeam from "@/components/JoinTeam";

export const metadata: Metadata = { title: "Join your team — PinPlan", robots: { index: false, follow: false } };

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate-500">Loading…</p>}>
      <JoinTeam />
    </Suspense>
  );
}
