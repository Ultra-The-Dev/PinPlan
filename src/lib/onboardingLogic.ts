// Sign-up, first-run and account-deletion rules. Pure (no browser or network), shared by the pages, the
// /api/account route and the tests.
import { PASSWORD_MIN, signupProblem, type TeamRole } from "./teamLogic";

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
}

/** "welcome": first-time visitor → landing page. "stay": show the jobs list. "wait": not known yet. */
export function landingDecision(i: LandingInput): "welcome" | "stay" | "wait" {
  // A self-hosted, local-only copy has no accounts to sign up for: it's just the app.
  if (!i.configured || i.demo) return "stay";
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

const COMMON = /^(password|passw0rd|12345678|123456789|1234567890|qwerty12|qwertyuiop|iloveyou|letmein1|abc12345|11111111|00000000|pinplan1?)$/i;

/** A quick, honest strength meter: length matters most, then variety; common passwords are always weak. */
export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "", hint: `At least ${PASSWORD_MIN} characters.` };
  if (pw.length < PASSWORD_MIN) return { score: 1, label: "Too short", hint: `${PASSWORD_MIN - pw.length} more character${PASSWORD_MIN - pw.length === 1 ? "" : "s"}.` };
  if (COMMON.test(pw) || /^(.)\1+$/.test(pw)) return { score: 1, label: "Weak", hint: "That one is easy to guess. Try a short phrase." };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let points = (pw.length >= 12 ? 2 : pw.length >= 10 ? 1 : 0) + (kinds >= 3 ? 2 : kinds === 2 ? 1 : 0);
  if (pw.length >= 16) points += 1;
  if (points <= 1) return { score: 2, label: "Fair", hint: "Longer is stronger — add a word or two." };
  if (points <= 3) return { score: 3, label: "Good", hint: "Good. A few more characters make it strong." };
  return { score: 4, label: "Strong", hint: "Strong password." };
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
  if (!company) return "Enter your company name.";
  if (company.length > 120) return "Keep the company name under 120 characters.";
  if (!f.name.trim()) return "Enter your name.";
  const base = signupProblem({ email: f.email, password: f.password, name: f.name });
  if (base) return base;
  if (passwordStrength(f.password).score < 2) return "Choose a less common password.";
  if (!f.accepted) return "Please accept the Terms and Privacy Policy.";
  return null;
}

/** Supabase's sign-up / sign-in errors, in plain words. */
export function authErrorMessage(message: string | null | undefined): string {
  const m = message ?? "";
  if (/already (registered|been registered)|user already exists/i.test(m)) return "There’s already an account with this email. Sign in instead, or reset your password.";
  if (/invalid login credentials/i.test(m)) return "That email and password don’t match. Check them, or reset your password.";
  if (/email not confirmed/i.test(m)) return "Confirm your email first — open the link we sent you (check spam), then sign in.";
  if (/rate limit|too many|security purposes/i.test(m)) return "Too many tries for now. Wait a minute and try again.";
  if (/signups? not allowed|signup.*disabled/i.test(m)) return "New sign-ups are turned off on this server.";
  if (/failed to fetch|network/i.test(m)) return "Can’t reach the server. Check your connection and try again.";
  if (/weak|pwned|leaked/i.test(m)) return "That password is too easy to guess. Choose another one.";
  return m || "Something went wrong. Try again.";
}

// ---------------- first-run checklist ----------------

export type OnboardingStepId = "business" | "plan" | "team" | "app";
export const ONBOARDING_STEPS: OnboardingStepId[] = ["business", "plan", "team", "app"];

export interface OnboardingSignals {
  /** The company's own name and phone are in Settings › Business. */
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
