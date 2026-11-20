"use client";
// Browser side of the accounting integrations: the /api/integrations calls and the per-device fallbacks.
import { DEFAULT_ACCOUNTS, normalizeAccounts, type AccountNames, type CsvFormat } from "@/lib/accountingExport";
import { apiFetch } from "@/lib/api";
import { msg } from "@/lib/i18n/msg";
import type { SalesDoc } from "@/lib/types";

export type ExportFormat = CsvFormat | "iif";

export const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "qbo", label: "QuickBooks Online (CSV)", hint: msg("Import in QuickBooks: Settings → Import data → Invoices.") },
  { id: "xero", label: "Xero (CSV)", hint: msg("Import in Xero: Business → Invoices → Import.") },
  { id: "iif", label: "QuickBooks Desktop (IIF)", hint: msg("Invoices, credit memos and payments. File → Utilities → Import → IIF Files.") },
  { id: "generic", label: msg("Plain CSV (any app or spreadsheet)"), hint: msg("One row per line, with the document total on each row.") },
];

export interface ProviderStatus {
  id: "quickbooks" | "xero" | "billdu";
  label: string;
  auth: "api_key" | "oauth2";
  beta: boolean;
  enabled: boolean;
  settingsFields: { key: string; label: string; help?: string; placeholder?: string }[];
  connection: {
    status: "connected" | "needs_reconnect" | "disconnected" | "error";
    companyName: string | null;
    environment: string | null;
    connectedAt: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
    refreshExpiresAt: string | null;
  } | null;
  settings: Record<string, string>;
  events: { kind: string; ok: boolean; message: string | null; created_at: string; local_type: string | null }[];
  manageAt?: string;
}

export interface IntegrationsList {
  providers: ProviderStatus[];
  storageReady: boolean;
  storageMessage: string | null;
  mode: "team" | "solo" | "single_company";
  exportAccounts: AccountNames;
}

/** Thrown with the server's message; `status` 401/403 means signed out or not office staff. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await apiFetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string>) } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!r.ok) throw new ApiError(j.error || `Request failed (${r.status})`, r.status, j.code);
  return j;
}

export const listIntegrations = () => call<IntegrationsList>("/api/integrations");
export const providerStatus = (id: string) => call<ProviderStatus>(`/api/integrations/${id}/status`);
/** → the GET connect link to navigate to. The answer sets a cookie that ties the sign-in to this browser. */
export const connectProvider = (id: string) => call<{ url: string }>(`/api/integrations/${id}/connect`, { method: "POST", credentials: "same-origin" });
export const disconnectProvider = (id: string) => call<ProviderStatus>(`/api/integrations/${id}/disconnect`, { method: "POST" });
export const testProvider = (id: string) => call<{ ok: boolean; message: string }>(`/api/integrations/${id}/test`, { method: "POST" });
export const saveProviderSettings = (id: string, settings: Record<string, string>) => call<{ settings: Record<string, string> }>(`/api/integrations/${id}/settings`, { method: "POST", body: JSON.stringify({ settings }) });

export interface PushResult {
  status: "sent" | "unchanged" | "voided" | "skipped";
  remoteNumber: string | null;
  warnings: string[];
  payments: { id: string; status: string; message?: string }[];
}
/** The server sends its own copy of the document (and its payments): sync first so it has this device's changes. */
export const pushDocument = (id: string, doc: Pick<SalesDoc, "id">) => call<PushResult>(`/api/integrations/${id}/push`, { method: "POST", body: JSON.stringify({ docId: doc.id }) });

// ---------------------------------------------------------------- the accountant export's account names

const ACCOUNTS_KEY = "pinplan.exportAccounts";
const FORMAT_KEY = "pinplan.exportFormat";

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** The company's saved account names (cloud), else this device's copy, else the defaults. */
export async function loadAccounts(): Promise<{ accounts: AccountNames; shared: boolean }> {
  try {
    const j = await call<{ settings: AccountNames }>("/api/integrations/export/settings");
    const accounts = normalizeAccounts(j.settings);
    writeLocal(ACCOUNTS_KEY, accounts);
    return { accounts, shared: true };
  } catch {
    return { accounts: normalizeAccounts(readLocal<Partial<AccountNames>>(ACCOUNTS_KEY) ?? DEFAULT_ACCOUNTS), shared: false };
  }
}

/** Save for the whole company when the cloud is reachable; always keep this device's copy. */
export async function saveAccounts(a: AccountNames): Promise<boolean> {
  writeLocal(ACCOUNTS_KEY, a);
  try {
    await call("/api/integrations/export/settings", { method: "POST", body: JSON.stringify({ settings: a }) });
    return true;
  } catch {
    return false;
  }
}

export const savedFormat = (): ExportFormat => {
  const f = readLocal<string>(FORMAT_KEY);
  return FORMATS.some((x) => x.id === f) ? (f as ExportFormat) : "qbo";
};
export const rememberFormat = (f: ExportFormat) => writeLocal(FORMAT_KEY, f);
