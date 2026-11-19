// POST /api/email/welcome { company?, name? }: the getting-started email after a company signs up. Sends once per
// account: the address comes from the signed-in user's own account (never the request), and the account's
// app_metadata (which only the server can write) remembers that it went out.
import { welcomeEmail } from "@/lib/emailTemplates";
import { requireUser } from "@/lib/server/auth";
import { appOrigin, emailConfigured, emailUnavailable, rateLimiter, sendEmail, sendFailure, validEmail } from "@/lib/server/email";
import { getAuthUser, mergeAppMetadata, serviceConfigured, serviceFetch } from "@/lib/server/supabaseAdmin";

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status });
const SENT_KEY = "pinplan_welcome_sent_at";
const perUser = rateLimiter(60 * 60 * 1000, 5);

export async function POST(req: Request) {
  if (!emailConfigured()) return emailUnavailable();
  if (!serviceConfigured()) return json({ error: "Welcome emails need SUPABASE_SERVICE_ROLE_KEY on the server.", code: "unavailable" }, 501);
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  if (!auth.userId) return json({ error: "Sign in first.", code: "sign_in_required" }, 401);

  let body: { company?: unknown; name?: unknown } = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request.", code: "bad_request" }, 400);
  }
  if (perUser.limited(auth.userId)) return json({ error: "Too many tries. Wait a few minutes.", code: "rate_limited" }, 429);

  let user;
  try {
    user = await getAuthUser(auth.userId);
  } catch {
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }
  if (!user?.email || !validEmail(user.email)) return json({ error: "Your account has no email address.", code: "no_email" }, 400);
  if (user.app_metadata[SENT_KEY]) return json({ ok: true, already: true });

  let company = typeof body.company === "string" ? body.company.trim().slice(0, 120) : "";
  if (!company) {
    try {
      const r = await serviceFetch(`/rest/v1/teams?owner_id=eq.${encodeURIComponent(auth.userId)}&select=name`);
      if (r.ok) company = ((await r.json()) as { name?: string }[])[0]?.name ?? "";
    } catch {
      /* no team name: the email reads fine without it */
    }
  }
  const metaName = typeof user.user_metadata.name === "string" ? user.user_metadata.name : "";
  const name = (typeof body.name === "string" ? body.name.trim().slice(0, 80) : "") || metaName.trim();

  const content = welcomeEmail({ name, companyName: company, appUrl: appOrigin(req) });
  // The idempotency key covers two calls racing before the flag is saved (Resend remembers it for 24 hours).
  const sent = await sendEmail({ to: user.email, ...content, idempotencyKey: `welcome/${auth.userId}`, tags: { type: "welcome" } });
  // "Duplicate": this key already sent a welcome (e.g. with a different company name), so it went out.
  if (!sent.ok && sent.code !== "email_duplicate") return sendFailure(sent);
  try {
    await mergeAppMetadata(auth.userId, user.app_metadata, { [SENT_KEY]: new Date().toISOString() });
  } catch {
    /* sent anyway; the idempotency key stops a quick repeat */
  }
  return json({ ok: true });
}
