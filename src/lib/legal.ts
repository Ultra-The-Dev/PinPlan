// Shared facts for the legal and support pages (/terms, /privacy, /support).
//
// LAWYER REVIEW REQUIRED before launch. Every value in [square brackets] is a placeholder: replace it here and the
// pages update. Placeholders render highlighted on the pages so they can't ship unnoticed (see <Ph> in LegalDoc).

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
};

/** Third parties that process customer data on our behalf. Keep in sync with docs/production-checklist.md. */
export const SUBPROCESSORS: { name: string; purpose: string; data: string; location: string }[] = [
  {
    name: "Supabase, Inc.",
    purpose: "Database, user authentication and file storage",
    data: "Account data and all synced Customer Data (jobs, plans, photos, documents, proposals)",
    location: COMPANY.dataRegion,
  },
  {
    name: "Vercel Inc.",
    purpose: "Website and application hosting, serverless functions, content delivery",
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
  },
  {
    name: "Apple Inc.",
    purpose: "iOS app distribution through the App Store (and in-app purchases, if offered)",
    data: "Information Apple collects under its own terms when you download or buy through the App Store",
    location: "United States",
  },
];
