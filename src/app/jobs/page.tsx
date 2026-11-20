import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import FirstRunGate from "@/components/FirstRunGate";
import { OnboardingCard } from "@/components/Onboarding";
import ProjectsList from "@/components/ProjectsList";
import { PRODUCT_NAME } from "@/lib/plans";

// /jobs is the app's home: the jobs list (a local-first app shell). The marketing site is "/".
export const metadata: Metadata = { title: `Jobs · ${PRODUCT_NAME}`, robots: { index: false, follow: false } };

export default function JobsPage() {
  return (
    <FirstRunGate>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <OnboardingCard />
        <ProjectsList />
      </main>
    </FirstRunGate>
  );
}
