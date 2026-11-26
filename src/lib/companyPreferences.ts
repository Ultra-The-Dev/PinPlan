"use client";
// Company preferences: the rest of a company's setup (beyond the business details in companySettings.ts and the
// invoicing settings in docSettings.ts), kept in the cloud so a new device gets it back on sign-in:
//   shared (company_settings.preferences; the whole team reads it): branding, takeoff (wire slack / drops / floor
//     height), checklist and form templates, the statuses that need an install photo, and the trades of someone
//     working alone (a team keeps its trades on the team row, useTrades.ts);
//   office (document_settings.preferences; owner and admins only, like every price): pricing and the Billdu document type.
// This device keeps its copy in AppSettings (what every screen reads). Each part ("section") syncs on its own, newest
// change wins, and the database merges section by section (supabase/migrations/20261125004000_company_preferences.sql).
// Technicians only read. A change made here is noticed whichever screen saved it: this device remembers a fingerprint
// of what it last synced per section, and anything different is a change made at the settings' updatedAt.
import { DEFAULT_SETTINGS } from "./catalog";
import { COMPANY_SETTINGS_EVENT } from "./companySettings";
import { db, ensureSeeded } from "./db";
import { normalizeTemplates } from "./fieldDocs";
import { normalizeFormTemplates } from "./forms/forms";
import { FORM_TEMPLATES_EVENT } from "./forms/templateStore";
import { DEFAULT_PHOTO_REQUIRED, isInstallStatus } from "./installProgress";
import { readLocalOwner } from "./localOwner";
import { getSupabase } from "./supabase";
import { useTeam } from "./team";
import { normalizeTrades, TRADE_PACKS } from "./trades";
import { TRADES_EVENT, useTradeStore } from "./useTrades";
import type { AppSettings, PricingSettings } from "./types";

export type PrefScope = "shared" | "office";
export type PrefKey = "branding" | "takeoff" | "checklistTemplates" | "formTemplates" | "installPhotoRequired" | "trades" | "pricing" | "billduDocType";

interface SectionDef {
  key: PrefKey;
  scope: PrefScope;
  /** This device's value, normalized (the same value always reads the same). */
  read(s: AppSettings): unknown;
  /** Settings with `v` (from the cloud, so checked) put in. */
  apply(s: AppSettings, v: unknown): AppSettings;
  /** Still what a fresh install has (default: the same as DEFAULT_SETTINGS reads). */
  isDefault?(v: unknown): boolean;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const pricingOf = (s: AppSettings): PricingSettings => ({ ...DEFAULT_SETTINGS.pricing, ...s.pricing, wirePrices: { ...DEFAULT_SETTINGS.pricing.wirePrices, ...s.pricing?.wirePrices } });
const pricingSection = (s: AppSettings) => {
  const p = pricingOf(s);
  return { markupPct: p.markupPct, taxPct: p.taxPct, laborMode: p.laborMode, wirePrices: p.wirePrices, includeTentative: p.includeTentative, currency: p.currency };
};

const BRANDING_FIELDS = ["tagline", "brandColor", "accentColor", "serviceArea"] as const;
const TAKEOFF_FIELDS = ["wireSlackPct", "wireDropFt", "floorHeightFt"] as const;

function wirePricesFrom(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, p] of Object.entries(obj(v))) if (k && k.length <= 100 && typeof p === "number" && Number.isFinite(p) && p >= 0) out[k] = p;
  return out;
}

export const SECTIONS: SectionDef[] = [
  {
    key: "branding",
    scope: "shared",
    read: (s) => Object.fromEntries(BRANDING_FIELDS.map((k) => [k, str(s.business?.[k])])),
    apply: (s, v) => {
      const o = obj(v);
      const business = { ...s.business };
      for (const k of BRANDING_FIELDS) business[k] = str(o[k]);
      return { ...s, business };
    },
    // Blank fields show the defaults, so blank or default is the same untouched branding.
    isDefault: (v) => BRANDING_FIELDS.every((k) => !obj(v)[k] || obj(v)[k] === str(DEFAULT_SETTINGS.business[k])),
  },
  {
    key: "takeoff",
    scope: "shared",
    read: (s) => {
      const p = pricingOf(s);
      return { wireSlackPct: p.wireSlackPct, wireDropFt: p.wireDropFt, floorHeightFt: p.floorHeightFt };
    },
    apply: (s, v) => {
      const o = obj(v);
      const p = pricingOf(s);
      const next = { ...p };
      for (const k of TAKEOFF_FIELDS) next[k] = Math.max(0, num(o[k], p[k]));
      return { ...s, pricing: next };
    },
  },
  {
    key: "checklistTemplates",
    scope: "shared",
    read: (s) => normalizeTemplates(s.checklistTemplates),
    apply: (s, v) => ({ ...s, checklistTemplates: normalizeTemplates(v) }),
  },
  {
    key: "formTemplates",
    scope: "shared",
    read: (s) => normalizeFormTemplates(s.formTemplates),
    apply: (s, v) => ({ ...s, formTemplates: normalizeFormTemplates(v) }),
  },
  {
    key: "installPhotoRequired",
    scope: "shared",
    read: (s) => (s.installPhotoRequired ?? DEFAULT_PHOTO_REQUIRED).filter(isInstallStatus),
    apply: (s, v) => ({ ...s, installPhotoRequired: Array.isArray(v) ? [...new Set(v.filter(isInstallStatus))] : [...DEFAULT_PHOTO_REQUIRED] }),
  },
  {
    key: "trades",
    scope: "shared",
    read: (s) => normalizeTrades(s.trades),
    apply: (s, v) => ({ ...s, trades: normalizeTrades(v) }),
  },
  {
    key: "pricing",
    scope: "office",
    read: (s) => pricingSection(s),
    apply: (s, v) => {
      const o = obj(v);
      const p = pricingOf(s);
      const currency = str(o.currency, 10).trim();
      return {
        ...s,
        pricing: {
          ...p,
          markupPct: num(o.markupPct, p.markupPct),
          taxPct: num(o.taxPct, p.taxPct),
          laborMode: o.laborMode === "separate" || o.laborMode === "combined" ? o.laborMode : p.laborMode,
          wirePrices: "wirePrices" in o ? wirePricesFrom(o.wirePrices) : p.wirePrices,
          includeTentative: typeof o.includeTentative === "boolean" ? o.includeTentative : p.includeTentative,
          currency: currency || p.currency,
        },
      };
    },
    // A trade's starting wire prices (added when a trade is switched on, e.g. a team's trades on a new device) are
    // still a fresh install's prices: they must not seed the company's copy over the office's real ones.
    isDefault: (v) => {
      const o = obj(v);
      const d: Record<string, unknown> = pricingSection(DEFAULT_SETTINGS);
      if (["markupPct", "taxPct", "laborMode", "includeTentative", "currency"].some((k) => o[k] !== d[k])) return false;
      const dw = obj(d.wirePrices);
      return Object.entries(obj(o.wirePrices)).every(([w, p]) => p === dw[w] || TRADE_PACKS.some((t) => t.wireTypes.includes(w) && p === (t.wirePrices[w] ?? 0)));
    },
  },
  {
    key: "billduDocType",
    scope: "office",
    read: (s) => (s.billduDocType === "order" || s.billduDocType === "invoice" ? s.billduDocType : "estimate"),
    apply: (s, v) => ({ ...s, billduDocType: v === "order" || v === "invoice" ? v : "estimate" }),
  },
];

/** JSON with object keys sorted, so the same value always gives the same text. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => stableJson(x === undefined ? null : x)).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** A short fingerprint of a section's value (cyrb53), so the device's record of what it synced stays small. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** One section as stored in the cloud. */
export interface PrefSection {
  value: unknown;
  updatedAt: string;
}

/** What this device last synced, per account and section. */
export interface PrefMark {
  userId: string;
  sections: Partial<Record<PrefKey, { updatedAt: string; hash: string }>>;
}

export interface SectionInput {
  /** This device's value, as stableJson. */
  local: string;
  /** It is still what a fresh install has (never worth sending: a new device must not seed the company's copy). */
  isDefault: boolean;
  /** When this device's settings were last saved. */
  localSavedAt: string | null;
  mark: { updatedAt: string; hash: string } | null;
  /** The company's copy (its value as stableJson, after the same normalizing), null when it has none yet. */
  remote: { local: string; updatedAt: string } | null;
  /** The owner or an office admin (technicians only read). */
  canWrite: boolean;
}

/** "push": send this device's copy. "pull": take the company's. "none": already the same, or nothing to do. */
export function sectionAction(i: SectionInput): "push" | "pull" | "none" {
  if (i.remote && i.remote.local === i.local) return "none";
  const changedHere = i.mark ? fingerprint(i.local) !== i.mark.hash : !i.isDefault;
  if (!i.remote) return i.canWrite && changedHere ? "push" : "none";
  if (!i.canWrite || !changedHere) return "pull";
  // First sync for this account on this device: the company's copy wins (what was here came from before).
  if (!i.mark) return "pull";
  // The company's copy is still the one this device last synced: only this device changed it, so it goes up whatever
  // the clocks say (a device whose clock ran ahead must not undo every later change; planPreferences dates it after).
  if (Date.parse(i.mark.updatedAt) === Date.parse(i.remote.updatedAt)) return "push";
  const localAt = Date.parse(i.localSavedAt ?? "") || 0;
  return localAt > (Date.parse(i.remote.updatedAt) || 0) ? "push" : "pull";
}

/** A section as the cloud stores it, or null when it isn't one. */
export function sectionFrom(raw: unknown): PrefSection | null {
  const o = obj(raw);
  if (!("value" in o) || typeof o.updatedAt !== "string" || !Number.isFinite(Date.parse(o.updatedAt))) return null;
  return { value: o.value, updatedAt: o.updatedAt };
}

export interface PrefPlanInput {
  settings: AppSettings;
  localSavedAt: string | null;
  mark: PrefMark | null;
  userId: string;
  /** company_settings.preferences (null: no row, or not readable). */
  shared: Record<string, unknown> | null;
  /** document_settings.preferences; undefined when this device doesn't sync office sections (technicians, offline). */
  office?: Record<string, unknown> | null;
  canWrite: boolean;
  /** Sync the trades here (someone working alone; a team keeps them on the team row). */
  trades: boolean;
}

export interface PrefPlan {
  /** Sections to take from the company, with their (checked) values. */
  pull: Partial<Record<PrefKey, unknown>>;
  /** Sections to send, by where they go. */
  push: { shared: Partial<Record<PrefKey, PrefSection>>; office: Partial<Record<PrefKey, PrefSection>> };
  /** The record of what this device has synced, once the pushes have gone up. */
  mark: PrefMark;
}

/** Work out, section by section, what to take and what to send. Pure. */
export function planPreferences(i: PrefPlanInput): PrefPlan {
  const plan: PrefPlan = { pull: {}, push: { shared: {}, office: {} }, mark: { userId: i.userId, sections: i.mark?.userId === i.userId ? { ...i.mark.sections } : {} } };
  const markOf = i.mark?.userId === i.userId ? i.mark.sections : {};
  const savedAt = i.localSavedAt ?? new Date(0).toISOString();
  for (const def of SECTIONS) {
    if (def.key === "trades" && !i.trades) continue;
    const source = def.scope === "office" ? i.office : i.shared;
    if (def.scope === "office" && source === undefined) continue;
    const local = stableJson(def.read(i.settings));
    const isDefault = def.isDefault ? def.isDefault(def.read(i.settings)) : local === stableJson(def.read(DEFAULT_SETTINGS));
    const section = sectionFrom(source?.[def.key]);
    const remote = section ? { local: stableJson(def.read(def.apply(i.settings, section.value))), updatedAt: section.updatedAt } : null;
    const action = sectionAction({ local, isDefault, localSavedAt: i.localSavedAt, mark: markOf[def.key] ?? null, remote, canWrite: i.canWrite });
    if (action === "push") {
      const target = def.scope === "office" ? plan.push.office : plan.push.shared;
      // The database keeps a section only when it is newer than its copy there: date it after the copy it replaces.
      const at = section && Date.parse(section.updatedAt) >= Date.parse(savedAt) ? new Date(Date.parse(section.updatedAt) + 1).toISOString() : savedAt;
      target[def.key] = { value: def.read(i.settings), updatedAt: at };
      plan.mark.sections[def.key] = { updatedAt: at, hash: fingerprint(local) };
    } else if (action === "pull" && section && remote) {
      plan.pull[def.key] = section.value;
      plan.mark.sections[def.key] = { updatedAt: section.updatedAt, hash: fingerprint(remote.local) };
    } else if (remote) plan.mark.sections[def.key] = { updatedAt: section!.updatedAt, hash: fingerprint(local) };
  }
  return plan;
}

/** Settings with the pulled sections put in. */
export function applyPulled(s: AppSettings, pull: Partial<Record<PrefKey, unknown>>): AppSettings {
  let next = s;
  for (const def of SECTIONS) if (def.key in pull) next = def.apply(next, pull[def.key]);
  return next;
}

/** Sections changed on this device since it last synced them (the next sync sends them). Sections never synced here
 *  aren't counted: the first sync takes the company's copy of those anyway. */
export function unsentSections(s: AppSettings, mark: PrefMark | null, userId: string): PrefKey[] {
  if (!mark || mark.userId !== userId) return [];
  return SECTIONS.filter((def) => {
    const m = mark.sections[def.key];
    return !!m && fingerprint(stableJson(def.read(s))) !== m.hash;
  }).map((def) => def.key);
}

/** The company-level parts of the settings back to what a fresh install has (another account's setup must not show,
 *  or be sent into this account's company). Device-only parts stay. */
export function withoutCompanySetup(s: AppSettings): AppSettings {
  return {
    ...s,
    business: { ...DEFAULT_SETTINGS.business },
    pricing: { ...DEFAULT_SETTINGS.pricing, wirePrices: { ...DEFAULT_SETTINGS.pricing.wirePrices } },
    billduDocType: DEFAULT_SETTINGS.billduDocType,
    checklistTemplates: [],
    formTemplates: [],
    installPhotoRequired: undefined,
    trades: undefined,
    documents: undefined,
    brandDefaults: "neutral",
  };
}

// ---------------- this device ----------------

const MARK_KEY = "pinplan.companyPreferences";
export const EPOCH = "1970-01-01T00:00:00.000Z";

function readMark(userId: string): PrefMark | null {
  try {
    const m = JSON.parse(localStorage.getItem(MARK_KEY) ?? "null") as PrefMark | null;
    return m?.userId === userId && m.sections && typeof m.sections === "object" ? m : null;
  } catch {
    return null;
  }
}
/** Whether this device has company setup changes the cloud doesn't have yet (sign-out keeps the data then). */
export async function hasUnsentPreferences(userId: string): Promise<boolean> {
  const mark = readMark(userId);
  if (!mark) return false;
  const s = await db().settings.get("app");
  return !!s && unsentSections(s, mark, userId).length > 0;
}

function writeMark(m: PrefMark) {
  try {
    localStorage.setItem(MARK_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable */
  }
}

/** Write the pulled sections into this device's settings (on the latest stored copy; the save time stays, so a
 *  change made here earlier keeps its own time) and tell the open screens. */
async function applyLocal(pull: Partial<Record<PrefKey, unknown>>): Promise<void> {
  const d = db();
  const next = await d.transaction("rw", d.settings, async () => {
    const s = (await d.settings.get("app")) ?? DEFAULT_SETTINGS;
    const n = applyPulled(s, pull);
    await d.settings.put(n);
    return n;
  });
  if ("trades" in pull) {
    const trades = normalizeTrades(next.trades);
    useTradeStore.setState({ trades, loaded: true });
    try {
      localStorage.setItem("pinplan.trades", JSON.stringify(trades));
    } catch {
      /* storage unavailable */
    }
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMPANY_SETTINGS_EVENT));
  if ("checklistTemplates" in pull) window.dispatchEvent(new Event("pinplan:checklist-templates"));
  if ("formTemplates" in pull) window.dispatchEvent(new Event(FORM_TEMPLATES_EVENT));
  if ("trades" in pull) window.dispatchEvent(new Event(TRADES_EVENT));
}

type Client = NonNullable<ReturnType<typeof getSupabase>>;

/** Send sections to one table: the row is made if missing (dated 1970, so its other columns never win over a real
 *  save), then the database merges the sections in. False when nothing was written. */
async function pushSections(sb: Client, table: "company_settings" | "document_settings", owner: string, sections: Partial<Record<PrefKey, PrefSection>>, create: boolean): Promise<boolean> {
  if (!Object.keys(sections).length) return true;
  if (create) await sb.from(table).upsert({ owner_id: owner, updated_at: EPOCH }, { onConflict: "owner_id", ignoreDuplicates: true });
  const { data, error } = await sb.from(table).update({ preferences: sections }).eq("owner_id", owner).select("owner_id");
  return !error && Array.isArray(data) && data.length > 0;
}

let running: Promise<void> | null = null;

/** Bring this device and the company's copy in step, section by section (called by sync after the company's
 *  details). Quiet when offline, signed out or a migration behind. */
export function pullCompanyPreferences(): Promise<void> {
  running ??= (async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data: sess } = await sb.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) return;
    // Only once this device's data is known to be this account's (sync's owner check).
    if (readLocalOwner()?.userId !== userId) return;
    const team = useTeam.getState();
    // The role decides what may be sent and whether the trades are the team's: wait until it is known for this account.
    if (!team.ready || team.userId !== userId) return;
    const canWrite = team.role !== "tech";
    const shared = await sb.from("company_settings").select("preferences").maybeSingle();
    if (shared.error) return; // offline, or the column isn't there yet
    let office: Record<string, unknown> | null | undefined;
    if (canWrite) {
      const o = await sb.from("document_settings").select("preferences").maybeSingle();
      // No row yet: the invoicing sync makes it; office sections wait until then.
      office = o.error || !o.data ? undefined : obj((o.data as { preferences?: unknown }).preferences);
    }
    await ensureSeeded();
    const stored = (await db().settings.get("app")) ?? DEFAULT_SETTINGS;
    const plan = planPreferences({
      settings: stored,
      localSavedAt: stored.updatedAt ?? null,
      mark: readMark(userId),
      userId,
      shared: shared.data ? obj((shared.data as { preferences?: unknown }).preferences) : null,
      office,
      canWrite,
      trades: !team.team,
    });
    if (Object.keys(plan.pull).length) await applyLocal(plan.pull);
    const pushing = Object.keys(plan.push.shared).length + Object.keys(plan.push.office).length;
    if (pushing) {
      const owner = await sb.rpc("my_billing_owner");
      if (owner.error || !owner.data) return;
      const id = owner.data as string;
      const sharedOk = await pushSections(sb, "company_settings", id, plan.push.shared, !shared.data);
      const officeOk = await pushSections(sb, "document_settings", id, plan.push.office, false);
      // What didn't go up is tried again next time.
      const failed = [...(sharedOk ? [] : Object.keys(plan.push.shared)), ...(officeOk ? [] : Object.keys(plan.push.office))] as PrefKey[];
      const prev = readMark(userId)?.sections ?? {};
      for (const k of failed) {
        if (prev[k]) plan.mark.sections[k] = prev[k];
        else delete plan.mark.sections[k];
      }
    }
    writeMark(plan.mark);
  })()
    .catch(() => undefined)
    .finally(() => {
      running = null;
    });
  return running;
}
