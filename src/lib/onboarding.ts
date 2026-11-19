"use client";
// First-run state kept on this device: demo mode, the company waiting for a confirmed email, and the
// onboarding checklist (ticks + dismissed). See onboardingLogic.ts for the rules.
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "./catalog";
import { db, getSettings, saveSettings } from "./db";
import { onboardingDone, onboardingProgress, type OnboardingStepId } from "./onboardingLogic";
import { getSupabase } from "./supabase";
import { createTeam, useTeam } from "./team";

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

/** Call after sign-in: creates the team from a sign-up that was waiting for email confirmation. Returns its name when it did. */
export async function finishPendingCompany(email: string | null): Promise<string | null> {
  const p = pendingCompany();
  const t = useTeam.getState();
  if (!p || !t.userId || !email) return null;
  // Only for the account that signed up, and only once.
  if (p.email !== email.trim().toLowerCase() || t.team) {
    if (t.team && p.email === email.trim().toLowerCase()) clearPendingCompany();
    return null;
  }
  try {
    await createTeam(p.company, p.name);
    clearPendingCompany();
    sendWelcomeEmail(p.company, p.name);
    write(ONBOARDING_KEY, { ...readOnboarding(), started: true });
    return p.company;
  } catch (e) {
    if (!/fetch|network/i.test((e as Error).message)) clearPendingCompany();
    return null;
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

/** The checklist, with steps detected from this device's data (business name, a floor plan, teammates). */
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
      const [settings, sheets] = await Promise.all([getSettings().catch(() => null), db().sheets.filter((s) => !s.deleted).count().catch(() => 0)]);
      if (alive) setState({ ready: true, store: readOnboarding(), businessName: !!settings && businessReady(settings.business), hasPlan: sheets > 0 });
    };
    void load();
    window.addEventListener(ONBOARDING_EVENT, load);
    window.addEventListener("pinplan:synced", load);
    return () => {
      alive = false;
      window.removeEventListener(ONBOARDING_EVENT, load);
      window.removeEventListener("pinplan:synced", load);
    };
  }, []);
  const done = onboardingDone({ businessName: state.businessName, hasPlan: state.hasPlan, teamMembers: members }, state.store.ticked ?? {});
  return { ready: state.ready, started: !!state.store.started, dismissed: !!state.store.dismissed, done, progress: onboardingProgress(done) };
}

/** The business settings still carry the built-in sample company, not this company's own details. */
export const isSampleBusiness = (name: string) => !name.trim() || name.trim() === DEFAULT_SETTINGS.business.name;

/** Step 1 is done once the business has its own name and phone (not the sample company's). */
const businessReady = (b: { name: string; phone: string }) => !isSampleBusiness(b.name) && !!b.phone.trim() && b.phone !== DEFAULT_SETTINGS.business.phone;

/** After sign-up: put the new company's name and email on its estimates and proposals (if this device has no business yet). */
export async function brandNewCompany(company: string, email: string): Promise<void> {
  const s = await getSettings();
  if (!isSampleBusiness(s.business.name)) return;
  await saveSettings({ ...s, business: { ...s.business, name: company.trim(), email: email.trim() } });
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
