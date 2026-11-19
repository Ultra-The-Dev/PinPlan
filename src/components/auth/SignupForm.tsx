"use client";
// /signup: a company owner makes their login and their company team in one go, then goes to /start.
import { ArrowRight, Building2, Loader2, LogOut, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { brandNewCompany, markOnboardingStarted, rememberPendingCompany, sendWelcomeEmail } from "@/lib/onboarding";
import { authErrorMessage, companySignupProblem } from "@/lib/onboardingLogic";
import { setAuthor } from "@/lib/photos";
import { PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { createTeam } from "@/lib/team";
import { TryDemoLink } from "../marketing/Site";
import { AuthCard, AuthShell, AuthTitle, errText, FormError, FormNotice, PasswordField } from "./AuthShell";

const confirmRedirect = () => `${window.location.origin}/login?confirmed=1`;

export default function SignupForm() {
  const router = useRouter();
  const sync = useSyncStatus();
  const [f, setF] = useState({ company: "", name: "", email: "", password: "", accepted: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** The login exists but making the company failed: offer a retry instead of a second sign-up. */
  const [teamRetry, setTeamRetry] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const makeCompany = async () => {
    try {
      await createTeam(f.company.trim(), f.name.trim());
    } catch (e) {
      // Signed up twice on one account: their company already exists, carry on.
      if (!/already on a team/i.test(errText(e))) throw e;
    }
    setAuthor(f.name.trim());
    sendWelcomeEmail(f.company, f.name);
    await brandNewCompany(f.company, f.email).catch(() => undefined);
    markOnboardingStarted();
    setLeaving(true);
    void useSyncStatus.getState().syncNow().catch(() => undefined);
    router.push("/start");
  };

  const submit = async () => {
    const problem = companySignupProblem(f);
    if (problem) {
      setError(problem);
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    try {
      if (teamRetry) {
        await makeCompany();
        return;
      }
      const email = f.email.trim();
      const { data, error } = await sb.auth.signUp({
        email,
        password: f.password,
        options: { data: { name: f.name.trim(), company: f.company.trim() }, emailRedirectTo: confirmRedirect() },
      });
      // With "Confirm email" on, an address that already has an account comes back with no identities.
      const exists = !error && data.user && !data.session && data.user.identities?.length === 0;
      if (error || exists) {
        const msg = authErrorMessage(exists ? "User already registered" : error!.message);
        setError(
          /already an account/.test(msg) ? (
            <>
              There’s already an account with this email.{" "}
              <Link href={`/login?email=${encodeURIComponent(email)}`} className="font-medium underline">
                Sign in
              </Link>{" "}
              or{" "}
              <Link href={`/reset?email=${encodeURIComponent(email)}`} className="font-medium underline">
                reset your password
              </Link>
              .
            </>
          ) : (
            msg
          ),
        );
        return;
      }
      if (!data.session) {
        // "Confirm email" is on: the company is made on the first sign-in after they click the link (see sync.ts).
        rememberPendingCompany({ company: f.company.trim(), name: f.name.trim(), email });
        setAuthor(f.name.trim());
        setSentTo(email);
        return;
      }
      try {
        await makeCompany();
      } catch (e) {
        setTeamRetry(true);
        setError(`Your login is ready, but setting up ${f.company.trim()} didn’t finish: ${errText(e)} Press the button to try again.`);
      }
    } catch (e) {
      setError(authErrorMessage(errText(e)));
    } finally {
      setBusy(false);
    }
  };

  if (!supabaseConfigured) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle icon={<Building2 />} title="Sign-up isn’t available here" sub={`This copy of ${PRODUCT_NAME} isn’t connected to the cloud, so there are no accounts. You can still use it on this device.`} />
          <TryDemoLink className="btn btn-brand h-11 w-full" />
        </AuthCard>
      </AuthShell>
    );
  }

  if (sentTo) return <CheckEmail email={sentTo} company={f.company.trim()} />;

  if (sync.authReady && sync.signedIn && !busy && !teamRetry && !leaving) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle title="You’re already signed in" sub={<>Signed in as <span className="font-medium text-slate-700">{sync.email}</span>.</>} />
          <div className="space-y-2">
            <Link href="/" className="btn btn-brand h-11 w-full">
              Open {PRODUCT_NAME} <ArrowRight />
            </Link>
            <button className="btn h-11 w-full" onClick={() => void getSupabase()?.auth.signOut()}>
              <LogOut /> Sign out to create another company
            </button>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      wide
      aside={
        <>
          <span className="hidden sm:inline">Have an account? </span>
          <Link href="/login" className="font-medium text-slate-900 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <AuthCard>
        <AuthTitle title="Start your free trial" sub={`${TRIAL_DAYS} days of everything in ${PRODUCT_NAME}. Set up your company now and invite your crew when you’re ready.`} />
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <label className="label" htmlFor="su-company">Company name</label>
            <input id="su-company" className="input h-11" autoComplete="organization" maxLength={120} required placeholder="Brightline Integration" value={f.company} onChange={(e) => set("company", e.target.value)} disabled={teamRetry} />
          </div>
          <div>
            <label className="label" htmlFor="su-name">Your name</label>
            <input id="su-name" className="input h-11" autoComplete="name" maxLength={80} required placeholder="First and last name" value={f.name} onChange={(e) => set("name", e.target.value)} disabled={teamRetry} />
          </div>
          <div>
            <label className="label" htmlFor="su-email">Work email</label>
            <input id="su-email" className="input h-11" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required placeholder="you@company.com" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={teamRetry} />
          </div>
          {!teamRetry && <PasswordField id="su-password" label="Password" isNew value={f.password} onChange={(v) => set("password", v)} />}
          {!teamRetry && (
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
          <FormError>{error}</FormError>
          <button type="submit" className="btn btn-brand h-11 w-full text-[15px]" disabled={busy || leaving}>
            {busy || leaving ? <Loader2 className="animate-spin" /> : teamRetry ? <RefreshCw /> : null}
            {busy || leaving ? "Setting up your company…" : teamRetry ? "Try again" : "Create company account"}
          </button>
          <p className="text-center text-xs text-slate-500">
            Joining your company’s team?{" "}
            <Link href="/join" className="font-medium text-slate-700 underline underline-offset-2">
              Use your invite code
            </Link>
          </p>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

function CheckEmail({ email, company }: { email: string; company: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <AuthShell>
      <AuthCard>
        <AuthTitle
          icon={<Mail />}
          title="Check your email"
          sub={
            <>
              We sent a confirmation link to <span className="font-medium break-all text-slate-700">{email}</span>. Open it on this device and sign in — we’ll finish setting up{" "}
              <span className="font-medium text-slate-700">{company}</span> for you.
            </>
          }
        />
        <ul className="mb-5 space-y-1.5 text-sm text-slate-500">
          <li>· It can take a few minutes to arrive.</li>
          <li>· Check spam or promotions if you don’t see it.</li>
        </ul>
        <div className="space-y-2">
          <Link href={`/login?email=${encodeURIComponent(email)}`} className="btn btn-brand h-11 w-full">
            I’ve confirmed — sign in
          </Link>
          <button
            className="btn h-11 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              const r = await getSupabase()?.auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmRedirect() } });
              setBusy(false);
              setMsg(r?.error ? { ok: false, text: authErrorMessage(r.error.message) } : { ok: true, text: "Sent again. Give it a few minutes." });
            }}
          >
            <RefreshCw /> Resend the email
          </button>
        </div>
        <div className="mt-3">{msg && (msg.ok ? <FormNotice>{msg.text}</FormNotice> : <FormError>{msg.text}</FormError>)}</div>
      </AuthCard>
    </AuthShell>
  );
}
