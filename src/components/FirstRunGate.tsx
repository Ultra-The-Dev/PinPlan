"use client";
// "/" for a first-time visitor (signed out, no jobs on this device) goes to the landing page instead of an empty
// jobs list. Signed-in users, anyone with local jobs, and "Try it without an account" keep the app — except that
// every account belongs to a company: someone signed in without one goes to /start ("Set up your company").
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pullCompanySettings } from "@/lib/companySettings";
import { db } from "@/lib/db";
import { COMPANY_READY_EVENT, isDemo } from "@/lib/onboarding";
import { landingDecision } from "@/lib/onboardingLogic";
import { useSyncStatus } from "@/lib/sync";
import { useTeam } from "@/lib/team";

export default function FirstRunGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const s = useSyncStatus();
  const t = useTeam();
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
  // On a team, not on one, or not known yet. A team that couldn't be read (offline, a migration behind) doesn't count
  // as "no team": nobody is sent to set up a company because the network is down.
  const known = t.ready && t.userId === s.userId;
  const hasTeam = !s.signedIn || !known ? null : t.team || t.error || t.needsMigration ? true : false;
  const decision = landingDecision({ configured: s.configured, authReady: s.authReady, signedIn: s.signedIn, localJobs, demo, hasTeam });
  useEffect(() => {
    if (decision === "welcome") router.replace("/welcome");
    if (decision === "setup") router.replace("/start");
  }, [decision, router]);
  // A company from the sign-up was just made (maybe on another device's confirmation link): on to the checklist.
  useEffect(() => {
    const go = () => router.push("/start");
    window.addEventListener(COMPANY_READY_EVENT, go);
    return () => window.removeEventListener(COMPANY_READY_EVENT, go);
  }, [router]);
  // The company's name, phone and logo may have changed on another device.
  const onTeam = !!t.team;
  useEffect(() => {
    if (onTeam) void pullCompanySettings();
  }, [onTeam]);
  if (decision !== "stay") return <div className="flex-1" aria-busy="true" />;
  return <>{children}</>;
}
