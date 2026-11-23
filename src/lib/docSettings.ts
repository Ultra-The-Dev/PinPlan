"use client";
// Company invoicing settings (Settings → Invoicing). Settings live per device (AppSettings), but invoicing has to be the
// same for the whole office — number formats, terms, taxes, payment details — so the company's copy is kept in the
// cloud (`document_settings`, one row per company, readable by the office, written by the owner and admins) and this
// device keeps a cache in AppSettings.documents. Newest `updatedAt` wins. Number counters live only on the server.
import { useEffect, useState } from "react";
import { db, getSettings, nowIso, saveDocumentSettings } from "./db";
import { hasLegacyQuoteDefault, normalizeDocSettings } from "./documents";
import { t } from "./i18n";
import { getSupabase } from "./supabase";
import type { DocKind, DocumentSettings } from "./types";

export const DOC_SETTINGS_EVENT = "pinplan:doc-settings";

export async function getDocSettings(): Promise<DocumentSettings> {
  const s = await getSettings();
  return normalizeDocSettings(s.documents ?? null, s.pricing?.currency);
}

async function writeLocal(doc: DocumentSettings, fromCloud = false) {
  await saveDocumentSettings(doc, { fromCloud });
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DOC_SETTINGS_EVENT));
}

async function signedIn() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ? sb : null;
}

/** Save on this device, then for the company. Returns false (with a reason) when the cloud copy couldn't be saved. */
export async function saveDocSettings(next: DocumentSettings): Promise<{ cloud: boolean; error?: string }> {
  const doc = { ...normalizeDocSettings(next), updatedAt: nowIso() };
  await writeLocal(doc);
  const sb = await signedIn();
  if (!sb) return { cloud: false };
  try {
    const owner = await sb.rpc("my_billing_owner");
    if (owner.error || !owner.data) throw new Error(owner.error?.message ?? "No company");
    const { error } = await sb.from("document_settings").upsert({ owner_id: owner.data, config: doc, updated_at: doc.updatedAt }, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { cloud: true };
  } catch (e) {
    return { cloud: false, error: (e as Error).message };
  }
}

/** Dated as old as can be, so seeded defaults never win over settings someone saved on another device. */
const SEED_AT = "1970-01-01T00:00:00.000Z";

/** Save the defaults as the company copy (nothing on this device changes), so the server numbers quotes Q-{0000}. */
async function seedDefaults(sb: NonNullable<Awaited<ReturnType<typeof signedIn>>>): Promise<void> {
  try {
    const owner = await sb.rpc("my_billing_owner");
    if (owner.error || !owner.data) return;
    await sb.from("document_settings").upsert({ owner_id: owner.data, config: { ...normalizeDocSettings(null), updatedAt: SEED_AT }, updated_at: SEED_AT }, { onConflict: "owner_id", ignoreDuplicates: true });
  } catch {
    /* offline, or not allowed (technicians): the next sync tries again */
  }
}

/** Bring this device's copy up to date with the company's (called by sync). Pushes this device's copy when the company
 *  has none yet (the first person to set up invoicing), or seeded defaults (dated 1970, so a copy someone saved on
 *  another device still wins and is pushed over them), so the server numbers quotes with the same
 *  format the app shows (its built-in fallback is the old EST-{0000}). A company copy still on the old untouched quote
 *  default ("Estimate", EST-{0000}) is saved back as "Quote", Q-{0000} (owner / admin only; others just read it). */
export async function pullDocSettings(): Promise<void> {
  const sb = await signedIn();
  if (!sb) return;
  const { data, error } = await sb.from("document_settings").select("config, updated_at").maybeSingle();
  if (error) return; // offline, a migration behind, or a technician
  const local = (await db().settings.get("app"))?.documents;
  const saved = !!local?.updatedAt && local.updatedAt !== SEED_AT;
  if (!data) {
    if (saved) await saveDocSettings(local!);
    else await seedDefaults(sb);
    return;
  }
  const raw = data.config as Partial<DocumentSettings>;
  const remote = normalizeDocSettings(raw);
  const remoteAt = remote.updatedAt ?? data.updated_at;
  // The company copy is only the seeded defaults and this device has settings someone saved: those win.
  if (remote.updatedAt === SEED_AT && saved) {
    await saveDocSettings(local!);
    return;
  }
  if (hasLegacyQuoteDefault(raw)) {
    await saveDocSettings(remote);
    return;
  }
  if (!local?.updatedAt || Date.parse(remoteAt) > Date.parse(local.updatedAt)) await writeLocal({ ...remote, updatedAt: remoteAt }, true);
}

export interface Numbering {
  next: number;
  preview: string;
}

/** The next number per kind for the company (null when offline or not signed in). */
export async function fetchNumbering(): Promise<Record<DocKind, Numbering> | null> {
  const sb = await signedIn();
  if (!sb) return null;
  const { data, error } = await sb.rpc("document_numbering");
  if (error) return null;
  return (data as Record<DocKind, Numbering> | null) ?? null;
}

export async function setNextNumber(kind: DocKind, next: number): Promise<Record<DocKind, Numbering>> {
  const sb = await signedIn();
  if (!sb) throw new Error(t("Sign in to change numbering."));
  const { data, error } = await sb.rpc("set_document_next_number", { p_kind: kind, p_next: next });
  if (error) throw new Error(error.message);
  return data as Record<DocKind, Numbering>;
}

/** The company invoicing settings, kept current when they're saved or synced. Null until read. */
export function useDocSettings(): DocumentSettings | null {
  const [s, setS] = useState<DocumentSettings | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void getDocSettings().then((x) => live && setS(x));
    load();
    window.addEventListener(DOC_SETTINGS_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(DOC_SETTINGS_EVENT, load);
    };
  }, []);
  return s;
}
