// RFIs (requests for information): numbering, status changes, ball-in-court, overdue, summary, permissions, the
// email text and what the no-login answer page may show. Pure (no browser, database or network): shared by the
// web screens, the server route and tests. See docs/rfis.md.
import { msg, t } from "./i18n";
import type { TeamRole } from "./teamLogic";
import type { Photo, PhotoShape, Project, Rfi, RfiSender, RfiStatus } from "./types";

/** "Can't <action> an RFI that is <status>": one whole sentence per action, so it translates (src/lib/i18n). */
const CANT: Record<RfiAction, string> = {
  send: msg("Can't send an RFI that is {status}"),
  answer: msg("Can't answer an RFI that is {status}"),
  close: msg("Can't close an RFI that is {status}"),
  reopen: msg("Can't reopen an RFI that is {status}"),
  void: msg("Can't void an RFI that is {status}"),
};

export const RFI_STATUS_LABEL: Record<RfiStatus, string> = { draft: msg("Draft"), open: msg("Open"), answered: msg("Answered"), closed: msg("Closed"), void: msg("Void") };

/** Next number on a job: one past the highest ever used (deleted and void ones included, so numbers aren't reused). */
export function nextRfiNumber(rfis: Pick<Rfi, "number">[]): number {
  return rfis.reduce((n, r) => Math.max(n, Number.isFinite(r.number) ? Math.floor(r.number) : 0), 0) + 1;
}

/** 7 → "RFI-007" (wider numbers are never cut: 1234 → "RFI-1234"). */
export function rfiCode(n: number): string {
  return `RFI-${String(Math.max(0, Math.floor(n || 0))).padStart(3, "0")}`;
}

export type RfiAction = "send" | "answer" | "close" | "reopen" | "void";

/** Which statuses each action may start from. */
export const RFI_TRANSITIONS: Record<RfiAction, RfiStatus[]> = {
  // Sending again (a reminder, a new contact) keeps the RFI open.
  send: ["draft", "open"],
  answer: ["open"],
  // Closed without an answer is fine too (settled in a site meeting).
  close: ["open", "answered"],
  reopen: ["answered", "closed"],
  void: ["draft", "open", "answered", "closed"],
};

export function canTransition(status: RfiStatus, action: RfiAction): boolean {
  return RFI_TRANSITIONS[action].includes(status);
}

/**
 * Apply an action. `by` is who did it (the answerer's name for "answer"), `now` an ISO timestamp.
 * send → open, ball with them (sentAt is the first send); answer → answered, ball with us; close / void → ball with us;
 * reopen → open, ball with them (the earlier answer is kept for the record). Throws on a move that isn't allowed.
 */
export function transition(rfi: Rfi, action: RfiAction, by: string, now: string, extra: { answer?: string; shareToken?: string | null } = {}): Rfi {
  if (rfi.deleted) throw new Error(t("This RFI was deleted"));
  if (!canTransition(rfi.status, action)) throw new Error(t(CANT[action], { status: RFI_STATUS_LABEL[rfi.status] ? t(RFI_STATUS_LABEL[rfi.status]).toLowerCase() : rfi.status }));
  switch (action) {
    case "send":
      if (!rfi.subject.trim() && !rfi.question.trim()) throw new Error(t("Write the question first"));
      return { ...rfi, status: "open", ballInCourt: "them", sentAt: rfi.sentAt ?? now, shareToken: extra.shareToken ?? rfi.shareToken ?? null, closedAt: null };
    case "answer": {
      const answer = (extra.answer ?? "").trim();
      if (!answer) throw new Error(t("Write the answer first"));
      return { ...rfi, status: "answered", ballInCourt: "us", answer, answeredBy: by.trim() || null, answeredAt: now };
    }
    case "close":
      return { ...rfi, status: "closed", ballInCourt: "us", closedAt: now };
    case "reopen":
      return { ...rfi, status: "open", ballInCourt: "them", closedAt: null };
    case "void":
      return { ...rfi, status: "void", ballInCourt: "us", closedAt: now };
  }
}

/** Open and past its due day (`today` and `due` are YYYY-MM-DD; due today is not overdue yet). */
export function isOverdue(rfi: Pick<Rfi, "status" | "due" | "deleted">, today: string): boolean {
  return !rfi.deleted && rfi.status === "open" && !!rfi.due && rfi.due < today;
}

const DAY = 86_400_000;

/** Whole days between two ISO times (or days), never negative. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.length === 10 ? `${fromIso}T12:00:00Z` : fromIso);
  const b = Date.parse(toIso.length === 10 ? `${toIso}T12:00:00Z` : toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / DAY));
}

export interface RfiSummary {
  open: number;
  overdue: number;
  /** Open and waiting on the other side. */
  withThem: number;
  /** Mean days from sent to answered (one decimal), null when nothing was answered yet. */
  avgDaysToAnswer: number | null;
  total: number;
}

export function rfiSummary(rfis: Rfi[], today: string): RfiSummary {
  const live = rfis.filter((r) => !r.deleted && r.status !== "void");
  const open = live.filter((r) => r.status === "open");
  const spans = live
    .filter((r) => r.sentAt && r.answeredAt)
    .map((r) => (Date.parse(r.answeredAt!) - Date.parse(r.sentAt!)) / DAY)
    .filter((d) => Number.isFinite(d) && d >= 0);
  return {
    open: open.length,
    overdue: open.filter((r) => isOverdue(r, today)).length,
    withThem: open.filter((r) => r.ballInCourt === "them").length,
    avgDaysToAnswer: spans.length ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null,
    total: live.length,
  };
}

export type RfiFilter = "open" | "them" | "overdue" | "all";

/** The list filters: open (waiting on anyone), with them, overdue, all (void and deleted hidden except in "all"). */
export function filterRfis(rfis: Rfi[], filter: RfiFilter, today: string): Rfi[] {
  const live = rfis.filter((r) => !r.deleted);
  const out =
    filter === "open"
      ? live.filter((r) => r.status === "open" || r.status === "draft" || r.status === "answered")
      : filter === "them"
        ? live.filter((r) => r.status === "open" && r.ballInCourt === "them")
        : filter === "overdue"
          ? live.filter((r) => isOverdue(r, today))
          : live;
  return [...out].sort((a, b) => b.number - a.number);
}

/** What each role may do. Techs raise RFIs from the field (drafts with photos); the office sends, closes and voids. */
export type RfiPermission = "view" | "create" | "editDraft" | "addPhoto" | "edit" | "send" | "recordAnswer" | "close" | "reopen" | "void" | "delete";
const TECH_RFI: Record<RfiPermission, boolean> = {
  view: true,
  create: true,
  editDraft: true,
  addPhoto: true,
  edit: false,
  send: false,
  recordAnswer: false,
  close: false,
  reopen: false,
  void: false,
  delete: false,
};
/** No team (working alone) means full access, like `can()` in teamLogic. */
export function canRfi(role: TeamRole | null | undefined, action: RfiPermission): boolean {
  return role === "tech" ? TECH_RFI[action] : true;
}

/** May this person change the RFI's text and attachments? */
export function canEditRfi(role: TeamRole | null | undefined, rfi: Pick<Rfi, "status">): boolean {
  if (rfi.status === "void") return false;
  return canRfi(role, "edit") || (rfi.status === "draft" && canRfi(role, "editDraft"));
}

/** A random share token: URL-safe, 24 characters (rejection sampling keeps every character equally likely). */
const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newShareToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)), length = 24): string {
  let out = "";
  while (out.length < length) {
    for (const b of random(length * 2)) {
      if (out.length >= length) break;
      if (b < 256 - (256 % TOKEN_ALPHABET.length)) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
    }
  }
  return out;
}

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

export function rfiLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/q?t=${encodeURIComponent(token)}`;
}

const dueText = (due: string) => {
  const d = new Date(`${due}T12:00:00`);
  return Number.isNaN(d.getTime()) ? due : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

/** Subject and body for a mailto: link (plain text; the link is the no-login answer page when there is one). */
export function emailText(
  rfi: Rfi,
  project: Pick<Project, "address" | "clientName">,
  link: string | null,
  opts: { sheetName?: string | null; from?: string | null; company?: string | null } = {},
): { subject: string; body: string } {
  const job = project.address || project.clientName || "";
  const subject = [`${rfiCode(rfi.number)}: ${rfi.subject.trim() || "Question"}`, job].filter(Boolean).join(" — ");
  const lines: string[] = [];
  lines.push(rfi.toName?.trim() ? `Hi ${rfi.toName.trim().split(/\s+/)[0]},` : "Hi,");
  lines.push("");
  lines.push(`We need an answer on the following${job ? ` for ${job}` : ""}:`);
  lines.push("");
  lines.push(`${rfiCode(rfi.number)} — ${rfi.subject.trim() || "Question"}`);
  if (rfi.question.trim()) lines.push(rfi.question.trim());
  if (rfi.suggestion?.trim()) {
    lines.push("");
    lines.push(`Our suggestion: ${rfi.suggestion.trim()}`);
  }
  const facts: string[] = [];
  if (rfi.due) facts.push(`Answer needed by: ${dueText(rfi.due)}`);
  if (opts.sheetName && rfi.x != null && rfi.y != null) facts.push(`Location: marked on plan sheet "${opts.sheetName}"`);
  if (rfi.costImpact === "yes" || rfi.costImpact === "tbd") facts.push(`Possible cost impact: ${rfi.costImpact === "yes" ? "yes" : "to be determined"}`);
  if (rfi.scheduleImpact === "yes" || rfi.scheduleImpact === "tbd") facts.push(`Possible schedule impact: ${rfi.scheduleImpact === "yes" ? "yes" : "to be determined"}`);
  if ((rfi.photoIds?.length ?? 0) > 0) facts.push(`Photos: ${rfi.photoIds!.length}${link ? " (on the page below)" : " (attached separately)"}`);
  if (facts.length) {
    lines.push("");
    lines.push(...facts);
  }
  lines.push("");
  if (link) {
    lines.push("See the plan location and photos, and answer here (no login needed):");
    lines.push(link);
  } else {
    lines.push("Please reply to this email with your answer.");
  }
  lines.push("");
  lines.push("Thank you,");
  const sign = [opts.from?.trim(), opts.company?.trim()].filter(Boolean);
  if (sign.length) lines.push(sign.join("\n"));
  return { subject, body: lines.join("\n") };
}

/** mailto: URL with to, cc, subject and body (each part encoded). */
export function mailtoUrl(to: string | null | undefined, cc: string[] | null | undefined, text: { subject: string; body: string }): string {
  const q = [`subject=${encodeURIComponent(text.subject)}`, `body=${encodeURIComponent(text.body)}`];
  const ccs = (cc ?? []).map((c) => c.trim()).filter(Boolean);
  if (ccs.length) q.unshift(`cc=${ccs.map(encodeURIComponent).join(",")}`);
  return `mailto:${encodeURIComponent((to ?? "").trim())}?${q.join("&")}`;
}

/** Split a typed CC list ("a@b.c, d@e.f; g@h.i") into addresses. */
export function parseCc(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))];
}

/** The part of a plan shown around a spot: a window `frac` of the sheet's longer side, kept inside the sheet. Relative (0–1). */
export function planCropRect(x: number, y: number, sheetW: number, sheetH: number, frac = 0.28): { x: number; y: number; w: number; h: number } {
  const W = Math.max(1, sheetW);
  const H = Math.max(1, sheetH);
  const side = Math.max(W, H) * frac;
  // A 4:3 window (landscape), never bigger than the sheet.
  const wPx = Math.min(W, side * 1.3333);
  const hPx = Math.min(H, side);
  const w = wPx / W;
  const h = hPx / H;
  const clamp = (v: number, size: number) => Math.min(1 - size, Math.max(0, v - size / 2));
  return { x: clamp(x, w), y: clamp(y, h), w, h };
}

export interface PublicRfiPhoto {
  url: string;
  width: number;
  height: number;
  caption?: string | null;
  annotations?: PhotoShape[] | null;
}

export interface PublicRfiPlan {
  url: string;
  width: number;
  height: number;
  x: number;
  y: number;
  sheetName?: string | null;
}

/** Exactly what the outside party sees on the answer page. Built from a whitelist: no author emails, ids, tokens or internal links. */
export interface PublicRfiView {
  code: string;
  subject: string;
  question: string;
  suggestion: string | null;
  status: "open" | "answered" | "closed";
  priority: "low" | "normal" | "high" | null;
  costImpact: "yes" | "no" | "tbd" | null;
  scheduleImpact: "yes" | "no" | "tbd" | null;
  due: string | null;
  sentAt: string | null;
  toName: string | null;
  toCompany: string | null;
  address: string;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  sender: { company: string | null; contact: string | null; phone: string | null; email: string | null; website: string | null; logo: string | null; brandColor: string | null };
  photos: PublicRfiPhoto[];
  plan: PublicRfiPlan | null;
}

const str = (v: unknown, max = 5000): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): T | null => (xs.includes(v as T) ? (v as T) : null);

/**
 * The answer page's view of an RFI, or null when it must not be shown (draft, void, deleted). Void and drafts look
 * exactly like an unknown link. `photos` are the signed URLs for the RFI's photos (in order); `plan` the plan crop.
 */
export function publicRfiView(
  rfi: Rfi,
  project: { address?: string | null } | null,
  photos: PublicRfiPhoto[],
  plan: PublicRfiPlan | null = null,
): PublicRfiView | null {
  if (rfi.deleted || rfi.status === "void" || rfi.status === "draft") return null;
  const s: RfiSender = rfi.sender ?? {};
  const logo = str(s.logo, 400_000);
  return {
    code: rfiCode(rfi.number),
    subject: str(rfi.subject, 300) ?? "Question",
    question: str(rfi.question) ?? "",
    suggestion: str(rfi.suggestion),
    status: rfi.status,
    priority: oneOf(rfi.priority, ["low", "normal", "high"] as const),
    costImpact: oneOf(rfi.costImpact, ["yes", "no", "tbd"] as const),
    scheduleImpact: oneOf(rfi.scheduleImpact, ["yes", "no", "tbd"] as const),
    due: typeof rfi.due === "string" && /^\d{4}-\d{2}-\d{2}/.test(rfi.due) ? rfi.due.slice(0, 10) : null,
    sentAt: str(rfi.sentAt, 40),
    toName: str(rfi.toName, 120),
    toCompany: str(rfi.toCompany, 120),
    address: str(project?.address, 300) ?? "",
    answer: str(rfi.answer),
    answeredBy: str(rfi.answeredBy, 120),
    answeredAt: str(rfi.answeredAt, 40),
    sender: {
      company: str(s.company, 120),
      contact: str(s.contact, 120),
      phone: str(s.phone, 40),
      email: str(s.email, 200),
      website: str(s.website, 200),
      // Only images (a data: URL or https), never script-able URLs.
      logo: logo && /^(data:image\/|https:\/\/)/i.test(logo) ? logo : null,
      brandColor: str(s.brandColor, 20) && /^#[0-9a-f]{3,8}$/i.test(String(s.brandColor)) ? String(s.brandColor) : null,
    },
    photos: photos.map((p) => ({ url: p.url, width: p.width || 0, height: p.height || 0, caption: str(p.caption, 300), annotations: Array.isArray(p.annotations) ? p.annotations : null })),
    plan: plan && Number.isFinite(plan.x) && Number.isFinite(plan.y) ? { url: plan.url, width: plan.width || 0, height: plan.height || 0, x: plan.x, y: plan.y, sheetName: str(plan.sheetName, 120) } : null,
  };
}

/** Photos the RFI points at, in its order (deleted or missing ones skipped). */
export function rfiPhotos(rfi: Pick<Rfi, "photoIds">, photos: Photo[]): Photo[] {
  const byId = new Map(photos.filter((p) => !p.deleted).map((p) => [p.id, p]));
  return (rfi.photoIds ?? []).map((id) => byId.get(id)).filter((p): p is Photo => !!p);
}

/** Pick the company details to freeze on the RFI at send time (small logos only, so the row stays light). */
export function senderFrom(business: { name?: string; phone?: string; email?: string; website?: string; logo?: string; brandColor?: string }, contact: string | null): RfiSender {
  const logo = business.logo && business.logo.length <= 300_000 && /^(data:image\/|https:\/\/)/i.test(business.logo) ? business.logo : null;
  return {
    company: business.name?.trim() || null,
    contact: contact?.trim() || null,
    phone: business.phone?.trim() || null,
    email: business.email?.trim() || null,
    website: business.website?.trim() || null,
    logo,
    brandColor: business.brandColor || null,
  };
}

/** Age label: "today", "1 day", "12 days". */
export function ageText(fromIso: string, nowIso: string): string {
  const d = daysBetween(fromIso, nowIso);
  return d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`;
}

/** A blank draft. */
export function newRfi(id: string, projectId: string, number: number, createdBy: string | null, now: string, extra: Partial<Rfi> = {}): Rfi {
  return {
    id,
    projectId,
    number,
    subject: "",
    question: "",
    status: "draft",
    ballInCourt: "us",
    priority: "normal",
    costImpact: "tbd",
    scheduleImpact: "tbd",
    photoIds: [],
    documentIds: [],
    createdBy,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

/** File name for a PDF: "rfi-007-12-oak-st.pdf" / "rfi-log-12-oak-st.pdf". */
export function rfiPdfName(jobSlug: string, rfi?: Pick<Rfi, "number">): string {
  return rfi ? `${rfiCode(rfi.number).toLowerCase()}-${jobSlug}.pdf` : `rfi-log-${jobSlug}.pdf`;
}
