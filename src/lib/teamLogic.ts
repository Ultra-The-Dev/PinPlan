// Company teams: roles, what each role may do, and invite codes. Pure (no browser or network), shared by the
// web screens and tests; the iPad app mirrors it in PinPlanCore (TeamLogic.swift).

export type TeamRole = "owner" | "admin" | "tech";

/** Things the app shows or hides by role. The database enforces the price and delete rules as well. */
export type TeamAction =
  | "prices" // estimate tab, proposals, Billdu, prices in the catalog and products
  | "manageTeam" // invite, change roles, remove people
  | "deleteJob"
  | "editCatalog";

export const ROLE_INFO: Record<TeamRole, { name: string; short: string; description: string }> = {
  owner: { name: "Owner", short: "Owner", description: "Everything, including billing and the team. One per company." },
  admin: { name: "Office / admin", short: "Admin", description: "Everything: estimates, proposals, Billdu, catalog and the team." },
  tech: { name: "Technician", short: "Tech", description: "Field work on every job: plans, devices, photos, checklists, logs and tasks. No prices." },
};

/** No team (working alone) means full access. */
const TECH_CAN: Record<TeamAction, boolean> = { prices: false, manageTeam: false, deleteJob: false, editCatalog: false };
export function can(role: TeamRole | null | undefined, action: TeamAction): boolean {
  return role === "tech" ? TECH_CAN[action] : true;
}

// Unambiguous characters (no 0/O, 1/I/L), so a code read aloud or typed on an iPad works first time.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 10;

/** A random invite code, e.g. "K7QM-XR4T-PA" style without the dashes. `random` is for tests. */
export function newInviteCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(CODE_LENGTH * 2);
  let out = "";
  // Rejection sampling keeps every character equally likely.
  for (let i = 0; i < bytes.length && out.length < CODE_LENGTH; i++) {
    const b = bytes[i];
    if (b < 256 - (256 % CODE_ALPHABET.length)) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return out.length === CODE_LENGTH ? out : newInviteCode(random);
}

/** Codes are stored upper case without separators; people may type spaces, dashes or lower case. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "K7QMXR4TPA" → "K7QM-XR4T-PA" for showing and reading aloud. */
export function formatCode(code: string): string {
  return normalizeCode(code).replace(/(.{4})(?=.)/g, "$1-");
}

export function joinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/join?code=${encodeURIComponent(normalizeCode(code))}`;
}

export type InviteState = "open" | "used" | "expired" | "revoked";
export function inviteState(i: { used_by?: string | null; revoked?: boolean; expires_at: string }, now = new Date()): InviteState {
  if (i.revoked) return "revoked";
  if (i.used_by) return "used";
  return new Date(i.expires_at).getTime() <= now.getTime() ? "expired" : "open";
}

/** A friendly message for the errors the team functions raise. */
export function teamErrorMessage(e: { message?: string | null; code?: string | null } | null | undefined): string {
  const msg = e?.message ?? "Something went wrong";
  if (/(function|table|relation)[^]*\b(team_|create_team|teams\b)/i.test(msg))
    return "The cloud database needs the team update: run supabase/migrations/20261120000000_teams.sql in Supabase.";
  if (/JWT|not authenticated|Sign in first/i.test(msg)) return "Sign in first.";
  return msg;
}

/** Sort members: owner, admins, techs, then by name. */
export function sortMembers<T extends { role: TeamRole; name: string; email?: string | null }>(members: T[]): T[] {
  const rank: Record<TeamRole, number> = { owner: 0, admin: 1, tech: 2 };
  const label = (m: T) => (m.name || m.email || "").toLowerCase();
  return [...members].sort((a, b) => rank[a.role] - rank[b.role] || label(a).localeCompare(label(b)));
}

/** What to call someone: their name, else the part of their email before the @. */
export function memberLabel(m: { name?: string | null; email?: string | null }): string {
  return m.name?.trim() || m.email?.split("@")[0] || "Team member";
}

/** Initials for a member's avatar: "Jordan Lee" → "JL", "pat@x.com" → "P". */
export function memberInitials(m: { name?: string | null; email?: string | null }): string {
  const words = memberLabel(m).split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** The text sent with an invite (copied, shared or texted). */
export function inviteMessage(opts: { team: string; from?: string; role: "admin" | "tech"; code: string; link: string }): string {
  const who = opts.from?.trim() ? `${opts.from.trim()} invited you` : "You're invited";
  const as = opts.role === "admin" ? "the office" : "the crew";
  return `${who} to join ${opts.team.trim() || "our team"} on PinPlan (${as}). Open ${opts.link} to set up your login — or enter code ${formatCode(opts.code)} on the Join page.`;
}

/** An sms: link that opens Messages with the text filled in (the "?&body=" form works on iPhone and Android). */
export function smsHref(body: string, to = ""): string {
  return `sms:${encodeURIComponent(to)}?&body=${encodeURIComponent(body)}`;
}

export const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks a new worker's sign-up form. Returns a message for the first problem, or null when it's fine. */
export function signupProblem(f: { email: string; password: string; name?: string; code?: string }): string | null {
  if (f.code !== undefined) {
    const c = normalizeCode(f.code);
    if (c.length < 8 || c.length > 64) return "Enter the invite code you were sent.";
  }
  if ((f.name ?? "").trim().length > 80) return "Keep your name under 80 characters.";
  const email = f.email.trim();
  if (!EMAIL_RE.test(email) || email.length > 254) return "Enter a valid email address.";
  if (f.password.length < PASSWORD_MIN) return `Use a password of at least ${PASSWORD_MIN} characters.`;
  if (f.password.length > 72) return "Use a password of 72 characters or fewer.";
  return null;
}
