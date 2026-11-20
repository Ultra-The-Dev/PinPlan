"use client";
// First-run state kept on this device: demo mode, the company waiting for a confirmed email, and the
// onboarding checklist (ticks + dismissed). See onboardingLogic.ts for the rules.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { FOUNDER_BUSINESS } from "./catalog";
import { COMPANY_SETTINGS_EVENT, getCompanySettings, pullCompanySettings, saveCompanySettings } from "./companySettings";
import { db, getSettings } from "./db";
import { companyFromMetadata, onboardingDone, onboardingProgress, termsMetadata, type OnboardingStepId } from "./onboardingLogic";
import { setAuthor } from "./photos";
import { getSupabase } from "./supabase";
import { createTeam, useTeam } from "./team";
import type { TradeId } from "./types";
import { chooseTrades } from "./useTrades";

const DEMO_KEY = "pinplan.demo";
const PENDING_COMPANY_KEY = "pinplan.pendingCompany";
const ONBOARDING_KEY = "pinplan.onboarding";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

// ---------------- demo mode ----------------

/** "Try it without an account": the jobs list stays, even with no jobs and nobody signed in. */
export const isDemo = () => read<boolean>(DEMO_KEY) === true;
export const startDemo = () => write(DEMO_KEY, true);

// ---------------- company waiting for email confirmation ----------------

export interface PendingCompany {
  company: string;
  name: string;
  email: string;
  /** Trades picked at sign-up (applied once the company is made). */
  trades?: TradeId[];
}
export const rememberPendingCompany = (p: PendingCompany) => write(PENDING_COMPANY_KEY, { ...p, email: p.email.trim().toLowerCase() });
export const pendingCompany = () => read<PendingCompany>(PENDING_COMPANY_KEY);
export const clearPendingCompany = () => write(PENDING_COMPANY_KEY, null);

/** Fire-and-forget welcome email for a new company (the server answers 501 when email isn't set up; ignored). */
export function sendWelcomeEmail(company: string, name: string): void {
  void (async () => {
    const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    await fetch("/api/email/welcome", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ company: company.trim(), name: name.trim() }),
    });
  })().catch(() => undefined);
}

/** The company being made from a sign-up right now (so screens wait instead of offering "Set up your company"). */
export const useCompanySetup = create<{ finishing: string | null }>(() => ({ finishing: null }));

/** Sent when a company from a sign-up is ready: the jobs list moves on to /start. */
export const COMPANY_READY_EVENT = "pinplan:company-ready";

/** The signed-in account's user_metadata (null when signed out or offline). */
export async function accountMetadata(): Promise<Record<string, unknown> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return (data.session?.user.user_metadata as Record<string, unknown> | undefined) ?? null;
}

/** Note on the account that it agreed to the current Terms and Privacy Policy (best effort: the sign-up already
 *  sent it where it could). */
export async function recordTermsAccepted(): Promise<void> {
  await getSupabase()
    ?.auth.updateUser({ data: termsMetadata() })
    .catch(() => undefined);
}

/** Everything a brand-new company gets once its team exists: trades, this device's business name, the welcome email,
 *  and the checklist. The company is noted on the account so it's never made twice (another device, a later sign-in). */
export async function welcomeNewCompany(c: { company: string; name: string; email: string; trades?: TradeId[] }): Promise<void> {
  if (c.name.trim()) setAuthor(c.name.trim());
  if (c.trades?.length) await chooseTrades(c.trades).catch(() => undefined);
  await brandNewCompany(c.company, c.email).catch(() => undefined);
  await getSupabase()
    ?.auth.updateUser({ data: { company_created_at: new Date().toISOString() } })
    .catch(() => undefined);
  sendWelcomeEmail(c.company, c.name);
  markOnboardingStarted();
}

/** Call after sign-in: creates the team from a sign-up that was waiting for email confirmation — from this device's
 *  note, or else from the account itself (the link may have been opened on another device). Returns its name when it did. */
export async function finishPendingCompany(email: string | null): Promise<string | null> {
  const t = useTeam.getState();
  if (!t.userId || !email) return null;
  const mine = (p: PendingCompany | null) => (p && p.email === email.trim().toLowerCase() ? p : null);
  const local = mine(pendingCompany());
  // Only once: already on a team (or the team couldn't be read) means there's nothing to make.
  if (t.team) {
    if (local) clearPendingCompany();
    return null;
  }
  if (t.error || t.needsMigration) return null;
  // Only sign-ups made since the company travels with the account (they also note the terms): an older account that
  // isn't on a team any more gets "Set up your company" rather than a company made silently from an old sign-up.
  const meta = local ? null : await accountMetadata();
  const fromAccount = typeof meta?.terms_version === "string" ? companyFromMetadata(meta) : null;
  const p: PendingCompany | null = local ?? (fromAccount ? { ...fromAccount, email } : null);
  if (!p || useTeam.getState().team) return null;
  useCompanySetup.setState({ finishing: p.company });
  try {
    await createTeam(p.company, p.name);
    clearPendingCompany();
    await welcomeNewCompany({ company: p.company, name: p.name, email, trades: p.trades });
    if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANY_READY_EVENT));
    return p.company;
  } catch (e) {
    if (local && !/fetch|network/i.test((e as Error).message)) clearPendingCompany();
    return null;
  } finally {
    useCompanySetup.setState({ finishing: null });
  }
}

// ---------------- onboarding checklist ----------------

interface OnboardingStore {
  /** Shown since this device's sign-up (the compact card only appears for new companies). */
  started?: boolean;
  dismissed?: boolean;
  ticked?: Partial<Record<OnboardingStepId, boolean>>;
}
const readOnboarding = (): OnboardingStore => read<OnboardingStore>(ONBOARDING_KEY) ?? {};
const ONBOARDING_EVENT = "pinplan:onboarding";
function saveOnboarding(next: OnboardingStore) {
  write(ONBOARDING_KEY, next);
  window.dispatchEvent(new Event(ONBOARDING_EVENT));
}

/** Re-read the checklist (after saving business details). */
export const refreshOnboarding = () => window.dispatchEvent(new Event(ONBOARDING_EVENT));
export const markOnboardingStarted = () => saveOnboarding({ ...readOnboarding(), started: true, dismissed: false });
export const dismissOnboarding = () => saveOnboarding({ ...readOnboarding(), dismissed: true });
export const tickOnboarding = (step: OnboardingStepId, on = true) => {
  const s = readOnboarding();
  saveOnboarding({ ...s, ticked: { ...s.ticked, [step]: on } });
};

export interface OnboardingView {
  ready: boolean;
  started: boolean;
  dismissed: boolean;
  done: Record<OnboardingStepId, boolean>;
  progress: ReturnType<typeof onboardingProgress>;
}

/** The checklist, with steps detected from the data (the company's name and phone, a floor plan, teammates). */
export function useOnboarding(): OnboardingView {
  const members = useTeam((s) => s.members.length);
  const [state, setState] = useState<{ ready: boolean; store: OnboardingStore; businessName: boolean; hasPlan: boolean }>({
    ready: false,
    store: {},
    businessName: false,
    hasPlan: false,
  });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [company, sheets] = await Promise.all([getCompanySettings().catch(() => null), db().sheets.filter((s) => !s.deleted).count().catch(() => 0)]);
      if (alive) setState({ ready: true, store: readOnboarding(), businessName: !!company && businessReady(company), hasPlan: sheets > 0 });
    };
    void load();
    // The company's details may have been filled in on another device.
    void pullCompanySettings();
    window.addEventListener(ONBOARDING_EVENT, load);
    window.addEventListener(COMPANY_SETTINGS_EVENT, load);
    window.addEventListener("pinplan:synced", load);
    return () => {
      alive = false;
      window.removeEventListener(ONBOARDING_EVENT, load);
      window.removeEventListener(COMPANY_SETTINGS_EVENT, load);
      window.removeEventListener("pinplan:synced", load);
    };
  }, []);
  const done = onboardingDone({ businessName: state.businessName, hasPlan: state.hasPlan, teamMembers: members }, state.store.ticked ?? {});
  return { ready: state.ready, started: !!state.store.started, dismissed: !!state.store.dismissed, done, progress: onboardingProgress(done) };
}

/** The business settings still carry the built-in sample company, not this company's own details. */
export const isSampleBusiness = (name: string) => !name.trim() || name.trim() === FOUNDER_BUSINESS.name;

/** Step 1 is done once the business has its own name and phone (not the sample company's). */
const businessReady = (b: { name: string; phone: string }) => !isSampleBusiness(b.name) && !!b.phone.trim() && b.phone !== FOUNDER_BUSINESS.phone;

/** After sign-up: put the new company's name and email on its estimates and proposals (if this device has no business yet). */
export async function brandNewCompany(company: string, email: string): Promise<void> {
  const s = await getSettings();
  if (!isSampleBusiness(s.business.name)) return;
  // For the whole company (company_settings), so every device and teammate starts with the right name.
  await saveCompanySettings({ name: company.trim(), email: email.trim() });
}

// ---------------- leaving this device ----------------

/** After the account is deleted: wipe this device's jobs, photos, settings and PinPlan keys. */
export async function clearLocalData(): Promise<void> {
  try {
    const d = db();
    d.close();
    await d.delete();
  } catch {
    /* IndexedDB unavailable */
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("pinplan") || k.startsWith("sb-")) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}
