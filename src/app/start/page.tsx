import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { OnboardingChecklist } from "@/components/Onboarding";
import { PRODUCT_NAME } from "@/lib/plans";

export const metadata: Metadata = { title: `Get set up — ${PRODUCT_NAME}`, robots: { index: false, follow: false } };

export default function StartPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <OnboardingChecklist />
      </main>
    </>
  );
}
