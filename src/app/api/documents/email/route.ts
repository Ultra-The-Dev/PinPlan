// POST /api/documents/email { documentId, token, to, kind: "document" | "reminder" | "receipt", message? }
// Emails a client their quote / invoice / credit note (a link to view it online, download the PDF, accept or pay), a
// payment reminder or a receipt. Office only. The document and its link are read with the caller's own token, so
// row-level security decides whether they may (technicians and other companies can't see them).
// Abuse limits (sendGuard.ts): the sender's email must be confirmed, the company's subscription active and under its
// daily cap; a free trial can't put links in the message, the title or the names, and gets no pay button. Replies go
// to the company's own business email, which is required: client mail never replies to Northpin.
// The company's name and email come from its settings (company_settings, read with the caller's token so RLS applies),
// never from the link's snapshot: the snapshot is whatever the app published. A pay button only for a known payment
// site (allowedPayUrl). When the company takes card payments online (docs/payments.md), invoices get a "Pay by card"
// button that opens the client link itself (our own address), where the client pays on Stripe's page.
import { documentUrl, payUrl, PAYMENT_METHODS, type DocSnapshot } from "@/lib/documents";
import { allowedPayUrl, documentEmail, stripLinks } from "@/lib/emailTemplates";
import { requireOffice } from "@/lib/server/auth";
import { appOrigin, appOriginMissing, emailConfigured, emailUnavailable, rateLimiter, sendEmail, sendFailure, validEmail } from "@/lib/server/email";
import { paymentsConfig } from "@/lib/server/onlinePayments";
import { finishSend, reserveSend } from "@/lib/server/sendGuard";
import { anonKey, bearer, supabaseUrl, userFetch } from "@/lib/server/supabaseAdmin";

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status });
const perUser = rateLimiter(60 * 60 * 1000, 60);
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

interface DocRow {
  id: string;
  kind: "quote" | "invoice" | "credit_note";
  number: string | null;
  status: string;
  total: number;
  amount_paid: number;
  balance_due: number;
  currency: string;
  due_date: string | null;
  valid_until: string | null;
  client: { name?: string; email?: string } | null;
  deleted: boolean;
}

export async function POST(req: Request) {
  if (!emailConfigured()) return emailUnavailable("Copy the client link and send it yourself instead.");
  const origin = appOrigin(req);
  if (!origin) return appOriginMissing();
  if (!supabaseUrl() || !anonKey()) return json({ error: "Client links need cloud sync, which isn't set up on this server.", code: "unavailable" }, 501);
  const auth = await requireOffice(req);
  if (!auth.ok) return auth.response;
  const token = bearer(req);
  if (!auth.userId || !token) return json({ error: "Sign in to email clients.", code: "sign_in_required" }, 401);

  let body: { documentId?: unknown; token?: unknown; to?: unknown; kind?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request.", code: "bad_request" }, 400);
  }
  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const link = typeof body.token === "string" ? body.token : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const kind = body.kind === "reminder" || body.kind === "receipt" ? body.kind : "document";
  const message = typeof body.message === "string" ? body.message.slice(0, 4000) : "";
  if (!documentId || documentId.length > 64 || !TOKEN_RE.test(link)) return json({ error: "Publish the client link first.", code: "bad_request" }, 400);
  if (!validEmail(to)) return json({ error: "Enter a valid email address.", code: "bad_request" }, 400);
  if (perUser.limited(`user:${auth.userId}`)) return json({ error: "That's a lot of emails for one hour. Try again later.", code: "rate_limited" }, 429);

  let snap: DocSnapshot;
  let doc: DocRow;
  let last: { amount: number; paid_on: string; method: string } | undefined;
  let business: { business_name?: string | null; email?: string | null } | undefined;
  let payOnline = false;
  try {
    const [l, d, c] = await Promise.all([
      userFetch(token, `/rest/v1/document_links?id=eq.${encodeURIComponent(link)}&select=id,document_id,status,snapshot`),
      userFetch(token, `/rest/v1/sales_documents?id=eq.${encodeURIComponent(documentId)}&select=id,kind,number,status,total,amount_paid,balance_due,currency,due_date,valid_until,client,deleted`),
      // The caller's own company (RLS: company_settings_read shows only that row).
      userFetch(token, `/rest/v1/company_settings?select=business_name,email&limit=1`),
    ]);
    if (l.status === 404 || d.status === 404 || c.status === 404) return json({ error: "Invoicing isn't set up on this server's database yet.", code: "unavailable" }, 501);
    if (!l.ok || !d.ok || !c.ok) return json({ error: "Couldn't load the document. Try again.", code: "upstream" }, 502);
    business = ((await c.json()) as { business_name?: string | null; email?: string | null }[])[0];
    const lr = ((await l.json()) as { document_id: string; status: string; snapshot: DocSnapshot }[])[0];
    const dr = ((await d.json()) as DocRow[])[0];
    if (!lr || !dr || dr.deleted || lr.document_id !== dr.id) return json({ error: "That document wasn't found on your team.", code: "not_found" }, 404);
    if (lr.status !== "active") return json({ error: "That link was withdrawn. Publish a new one.", code: "link_revoked" }, 409);
    if (dr.status === "void") return json({ error: "That document is void.", code: "void" }, 409);
    snap = lr.snapshot;
    doc = dr;
    if (doc.kind === "invoice" && kind !== "receipt" && paymentsConfig().ok) {
      // The company's connected Stripe account (RLS: the office sees its own row). No table yet: no button.
      const a = await userFetch(token, `/rest/v1/payment_accounts?select=stripe_account_id,charges_enabled,enabled&limit=1`).catch(() => null);
      const row = a?.ok ? ((await a.json()) as { stripe_account_id: string | null; charges_enabled: boolean; enabled: boolean }[])[0] : undefined;
      payOnline = !!row?.stripe_account_id && row.charges_enabled && row.enabled && doc.balance_due > 0 && doc.status !== "draft";
    }
    if (kind === "receipt") {
      const p = await userFetch(token, `/rest/v1/sales_document_payments?document_id=eq.${encodeURIComponent(documentId)}&voided=eq.false&deleted=eq.false&amount=gt.0&order=paid_on.desc,created_at.desc&limit=1&select=amount,paid_on,method`);
      if (p.ok) last = ((await p.json()) as { amount: number; paid_on: string; method: string }[])[0];
    }
  } catch {
    console.warn("[documents/email] database unreachable");
    return json({ error: "Couldn't reach the cloud database.", code: "upstream" }, 502);
  }
  if (kind !== "document" && doc.kind !== "invoice") return json({ error: "Reminders and receipts are for invoices.", code: "bad_request" }, 400);
  // Replies go to the company (its settings, not the snapshot). Without its own email the client would reply to
  // nobody (or to Northpin): refuse.
  const replyTo = business?.email?.trim() ?? "";
  if (!validEmail(replyTo))
    return json({ error: "Add your business email in Settings → Company → Your business, then send it again.", code: "business_email_required" }, 400);
  const companyName = business?.business_name?.trim() || undefined;

  const guard = await reserveSend(auth.userId, kind, to);
  if (!guard.ok) return guard.response;

  const today = new Date().toISOString().slice(0, 10);
  // A free trial can't send links in its own words: not in the message, the title, the number or the names (the client link is
  // ours and checked), and no pay button at all.
  const clean = (s: string | null | undefined) => (s && guard.trial ? stripLinks(s) : (s ?? undefined));
  const content = documentEmail({
    kind,
    docKind: doc.kind,
    title: clean(snap.title) ?? "",
    // The number is built from the company's own numbering format (Settings › Documents), so it is their text too.
    number: clean(doc.number ?? snap.number) ?? null,
    companyName: clean(companyName),
    clientName: clean(doc.client?.name ?? snap.client?.name),
    total: doc.total,
    balanceDue: doc.balance_due,
    amountPaid: doc.amount_paid,
    currency: doc.currency,
    dueDate: doc.due_date,
    validUntil: doc.valid_until,
    overdue: doc.kind === "invoice" && !!doc.due_date && doc.due_date < today && doc.balance_due > 0,
    url: documentUrl(origin, link),
    // Only an https link on a known payment site, and the email names its site. None on a trial.
    payUrl:
      doc.kind === "invoice" && !guard.trial
        ? allowedPayUrl(payUrl(snap.payment?.payUrl ?? "", { number: doc.number, balanceDue: doc.balance_due, currency: doc.currency }))
        : null,
    // Our own client link, so a trial may have it too.
    payOnline,
    message: guard.trial ? stripLinks(message) : message,
    lastPayment: last ? { amount: last.amount, date: last.paid_on, method: PAYMENT_METHODS.find((m) => m.id === last.method)?.label ?? last.method } : null,
  });
  const sent = await sendEmail({ to, ...content, replyTo, platformReplyTo: false, tags: { type: `document_${kind}` } });
  await finishSend(guard, sent);
  if (!sent.ok) return sendFailure(sent);
  return json({ ok: true });
}
