// POST /api/team/invite-email { code, email, name? }: emails a team invite.
// Owner or admin only. The invite is read with the caller's own token, so row-level security decides whether they may
// see it (only the owner and admins of its team can). Works for the web app and the iPad (Authorization: Bearer …).
// Abuse limits (sendGuard.ts): confirmed sender email, active subscription and a daily invite cap per company.
// Once sent, the address and the time are saved on the invite (team_invites.email and invite_emailed_at) by the server
// (service role; the caller's right to the invite was checked with their own token above). /api/team/join only
// creates an account for an invite PinPlan emailed, and only for that address. Sending again to another address moves
// the invite to it. invite_emailed_at is the server's alone (team_invites_emailed_guard).
// A free trial can't put links in the names the email shows (team, inviter, invitee): stripLinks.
import { inviteState, joinUrl, memberLabel, normalizeCode } from "@/lib/teamLogic";
import { stripLinks, teamInviteEmail } from "@/lib/emailTemplates";
import { requireUser } from "@/lib/server/auth";
import { appOrigin, appOriginMissing, emailConfigured, emailUnavailable, rateLimiter, sendEmail, sendFailure, validEmail } from "@/lib/server/email";
import { finishSend, reserveSend } from "@/lib/server/sendGuard";
import { anonKey, bearer, serviceConfigured, serviceFetch, supabaseUrl, userFetch } from "@/lib/server/supabaseAdmin";

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status });

// Per user per hour (per server instance): plenty for hiring, a brake on misuse.
const perUser = rateLimiter(60 * 60 * 1000, 20);

export async function POST(req: Request) {
  if (!emailConfigured()) return emailUnavailable("Share the invite with Copy link or Text it instead.");
  if (!supabaseUrl() || !anonKey()) return json({ error: "Teams need cloud sync, which isn't set up on this server.", code: "unavailable" }, 501);
  const origin = appOrigin(req);
  if (!origin) return appOriginMissing();

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const token = bearer(req);
  if (!auth.userId || !token) return json({ error: "Sign in to email invites.", code: "sign_in_required" }, 401);

  let body: { code?: unknown; email?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request.", code: "bad_request" }, 400);
  }
  const code = typeof body.code === "string" ? normalizeCode(body.code) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (code.length < 8 || code.length > 64) return json({ error: "That invite code isn't valid.", code: "bad_request" }, 400);
  if (!validEmail(email)) return json({ error: "Enter a valid email address.", code: "bad_request" }, 400);

  if (perUser.limited(`user:${auth.userId}`)) return json({ error: "That's a lot of invites for one hour. Wait a while, or send the link by text.", code: "rate_limited" }, 429);

  let invite: { code: string; team_id: string; role: "admin" | "tech"; name: string; expires_at: string; used_by: string | null; revoked: boolean } | undefined;
  let teamName = "";
  let inviter = "";
  let inviterEmail = "";
  try {
    const r = await userFetch(token, `/rest/v1/team_invites?code=eq.${encodeURIComponent(code)}&select=code,team_id,role,name,expires_at,used_by,revoked`);
    if (r.status === 404) return json({ error: "Teams aren't set up on this server yet.", code: "unavailable" }, 501);
    if (r.status === 401) return json({ error: "Your session has expired. Sign in again.", code: "sign_in_required" }, 401);
    if (!r.ok) return json({ error: "Couldn't check the invite. Try again.", code: "upstream" }, 502);
    invite = ((await r.json()) as (typeof invite)[])[0];
    // Not found, or not one this caller manages (RLS hides other teams' invites and all invites from technicians).
    if (!invite) return json({ error: "That invite wasn't found on your team.", code: "not_found" }, 404);
    const state = inviteState(invite);
    if (state !== "open")
      return json({ error: `That invite has ${state === "used" ? "already been used" : state === "expired" ? "expired" : "been revoked"}. Create a new one.`, code: `invite_${state}` }, 409);

    const [t, me] = await Promise.all([
      userFetch(token, `/rest/v1/teams?id=eq.${encodeURIComponent(invite.team_id)}&select=name`),
      userFetch(token, `/rest/v1/team_members?user_id=eq.${encodeURIComponent(auth.userId)}&select=name,email,role,team_id`),
    ]);
    if (!t.ok || !me.ok) return json({ error: "Couldn't load your team. Try again.", code: "upstream" }, 502);
    teamName = ((await t.json()) as { name?: string }[])[0]?.name ?? "";
    const mine = ((await me.json()) as { name?: string; email?: string; role?: string; team_id?: string }[])[0];
    if (!mine || mine.team_id !== invite.team_id || (mine.role !== "owner" && mine.role !== "admin"))
      return json({ error: "Only the owner or an admin can send invites.", code: "forbidden" }, 403);
    inviter = memberLabel(mine);
    inviterEmail = mine.email ?? "";
  } catch {
    console.warn("[invite-email] database unreachable");
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }

  const guard = await reserveSend(auth.userId, "invite", email);
  if (!guard.ok) return guard.response;

  // A free trial's names can't carry links (anyone can open a trial and name their "team" after a phishing site).
  const clean = (s: string) => (guard.trial ? stripLinks(s) : s);
  const content = teamInviteEmail({
    inviterName: clean(inviter),
    teamName: clean(teamName),
    role: invite.role,
    code: invite.code,
    joinUrl: joinUrl(origin, invite.code),
    inviteeName: clean(name || invite.name),
    expiresAt: invite.expires_at,
  });
  // Replies go to whoever sent the invite.
  const sent = await sendEmail({ to: email, ...content, replyTo: validEmail(inviterEmail) ? inviterEmail : undefined, tags: { type: "team_invite" } });
  await finishSend(guard, sent);
  if (!sent.ok) return sendFailure(sent);
  const saved = await saveInviteEmail(token, invite.code, invite.team_id, email);
  return json({ ok: true, savedEmail: saved });
}

/** Remembers who the invite went to, and that PinPlan emailed it (the server's own write: the caller's right to this
 *  invite was checked above with their token). A failure (e.g. the migration not run yet) doesn't undo the send: the
 *  join page then uses the normal sign-up. Without the service key (local use) only the address is saved, as the
 *  caller. */
async function saveInviteEmail(token: string, code: string, teamId: string, email: string): Promise<boolean> {
  const path = `/rest/v1/team_invites?code=eq.${encodeURIComponent(code)}`;
  const init = (body: Record<string, unknown>): RequestInit => ({
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  try {
    const r = serviceConfigured()
      ? await serviceFetch(`${path}&team_id=eq.${encodeURIComponent(teamId)}&used_by=is.null&revoked=is.false`, init({ email, invite_emailed_at: new Date().toISOString() }))
      : await userFetch(token, path, init({ email }));
    if (!r.ok) console.warn("[invite-email] couldn't save the invite's email", r.status);
    return r.ok;
  } catch {
    console.warn("[invite-email] couldn't save the invite's email");
    return false;
  }
}
