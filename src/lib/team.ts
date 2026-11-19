"use client";
// The signed-in user's company team: who's on it, their role, and the calls that manage it.
// The role is cached on this device so the app hides the right things offline too.
import { create } from "zustand";
import { parseTeamBilling, type TeamBilling } from "./billingLogic";
import { setAuthor } from "./photos";
import { getSupabase } from "./supabase";
import { newInviteCode, normalizeCode, teamErrorMessage, type TeamRole } from "./teamLogic";

export interface Team {
  id: string;
  name: string;
  ownerId: string;
}
export interface TeamMember {
  userId: string;
  role: TeamRole;
  name: string;
  email: string | null;
  createdAt: string;
}
export interface TeamInvite {
  code: string;
  role: Exclude<TeamRole, "owner">;
  name: string;
  createdAt: string;
  expiresAt: string;
  usedBy: string | null;
  usedAt: string | null;
  revoked: boolean;
}

export interface TeamState {
  /** Loaded for this user at least once (from the cloud or this device's cache). */
  ready: boolean;
  userId: string | null;
  team: Team | null;
  role: TeamRole | null;
  members: TeamMember[];
  /** The team's subscription (from `team_billing()`); null when not on a team or the billing update isn't in the database. */
  billing: TeamBilling | null;
  /** The database doesn't have the team tables yet (migration not run). */
  needsMigration: boolean;
  error: string | null;
}

const CACHE_KEY = "pinplan.team";
const empty: TeamState = { ready: false, userId: null, team: null, role: null, members: [], billing: null, needsMigration: false, error: null };

function readCache(): Partial<TeamState> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Partial<TeamState>) : null;
  } catch {
    return null;
  }
}
function writeCache(s: TeamState) {
  try {
    if (!s.userId) localStorage.removeItem(CACHE_KEY);
    else localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: s.userId, team: s.team, role: s.role, members: s.members, billing: s.billing }));
  } catch {
    /* storage unavailable */
  }
}

export const useTeam = create<TeamState>(() => empty);

/** The current user's role, or null when not on a team (full access). */
export const useRole = () => useTeam((s) => s.role);

/** The team's billing, or null (solo, or billing not set up). */
export const useBilling = () => useTeam((s) => s.billing);

/** Reload the team (and its billing) for the signed-in user, e.g. after checkout. */
export const reloadTeam = () => reload();

const isMissingSchema = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42P01" || /Could not find the (table|function)/i.test(e.message ?? ""));

/** Load the team for `userId` (null = signed out). Uses this device's cache while offline. */
export async function loadTeam(userId: string | null): Promise<TeamState> {
  if (!userId) {
    const s = { ...empty, ready: true };
    useTeam.setState(s, true);
    writeCache(s);
    return s;
  }
  const cached = readCache();
  if (cached?.userId === userId && !useTeam.getState().ready) useTeam.setState({ ...empty, ...cached, ready: true } as TeamState, true);
  const sb = getSupabase();
  if (!sb) return useTeam.getState();
  const me = await sb.from("team_members").select("team_id, role").eq("user_id", userId).maybeSingle();
  if (me.error) {
    // Offline or a migration behind: keep what we had (but never another account's team).
    const keep = useTeam.getState().userId === userId ? {} : { ...empty };
    useTeam.setState({ ...keep, ready: true, userId, needsMigration: isMissingSchema(me.error), error: isMissingSchema(me.error) ? null : me.error.message });
    return useTeam.getState();
  }
  if (!me.data) {
    const s: TeamState = { ...empty, ready: true, userId };
    useTeam.setState(s, true);
    writeCache(s);
    noteTeamForSync(userId, null);
    return s;
  }
  const [t, m, b] = await Promise.all([
    sb.from("teams").select("id, name, owner_id").eq("id", me.data.team_id).maybeSingle(),
    sb.from("team_members").select("user_id, role, name, email, created_at").eq("team_id", me.data.team_id),
    sb.rpc("team_billing"),
  ]);
  if (t.error || m.error) {
    useTeam.setState({ ready: true, userId, error: (t.error ?? m.error)!.message });
    return useTeam.getState();
  }
  const s: TeamState = {
    ready: true,
    userId,
    team: t.data ? { id: t.data.id, name: t.data.name, ownerId: t.data.owner_id } : null,
    role: me.data.role as TeamRole,
    members: (m.data ?? []).map((r) => ({ userId: r.user_id, role: r.role as TeamRole, name: r.name ?? "", email: r.email ?? null, createdAt: r.created_at })),
    // Without the billing update in the database there's no billing (never lock); on another error keep what we had.
    billing: b.error ? (isMissingSchema(b.error) ? null : (useTeam.getState().billing ?? null)) : parseTeamBilling(b.data),
    needsMigration: false,
    error: null,
  };
  useTeam.setState(s, true);
  writeCache(s);
  noteTeamForSync(userId, s.team?.id ?? null);
  return s;
}

/** Joining a team brings jobs that changed before this device's sync watermarks: pull everything again once. */
const TEAM_SYNC_KEY = (userId: string) => `pinplan.sync.team.${userId}`;
function noteTeamForSync(userId: string, teamId: string | null) {
  try {
    const prev = localStorage.getItem(TEAM_SYNC_KEY(userId));
    if (prev === (teamId ?? "")) return;
    localStorage.setItem(TEAM_SYNC_KEY(userId), teamId ?? "");
    // Nothing new to see when leaving a team, or the first time a solo user is checked.
    if (!teamId) return;
    const prefix = `pinplan.sync.pull.${userId}.`;
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}

/** Reload for the signed-in user. Asks the client for the session: right after signing in (the join page), the
 *  auth listener may not have recorded the user yet, and loading for "nobody" would wipe the team. */
async function reload(): Promise<TeamState> {
  const sb = getSupabase();
  const uid = (sb ? (await sb.auth.getSession()).data.session?.user.id : null) ?? useTeam.getState().userId;
  const s = await loadTeam(uid);
  // Photos, comments and logs say who did them: use the name on the team.
  const mine = s.members.find((m) => m.userId === s.userId);
  if (mine?.name) setAuthor(mine.name);
  return s;
}

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error("Cloud sync isn't set up on this server.");
  return sb;
}
function fail(e: { message?: string; code?: string } | null): never {
  throw new Error(teamErrorMessage(e));
}

export async function createTeam(name: string, myName: string): Promise<void> {
  const { error } = await client().rpc("create_team", { p_name: name, p_my_name: myName });
  if (error) fail(error);
  await reload();
}

export async function renameTeam(name: string): Promise<void> {
  const t = useTeam.getState().team;
  if (!t) return;
  const { error } = await client().from("teams").update({ name: name.trim(), updated_at: new Date().toISOString() }).eq("id", t.id);
  if (error) fail(error);
  await reload();
}

export async function setMyName(name: string): Promise<void> {
  const uid = useTeam.getState().userId;
  if (!uid) return;
  const { error } = await client().from("team_members").update({ name: name.trim() }).eq("user_id", uid);
  if (error) fail(error);
  await reload();
}

export async function listInvites(): Promise<TeamInvite[]> {
  const t = useTeam.getState().team;
  if (!t) return [];
  const { data, error } = await client()
    .from("team_invites")
    .select("code, role, name, created_at, expires_at, used_by, used_at, revoked")
    .eq("team_id", t.id)
    .order("created_at", { ascending: false });
  if (error) fail(error);
  return (data ?? []).map((r) => ({
    code: r.code,
    role: r.role,
    name: r.name ?? "",
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    usedBy: r.used_by,
    usedAt: r.used_at,
    revoked: r.revoked,
  }));
}

export async function createInvite(role: "admin" | "tech", name: string): Promise<string> {
  const t = useTeam.getState().team;
  if (!t) throw new Error("Start your team first.");
  // A clash is astronomically unlikely, but retry rather than fail.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newInviteCode();
    const { error } = await client().from("team_invites").insert({ code, team_id: t.id, role, name: name.trim() });
    if (!error) return code;
    if (error.code !== "23505") fail(error);
  }
  throw new Error("Couldn't make an invite code. Try again.");
}

export async function revokeInvite(code: string): Promise<void> {
  const { error } = await client().from("team_invites").update({ revoked: true }).eq("code", code);
  if (error) fail(error);
}

export async function setMemberRole(userId: string, role: "admin" | "tech"): Promise<void> {
  const { error } = await client().rpc("set_team_member_role", { p_user: userId, p_role: role });
  if (error) fail(error);
  await reload();
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await client().rpc("remove_team_member", { p_user: userId });
  if (error) fail(error);
  await reload();
}

export async function leaveTeam(): Promise<void> {
  const uid = useTeam.getState().userId;
  if (uid) await removeMember(uid);
}

export interface InviteInfo {
  team: string;
  role: "admin" | "tech";
  name: string;
  expiresAt: string;
}

/** What a code is for (works before signing in). Null when the code isn't valid (wrong, used, expired or revoked). */
export async function inviteInfo(code: string): Promise<InviteInfo | null> {
  const { data, error } = await client().rpc("team_invite_info", { p_code: normalizeCode(code) });
  if (error) fail(error);
  if (!data) return null;
  const d = data as { team: string; role: "admin" | "tech"; name: string; expires_at: string };
  return { team: d.team, role: d.role, name: d.name, expiresAt: d.expires_at };
}

export async function acceptInvite(code: string, name: string): Promise<{ team: string; role: TeamRole }> {
  const { data, error } = await client().rpc("accept_team_invite", { p_code: normalizeCode(code), p_name: name.trim() });
  if (error) fail(error);
  await reload();
  const d = data as { team: string; role: TeamRole };
  return { team: d.team, role: d.role };
}

// An invite opened before the worker had an account (e.g. waiting for the confirmation email) is finished
// automatically the next time they sign in on this device.
const PENDING_KEY = "pinplan.pendingInvite";
export function rememberPendingInvite(code: string, name: string) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ code: normalizeCode(code), name }));
  } catch {
    /* storage unavailable */
  }
}
export function pendingInvite(): { code: string; name: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as { code: string; name: string }) : null;
  } catch {
    return null;
  }
}
export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Call after sign-in: joins the team from a remembered invite, if any. Returns the team name when it did. */
export async function finishPendingInvite(): Promise<string | null> {
  const p = pendingInvite();
  if (!p || !useTeam.getState().userId) return null;
  try {
    const r = await acceptInvite(p.code, p.name);
    clearPendingInvite();
    return r.team;
  } catch (e) {
    // A dead code won't start working later; a network error might.
    if (!/fetch|network/i.test((e as Error).message)) clearPendingInvite();
    return null;
  }
}
