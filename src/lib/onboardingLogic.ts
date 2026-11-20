// Sign-up, first-run and account-deletion rules. Pure (no browser or network), shared by the pages, the
// /api/account route and the tests.
import { t, tn } from "./i18n";
import { PASSWORD_MIN, signupProblem, type TeamRole } from "./teamLogic";
import { normalizeTrades } from "./trades";
import type { TradeId } from "./types";

// ---------------- where "/" sends a visitor ----------------

export interface LandingInput {
  /** Supabase is set up on this server (accounts exist at all). */
  configured: boolean;
  /** The saved sign-in has been read. */
  authReady: boolean;
  signedIn: boolean;
  /** Jobs on this device (null while still counting). */
  localJobs: number | null;
  /** The visitor chose "Try it without an account" on this device. */
  demo: boolean;
  /** Signed in: on a company team (true), not on one (false), or not known yet (null). Leave it out where the team
   *  doesn't matter. */
  hasTeam?: boolean | null;
}

/** "welcome": first-time visitor → landing page. "setup": signed in but not in a company yet → "Set up your company".
 *  "stay": show the jobs list. "wait": not known yet. */
export function landingDecision(i: LandingInput): "welcome" | "setup" | "stay" | "wait" {
  // A self-hosted, local-only copy has no accounts to sign up for: it's just the app.
  if (!i.configured) return "stay";
  // Every account belongs to a company: someone signed in without one sets it up (or joins one) first.
  if (i.authReady && i.signedIn && i.hasTeam === false) return "setup";
  if (i.authReady && i.signedIn && i.hasTeam === null && !i.localJobs) return "wait";
  if (i.demo) return "stay";
  if (i.localJobs !== null && i.localJobs > 0) return "stay";
  if (i.authReady && i.signedIn) return "stay";
  if (!i.authReady || i.localJobs === null) return "wait";
  return "welcome";
}

// ---------------- sign-up form ----------------

export interface PasswordStrength {
  /** 0 (empty) … 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: "" | "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  hint: string;
}

const COMMON =
  /^(password\d{0,4}!?|passw0rd\d{0,4}|1234567890?|0123456789|qwerty\d{0,4}|qwertyuiop|1q2w3e4r5t|iloveyou\d{0,4}|letmein\d{0,4}|welcome\d{0,4}|changeme\d{0,4}|abc1234567|abcdefghij|administrator|pinplan\d{0,4})$/i;

/** A quick, honest strength meter: length matters most, then variety; common passwords are always weak. */
export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "", hint: t("At least {n} characters.", { n: PASSWORD_MIN }) };
  if (pw.length < PASSWORD_MIN) return { score: 1, label: "Too short", hint: tn("{n} more character.", "{n} more characters.", PASSWORD_MIN - pw.length) };
  if (COMMON.test(pw) || /^(.)\1+$/.test(pw)) return { score: 1, label: "Weak", hint: t("That one is easy to guess. Try a short phrase.") };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let points = (pw.length >= 12 ? 2 : pw.length >= 10 ? 1 : 0) + (kinds >= 3 ? 2 : kinds === 2 ? 1 : 0);
  if (pw.length >= 16) points += 1;
  if (points <= 1) return { score: 2, label: "Fair", hint: t("Longer is stronger — add a word or two.") };
  if (points <= 3) return { score: 3, label: "Good", hint: t("Good. A few more characters make it strong.") };
  return { score: 4, label: "Strong", hint: t("Strong password.") };
}

export interface CompanySignup {
  company: string;
  name: string;
  email: string;
  password: string;
  accepted: boolean;
}

/** The first problem with the company sign-up form, or null when it can be sent. */
export function companySignupProblem(f: CompanySignup): string | null {
  const company = f.company.trim();
  if (!company) return t("Enter your company name.");
  if (company.length > 120) return t("Keep the company name under 120 characters.");
  if (!f.name.trim()) return t("Enter your name.");
  const base = signupProblem({ email: f.email, password: f.password, name: f.name });
  if (base) return base;
  if (passwordStrength(f.password).score < 2) return t("Choose a less common password.");
  if (!f.accepted) return t("Please accept the Terms and Privacy Policy.");
  return null;
}

/** Supabase's sign-up / sign-in errors, in plain words. */
export function authErrorMessage(message: string | null | undefined): string {
  const m = message ?? "";
  const min = /should be at least (\d+) characters/i.exec(m);
  if (min) return t("Use a password of at least {n} characters.", { n: min[1] });
  if (/captcha/i.test(m)) return t("We couldn’t check that you’re a person. Wait a moment and try again.");
  if (/already (registered|been registered)|user already exists/i.test(m)) return t("There’s already an account with this email. Sign in instead, or reset your password.");
  if (/invalid login credentials/i.test(m)) return t("That email and password don’t match. Check them, or reset your password.");
  if (/email not confirmed/i.test(m)) return t("Confirm your email first — open the link we sent you (check spam), then sign in.");
  if (/rate limit|too many|security purposes/i.test(m)) return t("Too many tries for now. Wait a minute and try again.");
  if (/signups? not allowed|signup.*disabled/i.test(m)) return t("New sign-ups are turned off on this server.");
  if (/failed to fetch|network/i.test(m)) return t("Can’t reach the server. Check your connection and try again.");
  if (/weak|pwned|leaked/i.test(m)) return t("That password is too easy to guess. Choose another one.");
  return m ? t(m) : t("Something went wrong. Try again.");
}

// ---------------- terms ----------------

/** Which Terms of Service and Privacy Policy people agree to. Change it together with LEGAL_EFFECTIVE_DATE (legal.ts)
 *  whenever either document materially changes. */
export const TERMS_VERSION = "2026-11";

/** Stored in the account's user_metadata on every sign-up path (company sign-up, invite, "Set up your company"). */
export const termsMetadata = (now = new Date()) => ({ terms_accepted_at: now.toISOString(), terms_version: TERMS_VERSION });

/** The account has agreed to the current terms. */
export const acceptedTerms = (meta: Record<string, unknown> | null | undefined) =>
  meta?.terms_version === TERMS_VERSION && typeof meta?.terms_accepted_at === "string";

// ---------------- the company a new account is waiting for ----------------

export interface CompanyFromSignup {
  company: string;
  name: string;
  trades: TradeId[];
}

/** The company a sign-up asked for, from the account's user_metadata, so it can be made on whichever device opens the
 *  confirmation email. Null when the account didn't sign up as a company, or the company was already made. */
export function companyFromMetadata(meta: Record<string, unknown> | null | undefined): CompanyFromSignup | null {
  if (!meta || meta.company_created_at) return null;
  const company = typeof meta.company === "string" ? meta.company.trim().slice(0, 120) : "";
  if (!company) return null;
  const name = typeof meta.name === "string" ? meta.name.trim().slice(0, 80) : "";
  const trades = Array.isArray(meta.trades) && meta.trades.length ? normalizeTrades(meta.trades) : [];
  return { company, name, trades };
}

/** The first problem with "Set up your company", or null. `accepted` is only asked of accounts that haven't agreed yet. */
export function setupCompanyProblem(f: { company: string; name: string; accepted: boolean }): string | null {
  const company = f.company.trim();
  if (!company) return t("Enter your company name.");
  if (company.length > 120) return t("Keep the company name under 120 characters.");
  if (!f.name.trim()) return t("Enter your name.");
  if (f.name.trim().length > 80) return t("Keep your name under 80 characters.");
  if (!f.accepted) return t("Please accept the Terms and Privacy Policy.");
  return null;
}

// ---------------- /start ----------------

export type StartView = "loading" | "setup" | "finishing" | "tech" | "checklist";

/** What /start shows: the checklist (owner and office, or a local-only copy), a short "Get the app" page for
 *  technicians, "Set up your company" for an account without one, or a spinner while that's being worked out. */
export function startView(i: {
  configured: boolean;
  authReady: boolean;
  signedIn: boolean;
  /** On a team (true), not on one (false), not known yet (null). */
  hasTeam: boolean | null;
  role: TeamRole | null;
  /** A company from the sign-up is being made right now. */
  finishing: boolean;
}): StartView {
  if (!i.configured) return "checklist";
  if (!i.authReady) return "loading";
  if (!i.signedIn) return "checklist";
  if (i.finishing) return "finishing";
  if (i.hasTeam === null) return "loading";
  if (!i.hasTeam) return "setup";
  return i.role === "tech" ? "tech" : "checklist";
}

/** The App Store link (NEXT_PUBLIC_APP_STORE_URL), or "" when it isn't set or isn't an https link. */
export function appStoreUrl(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  try {
    return v && new URL(v).protocol === "https:" ? v : "";
  } catch {
    return "";
  }
}

// ---------------- first-run checklist ----------------

export type OnboardingStepId = "business" | "plan" | "team" | "app";
export const ONBOARDING_STEPS: OnboardingStepId[] = ["business", "plan", "team", "app"];

export interface OnboardingSignals {
  /** The company's own name and phone are in the company settings (companySettings.ts). */
  businessName: boolean;
  /** At least one floor plan sheet on this device. */
  hasPlan: boolean;
  /** Someone else is on the team. */
  teamMembers: number;
}

/** Which steps are done: detected from the data, or ticked by hand. */
export function onboardingDone(signals: OnboardingSignals, ticked: Partial<Record<OnboardingStepId, boolean>>): Record<OnboardingStepId, boolean> {
  return {
    business: signals.businessName || !!ticked.business,
    plan: signals.hasPlan || !!ticked.plan,
    team: signals.teamMembers > 1 || !!ticked.team,
    app: !!ticked.app,
  };
}

export function onboardingProgress(done: Record<OnboardingStepId, boolean>): { done: number; total: number; next: OnboardingStepId | null; complete: boolean } {
  const n = ONBOARDING_STEPS.filter((s) => done[s]).length;
  return { done: n, total: ONBOARDING_STEPS.length, next: ONBOARDING_STEPS.find((s) => !done[s]) ?? null, complete: n === ONBOARDING_STEPS.length };
}

// ---------------- account deletion ----------------

export interface DeletionInput {
  userId: string;
  /** The user's team row, if on a team. */
  membership: { teamId: string; role: TeamRole } | null;
  /** The team's owner (for members). */
  teamOwnerId: string | null;
  /** Everyone on the team, including the user. */
  memberCount: number;
}

export type DeletionPlan =
  | { ok: false; status: 409; code: "team_has_members"; message: string }
  | {
      ok: true;
      /** Team to delete with the account (an owner on their own). */
      deleteTeamId: string | null;
      /** A team member's jobs stay with the company: they move to this user (the team owner) first. */
      transferJobsTo: string | null;
    };

/** What deleting this account does, or why it can't be done yet. */
export function accountDeletionPlan(i: DeletionInput): DeletionPlan {
  if (!i.membership) return { ok: true, deleteTeamId: null, transferJobsTo: null };
  if (i.membership.role === "owner") {
    if (i.memberCount > 1) {
      const others = i.memberCount - 1;
      return {
        ok: false,
        status: 409,
        code: "team_has_members",
        message: `You own a team with ${others} other ${others === 1 ? "person" : "people"}. Remove them in Settings › Team first (their own logins stay), then delete your account.`,
      };
    }
    return { ok: true, deleteTeamId: i.membership.teamId, transferJobsTo: null };
  }
  const owner = i.teamOwnerId && i.teamOwnerId !== i.userId ? i.teamOwnerId : null;
  return { ok: true, deleteTeamId: null, transferJobsTo: owner };
}

/** The confirmation word the user must type. */
export const DELETE_WORD = "DELETE";
export const deleteConfirmed = (typed: string) => typed.trim() === DELETE_WORD;
