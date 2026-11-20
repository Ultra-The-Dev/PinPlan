// Online invoice payments (docs/payments.md): the pure rules shared by the client page, the office screens and the
// server routes. No I/O here.
import type { DocPayment } from "./types";

/** What get_document() says about paying an invoice online (`payOnline`; null for quotes and credit notes). */
export interface PayOnlineState {
  /** The company takes card payments on its links and there is something left to pay. */
  available: boolean;
  /** US bank account (ACH) is offered too (USD invoices, when the office switched it on). */
  ach: boolean;
  /** What the client can pay now: the balance less bank payments still processing. */
  payable: number;
  /** Bank payments started but not confirmed yet. */
  processing: number;
  /** Paid online so far (what was applied to the invoice). */
  paidOnline: number;
}

/** Currencies Stripe charges in whole units (no cents). */
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
/** Three-decimal currencies: Stripe wants the last digit 0; not supported here (the invoice keeps 2 decimals). */
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

/** Can this currency be charged online? */
export function onlineCurrencyOk(currency: string | null | undefined): boolean {
  const c = (currency ?? "").toLowerCase();
  return /^[a-z]{3}$/.test(c) && !THREE_DECIMAL.has(c);
}

/** An amount in the currency's smallest unit (cents), as Stripe wants it. */
export function toMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? Math.round(amount) : Math.round(amount * 100);
}

/** Stripe's smallest unit back to an amount. */
export function fromMinor(minor: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? minor : Math.round(minor) / 100;
}

/** The platform's fee on a charge (basis points of the amount, rounded down; 0 = none). Never the whole charge. */
export function platformFee(minor: number, bps: number): number {
  if (!Number.isFinite(bps) || bps <= 0 || minor <= 0) return 0;
  return Math.min(Math.floor((minor * Math.min(bps, 10_000)) / 10_000), minor - 1);
}

/** PINPLAN_PAYMENTS_FEE_BPS as a number of basis points: 0 when unset or not a whole number from 0 to 1000 (10 %). */
export function feeBps(raw: string | null | undefined): number {
  const s = (raw ?? "").trim();
  if (!/^\d{1,4}$/.test(s)) return 0;
  const n = Number(s);
  return n <= 1000 ? n : 0;
}

/** A payment the server recorded from Stripe (id `stripe_<payment intent>`; refunds `stripe_re_<refund>`). */
export function isOnlinePayment(p: Pick<DocPayment, "id">): boolean {
  return p.id.startsWith("stripe_");
}

/** What the client page shows about paying, from the live document and whether the client just came back from Stripe. */
export type ClientPayView =
  | { kind: "none" }
  | { kind: "pay"; amount: number; ach: boolean }
  | { kind: "processing"; amount: number }
  | { kind: "paid"; online: boolean }
  | { kind: "thanks"; remaining: number };

export interface ClientPayInput {
  kind: string;
  status: string;
  balanceDue: number;
  payOnline?: PayOnlineState | null;
  /** The client is back from Stripe's page after paying (?paid=1). */
  returned?: boolean;
}

export function clientPayView(d: ClientPayInput): ClientPayView {
  if (d.kind !== "invoice" || d.status === "void" || d.status === "draft") return { kind: "none" };
  const p = d.payOnline ?? null;
  if (d.status === "paid" || d.balanceDue <= 0) return { kind: "paid", online: !!p && p.paidOnline > 0 };
  if (p && p.processing > 0 && p.payable <= 0) return { kind: "processing", amount: p.processing };
  if (d.returned && p && p.paidOnline > 0) return { kind: "thanks", remaining: d.balanceDue };
  if (p?.available && p.payable > 0) return { kind: "pay", amount: p.payable, ach: p.ach };
  return { kind: "none" };
}

/** The connected account as the office sees it (GET /api/payments/account). */
export interface PaymentAccountStatus {
  /** The server has online payments configured (Stripe and the Connect webhook secret). */
  configured: boolean;
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  enabled: boolean;
  ach: boolean;
  country: string | null;
  currency: string | null;
  /** The platform's fee on each payment, in basis points (0 = none). */
  feeBps: number;
}

export type AccountStage = "off" | "not_connected" | "onboarding" | "pending" | "ready" | "paused";

/** Where the company is with online payments, for Settings. */
export function accountStage(s: PaymentAccountStatus | null): AccountStage {
  if (!s || !s.configured) return "off";
  if (!s.connected) return "not_connected";
  if (!s.detailsSubmitted) return "onboarding";
  if (!s.chargesEnabled) return "pending";
  return s.enabled ? "ready" : "paused";
}
