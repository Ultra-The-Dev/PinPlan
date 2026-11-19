// DELETE /api/account: deletes the caller's PinPlan account (App Store rule 5.1.1(v): apps with sign-up must
// offer deletion). The caller is identified by their own Supabase access token; the work is done with the
// service-role key, which never leaves the server. Without that key this answers 501.
//
// What goes: the login, their jobs (projects → everything else by FK cascade), their catalog and products,
// their files in the `plans` and `proposals` storage buckets, and their team if they own it alone.
// A team owner with other people on the team is refused (remove them first). A team member's jobs stay with
// the company: they move to the team owner before the login is deleted.
import { connection } from "next/server";
import { accountDeletionPlan } from "@/lib/onboardingLogic";
import type { TeamRole } from "@/lib/teamLogic";
import { billingConfig, getStripe } from "@/lib/server/billing";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status });

class Upstream extends Error {}

export async function DELETE(req: Request) {
  await connection();
  const url = supabaseUrl();
  const anon = anonKey();
  const service = serviceKey();
  if (!url || !anon) return json({ error: "Accounts aren’t set up on this server.", code: "unavailable" }, 501);
  if (!service)
    return json(
      {
        error: "Account deletion isn’t switched on for this server yet (SUPABASE_SERVICE_ROLE_KEY is missing). Email support and we’ll delete your account for you.",
        code: "unavailable",
      },
      501,
    );

  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in first.", code: "unauthorized" }, 401);

  // Who is asking (their own token, checked by Supabase Auth).
  let userId: string;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.status === 401 || r.status === 403) return json({ error: "Your sign-in has expired. Sign in again, then delete your account.", code: "unauthorized" }, 401);
    if (!r.ok) return json({ error: "Couldn’t check your sign-in. Try again.", code: "upstream" }, 502);
    const u = (await r.json()) as { id?: string };
    if (!u.id) return json({ error: "Sign in first.", code: "unauthorized" }, 401);
    userId = u.id;
  } catch {
    return json({ error: "Couldn’t reach the cloud database.", code: "upstream" }, 502);
  }

  const admin = { apikey: service, Authorization: `Bearer ${service}` };
  const rest = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
    const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...admin, "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
    // A table this project doesn't have yet (migration not run) has nothing of theirs in it.
    if (r.status === 404) return null;
    if (!r.ok) throw new Upstream(`${path.split("?")[0]}: ${r.status} ${await r.text().catch(() => "")}`);
    return r.status === 204 ? null : ((await r.json().catch(() => null)) as T);
  };
  const id = encodeURIComponent(userId);

  try {
    // 1. Team rules.
    const me = (await rest<{ team_id: string; role: TeamRole }[]>(`team_members?user_id=eq.${id}&select=team_id,role`))?.[0] ?? null;
    let memberCount = 0;
    let teamOwnerId: string | null = null;
    if (me) {
      const tid = encodeURIComponent(me.team_id);
      memberCount = (await rest<{ user_id: string }[]>(`team_members?team_id=eq.${tid}&select=user_id`))?.length ?? 0;
      teamOwnerId = (await rest<{ owner_id: string }[]>(`teams?id=eq.${tid}&select=owner_id`))?.[0]?.owner_id ?? null;
    }
    const plan = accountDeletionPlan({ userId, membership: me ? { teamId: me.team_id, role: me.role } : null, teamOwnerId, memberCount });
    if (!plan.ok) return json({ error: plan.message, code: plan.code }, plan.status);

    // 2. A team member's jobs (and the proposals and photo reports on them) stay with the company.
    if (plan.transferJobsTo) {
      const to = JSON.stringify({ owner_id: plan.transferJobsTo });
      for (const table of ["projects", "proposals", "photo_reports"])
        await rest(`${table}?owner_id=eq.${id}`, { method: "PATCH", body: to, headers: { Prefer: "return=minimal" } });
    }

    // 3. Files: plan images live under <project id>/ in `plans`; proposal renders under <user id>/ in `proposals`.
    const projects = (await rest<{ id: string }[]>(`projects?owner_id=eq.${id}&select=id`)) ?? [];
    for (const p of projects) await removeFolder(url, admin, "plans", p.id);
    if (!plan.transferJobsTo) await removeFolder(url, admin, "proposals", userId);

    // 4. A team they own alone (members and invites cascade with it). Stop its subscription first, so a closed
    //    account is never billed again (Stripe's own record and invoices stay, as accounting requires).
    if (plan.deleteTeamId) {
      const sub = (await rest<{ stripe_subscription_id: string | null }[]>(`teams?id=eq.${encodeURIComponent(plan.deleteTeamId)}&select=stripe_subscription_id`).catch(() => null))?.[0]?.stripe_subscription_id;
      const cfg = billingConfig();
      if (sub && cfg.ok) {
        try {
          await getStripe(cfg.config).subscriptions.cancel(sub, { prorate: false });
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== "resource_missing") throw new Upstream(`stripe: ${(e as Error).message}`);
        }
      }
    }
    if (plan.deleteTeamId) await rest(`teams?id=eq.${encodeURIComponent(plan.deleteTeamId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

    // 5. The login. Their jobs, catalog, products, proposals and memberships go with it (on delete cascade).
    const del = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin, cache: "no-store" });
    if (!del.ok && del.status !== 404) throw new Upstream(`auth: ${del.status} ${await del.text().catch(() => "")}`);
    return json({ ok: true, deletedTeam: !!plan.deleteTeamId, keptJobsWithTeam: !!plan.transferJobsTo, deletedJobs: plan.transferJobsTo ? 0 : projects.length });
  } catch (e) {
    console.error("[account delete]", e);
    return json({ error: "Your account wasn’t deleted — something went wrong on the server. Try again in a minute, or email support.", code: "upstream" }, 502);
  }
}

type Headers_ = Record<string, string>;

/** Every object under `prefix/` in `bucket` (walks sub-folders), via the Storage API. */
async function listFolder(url: string, admin: Headers_, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      cache: "no-store",
    });
    // No such bucket on this project: nothing to delete.
    if (r.status === 400 || r.status === 404) {
      const text = await r.text().catch(() => "");
      if (/not.?found/i.test(text)) return out;
      throw new Upstream(`storage list ${bucket}: ${r.status} ${text}`);
    }
    if (!r.ok) throw new Upstream(`storage list ${bucket}: ${r.status}`);
    const items = (await r.json()) as { name: string; id: string | null }[];
    for (const it of items) {
      const path = `${prefix}/${it.name}`;
      if (it.id) out.push(path);
      else if (depth < 3) out.push(...(await listFolder(url, admin, bucket, path, depth + 1)));
    }
    if (items.length < 1000) return out;
  }
}

async function removeFolder(url: string, admin: Headers_, bucket: string, prefix: string) {
  const paths = await listFolder(url, admin, bucket, prefix);
  for (let i = 0; i < paths.length; i += 500) {
    const r = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths.slice(i, i + 500) }),
      cache: "no-store",
    });
    if (!r.ok) throw new Upstream(`storage delete ${bucket}: ${r.status}`);
  }
}
