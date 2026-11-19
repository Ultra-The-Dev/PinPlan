"use client";
// "/" for a first-time visitor (signed out, no jobs on this device) goes to the landing page instead of an empty
// jobs list. Signed-in users, anyone with local jobs, and "Try it without an account" keep the app.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { isDemo } from "@/lib/onboarding";
import { landingDecision } from "@/lib/onboardingLogic";
import { useSyncStatus } from "@/lib/sync";

export default function FirstRunGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const s = useSyncStatus();
  const [localJobs, setLocalJobs] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    const done = (n: number) => {
      setDemo(isDemo());
      setLocalJobs(n);
    };
    db()
      .projects.filter((p) => !p.deleted)
      .count()
      .then(done, () => done(0));
  }, []);
  const decision = landingDecision({ configured: s.configured, authReady: s.authReady, signedIn: s.signedIn, localJobs, demo });
  useEffect(() => {
    if (decision === "welcome") router.replace("/welcome");
  }, [decision, router]);
  if (decision !== "stay") return <div className="flex-1" aria-busy="true" />;
  return <>{children}</>;
}
