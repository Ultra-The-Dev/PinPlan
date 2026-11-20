// One look for every status chip in the app (jobs, quotes / invoices, RFIs, invites, tasks), so "approved" is the
// same teal everywhere. Tones map to the ok / info / warn / bad tokens in src/app/globals.css (docs/brand.md).

export type StatusTone = "ok" | "info" | "warn" | "bad" | "neutral" | "muted";

/** Chip classes per tone (use with the `.chip` class). Text/ground pairs are AA (tests/statusStyle.test.ts). */
export const TONE_CHIP: Record<StatusTone, string> = {
  ok: "bg-ok-50 text-ok-700 ring-1 ring-ok-200",
  info: "bg-info-50 text-info-700 ring-1 ring-info-200",
  warn: "bg-warn-50 text-warn-700 ring-1 ring-warn-200",
  bad: "bg-bad-50 text-bad-700 ring-1 ring-bad-200",
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  muted: "bg-slate-100 text-slate-500 ring-1 ring-slate-200 line-through",
};

/** Text-only colour per tone (due dates, inline status words). */
export const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-ok-700",
  info: "text-info-700",
  warn: "text-warn-700",
  bad: "text-bad-700",
  neutral: "text-slate-600",
  muted: "text-slate-500",
};

/** Solid colour per tone, for map pins and dots drawn outside Tailwind (matches the 600 tokens). */
export const TONE_HEX: Record<StatusTone, string> = {
  ok: "#0B7F72",
  info: "#0B6FE0",
  warn: "#B7791F",
  bad: "#C73A2C",
  neutral: "#5F718B",
  muted: "#5F718B",
};

/**
 * Every status word the app shows, across jobs (ProjectStatus), quotes / invoices (DocDisplayStatus), RFIs and team
 * invites. Done and agreed = ok (teal), out with the client = info, waiting or part-way = warn, problem = bad.
 */
export const STATUS_TONE: Record<string, StatusTone> = {
  // Jobs
  estimate: "warn",
  approved: "ok",
  installed: "ok",
  // Quotes / invoices / credit notes
  draft: "neutral",
  ready: "warn",
  sent: "info",
  viewed: "info",
  accepted: "ok",
  declined: "bad",
  partially_paid: "warn",
  partial: "warn",
  paid: "ok",
  void: "muted",
  overdue: "bad",
  expired: "warn",
  // RFIs
  open: "info",
  answered: "ok",
  closed: "neutral",
  // Team invites
  used: "neutral",
  revoked: "muted",
};

/** The tone for a status; unknown statuses (e.g. synced from a newer app) are neutral. */
export const statusTone = (status: string): StatusTone => (Object.prototype.hasOwnProperty.call(STATUS_TONE, status) ? STATUS_TONE[status] : "neutral");

/** Chip classes for a status. */
export const statusChip = (status: string): string => TONE_CHIP[statusTone(status)];

/** Job status → pin colour on the jobs map. Approved and installed are both "ok"; installed uses the deeper teal so
 *  the two can be told apart on the map. */
export const PROJECT_STATUS_HEX = {
  estimate: TONE_HEX.warn,
  approved: "#14A391",
  installed: "#075A51",
} as const;
