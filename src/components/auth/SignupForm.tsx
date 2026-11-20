"use client";
// /signup: a company owner makes their login and their company team in one go, then goes to /start.
import { ArrowRight, Building2, Loader2, LogOut, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCaptcha } from "@/lib/captcha";
import { useT } from "@/lib/i18n";
import { rememberPendingCompany, welcomeNewCompany } from "@/lib/onboarding";
import { authErrorMessage, companySignupProblem, termsMetadata } from "@/lib/onboardingLogic";
import { setAuthor } from "@/lib/photos";
import { PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { createTeam } from "@/lib/team";
import type { TradeId } from "@/lib/types";
import TradePicker from "../TradePicker";
import { TryDemoLink } from "../marketing/Site";
import { AuthCard, AuthShell, AuthTitle, errText, FormError, FormNotice, PasswordField } from "./AuthShell";
import { rich } from "./rich";

const confirmRedirect = () => `${window.location.origin}/login?confirmed=1`;

export default function SignupForm() {
  const t = useT();
  const router = useRouter();
  const sync = useSyncStatus();
  const [f, setF] = useState({ company: "", name: "", email: "", password: "", accepted: false, trades: [] as TradeId[] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** The login exists but making the company failed: offer a retry instead of a second sign-up. */
  const [teamRetry, setTeamRetry] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("signup");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const makeCompany = async () => {
    try {
      await createTeam(f.company.trim(), f.name.trim());
    } catch (e) {
      // Signed up twice on one account: their company already exists, carry on.
      if (!/already on a team/i.test(errText(e))) throw e;
    }
    // The company's trades (their palette, catalog, wire types and checklists; none picked = low voltage), its name on
    // estimates, the welcome email and the checklist.
    await welcomeNewCompany({ company: f.company.trim(), name: f.name.trim(), email: f.email.trim(), trades: f.trades });
    setLeaving(true);
    void useSyncStatus.getState().syncNow().catch(() => undefined);
    router.push("/start");
  };

  const submit = async () => {
    const problem = companySignupProblem(f);
    if (problem) {
      setError(t(problem));
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
      // The company travels with the account, so it can be made on whichever device opens the confirmation email.
      const { data, error } = await sb.auth.signUp({
        email,
        password: f.password,
        options: {
          data: { name: f.name.trim(), company: f.company.trim(), trades: f.trades, ...termsMetadata() },
          emailRedirectTo: confirmRedirect(),
          captchaToken: await takeCaptcha(),
        },
      });
      // With "Confirm email" on, an address that already has an account comes back with no identities. It gets exactly
      // what a new sign-up gets ("Check your email"): this form must not tell anyone which addresses have accounts.
      // Nothing is noted on this device for it (no company waits for a confirmation that never comes).
      if (!error && data.user && !data.session && data.user.identities?.length === 0) {
        setSentTo(email);
        return;
      }
      if (error) {
        const msg = authErrorMessage(error.message);
        setError(
          /already an account/.test(msg) ? (
            rich(t("There’s already an account with this email. {signIn} or {reset}."), {
              signIn: (
                <Link href={`/login?email=${encodeURIComponent(email)}`} className="font-medium underline">
                  {t("Sign in")}
                </Link>
              ),
              reset: (
                <Link href={`/reset?email=${encodeURIComponent(email)}`} className="font-medium underline">
                  {t("reset your password")}
                </Link>
              ),
            })
          ) : (
            t(msg)
          ),
        );
        return;
      }
      if (!data.session) {
        // "Confirm email" is on: the company is made on the first sign-in after they click the link, on this device or
        // any other (finishPendingCompany in onboarding.ts, run by sync.ts).
        rememberPendingCompany({ company: f.company.trim(), name: f.name.trim(), email, trades: f.trades });
        setAuthor(f.name.trim());
        setSentTo(email);
        return;
      }
      try {
        await makeCompany();
      } catch (e) {
        setTeamRetry(true);
        setError(t("Your login is ready, but setting up {company} didn’t finish: {error} Press the button to try again.", { company: f.company.trim(), error: errText(e) }));
      }
    } catch (e) {
      setError(t(authErrorMessage(errText(e))));
    } finally {
      setBusy(false);
    }
  };

  if (!supabaseConfigured) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle
            icon={<Building2 />}
            title={t("Sign-up isn’t available here")}
            sub={t("This copy of {product} isn’t connected to the cloud, so there are no accounts. You can still use it on this device.", { product: PRODUCT_NAME })}
          />
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
          <AuthTitle title={t("You’re already signed in")} sub={rich(t("Signed in as {email}."), { email: <span className="font-medium text-slate-700">{sync.email}</span> })} />
          <div className="space-y-2">
            <Link href="/jobs" className="btn btn-brand h-11 w-full">
              {t("Open {product}", { product: PRODUCT_NAME })} <ArrowRight />
            </Link>
            <button className="btn h-auto min-h-11 w-full py-2 text-center whitespace-normal" onClick={() => void getSupabase()?.auth.signOut()}>
              <LogOut /> {t("Sign out to create another company")}
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
          <span className="hidden sm:inline">{t("Have an account?")} </span>
          <Link href="/login" className="font-medium text-slate-900 hover:underline">
            {t("Sign in")}
          </Link>
        </>
      }
    >
      <AuthCard>
        <AuthTitle
          title={t("Start your free trial")}
          sub={t.tn(
            "{n} day of everything in {product}. Set up your company now and invite your crew when you’re ready.",
            "{n} days of everything in {product}. Set up your company now and invite your crew when you’re ready.",
            TRIAL_DAYS,
            { product: PRODUCT_NAME },
          )}
        />
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {!teamRetry && (
            <div>
              <span className="label">{t("What does your company do?")}</span>
              <TradePicker compact value={f.trades} onChange={(t) => set("trades", t)} />
              <p className="mt-1.5 text-xs text-slate-500">
                {t("Pick one or more — the first is your main trade. It sets up your device menu, catalog, wire types and checklists. You can change it later in Settings.")}
              </p>
            </div>
          )}
          <div>
            <label className="label" htmlFor="su-company">{t("Company name")}</label>
            <input id="su-company" className="input h-11" autoComplete="organization" maxLength={120} required placeholder="Brightline Integration" value={f.company} onChange={(e) => set("company", e.target.value)} disabled={teamRetry} />
          </div>
          <div>
            <label className="label" htmlFor="su-name">{t("Your name")}</label>
            <input id="su-name" className="input h-11" autoComplete="name" maxLength={80} required placeholder={t("First and last name")} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={teamRetry} />
          </div>
          <div>
            <label className="label" htmlFor="su-email">{t("Work email")}</label>
            <input id="su-email" className="input h-11" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required placeholder="you@company.com" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={teamRetry} />
          </div>
          {!teamRetry && <PasswordField id="su-password" label={t("Password")} isNew value={f.password} onChange={(v) => set("password", v)} />}
          {!teamRetry && (
            <label className="flex items-start gap-2.5 text-sm text-slate-600">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" checked={f.accepted} onChange={(e) => set("accepted", e.target.checked)} />
              <span>
                {rich(t("I agree to the {terms} and {privacy}."), {
                  terms: (
                    <Link href="/terms" target="_blank" className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2">
                      {t("Terms of Service")}
                    </Link>
                  ),
                  privacy: (
                    <Link href="/privacy" target="_blank" className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2">
                      {t("Privacy Policy")}
                    </Link>
                  ),
                })}
              </span>
            </label>
          )}
          <div ref={captchaMount} className="flex justify-center empty:hidden" />
          <FormError>{error ?? captchaError}</FormError>
          <button type="submit" className="btn btn-brand h-11 w-full text-[15px]" disabled={busy || leaving}>
            {busy || leaving ? <Loader2 className="animate-spin" /> : teamRetry ? <RefreshCw /> : null}
            {busy || leaving ? t("Setting up your company…") : teamRetry ? t("Try again") : t("Create company account")}
          </button>
          <p className="text-center text-xs text-slate-500">
            {t("Joining your company’s team?")}{" "}
            <Link href="/join" className="font-medium text-slate-700 underline underline-offset-2">
              {t("Use your invite code")}
            </Link>
          </p>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

function CheckEmail({ email, company }: { email: string; company: string }) {
  const t = useT();
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("resend");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <AuthShell>
      <AuthCard>
        <AuthTitle
          icon={<Mail />}
          title={t("Check your email")}
          sub={rich(
            t("We sent a confirmation link to {email}. Open it on any device — phone, tablet or computer — and sign in. We’ll finish setting up {company} for you."),
            {
              email: <span className="font-medium break-all text-slate-700">{email}</span>,
              company: <span className="font-medium text-slate-700">{company}</span>,
            },
          )}
        />
        <ul className="mb-5 space-y-1.5 text-sm text-slate-500">
          <li>· {t("It can take a few minutes to arrive.")}</li>
          <li>· {t("Check spam or promotions if you don’t see it.")}</li>
        </ul>
        <div className="space-y-2">
          <Link href={`/login?email=${encodeURIComponent(email)}`} className="btn btn-brand h-11 w-full">
            {t("I’ve confirmed — sign in")}
          </Link>
          <button
            className="btn h-11 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                const r = await getSupabase()?.auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmRedirect(), captchaToken: await takeCaptcha() } });
                setMsg(r?.error ? { ok: false, text: t(authErrorMessage(r.error.message)) } : { ok: true, text: t("Sent again. Give it a few minutes.") });
              } catch (e) {
                setMsg({ ok: false, text: t(authErrorMessage(errText(e))) });
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw /> {t("Resend the email")}
          </button>
        </div>
        <div ref={captchaMount} className="mt-3 flex justify-center empty:hidden" />
        <div className="mt-3">{msg && (msg.ok ? <FormNotice>{msg.text}</FormNotice> : <FormError>{msg.text}</FormError>)}</div>
      </AuthCard>
    </AuthShell>
  );
}
