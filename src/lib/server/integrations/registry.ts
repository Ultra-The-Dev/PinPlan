// Every accounting connector Northpin knows, in the order Settings shows them (server-only).
import { billdu } from "./billdu";
import { quickbooks } from "./quickbooks";
import { isProviderId, type Provider, type ProviderId } from "./types";
import { xero } from "./xero";

export const PROVIDERS: Record<ProviderId, Provider> = { quickbooks, xero, billdu };

export function getProvider(id: unknown): Provider | null {
  return isProviderId(id) ? PROVIDERS[id] : null;
}

/** Public facts about each provider (never a secret or an env value). */
export function providerSummaries() {
  return Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, auth: p.auth, beta: p.beta, enabled: p.enabled(), settingsFields: p.settingsFields }));
}
