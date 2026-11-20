"use client";
// /login: email + password, or a one-time sign-in link. Back to the jobs list afterwards (or /start for a company
// that was waiting for its confirmation email, whichever device the sign-up was made on).
import { CheckCircle2, Loader2, LogIn, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCaptcha } from "@/lib/captcha";
import { useT } from "@/lib/i18n";
import { accountMetadata, markOnboardingStarted, pendingCompany } from "@/lib/onboarding";
import { authErrorMessage, companyFromMetadata } from "@/lib/onboardingLogic";
import { PRODUCT_NAME } from "@/lib/plans";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { useSyncStatus } from "@/lib/sync";
import { linkErrorFrom, useArrivalParams } from "@/lib/useArrivalUrl";
import { TryDemoLink } from "../marketing/Site";
import { AuthCard, AuthShell, AuthTitle, errText, FormError, FormNotice, PasswordField } from "./AuthShell";
import { rich } from "./rich";

export default function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const sync = useSyncStatus();
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "link" | null>(null);
  const [error, setError] = useState<React.ReactNode>(null);
  const [linkSent, setLinkSent] = useState(false);
  const confirmed = params.get("confirmed") === "1";
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("login");

  // Signed in (here, or by opening a confirmation / sign-in link): go to the app.
  // (Sync may finish a waiting company before this runs, so note it when the page opens.)
  const left = useRef(false);
  const hadPending = useRef(false);
  useEffect(() => {
    hadPending.current = !!pendingCompany();
  }, []);
  useEffect(() => {
    if (!sync.authReady || !sync.signedIn || left.current) return;
    left.current = true;
    void (async () => {
      // A company waiting for this account: noted on this device, or on the account (signed up on another device).
      // (Accounts from before sign-ups noted the terms also carry a company name but never wait for one: only newer
      // sign-ups count, so existing owners aren't sent to /start on every sign-in.)
      const meta = await accountMetadata().catch(() => null);
      const fromAccount = typeof meta?.terms_version === "string" && !!companyFromMetadata(meta);
      const waiting = hadPending.current || !!pendingCompany() || fromAccount;
      if (waiting) {
        markOnboardingStarted();
        router.replace("/start");
      } else router.replace("/");
    })();
  }, [sync.authReady, sync.signedIn, router]);

  // A link that failed (expired or already used) comes back with the reason in the URL hash.
  const arrival = useArrivalParams();
  const linkError = linkErrorFrom(arrival?.hash, t("That link has expired or was already used. Sign in with your password, or send a new link."));

  if (!supabaseConfigured) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle title={t("Accounts aren’t available here")} sub={t("This copy of {product} isn’t connected to the cloud. Your jobs are saved on this device.", { product: PRODUCT_NAME })} />
          <TryDemoLink className="btn btn-brand h-11 w-full" />
        </AuthCard>
      </AuthShell>
    );
  }

  const signIn = async () => {
    const sb = getSupabase()!;
    setBusy("password");
    setError(null);
    try {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken: await takeCaptcha() } });
      if (error) setError(t(authErrorMessage(error.message)));
    } catch (e) {
      setError(t(authErrorMessage(errText(e))));
    } finally {
      setBusy(null);
    }
  };

  const sendLink = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("Enter your email address first, then press “Email me a sign-in link”."));
      return;
    }
    const sb = getSupabase()!;
    setBusy("link");
    setError(null);
    try {
      // Only for existing accounts: new companies sign up on /signup.
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/login`, captchaToken: await takeCaptcha() },
      });
      if (error && !/signups? not allowed|not found/i.test(error.message)) setError(t(authErrorMessage(error.message)));
      // Don't reveal whether the address has an account.
      else setLinkSent(true);
    } catch (e) {
      setError(t(authErrorMessage(errText(e))));
    } finally {
      setBusy(null);
    }
  };

  if (sync.authReady && sync.signedIn) {
    return (
      <AuthShell>
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("Opening {product}…", { product: PRODUCT_NAME })}
        </p>
      </AuthShell>
    );
  }

  if (linkSent) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthTitle
            icon={<Mail />}
            title={t("Check your email")}
            sub={rich(
              t("If {email} has a {product} account, a sign-in link is on its way. Open it on the device you want to use. It can take a few minutes — check spam too.", {
                product: PRODUCT_NAME,
              }),
              { email: <span className="font-medium break-all text-slate-700">{email.trim()}</span> },
            )}
          />
          <button className="btn h-11 w-full" onClick={() => setLinkSent(false)}>
            {t("Back to sign in")}
          </button>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside={
        <>
          <span className="hidden sm:inline">{t("New to {product}?", { product: PRODUCT_NAME })} </span>
          <Link href="/signup" className="font-medium text-slate-900 hover:underline">
            {t("Start free trial")}
          </Link>
        </>
      }
    >
      <AuthCard>
        <AuthTitle title={t("Sign in")} sub={t("Welcome back. Sign in to sync your jobs across iPad, iPhone and the web.")} />
        {confirmed && !linkError && (
          <div className="mb-4">
            <FormNotice>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> {t("Email confirmed. Sign in to finish setting up.")}
              </span>
            </FormNotice>
          </div>
        )}
        {linkError && (
          <div className="mb-4">
            <FormError>{linkError}</FormError>
          </div>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <div>
            <label className="label" htmlFor="li-email">{t("Email")}</label>
            <input id="li-email" className="input h-11" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <PasswordField id="li-password" label={t("Password")} value={password} onChange={setPassword} />
            <div className="mt-2 text-right">
              <Link href={`/reset${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`} className="text-xs font-medium text-slate-500 hover:text-slate-900">
                {t("Forgot password?")}
              </Link>
            </div>
          </div>
          <div ref={captchaMount} className="flex justify-center empty:hidden" />
          <FormError>{error ?? captchaError}</FormError>
          <button type="submit" className="btn btn-brand h-11 w-full text-[15px]" disabled={!!busy || !email || !password}>
            {busy === "password" ? <Loader2 className="animate-spin" /> : <LogIn />} {t("Sign in")}
          </button>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> {t("or")} <span className="h-px flex-1 bg-slate-200" />
          </div>
          <button type="button" className="btn h-11 w-full" disabled={!!busy} onClick={() => void sendLink()}>
            {busy === "link" ? <Loader2 className="animate-spin" /> : <Mail />} {t("Email me a sign-in link")}
          </button>
        </form>
      </AuthCard>
      <p className="mt-6 text-center text-sm text-slate-500">
        {t("Got an invite from your company?")}{" "}
        <Link href="/join" className="font-medium text-slate-700 underline underline-offset-2">
          {t("Join your team")}
        </Link>
      </p>
    </AuthShell>
  );
}
