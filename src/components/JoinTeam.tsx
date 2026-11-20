"use client";
// /join?code=…: a worker opens their invite, makes a login (or signs in) and joins the company team.
import { ArrowRight, CheckCircle2, CircleAlert, FolderOpen, Loader2, LogIn, Mail, Smartphone, Ticket, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCaptcha } from "@/lib/captcha";
import { recordTermsAccepted } from "@/lib/onboarding";
import { authErrorMessage, termsMetadata, TERMS_VERSION } from "@/lib/onboardingLogic";
import { getAuthor, setAuthor } from "@/lib/photos";
import { PRODUCT_NAME } from "@/lib/plans";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { signOut, useSyncStatus } from "@/lib/sync";
import { acceptInvite, clearPendingInvite, inviteInfo, pendingInvite, rememberPendingInvite, useTeam, type InviteInfo } from "@/lib/team";
import { formatCode, joinReply, joinRequestBody, joinUrl, normalizeCode, PASSWORD_MIN, ROLE_INFO, signupProblem, type TeamRole } from "@/lib/teamLogic";
import { Logo } from "./AppHeader";
import RoleBadge from "./RoleBadge";

/** Every error on this page, in plain words (Supabase's own messages included). */
const errText = (e: unknown) => authErrorMessage(e instanceof Error ? e.message : String(e));
const BAD_CODE = "That code isn’t valid any more. It may have been used already, revoked, or it’s older than 14 days. Ask whoever invited you for a new one.";

type Step = { kind: "code" } | { kind: "invite"; info: InviteInfo } | { kind: "checkEmail"; info: InviteInfo; email: string } | { kind: "joined"; team: string; role: TeamRole };

export default function JoinTeam() {
  const params = useSearchParams();
  const fromUrl = params.get("code") ?? "";
  const [code, setCode] = useState(() => formatCode(fromUrl));
  const [step, setStep] = useState<Step>({ kind: "code" });
  const [looking, setLooking] = useState(!!fromUrl && supabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (raw: string) => {
    const c = normalizeCode(raw);
    if (c.length < 8) {
      setError("Enter the code from your invite — it looks like K7QM-XR4T-PA.");
      return;
    }
    setLooking(true);
    setError(null);
    try {
      const info = await inviteInfo(c);
      if (info) setStep({ kind: "invite", info });
      else setError(BAD_CODE);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLooking(false);
    }
  };

  // A link with ?code= looks the code up straight away.
  // Without one, an invite remembered on this device that wasn't joined automatically (another account signed in) is
  // offered here for the person to confirm.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !supabaseConfigured) return;
    const pending = fromUrl ? null : pendingInvite()?.code;
    const c = fromUrl || pending;
    if (!c) return;
    asked.current = true;
    inviteInfo(c).then(
      (info) => {
        if (info) {
          if (pending) setCode(formatCode(pending));
          setStep({ kind: "invite", info });
        } else if (pending) clearPendingInvite(); // a remembered code that died: forget it quietly
        else setError(BAD_CODE);
        setLooking(false);
      },
      (e) => {
        if (!pending) setError(errText(e));
        setLooking(false);
      },
    );
  }, [fromUrl]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur">
        <Logo />
        <span className="text-sm font-semibold sm:hidden">{PRODUCT_NAME}</span>
        <span className="ml-auto text-xs text-slate-500">Join your team</span>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-12">
          {!supabaseConfigured ? (
            <Card>
              <Problem title="Teams aren’t available on this server">
                This copy of {PRODUCT_NAME} isn’t connected to the cloud, so there’s no team to join here. Ask your office for the {PRODUCT_NAME} link they use.
              </Problem>
            </Card>
          ) : step.kind === "joined" ? (
            <Joined team={step.team} role={step.role} />
          ) : step.kind === "checkEmail" ? (
            <CheckEmail info={step.info} email={step.email} code={normalizeCode(code)} onJoined={(team, role) => setStep({ kind: "joined", team, role })} />
          ) : step.kind === "invite" ? (
            <Invite
              info={step.info}
              code={normalizeCode(code)}
              onBack={() => setStep({ kind: "code" })}
              onJoined={(team, role) => setStep({ kind: "joined", team, role })}
              onCheckEmail={(email) => setStep({ kind: "checkEmail", info: step.info, email })}
            />
          ) : looking ? (
            <Card>
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your invite…
              </p>
            </Card>
          ) : (
            <Card>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void lookup(code);
                }}
              >
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Ticket className="h-6 w-6" />
                  </div>
                  <h1 className="text-xl font-semibold">Join your company on {PRODUCT_NAME}</h1>
                  <p className="mt-1 text-sm text-slate-500">Enter the invite code you got by text or email.</p>
                </div>
                <div>
                  <label className="label" htmlFor="join-code">Invite code</label>
                  <input
                    id="join-code"
                    className="input h-12 text-center font-mono text-xl tracking-widest uppercase"
                    placeholder="K7QM-XR4T-PA"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </div>
                {error && <ErrorNote>{error}</ErrorNote>}
                <button className="btn btn-brand h-11 w-full" disabled={!normalizeCode(code)}>
                  Continue <ArrowRight />
                </button>
              </form>
            </Card>
          )}
          <p className="mt-6 text-center text-xs text-slate-400">
            Already set up?{" "}
            <Link href="/" className="font-medium text-slate-600 hover:underline">
              Go to your jobs
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card animate-in p-5 sm:p-6">{children}</div>;
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
        <CircleAlert className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{children}</p>
    </div>
  );
}

function InviteHeader({ info }: { info: InviteInfo }) {
  return (
    <div className="text-center">
      <p className="text-sm text-slate-500">You’re invited to join</p>
      <h1 className="mt-1 text-2xl font-semibold break-words text-slate-900">{info.team || "your company"}</h1>
      <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-600">
        as <RoleBadge role={info.role} long />
      </div>
      <p className="mx-auto mt-2 max-w-xs text-xs text-slate-500">{ROLE_INFO[info.role].description}</p>
    </div>
  );
}

/** Join with the current session, then refresh the jobs in the background. */
async function join(code: string, name: string) {
  const r = await acceptInvite(code, name);
  if (name.trim()) setAuthor(name); // the joined name is the name on this device (photos, ticks, "Mine")
  void useSyncStatus.getState().syncNow().catch(() => undefined);
  return r;
}

function Invite(props: { info: InviteInfo; code: string; onBack: () => void; onJoined: (team: string, role: TeamRole) => void; onCheckEmail: (email: string) => void }) {
  const { info, code } = props;
  const sync = useSyncStatus();
  const myTeam = useTeam((s) => (s.userId === sync.userId ? s.team : null));
  const [name, setName] = useState(() => {
    if (info.name) return info.name;
    const a = getAuthor(null);
    return a === "Me" ? "" : a;
  });
  // The office typed this person's name on the invite; it's the name tasks are assigned to, so it's kept unless they change it.
  const [editName, setEditName] = useState(!info.name);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("join");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    const r = await join(code, name);
    // Agreeing to the terms is noted on the account on every path (a no-op repeat for a brand-new login).
    void recordTermsAccepted();
    props.onJoined(r.team, r.role);
  };

  const needTerms = () => {
    if (!accepted) throw new Error("Please accept the Terms and Privacy Policy.");
  };

  const signIn = async () => {
    needTerms();
    const sb = getSupabase()!;
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken: await takeCaptcha() } });
    if (error) throw new Error(/invalid login/i.test(error.message) ? "That email and password don’t match an account. Check them, or create a new login." : error.message);
    await finish();
  };

  const createAccount = async () => {
    const problem = signupProblem({ email, password, name });
    if (problem) throw new Error(problem);
    needTerms();
    const sb = getSupabase()!;
    // Best: the server makes the account for this invite (one per code, rate limited, bot-checked). It's created
    // unconfirmed, so the usual answer is { ok: true, confirmEmail: true }: Supabase has emailed a confirmation link.
    // Falls back to the normal sign-up when the server can't make accounts.
    let fallback = true;
    try {
      const r = await fetch("/api/team/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(joinRequestBody({ code, email, password, name, captchaToken: await takeCaptcha(), termsVersion: TERMS_VERSION })),
      });
      const reply = joinReply(r.status, (await r.json().catch(() => ({}))) as Parameters<typeof joinReply>[1]);
      if (reply.kind === "checkEmail") {
        // Join automatically after they confirm and sign in on this device with this email (the email's link comes back
        // to this invite). Another account signing in here is only offered it.
        rememberPendingInvite(code, name.trim(), email);
        props.onCheckEmail(email.trim());
        return;
      }
      if (reply.kind === "signIn") fallback = false;
      else if (reply.kind === "exists") {
        setMode("existing");
        setNotice(`You already have a ${PRODUCT_NAME} account with this email. Sign in with its password to join.`);
        return;
      } else if (reply.kind === "error") throw new Error(reply.message);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e; // network trouble: try the normal sign-up
    }
    if (!fallback) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken: await takeCaptcha() } });
      if (error) throw new Error(error.message);
      await finish();
      return;
    }
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { ...(name.trim() ? { name: name.trim() } : {}), ...termsMetadata() },
        emailRedirectTo: joinUrl(window.location.origin, code),
        captchaToken: await takeCaptcha(),
      },
    });
    if (error) throw new Error(/already registered/i.test(error.message) ? "You already have an account with this email. Choose “I have an account” and sign in." : error.message);
    if (data.session) {
      await finish();
      return;
    }
    // Email confirmation is on: join automatically after they confirm and sign in on this device (with this email).
    rememberPendingInvite(code, name.trim(), email);
    props.onCheckEmail(email.trim());
  };

  const termsBox = (
    <label className="flex items-start gap-2.5 text-sm text-slate-600">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
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
  );

  if (sync.signedIn && myTeam) {
    const same = myTeam.name === info.team;
    return (
      <Card>
        <InviteHeader info={info} />
        <div className="mt-5 space-y-3">
          {same ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              You’re already on <span className="font-medium">{myTeam.name}</span> as {sync.email}.
            </p>
          ) : (
            <ErrorNote>
              You’re signed in as {sync.email}, which is already on {myTeam.name || "another team"}. Leave that team in Settings → Team first, or sign out and use a
              different email.
            </ErrorNote>
          )}
          <Link href="/" className="btn btn-brand h-11 w-full">
            <FolderOpen /> Open jobs
          </Link>
          {!same && (
            <button className="btn h-11 w-full" onClick={() => void signOut()}>
              Sign out
            </button>
          )}
        </div>
      </Card>
    );
  }

  const nameField = editName ? (
    <div>
      <label className="label" htmlFor="join-name">Your name</label>
      <input id="join-name" className="input h-11" autoComplete="name" maxLength={80} placeholder="First and last name" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="mt-1 text-xs text-slate-500">Your team sees this when they give you tasks, and it’s on the photos you take.</p>
    </div>
  ) : (
    <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
      You’ll join as <span className="font-medium text-slate-900">{name}</span>.{" "}
      <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => setEditName(true)}>
        Change
      </button>
    </p>
  );

  return (
    <Card>
      <InviteHeader info={info} />
      {!sync.authReady ? (
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking sign-in…
        </p>
      ) : sync.signedIn ? (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run("join", async () => {
              needTerms();
              await finish();
            });
          }}
        >
          {nameField}
          <p className="text-sm text-slate-500">
            Joining as <span className="font-medium text-slate-700">{sync.email}</span>.{" "}
            <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => void signOut()}>
              Not you?
            </button>
          </p>
          {termsBox}
          {error && <ErrorNote>{error}</ErrorNote>}
          <button className="btn btn-brand h-11 w-full" disabled={!!busy}>
            {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Join {info.team || "team"}
          </button>
        </form>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(mode, mode === "new" ? createAccount : signIn);
          }}
        >
          <div className="seg grid w-full grid-cols-2" role="tablist" aria-label="Account">
            {(
              [
                ["new", `New to ${PRODUCT_NAME}`],
                ["existing", "I have an account"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={`tab justify-center ${mode === m ? "tab-active" : ""}`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {nameField}
          <div>
            <label className="label" htmlFor="join-email">Email</label>
            <input id="join-email" className="input h-11" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="join-password">{mode === "new" ? "Choose a password" : "Password"}</label>
            <input
              id="join-password"
              className="input h-11"
              type="password"
              required
              minLength={mode === "new" ? PASSWORD_MIN : undefined}
              autoComplete={mode === "new" ? "new-password" : "current-password"}
              placeholder={mode === "new" ? `At least ${PASSWORD_MIN} characters` : ""}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "new" ? (
              <p className="mt-1 text-xs text-slate-500">You’ll use this email and password on the iPad and iPhone app too.</p>
            ) : (
              <div className="mt-2 text-right">
                <Link
                  href={`/reset${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  // After the reset they sign in and join automatically on this device.
                  onClick={() => rememberPendingInvite(code, name.trim(), email)}
                >
                  Forgot password?
                </Link>
              </div>
            )}
          </div>
          {termsBox}
          <div ref={captchaMount} className="flex justify-center empty:hidden" />
          {notice && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{notice}</p>}
          {(error ?? captchaError) && <ErrorNote>{error ?? captchaError}</ErrorNote>}
          <button className="btn btn-brand h-11 w-full" disabled={!!busy || !email || !password}>
            {busy ? <Loader2 className="animate-spin" /> : mode === "new" ? <UserPlus /> : <LogIn />}
            {mode === "new" ? (busy ? "Creating your login…" : "Create login & join") : busy ? "Signing in…" : "Sign in & join"}
          </button>
        </form>
      )}
      <button type="button" className="mt-4 block w-full text-center text-xs text-slate-400 hover:text-slate-600" onClick={props.onBack}>
        Use a different code
      </button>
    </Card>
  );
}

function CheckEmail({ info, email, code, onJoined }: { info: InviteInfo; email: string; code: string; onJoined: (team: string, role: TeamRole) => void }) {
  const sync = useSyncStatus();
  const team = useTeam((s) => (s.userId === sync.userId ? s.team : null));
  const role = useTeam((s) => s.role);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("join");

  // Confirmed in another tab on this device: the remembered invite is finished on sign-in.
  if (sync.signedIn && team && role) {
    return (
      <Card>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-2 font-semibold">You’re signed in and on {team.name}.</p>
          <button className="btn btn-brand mt-4 h-11 w-full" onClick={() => onJoined(team.name, role)}>
            Continue <ArrowRight />
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Check your email to finish</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your login is made, but it won’t work until you confirm it. We sent a confirmation link to <span className="font-medium break-all">{email}</span>.
        </p>
        <ol className="mx-auto mt-3 max-w-xs list-decimal space-y-1 pl-5 text-left text-sm text-slate-600">
          <li>Open the email from {PRODUCT_NAME} and tap the confirmation link.</li>
          <li>
            Sign in with your password — you’ll join <span className="font-medium">{info.team || "the team"}</span> automatically.
          </li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">Nothing after a few minutes? Check spam. Already had a {PRODUCT_NAME} account with this email? Just sign in below with its password.</p>
      </div>
      <form
        className="mt-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const { error } = await getSupabase()!.auth.signInWithPassword({ email, password, options: { captchaToken: await takeCaptcha() } });
            if (error) throw new Error(/not confirmed/i.test(error.message) ? "Your email isn’t confirmed yet. Open the link in the email first." : error.message);
            const r = await join(code, "");
            void recordTermsAccepted();
            onJoined(r.team, r.role);
          } catch (err) {
            setError(errText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label" htmlFor="confirm-password">Password</label>
          <input id="confirm-password" className="input h-11" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div ref={captchaMount} className="flex justify-center empty:hidden" />
        {(error ?? captchaError) && <ErrorNote>{error ?? captchaError}</ErrorNote>}
        <button className="btn btn-brand h-11 w-full" disabled={busy || !password}>
          {busy ? <Loader2 className="animate-spin" /> : <LogIn />} I’ve confirmed — sign in
        </button>
      </form>
    </Card>
  );
}

function Joined({ team, role }: { team: string; role: TeamRole }) {
  const router = useRouter();
  const email = useSyncStatus((s) => s.email);
  return (
    <Card>
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-semibold">You’re on {team || "the team"}</h1>
        <div className="mt-2 flex justify-center">
          <RoleBadge role={role} long />
        </div>
      </div>
      <ol className="mt-6 space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <FolderOpen className="h-4 w-4" />
          </span>
          <span className="text-slate-600">
            <span className="font-medium text-slate-900">Open Jobs</span> to see every team job. They download in the background — give it a moment the first time.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Smartphone className="h-4 w-4" />
          </span>
          <span className="text-slate-600">
            <span className="font-medium text-slate-900">On iPad or iPhone</span>, install {PRODUCT_NAME} and sign in with {email ? <span className="font-medium break-all">{email}</span> : "the same email"} and
            the same password.
          </span>
        </li>
        {role === "tech" && (
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <CircleAlert className="h-4 w-4" />
            </span>
            <span className="text-slate-600">Prices, estimates and Billdu stay with the office, so you won’t see them.</span>
          </li>
        )}
      </ol>
      <button className="btn btn-brand mt-6 h-11 w-full" onClick={() => router.push("/")}>
        Open jobs <ArrowRight />
      </button>
      <Link href="/settings#team" className="btn btn-ghost mt-2 h-10 w-full text-slate-500">
        Team settings
      </Link>
    </Card>
  );
}
