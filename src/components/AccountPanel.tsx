"use client";
import { CheckCircle2, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCaptcha } from "@/lib/captcha";
import { checkCloudSetup, type CheckResult } from "@/lib/cloudCheck";
import { authErrorMessage } from "@/lib/onboardingLogic";
import { getSupabase } from "@/lib/supabase";
import type { RefusedChange, SyncTable } from "@/lib/db";
import { discardRefused, keepPreviousAccountData, listRefused, removePreviousAccountData, retryRefused, signOut, useSyncStatus } from "@/lib/sync";
import { PASSWORD_MIN } from "@/lib/teamLogic";
import AccountData from "./AccountData";

/** Account + sync settings. Local-only mode when Supabase env vars are missing. */
export default function AccountPanel() {
  const s = useSyncStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Bot check (when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set): Supabase Auth may require a token on every sign-in.
  const { mount: captchaMount, error: captchaError, take: takeCaptcha } = useCaptcha("login");

  if (!s.configured) {
    return (
      <section id="account" className="space-y-2">
        <h2 className="text-lg font-semibold">Account &amp; sync</h2>
        <p className="text-sm text-slate-600">
          <span className="font-medium">Local only</span> (Supabase not configured). Everything is saved on this device and works offline.
          To share plans with your team, set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and run the
          migration in <code>supabase/migrations</code>.
        </p>
      </section>
    );
  }

  const sb = getSupabase();
  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await fn();
      // A link for an email with no account (shouldCreateUser: false) gets the same answer as one that has an account.
      setMsg(!error || /signups? not allowed for otp/i.test(error.message) ? ok : authErrorMessage(error.message));
    } catch (e) {
      setMsg(authErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="account" className="space-y-3">
      <h2 className="text-lg font-semibold">Account &amp; sync</h2>
      <CloudCheck />
      {!s.authReady ? (
        <p className="text-sm text-slate-500">Checking sign-in…</p>
      ) : s.signedIn ? (
        <div className="space-y-3">
          <p className="text-sm">
            Signed in as <span className="font-medium">{s.email}</span>
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Connection</dt>
            <dd>{s.online ? "Online" : "Offline — changes are queued"}</dd>
            <dt className="text-slate-500">Pending changes</dt>
            <dd>{s.pending}</dd>
            <dt className="text-slate-500">Last sync</dt>
            <dd>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : "—"}</dd>
            {s.error && (
              <>
                <dt className="text-slate-500">Error</dt>
                <dd className="text-red-600">{s.error}</dd>
              </>
            )}
          </dl>
          {s.ownerMismatch && <OtherAccountData previous={s.ownerMismatch.email} />}
          {s.refused > 0 && <RefusedChanges count={s.refused} />}
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={s.syncing || !s.online || !!s.ownerMismatch} onClick={() => s.syncNow()}>
              {s.syncing ? "Syncing…" : "Sync now"}
            </button>
            <SignOut pending={s.pending + s.refused} />
          </div>
          <SetPassword />
          <AccountData />
        </div>
      ) : (
        <form
          className="max-w-sm space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => sb!.auth.signInWithPassword({ email, password, options: { captchaToken: await takeCaptcha() } }), "Signed in.");
          }}
        >
          <p className="text-sm text-slate-600">Sign in to sync plans across devices and share them with your crew.</p>
          <input className="input" type="email" required placeholder="Email" aria-label="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" aria-label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !password} className="btn btn-primary">
              Sign in
            </button>
            <button
              type="button"
              disabled={busy || !email}
              className="btn"
              // Sign-in only: new accounts go through /signup, which records the terms they accept.
              onClick={() =>
                run(
                  async () =>
                    sb!.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/settings`, captchaToken: await takeCaptcha() } }),
                  "If there’s an account for this email, a sign-in link is on its way — check your email.",
                )
              }
            >
              Email me a link
            </button>
          </div>
          <div ref={captchaMount} className="flex justify-center empty:hidden" />
          {(msg ?? captchaError) && <p className="text-sm text-slate-700">{msg ?? captchaError}</p>}
          <p className="text-xs text-slate-500">
            New company? <Link href="/signup" className="font-medium text-slate-700 underline underline-offset-2">Start a free trial</Link> ·{" "}
            <Link href="/reset" className="font-medium text-slate-700 underline underline-offset-2">Forgot password?</Link>
          </p>
        </form>
      )}
    </section>
  );
}

/** Another account's jobs are on this device: sync waits until the person removes them (or, deliberately, keeps them). */
function OtherAccountData({ previous }: { previous: string | null }) {
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  return (
    <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
      <p className="font-medium">Sync is paused: this device has jobs from {previous ? <span className="break-all">{previous}</span> : "another account"}.</p>
      <p>Remove them from this device before syncing, so they don’t end up in this account. Anything that account didn’t sync yet will be lost.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await removePreviousAccountData();
          }}
        >
          {busy ? "Removing…" : "Remove and sync"}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void signOut()}>
          Sign out instead
        </button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setMore((v) => !v)} aria-expanded={more}>
          More
        </button>
      </div>
      {more && (
        <div className="space-y-1 border-t border-amber-200 pt-2">
          <p className="text-xs">Same company, new login? You can keep the jobs and add them to this account instead.</p>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => keepPreviousAccountData()}>
            Keep the jobs and add them to this account
          </button>
        </div>
      )}
    </div>
  );
}

/** Changes the cloud didn't accept: everything else kept syncing. Discard takes the cloud's copy back. */
function RefusedChanges({ count }: { count: number }) {
  const online = useSyncStatus((s) => s.online);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RefusedChange[] | null>(null);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setRows(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
      <p className="font-medium">
        {count} {count === 1 ? "change wasn’t" : "changes weren’t"} accepted
      </p>
      <p>Everything else synced. Discard puts these back the way they are in the cloud.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-danger" disabled={busy || !online} onClick={() => act(discardRefused)}>
          Discard
        </button>
        <button type="button" className="btn btn-sm" disabled={busy || !online} onClick={() => act(retryRefused)}>
          Try again
        </button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => setRows(rows ? null : await listRefused())} aria-expanded={!!rows}>
          {rows ? "Hide details" : "Details"}
        </button>
      </div>
      {rows && (
        <ul className="space-y-1 text-xs text-red-800">
          {rows.map((r) => (
            <li key={r.id} className="break-words">
              <span className="font-medium">{REFUSED_LABELS[r.table] ?? r.table}</span> · {r.error}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

const REFUSED_LABELS: Partial<Record<SyncTable, string>> = {
  projects: "Job",
  sheets: "Plan",
  deviceTypes: "Price list item",
  products: "Brand & model",
  markers: "Device",
  runs: "Wire run",
  closets: "Panel / closet",
  estimateLines: "Pricing line",
  photos: "Photo",
  photoComments: "Photo comment",
  checklists: "Checklist",
  jobLogs: "Daily log",
  documents: "Document",
  salesDocs: "Quote or invoice",
  salesPayments: "Payment",
  jobTemplates: "Job template",
  changeOrders: "Change order",
  rfis: "RFI",
  scheduleItems: "Schedule item",
  forms: "Form",
  measurements: "Measurement",
  sheetLinks: "Plan link",
  tasks: "Task",
  planMarkups: "Markup",
};

/** Sign out, optionally removing this device's jobs too (with a warning when changes haven't synced). */
function SignOut({ pending }: { pending: number }) {
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Sign out
      </button>
    );
  return (
    <div className="w-full max-w-sm space-y-2 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
        <span>Also remove jobs from this device</span>
      </label>
      {pending > 0 && (
        <p className="text-xs text-amber-800">
          {pending} {pending === 1 ? "change hasn’t" : "changes haven’t"} synced yet.{" "}
          {remove ? "Removing jobs now loses them — sync first." : "They stay on this device and sync when you sign in again."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn btn-sm ${remove ? "btn-danger" : "btn-primary"}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signOut({ removeData: remove });
            } finally {
              setBusy(false);
              setOpen(false);
            }
          }}
        >
          {remove ? "Sign out and remove" : "Sign out"}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Tests each piece of the cloud setup (keys, sign-in, tables, functions, storage, saving) and says what to fix. */
function CloudCheck() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm text-slate-600">Something not syncing or proposals failing? Check every part of the cloud setup.</span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setResults(await checkCloudSetup());
            } catch (e) {
              setResults([{ name: "Cloud check", ok: false, fix: (e as Error).message }]);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Checking…" : "Check cloud setup"}
        </button>
      </div>
      {results && (
        <ul className="mt-3 space-y-2">
          {results.map((r) => (
            <li key={r.name} className="flex gap-2 text-sm">
              {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
              <div>
                <span className="font-medium">{r.name}</span>
                {r.detail && r.ok && <span className="text-slate-500"> · {r.detail}</span>}
                {!r.ok && r.fix && <div className="text-slate-600">{r.fix}</div>}
                {!r.ok && r.detail && <div className="text-xs text-slate-400">{r.detail}</div>}
              </div>
            </li>
          ))}
          {results.every((r) => r.ok) && <li className="text-sm font-medium text-emerald-700">All good — sync and proposal links are ready.</li>}
        </ul>
      )}
    </div>
  );
}

/** Accounts made with a magic link have no password; the iPad app signs in with email + password. */
function SetPassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = pw.length >= PASSWORD_MIN && pw.length <= 72 && pw === pw2;
  return (
    <form
      className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setMsg(null);
        const { error } = (await getSupabase()?.auth.updateUser({ password: pw })) ?? { error: { message: "Not connected" } };
        setBusy(false);
        setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password set. On the iPad/iPhone, sign in with this email and password." });
        if (!error) {
          setPw("");
          setPw2("");
        }
      }}
    >
      <div className="text-sm font-medium">Set or change password</div>
      <p className="text-xs text-slate-500">Signed in with a magic link? Set a password here to sign in on the iPad and iPhone app.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-56" type="password" autoComplete="new-password" placeholder={`New password (${PASSWORD_MIN}+ characters)`} aria-label="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="input max-w-56" type="password" autoComplete="new-password" placeholder="Repeat password" aria-label="Repeat new password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <button className="btn" disabled={busy || !valid}>
          {busy ? "Saving…" : "Set password"}
        </button>
      </div>
      {pw && pw.length < PASSWORD_MIN && <p className="text-xs text-slate-500">Use at least {PASSWORD_MIN} characters.</p>}
      {pw2 && pw !== pw2 && <p className="text-xs text-amber-700">The two passwords don’t match.</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </form>
  );
}
