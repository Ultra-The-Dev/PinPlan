// Emails the office when a client answers a change order or an RFI from its link (called by the public answer routes
// right after the answer is saved). Each answer is announced once: the row's response_notified_at is claimed
// atomically first and released again if the email couldn't go out. Never throws and never changes the client's
// response: a missing setting or a failed email is logged on the server and that's all.
import { createHash } from "node:crypto";
import type { ChangeOrderPublicView } from "@/lib/types";
import { changeOrderResponseEmail, rfiAnsweredEmail } from "@/lib/emailTemplates";
import { rfiCode } from "@/lib/rfis";
import { appOrigin, emailConfigured, sendEmail } from "@/lib/server/email";
import { answerRecipient, logNotification } from "@/lib/server/sendGuard";
import { serviceConfigured, serviceFetch } from "@/lib/server/supabaseAdmin";

const EMAIL_TIMEOUT_MS = 6000;
const short = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);

/** Stamp `table` row `id` as notified when `filter` still matches; returns the claimed row (or null). */
async function claim<T>(table: "change_orders" | "rfis", id: string, filter: string, select: string, stamp: string): Promise<T | null> {
  const r = await serviceFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&${filter}&select=${select}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ response_notified_at: stamp }),
  });
  if (!r.ok) {
    // 400 here usually means supabase/migrations/20261124100500_email_guard.sql hasn't been run.
    console.warn(`[notify] ${table} claim failed: ${r.status}`);
    return null;
  }
  return ((await r.json()) as T[])[0] ?? null;
}

function release(table: "change_orders" | "rfis", id: string, stamp: string) {
  return serviceFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&response_notified_at=eq.${encodeURIComponent(stamp)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ response_notified_at: null }),
  }).catch(() => undefined);
}

function ready(req: Request): string | null {
  if (!emailConfigured() || !serviceConfigured()) return null;
  const origin = appOrigin(req);
  if (!origin) console.warn("[notify] PINPLAN_APP_URL is not set: answer email skipped");
  return origin;
}

interface CoClaimed {
  id: string;
  project_id: string;
  status: string;
  public_view: ChangeOrderPublicView | null;
  approved_name: string | null;
  client_comment: string | null;
  responded_at: string | null;
  created_by: string | null;
}

/** A client approved or rejected change order `id`: email whoever made it (or the job's owner). */
export async function notifyChangeOrderAnswer(req: Request, id: string): Promise<void> {
  const origin = ready(req);
  if (!origin) return;
  const stamp = new Date().toISOString();
  let row: CoClaimed | null = null;
  try {
    row = await claim<CoClaimed>(
      "change_orders",
      id,
      "status=in.(approved,rejected)&response_notified_at=is.null&deleted=is.false",
      "id,project_id,status,public_view,approved_name,client_comment,responded_at,created_by",
      stamp,
    );
    if (!row) return;
    const who = await answerRecipient(row.project_id, row.created_by, true);
    if (!who) return;
    const v = row.public_view;
    const content = changeOrderResponseEmail({
      outcome: row.status === "approved" ? "approved" : "rejected",
      code: v?.code ?? "Change order",
      title: v?.title,
      signerName: row.approved_name,
      clientName: v?.project?.clientName,
      jobName: v?.project?.address || who.jobName,
      total: v?.total,
      currency: v?.currency,
      comment: row.client_comment,
      respondedAt: row.responded_at,
      url: `${origin}/project?id=${encodeURIComponent(row.project_id)}&tab=changes`,
      companyName: v?.business?.name,
    });
    const sent = await sendEmail(
      { to: who.to, ...content, idempotencyKey: `co-response/${short(`${row.id}/${row.responded_at ?? ""}`)}`, tags: { type: "change_order_response" } },
      { timeoutMs: EMAIL_TIMEOUT_MS },
    );
    if (!sent.ok) {
      await release("change_orders", id, stamp);
      return;
    }
    await logNotification(who.ownerId, who.to, sent.id);
  } catch {
    console.warn("[notify] change order answer email failed");
    if (row) await release("change_orders", id, stamp);
  }
}

interface RfiClaimed {
  id: string;
  project_id: string;
  number: number | null;
  subject: string | null;
  question: string | null;
  answer: string | null;
  answered_by: string | null;
  answered_at: string | null;
  to_company: string | null;
  created_by: string | null;
  sender: { company?: string | null } | null;
}

/**
 * Someone answered RFI `id` from its link at `answeredAt`: email whoever raised it (or the job's owner). Keyed on the
 * answer time, so an RFI that was reopened and answered again is announced again.
 */
export async function notifyRfiAnswer(req: Request, id: string, answeredAt: string): Promise<void> {
  const origin = ready(req);
  if (!origin) return;
  const stamp = new Date().toISOString();
  let row: RfiClaimed | null = null;
  try {
    row = await claim<RfiClaimed>(
      "rfis",
      id,
      `status=eq.answered&deleted=is.false&answered_at=eq.${encodeURIComponent(answeredAt)}&or=${encodeURIComponent(`(response_notified_at.is.null,response_notified_at.lt."${answeredAt}")`)}`,
      "id,project_id,number,subject,question,answer,answered_by,answered_at,to_company,created_by,sender",
      stamp,
    );
    if (!row) return;
    const who = await answerRecipient(row.project_id, row.created_by, false);
    if (!who) return;
    const content = rfiAnsweredEmail({
      code: rfiCode(row.number ?? 0),
      subject: row.subject,
      question: row.question,
      answer: row.answer ?? "",
      answeredBy: row.answered_by,
      toCompany: row.to_company,
      jobName: who.jobName,
      answeredAt: row.answered_at,
      url: `${origin}/project?id=${encodeURIComponent(row.project_id)}&tab=field&section=rfis`,
      companyName: row.sender?.company,
    });
    const sent = await sendEmail(
      { to: who.to, ...content, idempotencyKey: `rfi-answer/${short(`${row.id}/${row.answered_at ?? ""}`)}`, tags: { type: "rfi_answered" } },
      { timeoutMs: EMAIL_TIMEOUT_MS },
    );
    if (!sent.ok) {
      await release("rfis", id, stamp);
      return;
    }
    await logNotification(who.ownerId, who.to, sent.id);
  } catch {
    console.warn("[notify] RFI answer email failed");
    if (row) await release("rfis", id, stamp);
  }
}
