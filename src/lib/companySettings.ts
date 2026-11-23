"use client";
// Company settings: the business details every quote, invoice, report and PDF carries (name, phone, email, website,
// address, logo, standard terms). They belong to the company, not to one browser, so the company's copy is kept in the
// cloud (`company_settings`, one row per company: everyone on the team reads it, the owner and office admins write it)
// and every device keeps a cache in AppSettings.business, which is what the PDFs and pages read. Newest change wins,
// like the invoicing settings (docSettings.ts).
//
// A change made on this device is noticed even when it was saved by a screen that only knows AppSettings (Settings ›
// Business): this device remembers what it last synced, and anything different is a local change made at the
// settings' updatedAt.
import { db, getSettings, nowIso, saveSettings } from "./db";
import { readLocalOwner } from "./localOwner";
import { getSupabase } from "./supabase";
import { useTeam } from "./team";
import type { AppSettings, BusinessSettings } from "./types";

export interface CompanySettings {
  name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  /** Standard terms on quotes (BusinessSettings.estimateTerms). */
  terms: string;
  /** A site path, https URL or data: URL (BusinessSettings.logo). */
  logo: string;
  /** An uploaded image used as the logo, when an app stores it that way (not used by the web app yet). */
  logoImageId: string | null;
}

export const COMPANY_FIELDS = ["name", "phone", "email", "website", "address", "terms", "logo"] as const;

/** The company part of this device's business settings. */
export function companyFromBusiness(b: Partial<BusinessSettings>, logoImageId: string | null = null): CompanySettings {
  return {
    name: (b.name ?? "").trim(),
    phone: (b.phone ?? "").trim(),
    email: (b.email ?? "").trim(),
    website: (b.website ?? "").trim(),
    address: (b.address ?? "").trim(),
    terms: b.estimateTerms ?? "",
    logo: b.logo ?? "",
    logoImageId,
  };
}

/** This device's business settings with the company's details put in (colours, tagline etc. stay this device's). */
export function businessWithCompany(b: BusinessSettings, c: CompanySettings): BusinessSettings {
  return { ...b, name: c.name, phone: c.phone, email: c.email, website: c.website, address: c.address, estimateTerms: c.terms, logo: c.logo };
}

export const sameCompany = (a: CompanySettings, b: CompanySettings) => COMPANY_FIELDS.every((k) => a[k] === b[k]) && (a.logoImageId ?? null) === (b.logoImageId ?? null);

/** A database row → CompanySettings. */
export function companyFromRow(r: Record<string, unknown>): CompanySettings {
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  return {
    name: s("business_name"),
    phone: s("phone"),
    email: s("email"),
    website: s("website"),
    address: s("address"),
    terms: s("terms"),
    logo: s("logo"),
    logoImageId: typeof r.logo_image_id === "string" && r.logo_image_id ? r.logo_image_id : null,
  };
}

export function companyToRow(c: CompanySettings, ownerId: string, updatedAt: string) {
  return {
    owner_id: ownerId,
    business_name: c.name.slice(0, 200),
    phone: c.phone.slice(0, 60),
    email: c.email.slice(0, 254),
    website: c.website.slice(0, 300),
    address: c.address.slice(0, 500),
    terms: c.terms.slice(0, 20000),
    // A logo too big for the row stays on this device rather than failing the whole save.
    logo: c.logo.length <= 1_500_000 ? c.logo : "",
    logo_image_id: c.logoImageId,
    updated_at: updatedAt,
  };
}

/** What this device last synced (per account), to spot changes made since. */
export interface CompanySyncMark {
  userId: string;
  updatedAt: string;
  values: CompanySettings;
}

export interface CompanySyncInput {
  /** This device's current values. */
  local: CompanySettings;
  /** When this device's business settings were last saved. */
  localSavedAt: string | null;
  mark: CompanySyncMark | null;
  /** The company's row (null when there's none yet). */
  remote: { values: CompanySettings; updatedAt: string } | null;
  /** The owner or an office admin (technicians only read). */
  canWrite: boolean;
}

/** "push": send this device's copy. "pull": take the company's. "none": already the same, or nothing to do. */
export function companySyncAction(i: CompanySyncInput): "push" | "pull" | "none" {
  const changedHere = !i.mark || !sameCompany(i.local, i.mark.values);
  // Only a business that has its own name is worth sending; a blank (or never-touched) device just takes the company's.
  const worthSending = i.canWrite && changedHere && !!i.local.name;
  if (!i.remote) return worthSending ? "push" : "none";
  if (sameCompany(i.local, i.remote.values)) return "none";
  if (!worthSending) return "pull";
  // First sync for this account on this device: the company's copy wins. What this device had came from before
  // (another company, working alone, an old install), not from an edit made since the last sync.
  if (!i.mark && i.remote.values.name) return "pull";
  const localAt = Date.parse(i.localSavedAt ?? "") || 0;
  return localAt > Date.parse(i.remote.updatedAt) ? "push" : "pull";
}

// ---------------- this device ----------------

const MARK_KEY = "pinplan.companySettings";
export const COMPANY_SETTINGS_EVENT = "pinplan:company-settings";

function readMark(userId: string): CompanySyncMark | null {
  try {
    const m = JSON.parse(localStorage.getItem(MARK_KEY) ?? "null") as CompanySyncMark | null;
    return m?.userId === userId ? m : null;
  } catch {
    return null;
  }
}
function writeMark(m: CompanySyncMark) {
  try {
    localStorage.setItem(MARK_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable */
  }
}

/** The company's details as this device has them. */
export async function getCompanySettings(): Promise<CompanySettings> {
  return companyFromBusiness((await getSettings()).business);
}

async function signedIn() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  return user ? { sb, userId: user.id } : null;
}

/** Technicians read the company's details; the owner and office admins change them (the database checks it too). */
const canWrite = () => useTeam.getState().role !== "tech";

async function push(sb: NonNullable<ReturnType<typeof getSupabase>>, userId: string, c: CompanySettings, at: string): Promise<void> {
  const owner = await sb.rpc("my_billing_owner");
  if (owner.error || !owner.data) throw new Error(owner.error?.message ?? "No company");
  const { error } = await sb.from("company_settings").upsert(companyToRow(c, owner.data as string, at), { onConflict: "owner_id" });
  if (error) throw new Error(error.message);
  writeMark({ userId, updatedAt: at, values: c });
}

async function applyLocal(s: AppSettings, c: CompanySettings, fromCloud = false) {
  if (fromCloud) {
    // The company's copy coming down is not a change made here: the settings keep their save time, which the
    // company preferences compare (companyPreferences.ts).
    const d = db();
    await d.transaction("rw", d.settings, async () => {
      const stored = await d.settings.get("app");
      if (stored) await d.settings.put({ ...stored, business: businessWithCompany(stored.business, c) });
    });
  } else await saveSettings({ ...s, business: businessWithCompany(s.business, c) });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANY_SETTINGS_EVENT));
}

/** Save the company's details on this device, then for the whole company. `cloud` is false (with a reason when it
 *  failed) when only this device has them for now; the next sync sends them. */
export async function saveCompanySettings(patch: Partial<CompanySettings>): Promise<{ cloud: boolean; error?: string }> {
  const s = await getSettings();
  const next = { ...companyFromBusiness(s.business), ...patch };
  await applyLocal(s, next);
  const me = await signedIn();
  if (!me) return { cloud: false };
  try {
    if (!canWrite()) return { cloud: false };
    await push(me.sb, me.userId, next, nowIso());
    return { cloud: true };
  } catch (e) {
    return { cloud: false, error: (e as Error).message };
  }
}

/** Settings › Save: this device's settings, then (when the company part changed since `before`) the company's copy
 *  for everyone, through saveCompanySettings. Returns what is stored now (names trimmed) and whether the cloud has it. */
export async function saveSettingsAndCompany(next: AppSettings, before: AppSettings | null): Promise<{ settings: AppSettings; cloud: boolean; error?: string }> {
  await saveSettings(next);
  const company = companyFromBusiness(next.business);
  if (before && sameCompany(companyFromBusiness(before.business), company)) return { settings: await getSettings(), cloud: false };
  const patch: Partial<CompanySettings> = {};
  for (const k of COMPANY_FIELDS) patch[k] = company[k];
  const r = await saveCompanySettings(patch);
  return { settings: await getSettings(), ...r };
}

let pulling: Promise<void> | null = null;

/** Bring this device and the company's copy in step (newest change wins). Safe to call often; quiet when offline,
 *  signed out or a migration behind. */
export function pullCompanySettings(): Promise<void> {
  pulling ??= (async () => {
    const me = await signedIn();
    if (!me) return;
    // Only once this device's data is known to be this account's (sync's owner check): another account's details
    // left here must never go up into this company.
    if (readLocalOwner()?.userId !== me.userId) return;
    const { data, error } = await me.sb.from("company_settings").select("*").maybeSingle();
    if (error) return; // offline or the table isn't there yet
    const s = await getSettings();
    const stored = await db().settings.get("app");
    const local = companyFromBusiness(s.business);
    const mark = readMark(me.userId);
    const remote = data ? { values: companyFromRow(data as Record<string, unknown>), updatedAt: String((data as { updated_at: string }).updated_at) } : null;
    const action = companySyncAction({ local, localSavedAt: stored?.updatedAt ?? null, mark, remote, canWrite: canWrite() });
    if (action === "push") await push(me.sb, me.userId, local, stored?.updatedAt ?? nowIso());
    else if (action === "pull" && remote) {
      await applyLocal(s, remote.values, true);
      writeMark({ userId: me.userId, updatedAt: remote.updatedAt, values: remote.values });
    } else if (remote) writeMark({ userId: me.userId, updatedAt: remote.updatedAt, values: remote.values });
  })()
    .catch(() => undefined)
    .finally(() => {
      pulling = null;
    });
  return pulling;
}
