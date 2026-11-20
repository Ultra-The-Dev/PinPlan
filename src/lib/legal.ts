// Shared facts for the legal and support pages (/terms, /privacy, /support, /accessibility, /legal/*).
//
// LAWYER REVIEW REQUIRED before launch. Every value in [square brackets] is a placeholder: replace it here and the
// pages update. Placeholders render highlighted on the pages so they can't ship unnoticed (see <Ph> in LegalDoc),
// and `scripts/check-legal.mjs` (run before every build) fails a production build (VERCEL_ENV=production) while any
// remain. Keep placeholders in this file only: the pages must not carry their own bracketed text.
import { AI_ENABLED } from "./features";

/** Shown as "Effective" on Terms and Privacy. Change it whenever either document materially changes. */
export const LEGAL_EFFECTIVE_DATE = "[Effective date, e.g. January 1, 2027]";

export const COMPANY = {
  product: "PinPlan",
  legalName: "[Company legal name]",
  entity: "[a State limited liability company]",
  state: "[State]",
  county: "[County]",
  address: "[Mailing address]",
  contactEmail: "[Contact email]",
  supportEmail: "[Support email]",
  privacyEmail: "[Privacy email]",
  securityEmail: "[Security email]",
  website: "[https://your-domain.com]",
  /** Supabase project region (database + file storage). */
  dataRegion: "[United States (AWS us-east-1)]",
  /** Time zone for support hours, e.g. "Eastern Time". */
  supportTimeZone: "[Support time zone]",
  /** International transfer safeguard for EU/UK data, e.g. "the EU Standard Contractual Clauses". */
  transferMechanism: "[Transfer mechanism, e.g. the EU Standard Contractual Clauses]",
};

/** Retention promises made on /privacy, /terms and /support. Keep them true to what the system actually does. */
export const RETENTION = {
  /**
   * There is no automatic purge yet: soft-deleted items and the data of ended subscriptions stay until the account is
   * deleted in the app or someone asks in writing. We promise to act on a written request within this many days.
   */
  deletionRequestDays: 30,
  /** Point-in-time recovery window of the production database (Supabase PITR: 7, 14 or 28 days, or daily backups). */
  backupDays: "[Backup retention in days, e.g. 7]",
  /** Error reports are pruned automatically (supabase/migrations/20261121020000_ops.sql). */
  errorReportDays: 90,
};

/** Last time the subprocessor list below changed (shown on /legal/subprocessors). */
export const SUBPROCESSORS_UPDATED = LEGAL_EFFECTIVE_DATE;

/** Third parties that process customer data on our behalf. Keep in sync with docs/production-checklist.md. */
export interface Subprocessor {
  name: string;
  purpose: string;
  data: string;
  location: string;
  /** Listed only while the feature is switched on (AI_ENABLED in src/lib/features.ts). */
  onlyWhen?: "ai";
}

/** Every provider we have a contract for, including ones behind a switched-off feature. */
export const ALL_SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Supabase, Inc.",
    purpose: "Database, user authentication and file storage",
    data: "Account data and all synced Customer Data (jobs, plans, photos, quotes, invoices, field records and files)",
    location: COMPANY.dataRegion,
  },
  {
    // The host: Cloudflare Workers (docs/cloudflare.md). If you host on Vercel instead, name Vercel Inc. here.
    name: "Cloudflare, Inc.",
    purpose: "Website and application hosting, serverless functions, content delivery, DNS and email forwarding",
    data: "Requests passing through the service, IP addresses, server logs",
    location: "United States (global edge network)",
  },
  {
    name: "Stripe, Inc.",
    purpose: "Subscription billing and payment processing",
    data: "Billing contact, company name, payment card details (held by Stripe, not by us), invoices",
    location: "United States",
  },
  {
    name: "Resend (Plus Five Five, Inc.)",
    purpose: "Transactional email (sign-in links, invitations, proposal and billing notices)",
    data: "Recipient email address and name, message content",
    location: "United States",
  },
  {
    name: "Anthropic, PBC",
    purpose: "AI features: reading floor plans, suggesting devices, photo captions and daily-log drafts",
    data: "Plan sheet images, job photos and related text you choose to send to an AI feature",
    location: "United States",
    onlyWhen: "ai",
  },
  {
    name: "Apple Inc.",
    purpose: "iOS app distribution through the App Store (and in-app purchases, if offered)",
    data: "Information Apple collects under its own terms when you download or buy through the App Store",
    location: "United States",
  },
];

/** The subprocessors that actually receive data with the features as shipped. Shown on /privacy and /legal/subprocessors. */
export const SUBPROCESSORS: Subprocessor[] = activeSubprocessors(AI_ENABLED);

export function activeSubprocessors(aiEnabled: boolean): Subprocessor[] {
  return ALL_SUBPROCESSORS.filter((s) => s.onlyWhen !== "ai" || aiEnabled);
}

/** Is this value still an unfilled "[placeholder]"? */
export function isPlaceholder(value: string | number): boolean {
  return typeof value === "string" && /^\[.*\]$/.test(value.trim());
}

/** Every placeholder still left in this file, as "COMPANY.legalName" style names. Empty means ready to publish. */
export function legalPlaceholders(): string[] {
  const out: string[] = [];
  if (isPlaceholder(LEGAL_EFFECTIVE_DATE)) out.push("LEGAL_EFFECTIVE_DATE");
  for (const [k, v] of Object.entries(COMPANY)) if (isPlaceholder(v)) out.push(`COMPANY.${k}`);
  for (const [k, v] of Object.entries(RETENTION)) if (isPlaceholder(v)) out.push(`RETENTION.${k}`);
  for (const s of ALL_SUBPROCESSORS) if (isPlaceholder(s.location) && s.location !== COMPANY.dataRegion) out.push(`SUBPROCESSORS ${s.name}`);
  return out;
}

// --- Public site URL (canonical links, sitemap, robots, Open Graph) ---

/**
 * The public origin, without a trailing slash. NEXT_PUBLIC_SITE_URL wins (set it in Vercel to the final domain), then
 * COMPANY.website once it is filled in, then the Vercel production domain, then localhost for development.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const candidates = [env.NEXT_PUBLIC_SITE_URL, isPlaceholder(COMPANY.website) ? undefined : COMPANY.website, env.VERCEL_PROJECT_PRODUCTION_URL];
  for (const c of candidates) {
    if (!c || !c.trim()) continue;
    const withScheme = /^https?:\/\//i.test(c.trim()) ? c.trim() : `https://${c.trim()}`;
    try {
      return new URL(withScheme).origin;
    } catch {
      // not a URL: try the next one
    }
  }
  return "http://localhost:3000";
}
