// DELETE /api/account: deletes the caller's PinPlan account (App Store rule 5.1.1(v): apps with sign-up must
// offer deletion). The caller is identified by their own Supabase access token; the work is done with the
// service-role key, which never leaves the server. Without that key this answers 501.
//
// What goes: the login, their jobs (projects → everything else by FK cascade), their catalog and products,
// their files in the `plans` and `proposals` storage buckets, and their team if they own it alone.
// A team owner with other people on the team is refused (remove them first). A team member's jobs stay with
// the company: they move to the team owner before the login is deleted.
//
// Safety and billing:
// - A stolen session alone can't delete an account: the sign-in must be fresh (in the last 5 minutes, by
//   the token's amr sign-in time, else its iat)
//   or the body must carry the account's email ({ "confirmEmail": "me@example.com" }), typed by the person.
// - A team with a Stripe subscription is never deleted while billing is misconfigured (501): the subscription would
//   keep charging with nobody left to cancel it. After cancelling, the Stripe customer is anonymised (name, email,
//   phone, address and metadata cleared; Stripe keeps the invoices, as accounting requires).
// - A member leaving a subscribed team gives back their paid seat (same rule as Settings → Team → remove).
import { connection } from "next/server";
import { accountDeletionPlan } from "@/lib/onboardingLogic";
import type { TeamRole } from "@/lib/teamLogic";
import { extraSeats, seatItem, seatTarget, type SubscriptionLike } from "@/lib/billingLogic";
import { applySubscription, billingConfig, getStripe } from "@/lib/server/billing";
import { tokenIssuedAt } from "@/lib/server/auth";
import { reportServerError } from "@/lib/server/serverErrors";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status });

class Upstream extends Error {}

/** When the person last actually signed in. A refreshed token gets a new `iat` (the browser refreshes on its own, and
 *  so can anyone holding a stolen refresh token), so Supabase's `amr` sign-in timestamps win when the token has them. */
function signedInAt(token: string): number | null {
  const part = token.split(".")[1];
  if (part) {
    try {
      const claims = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { amr?: unknown };
      if (Array.isArray(claims.amr)) {
        const times = claims.amr.map((m) => (m as { timestamp?: unknown } | null)?.timestamp).filter((t): t is number => typeof t === "number" && Number.isFinite(t));
        if (times.length) return Math.max(...times);
      }
    } catch {
      // fall through to iat
    }
  }
  return tokenIssuedAt(token);
}

/** How recent a sign-in must be to delete without typing the email. */
const FRESH_SIGN_IN_SECONDS = 5 * 60;
/** Subscription states that still bill for seats. */
const LIVE = new Set(["active", "past_due", "trialing"]);

interface TeamBillingRow {
  owner_id: string | null;
  plan_status?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  seat_limit?: number | null;
}

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
  let userEmail: string | null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.status === 401 || r.status === 403) return json({ error: "Your sign-in has expired. Sign in again, then delete your account.", code: "unauthorized" }, 401);
    if (!r.ok) return json({ error: "Couldn’t check your sign-in. Try again.", code: "upstream" }, 502);
    const u = (await r.json()) as { id?: string; email?: string | null };
    if (!u.id) return json({ error: "Sign in first.", code: "unauthorized" }, 401);
    userId = u.id;
    userEmail = u.email?.trim().toLowerCase() || null;
  } catch {
    return json({ error: "Couldn’t reach the cloud database.", code: "upstream" }, 502);
  }

  // A fresh sign-in, or the account's email typed again.
  const body = (await req.json().catch(() => null)) as { confirmEmail?: unknown; email?: unknown } | null;
  const typed = typeof body?.confirmEmail === "string" ? body.confirmEmail : typeof body?.email === "string" ? body.email : "";
  const signedIn = signedInAt(token);
  const fresh = signedIn != null && Date.now() / 1000 - signedIn < FRESH_SIGN_IN_SECONDS;
  const emailMatches = !!userEmail && typed.trim().toLowerCase() === userEmail;
  if (!fresh && !emailMatches)
    return json(
      {
        error: typed
          ? "That email doesn’t match your account. Type the email you sign in with, or sign out and sign in again, then delete your account."
          : "To keep your account safe, type the email you sign in with, or sign out and sign in again, then delete your account.",
        code: "reauth_required",
      },
      403,
    );

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
    let team: TeamBillingRow | null = null;
    if (me) {
      const tid = encodeURIComponent(me.team_id);
      memberCount = (await rest<{ user_id: string }[]>(`team_members?team_id=eq.${tid}&select=user_id`))?.length ?? 0;
      team =
        (await rest<TeamBillingRow[]>(`teams?id=eq.${tid}&select=owner_id,plan_status,stripe_subscription_id,stripe_customer_id,seat_limit`))?.[0] ?? null;
    }
    const teamOwnerId = team?.owner_id ?? null;
    const plan = accountDeletionPlan({ userId, membership: me ? { teamId: me.team_id, role: me.role } : null, teamOwnerId, memberCount });
    if (!plan.ok) return json({ error: plan.message, code: plan.code }, plan.status);

    // Billing must work before anything is deleted: a team's subscription is cancelled with it, and a leaving member's
    // paid seat is given back.
    const sub = team?.stripe_subscription_id ?? null;
    const releasesSeat = !!(plan.transferJobsTo && me && sub && team?.plan_status !== "comped" && LIVE.has(team?.plan_status ?? ""));
    const cfg = billingConfig();
    if ((plan.deleteTeamId && sub) || releasesSeat) {
      if (!cfg.ok) {
        console.error("[account delete] team has a subscription but billing isn't configured; missing:", cfg.missing.join(", "));
        return json(
          {
            error: "Your account can’t be deleted right now because your company’s subscription can’t be changed. Email support and we’ll delete it for you.",
            code: "billing_not_configured",
          },
          501,
        );
      }
    }

    // 2. A team member's jobs (and the proposals, photo reports and document links on them) stay with the company,
    //    as remove_team_member does. A table this project doesn't have yet answers 404 and is skipped.
    if (plan.transferJobsTo) {
      const to = JSON.stringify({ owner_id: plan.transferJobsTo });
      for (const table of ["projects", "proposals", "photo_reports", "document_links"])
        await rest(`${table}?owner_id=eq.${id}`, { method: "PATCH", body: to, headers: { Prefer: "return=minimal" } });
    }

    // 3. Files: plan images live under <project id>/ in `plans`; proposal renders under <user id>/ in `proposals`.
    const projects = (await rest<{ id: string }[]>(`projects?owner_id=eq.${id}&select=id`)) ?? [];
    for (const p of projects) await removeFolder(url, admin, "plans", p.id);
    if (!plan.transferJobsTo) await removeFolder(url, admin, "proposals", userId);

    // 4. A team they own alone (members and invites cascade with it). Stop its subscription first, so a closed
    //    account is never billed again (Stripe's own record and invoices stay, as accounting requires).
    if (plan.deleteTeamId && sub && cfg.ok) {
      const stripe = getStripe(cfg.config);
      try {
        await stripe.subscriptions.cancel(sub, { prorate: false });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== "resource_missing") throw new Upstream(`stripe: ${(e as Error).message}`);
      }
      // Keep no personal details at Stripe beyond the invoices themselves.
      const customer = team?.stripe_customer_id;
      if (customer) {
        try {
          await stripe.customers.update(customer, { name: "Deleted account", email: "", phone: "", description: "", address: "", shipping: "", metadata: "" });
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== "resource_missing") throw new Upstream(`stripe customer: ${(e as Error).message}`);
        }
      }
    }
    if (plan.deleteTeamId) await rest(`teams?id=eq.${encodeURIComponent(plan.deleteTeamId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

    // 5. The login. Their jobs, catalog, products, proposals and memberships go with it (on delete cascade).
    const del = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin, cache: "no-store" });
    if (!del.ok && del.status !== 404) throw new Upstream(`auth: ${del.status} ${await del.text().catch(() => "")}`);

    // 6. A member who left a subscribed team gives back their seat. The account is already gone, so a failure here is
    //    logged for the office to fix (Settings → Billing → seats) rather than reported as a failed deletion.
    let releasedSeat = false;
    if (releasesSeat && cfg.ok && me && sub) {
      try {
        const stripe = getStripe(cfg.config);
        const current = (await stripe.subscriptions.retrieve(sub)) as unknown as SubscriptionLike;
        const target = seatTarget("release", { members: Math.max(0, memberCount - 1), seatLimit: team?.seat_limit ?? null });
        const extra = extraSeats(target);
        const item = seatItem(current, cfg.config.priceSeat);
        let latest = current;
        if (item && (item.quantity ?? 0) !== extra) {
          latest = (await stripe.subscriptions.update(current.id, {
            items: [extra > 0 ? { id: item.id, quantity: extra } : { id: item.id, deleted: true }],
            proration_behavior: "create_prorations",
          })) as unknown as SubscriptionLike;
          releasedSeat = true;
        }
        await applySubscription(cfg.config, latest, me.team_id);
      } catch (e) {
        console.error("[account delete] releasing the seat failed", e);
      }
    }
    return json({
      ok: true,
      deletedTeam: !!plan.deleteTeamId,
      keptJobsWithTeam: !!plan.transferJobsTo,
      deletedJobs: plan.transferJobsTo ? 0 : projects.length,
      releasedSeat,
    });
  } catch (e) {
    console.error("[account delete]", e);
    await reportServerError(e, { where: "account delete", path: "/api/account", method: "DELETE", userId });
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
