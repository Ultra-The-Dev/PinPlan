// Accounting integrations: the provider interface every connector implements (server-only). See docs/integrations.md.
import type { DocClient, DocPayment, SalesDoc } from "@/lib/types";
import type { BillduCaller } from "../billduCreds";

export type ProviderId = "quickbooks" | "xero" | "billdu";
export const PROVIDER_IDS: ProviderId[] = ["quickbooks", "xero", "billdu"];
export const isProviderId = (s: unknown): s is ProviderId => typeof s === "string" && (PROVIDER_IDS as string[]).includes(s);

/** Whose connection it is: a team (the company), or a person who uses PinPlan without a team. */
export interface Owner {
  kind: "team" | "user";
  id: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** ISO time the access token stops working. */
  expiresAt: string | null;
  /** ISO time the refresh token stops working (QuickBooks: about 100 days; Xero: 60 days unused). */
  refreshExpiresAt: string | null;
}

export type ConnectionStatus = "connected" | "needs_reconnect" | "disconnected" | "error";

export interface Connection {
  owner: Owner;
  provider: ProviderId;
  status: ConnectionStatus;
  tokens: TokenSet | null;
  /** Set when the stored tokens can't be decrypted (PINPLAN_ENCRYPTION_KEY changed). */
  tokenError: string | null;
  meta: Record<string, unknown>;
  settings: Record<string, string>;
  version: number;
  connectedBy: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export type LocalType = "invoice" | "credit_note" | "payment" | "customer";

export interface Link {
  localType: LocalType;
  localId: string;
  remoteId: string | null;
  remoteNumber: string | null;
  syncToken: string | null;
  hash: string | null;
  remoteTotal: number | null;
  remoteStatus: string | null;
  lastError: string | null;
}

/** A mapping setting shown under "More" in Settings → Integrations. */
export interface SettingField {
  key: string;
  label: string;
  help?: string;
  placeholder?: string;
}

/** What a provider gets for each call: the connection, its settings and a token that is refreshed when needed. */
export interface ProviderContext {
  owner: Owner | null;
  caller: BillduCaller;
  connection: Connection | null;
  settings: Record<string, string>;
  /** A working access token (refreshed first when it is about to expire). */
  accessToken(): Promise<string>;
  /** Refresh now (after the provider answered 401), returning the new access token. */
  forceRefresh(): Promise<string>;
}

export interface PushOutcome {
  remoteId: string;
  remoteNumber?: string | null;
  syncToken?: string | null;
  /** What the accounting app says the document comes to (to warn when it differs from ours). */
  remoteTotal?: number | null;
  remoteStatus?: string | null;
}

export interface OAuthStart {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface OAuthResult {
  tokens: TokenSet;
  meta: Record<string, unknown>;
}

/** Raised by providers. `reconnect`: the refresh token is dead (invalid_grant) and someone must connect again. */
export class IntegrationError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "provider_error",
    public reconnect = false,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface Provider {
  id: ProviderId;
  label: string;
  auth: "api_key" | "oauth2";
  /** Shown with a "Beta" tag. */
  beta: boolean;
  /** Env vars the server needs before the provider can be switched on (names only). */
  requiredEnv: string[];
  /** Configured on this server? (OAuth providers: their client id and secret are set.) */
  enabled(): boolean;
  /** Mapping settings (item / account / tax codes in the remote books). */
  settingsFields: SettingField[];
  /** OAuth: the provider's sign-in URL. API-key providers: the PinPlan page where the key is entered. */
  connect(input: OAuthStart): string;
  /** OAuth: trade the code for tokens and work out which company was connected. */
  callback(input: { code: string; codeVerifier: string; redirectUri: string; params: URLSearchParams }): Promise<OAuthResult>;
  /** OAuth: a new token set from the refresh token. Throws IntegrationError with reconnect=true on invalid_grant. */
  refresh(tokens: TokenSet): Promise<TokenSet>;
  /** Revoke the tokens at the provider (best effort; the local row is deleted either way). */
  disconnect(ctx: ProviderContext): Promise<void>;
  test(ctx: ProviderContext): Promise<{ ok: boolean; message: string; meta?: Record<string, unknown> }>;
  pushCustomer(ctx: ProviderContext, client: DocClient, link: Link | null): Promise<PushOutcome>;
  /**
   * Create or update an issued invoice / credit note (never a draft), or void it remotely when it is void here.
   * `idempotencyKey` is stable for the same content, so a retried request is not applied twice.
   */
  pushInvoice(ctx: ProviderContext, input: { doc: SalesDoc; customerId: string; link: Link | null; idempotencyKey: string }): Promise<PushOutcome>;
  /** Record a payment against an invoice already in the accounting app. Null: this provider doesn't take payments. */
  pushPayment(ctx: ProviderContext, input: { payment: DocPayment; doc: SalesDoc; invoice: Link; customerId: string; link: Link | null; idempotencyKey: string }): Promise<PushOutcome | null>;
}
