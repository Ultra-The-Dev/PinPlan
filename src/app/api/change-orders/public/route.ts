// The client side of a change order link (/co?t=…). Clients have no account, so this route reads and answers the
// change order with the service role, looked up by its share token, and returns only the frozen client view
// (publicCoView: no costs, markup, internal ids or notes). Technicians and the public never read the table itself.
//
//   GET  ?t=<token>                                   → the client view, with short-lived links to its photos
//   POST {t, decision, name, signature, comment}      → approve (typed name + drawn signature) or reject, once
//
// Same pattern as the proposal / quote answer: one answer per link, only while it is waiting on the client. The
// signature PNG is stored like every job file (plans bucket, <project>/<image id>), so the office devices pull it.
// After an answer the office is emailed once (src/app/api/notify/answers.ts); a failed email never fails the answer.
// Answers are limited per IP and per link in memory and, when the database has answer_rate_hit, across every server.
import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { clientIp, rateLimiter } from "@/lib/server/email";
import { durableLimited, keyHash } from "@/lib/server/sendGuard";
import { notifyChangeOrderAnswer } from "@/app/api/notify/answers";
import { serviceConfigured, serviceFetch, supabaseUrl } from "@/lib/server/supabaseAdmin";
import type { PublicCoResponse } from "@/lib/changeOrders";
import type { ChangeOrderPublicView, ChangeOrderStatus } from "@/lib/types";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const PNG_RE = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
/** Largest signature image accepted (decoded bytes). */
const MAX_SIGNATURE_BYTES = 200 * 1024;
const BUCKET = "plans";
const HOUR = 60 * 60 * 1000;
const perIpRead = rateLimiter(HOUR, 300);
const perIp = rateLimiter(HOUR, 30);
const perToken = rateLimiter(HOUR, 10);

/** The shared (database) limit: per IP and per link. When it can't answer, the in-memory limits above still apply. */
async function overDurableLimit(req: Request, token: string): Promise<boolean> {
  const [ip, link] = await Promise.all([durableLimited(keyHash("co-ip", clientIp(req)), HOUR, 30), durableLimited(keyHash("co-link", token), HOUR, 10)]);
  return ip === true || link === true;
}

interface CoRow {
  id: string;
  project_id: string;
  status: ChangeOrderStatus;
  deleted: boolean;
  public_view: ChangeOrderPublicView | null;
  responded_at: string | null;
  approved_name: string | null;
  client_comment: string | null;
  updated_at?: string | null;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
const fail = (error: string, status: number) => json({ error }, status);

async function findByToken(token: string): Promise<CoRow | null> {
  const r = await serviceFetch(
    `/rest/v1/change_orders?share_token=eq.${encodeURIComponent(token)}&select=id,project_id,status,deleted,public_view,responded_at,approved_name,client_comment,updated_at&limit=1`,
  );
  if (!r.ok) throw new Error(`lookup failed (${r.status})`);
  return ((await r.json()) as CoRow[])[0] ?? null;
}

/** Short-lived links to the photos the office attached (they live in the private plans bucket). */
async function signPhotos(projectId: string, photos: ChangeOrderPublicView["photos"]): Promise<{ url: string; caption: string }[]> {
  if (!photos?.length) return [];
  try {
    const paths = photos.map((p) => `${projectId}/${p.imageId}`);
    const r = await serviceFetch(`/storage/v1/object/sign/${BUCKET}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 6 * 60 * 60, paths }),
    });
    if (!r.ok) return [];
    const signed = (await r.json()) as { path?: string; signedURL?: string | null; error?: string | null }[];
    const base = `${supabaseUrl()}/storage/v1`;
    const out: { url: string; caption: string }[] = [];
    photos.forEach((p, i) => {
      const s = signed.find((x) => x.path === paths[i]) ?? signed[i];
      if (s?.signedURL && !s.error) out.push({ url: base + s.signedURL, caption: p.caption ?? "" });
    });
    return out;
  } catch {
    return [];
  }
}

/** Not shown: drafts (not sent yet), deleted rows, and rows without a frozen view. Withdrawn (void) links say so. */
async function present(row: CoRow): Promise<Response> {
  if (row.deleted || row.status === "draft" || !row.public_view) return fail("This change order isn't available.", 404);
  if (row.status === "void") return fail("This change order was withdrawn. Please ask for the updated one.", 410);
  const { photos, ...view } = row.public_view;
  const body: PublicCoResponse = {
    view: { ...view, photos: await signPhotos(row.project_id, photos) },
    status: row.status,
    respondedAt: row.responded_at,
    approvedName: row.approved_name,
    clientComment: row.client_comment,
  };
  return json(body);
}

export async function GET(req: Request) {
  await connection();
  const token = new URL(req.url).searchParams.get("t")?.trim() ?? "";
  if (!TOKEN_RE.test(token)) return fail("This link isn't valid.", 400);
  if (!serviceConfigured()) return fail("Change order links aren't set up on this server.", 501);
  if (perIpRead.limited(clientIp(req))) return fail("Too many requests. Please wait a few minutes and try again.", 429);
  try {
    const row = await findByToken(token);
    if (!row) return fail("This change order isn't available.", 404);
    return await present(row);
  } catch {
    return fail("Couldn't load the change order. Please try again.", 502);
  }
}

/** Decoded size of a PNG data URL, or null when it isn't one. */
function signatureBytes(dataUrl: string): Buffer | null {
  const m = PNG_RE.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  // The PNG signature: 89 50 4E 47.
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 ? buf : null;
}

export async function POST(req: Request) {
  let body: { t?: unknown; decision?: unknown; name?: unknown; signature?: unknown; comment?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Bad request.", 400);
  }
  const token = typeof body.t === "string" ? body.t.trim() : "";
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 4000) : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  if (!TOKEN_RE.test(token) || !decision) return fail("Bad request.", 400);
  if (!serviceConfigured()) return fail("Change order links aren't set up on this server.", 501);
  if (perIp.limited(clientIp(req)) || perToken.limited(token)) return fail("Too many requests. Please wait a few minutes and try again.", 429);

  let png: Buffer | null = null;
  if (decision === "approve") {
    if (!name || !signature) return fail("Please type your name and sign to approve.", 400);
    // Rough check before decoding (base64 is 4/3 the size).
    if (signature.length > Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 64) return fail("The signature image is too large.", 413);
    png = signatureBytes(signature);
    if (!png) return fail("The signature isn't a valid image.", 400);
    if (png.length > MAX_SIGNATURE_BYTES) return fail("The signature image is too large.", 413);
  }
  if (await overDurableLimit(req, token)) return fail("Too many requests. Please wait a few minutes and try again.", 429);

  let row: CoRow | null;
  try {
    row = await findByToken(token);
  } catch {
    return fail("Couldn't load the change order. Please try again.", 502);
  }
  if (!row || row.deleted || row.status === "draft" || !row.public_view) return fail("This change order isn't available.", 404);
  if (row.status === "void") return fail("This change order was withdrawn. Please ask for the updated one.", 410);
  if (row.status !== "sent") return fail("This change order has already been answered.", 409);

  let signatureImageId: string | null = null;
  if (png) {
    signatureImageId = `sig${randomBytes(9).toString("base64url")}`;
    try {
      const up = await serviceFetch(`/storage/v1/object/${BUCKET}/${encodeURIComponent(row.project_id)}/${signatureImageId}`, {
        method: "POST",
        headers: { "Content-Type": "image/png", "x-upsert": "true" },
        body: new Uint8Array(png),
      });
      if (!up.ok) return fail("Couldn't save the signature. Please try again.", 502);
    } catch {
      return fail("Couldn't save the signature. Please try again.", 502);
    }
  }

  const now = new Date().toISOString();
  // Devices keep the newer copy (last write wins on updated_at). An office device whose clock runs ahead stamped the
  // sent row later than "now" here, so stamp the answer past the stored time or that device would never see it.
  const prev = Date.parse(row.updated_at ?? "");
  const stamp = Number.isFinite(prev) && prev >= Date.parse(now) ? new Date(prev + 1).toISOString() : now;
  try {
    // Only while it is still waiting on the client, so two answers can't both land.
    const r = await serviceFetch(`/rest/v1/change_orders?id=eq.${encodeURIComponent(row.id)}&status=eq.sent&deleted=is.false`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: decision === "approve" ? "approved" : "rejected",
        approved_name: name || null,
        responded_at: now,
        signature_image_id: signatureImageId,
        client_comment: comment || null,
        updated_at: stamp,
      }),
    });
    if (!r.ok) return fail("Couldn't save your answer. Please try again.", 502);
    const updated = ((await r.json()) as (CoRow & { project_id: string })[])[0];
    if (!updated) return fail("This change order has already been answered.", 409);
    // Tell the office (never fails the client's answer).
    await notifyChangeOrderAnswer(req, row.id);
    return await present({ ...row, ...updated, public_view: updated.public_view ?? row.public_view });
  } catch {
    return fail("Couldn't save your answer. Please try again.", 502);
  }
}
