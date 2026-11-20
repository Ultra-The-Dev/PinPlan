// POST /api/notify/proposal-response { token }: the client page calls this right after a client accepts or declines a
// proposal (or approves / asks for changes to a plan review). The server emails the installer who sent it, once.
// Anyone holding the link can call it, so it says nothing about the proposal: 200 when an email went out, 204 when there
// was nothing to send (unknown link, not answered yet, already sent, or email not set up), and never any details.
import { createHash } from "node:crypto";
import { proposalResponseEmail } from "@/lib/emailTemplates";
import type { ProposalSnapshot } from "@/lib/proposal";
import { logNotification } from "@/lib/server/sendGuard";
import { appOrigin, clientIp, emailConfigured, rateLimiter, sendEmail, validEmail } from "@/lib/server/email";
import { getAuthUser, serviceConfigured, serviceFetch } from "@/lib/server/supabaseAdmin";

const nothing = () => new Response(null, { status: 204 });
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

const HOUR = 60 * 60 * 1000;
const perIp = rateLimiter(HOUR, 60);
const perToken = rateLimiter(HOUR, 6);

interface Row {
  id: string;
  owner_id: string;
  project_id: string;
  snapshot: ProposalSnapshot;
  status: string;
  client_name: string | null;
  chosen_options: string[] | null;
  accepted_total: number | null;
  client_note: string | null;
  responded_at: string | null;
  response_notified_at: string | null;
}

export async function POST(req: Request) {
  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN_RE.test(token)) return Response.json({ ok: false }, { status: 400 });
  // Quietly do nothing until email and the service key are both set up.
  if (!emailConfigured() || !serviceConfigured()) return nothing();
  if (perIp.limited(clientIp(req)) || perToken.limited(token)) return Response.json({ ok: false }, { status: 429 });
  // Links in the email need the site address (PINPLAN_APP_URL in production): without it, don't claim or send.
  const origin = appOrigin(req);
  if (!origin) {
    console.warn("[notify] PINPLAN_APP_URL is not set: answer email skipped");
    return nothing();
  }

  // Claim the notification atomically: only an answered proposal that hasn't been notified yet is stamped, so two calls
  // at once (or a reload) can't both send.
  const stamp = new Date().toISOString();
  const filter = `id=eq.${encodeURIComponent(token)}&status=in.(accepted,declined)&response_notified_at=is.null`;
  let row: Row | undefined;
  try {
    const r = await serviceFetch(`/rest/v1/proposals?${filter}&select=id,owner_id,project_id,snapshot,status,client_name,chosen_options,accepted_total,client_note,responded_at,response_notified_at`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ response_notified_at: stamp }),
    });
    if (!r.ok) {
      // 400/404 here usually means supabase/migrations/20261121010000_email.sql hasn't been run.
      console.warn(`[notify] proposal claim failed: ${r.status}`);
      return nothing();
    }
    row = ((await r.json()) as Row[])[0];
  } catch {
    console.warn("[notify] proposal claim failed: network");
    return nothing();
  }
  if (!row) return nothing();

  const release = () =>
    serviceFetch(`/rest/v1/proposals?id=eq.${encodeURIComponent(token)}&response_notified_at=eq.${encodeURIComponent(stamp)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ response_notified_at: null }),
    }).catch(() => undefined);

  let to: string | null = null;
  try {
    to = (await getAuthUser(row.owner_id))?.email ?? null;
  } catch {
    await release();
    return Response.json({ ok: false }, { status: 502 });
  }
  // The installer's account has no email (or is gone): nothing to do, and nothing to retry.
  if (!to || !validEmail(to)) return nothing();

  const s = row.snapshot ?? ({} as ProposalSnapshot);
  const review = s.kind === "review";
  const chosen = new Set(row.chosen_options ?? []);
  const content = proposalResponseEmail({
    kind: review ? "review" : "proposal",
    outcome: row.status === "accepted" ? "accepted" : "declined",
    companyName: s.business?.name,
    clientName: s.client?.name,
    signerName: row.client_name,
    jobName: s.client?.address || s.client?.name || s.title || "Your job",
    title: s.title,
    acceptedOptions: (s.lines ?? []).filter((l) => l.optional && chosen.has(l.key)).map((l) => l.description),
    total: row.accepted_total,
    currency: s.currency,
    note: row.client_note,
    respondedAt: row.responded_at,
    jobUrl: `${origin}/project?id=${encodeURIComponent(row.project_id)}&tab=${review ? "takeoff" : "estimate"}`,
  });
  // Replying goes straight to the client, when the proposal has their email.
  const clientEmail = s.client?.email?.trim() ?? "";
  const sent = await sendEmail({
    to,
    ...content,
    replyTo: validEmail(clientEmail) ? clientEmail : undefined,
    idempotencyKey: `proposal-response/${createHash("sha256").update(token).digest("hex").slice(0, 40)}`,
    tags: { type: review ? "plan_review_response" : "proposal_response" },
  });
  if (!sent.ok) {
    // Let a later call try again.
    await release();
    return Response.json({ ok: false }, { status: 502 });
  }
  await logNotification(row.owner_id, to, sent.id);
  return Response.json({ ok: true });
}
