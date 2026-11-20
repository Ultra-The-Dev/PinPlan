import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import FirstRunGate from "@/components/FirstRunGate";
import { OnboardingCard } from "@/components/Onboarding";
import ProjectsList from "@/components/ProjectsList";
import { publicMetadata } from "@/components/marketing/seo";
import { PRODUCT_NAME } from "@/lib/plans";

// "/" is the jobs list (a local-first app shell). For search engines and shared links it stands for the home page,
// so its canonical URL is /welcome.
export const metadata: Metadata = publicMetadata({
  path: "/welcome",
  title: `${PRODUCT_NAME}: pin the plan, send the quote, get it signed`,
  description: `${PRODUCT_NAME} is takeoff, quoting, invoicing and job management for electrical, low-voltage and specialty contractors.`,
});

export default function Home() {
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
