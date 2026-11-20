// POST /api/notify/document-response { token }: the client page calls this right after a client accepts or declines a
// quote from its link. The server emails whoever published the link, once. Anyone holding the link can call it, so it
// says nothing: 200 when an email went out, 204 when there was nothing to send, never any details.
import { createHash } from "node:crypto";
import type { DocSnapshot } from "@/lib/documents";
import { documentResponseEmail } from "@/lib/emailTemplates";
import { logNotification } from "@/lib/server/sendGuard";
import { appOrigin, clientIpKey, emailConfigured, rateLimiter, sendEmail, validEmail } from "@/lib/server/email";
import { readJsonLimited } from "@/lib/server/readBody";
import { getAuthUser, serviceConfigured, serviceFetch } from "@/lib/server/supabaseAdmin";
import { jobHref } from "@/lib/tabRoutes";

const nothing = () => new Response(null, { status: 204 });
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const HOUR = 60 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const perIp = rateLimiter(HOUR, 60);
const perToken = rateLimiter(HOUR, 6);

interface LinkRow {
  id: string;
  owner_id: string;
  project_id: string;
  document_id: string;
  snapshot: DocSnapshot;
}
interface DocRow {
  status: string;
  number: string | null;
  total: number;
  currency: string;
  signer_name: string | null;
  client_note: string | null;
  responded_at: string | null;
}

export async function POST(req: Request) {
  // Only a token is expected: anything bigger is refused before it is read.
  const read = await readJsonLimited<{ token?: unknown } | null>(req, MAX_BODY_BYTES);
  if (!read.ok) return Response.json({ ok: false }, { status: read.status });
  const body = read.value && typeof read.value === "object" ? read.value : {};
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN_RE.test(token)) return Response.json({ ok: false }, { status: 400 });
  if (!emailConfigured() || !serviceConfigured()) return nothing();
  if (perIp.limited(clientIpKey(req)) || perToken.limited(token)) return Response.json({ ok: false }, { status: 429 });
  // Links in the email need the site address (PINPLAN_APP_URL in production): without it, don't claim or send.
  const origin = appOrigin(req);
  if (!origin) {
    console.warn("[notify] PINPLAN_APP_URL is not set: answer email skipped");
    return nothing();
  }

  // Claim the notification atomically (only an answered link not yet notified), so repeats can't send twice.
  const stamp = new Date().toISOString();
  let link: LinkRow | undefined;
  try {
    const r = await serviceFetch(`/rest/v1/document_links?id=eq.${encodeURIComponent(token)}&responded_at=not.is.null&response_notified_at=is.null&select=id,owner_id,project_id,document_id,snapshot`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ response_notified_at: stamp }),
    });
    if (!r.ok) {
      console.warn(`[notify] document claim failed: ${r.status}`);
      return nothing();
    }
    link = ((await r.json()) as LinkRow[])[0];
  } catch {
    console.warn("[notify] document claim failed: network");
    return nothing();
  }
  if (!link) return nothing();
  const release = () =>
    serviceFetch(`/rest/v1/document_links?id=eq.${encodeURIComponent(token)}&response_notified_at=eq.${encodeURIComponent(stamp)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ response_notified_at: null }),
    }).catch(() => undefined);

  let doc: DocRow | undefined;
  let to: string | null = null;
  try {
    const d = await serviceFetch(`/rest/v1/sales_documents?id=eq.${encodeURIComponent(link.document_id)}&select=status,number,total,currency,signer_name,client_note,responded_at`);
    doc = d.ok ? ((await d.json()) as DocRow[])[0] : undefined;
    to = (await getAuthUser(link.owner_id))?.email ?? null;
  } catch {
    await release();
    return Response.json({ ok: false }, { status: 502 });
  }
  if (!doc || (doc.status !== "accepted" && doc.status !== "declined") || !to || !validEmail(to)) return nothing();

  const s = link.snapshot;
  const content = documentResponseEmail({
    outcome: doc.status,
    title: s.title,
    number: doc.number ?? s.number,
    signerName: doc.signer_name,
    clientName: s.client?.name,
    jobName: s.client?.siteAddress || s.client?.name || "Your job",
    total: doc.total,
    currency: doc.currency,
    note: doc.client_note,
    respondedAt: doc.responded_at,
    // Client links are quotes: open it on the Money tab's Quote step.
    url: `${origin}${jobHref(link.project_id, "money", { step: "quote", doc: link.document_id })}`,
    companyName: s.business?.name,
  });
  const clientEmail = s.client?.email?.trim() ?? "";
  const sent = await sendEmail({
    to,
    ...content,
    replyTo: validEmail(clientEmail) ? clientEmail : undefined,
    idempotencyKey: `document-response/${createHash("sha256").update(token).digest("hex").slice(0, 40)}`,
    tags: { type: "document_response" },
  });
  if (!sent.ok) {
    await release();
    return Response.json({ ok: false }, { status: 502 });
  }
  await logNotification(link.owner_id, to, sent.id);
  return Response.json({ ok: true });
}
