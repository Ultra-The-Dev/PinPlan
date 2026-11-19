import AppHeader from "@/components/AppHeader";
import FirstRunGate from "@/components/FirstRunGate";
import { OnboardingCard } from "@/components/Onboarding";
import ProjectsList from "@/components/ProjectsList";

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
