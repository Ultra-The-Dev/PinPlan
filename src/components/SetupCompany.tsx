"use client";
// "Set up your company": for someone signed in who isn't in a company yet (an account made in the iPad app, a sign-up
// whose company didn't finish, or someone who left their team). Every account belongs to a company, so this comes
// before the jobs list. People who were invited go to /join instead.
import { Building2, Loader2, LogOut, Ticket } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { accountMetadata, clearPendingCompany, pendingCompany, recordTermsAccepted, welcomeNewCompany } from "@/lib/onboarding";
import { acceptedTerms, companyFromMetadata, setupCompanyProblem } from "@/lib/onboardingLogic";
import { getAuthor } from "@/lib/photos";
import { PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";
import { getSupabase } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { createTeam, reloadTeam } from "@/lib/team";
import { teamErrorMessage } from "@/lib/teamLogic";
import type { TradeId } from "@/lib/types";
import TradePicker from "./TradePicker";

export default function SetupCompany() {
  const sync = useSyncStatus();
  const [f, setF] = useState(() => {
    const p = pendingCompany();
    const me = getAuthor(null);
    return { company: p?.company ?? "", name: p?.name ?? (me === "Me" ? "" : me), trades: (p?.trades ?? []) as TradeId[], accepted: false };
  });
  // Accounts that agreed to the current terms at sign-up aren't asked again.
  const [termsNeeded, setTermsNeeded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    let live = true;
    void accountMetadata()
      .catch(() => null)
      .then((meta) => {
        if (!live) return;
        setTermsNeeded(!acceptedTerms(meta));
        // What they typed at sign-up (on any device) fills the form.
        const c = companyFromMetadata(meta);
        const metaName = typeof meta?.name === "string" ? meta.name.trim() : "";
        setF((x) => ({ ...x, company: x.company || c?.company || "", name: x.name || c?.name || metaName, trades: x.trades.length ? x.trades : (c?.trades ?? []) }));
      });
    return () => {
      live = false;
    };
  }, []);

  const submit = async () => {
    const problem = setupCompanyProblem({ company: f.company, name: f.name, accepted: termsNeeded === false || f.accepted });
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      try {
        await createTeam(f.company.trim(), f.name.trim());
      } catch (e) {
        // Made a moment ago (another tab or device): carry on with it.
        if (!/already on a team/i.test((e as Error).message)) throw e;
        await reloadTeam();
      }
      clearPendingCompany();
      if (termsNeeded !== false) await recordTermsAccepted();
      await welcomeNewCompany({ company: f.company.trim(), name: f.name.trim(), email: sync.email ?? "", trades: f.trades });
      void useSyncStatus.getState().syncNow().catch(() => undefined);
      // /start now shows the checklist (the team store has the new company).
    } catch (e) {
      setError(teamErrorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Set up your company</h1>
        <p className="mt-1.5 text-slate-500">
          Everything in {PRODUCT_NAME} belongs to your company: jobs, price list and crew. Your {TRIAL_DAYS}-day free trial starts now.
        </p>
      </div>
      <form
        className="card space-y-4 p-5 sm:p-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className="label" htmlFor="setup-company">Company name</label>
          <input id="setup-company" className="input h-11" autoComplete="organization" maxLength={120} required value={f.company} onChange={(e) => set("company", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="setup-name">Your name</label>
          <input id="setup-name" className="input h-11" autoComplete="name" maxLength={80} required placeholder="First and last name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Your crew sees this, and it’s on the photos you take.</p>
        </div>
        <div>
          <span className="label">What does your company do?</span>
          <TradePicker compact value={f.trades} onChange={(t) => set("trades", t)} />
          <p className="mt-1.5 text-xs text-slate-500">Pick one or more. It sets up your device list, price list and checklists. You can change it later in Settings.</p>
        </div>
        {termsNeeded && (
          <label className="flex items-start gap-2.5 text-sm text-slate-600">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" checked={f.accepted} onChange={(e) => set("accepted", e.target.checked)} />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-brand h-11 w-full text-[15px]" disabled={busy || termsNeeded === null}>
          {busy ? <Loader2 className="animate-spin" /> : <Building2 />} {busy ? "Setting up your company…" : "Set up my company"}
        </button>
        <Link href="/join" className="btn h-11 w-full">
          <Ticket /> I have an invite code
        </Link>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        Signed in as <span className="font-medium break-all text-slate-700">{sync.email}</span> ·{" "}
        <button className="inline-flex items-center gap-1 font-medium text-slate-700 hover:underline" onClick={() => void getSupabase()?.auth.signOut()}>
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </p>
    </div>
  );
}
