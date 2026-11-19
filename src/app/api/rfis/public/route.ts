// The no-login RFI answer page (/q?t=…) talks to this route. The token is the only key: the database stays closed to
// anon (row-level security), and the server reads and writes with the service role, showing only publicRfiView().
//   GET  ?t=<token>                → the public view, or 404 (unknown, draft, void or deleted all look the same)
//   POST { t, answer, name }       → records the answer (status answered, ball with us) and bumps updated_at so the
//                                    office's next sync pulls it; 409 when the RFI isn't waiting for an answer.
// 501 when the server has no service key (sharing needs cloud sync; the app falls back to email).
// After an answer whoever raised it is emailed once (src/app/api/notify/answers.ts); a failed email never fails the
// answer. Answers are limited per IP and per link in memory and, when the database has answer_rate_hit, across every
// server instance.
import { clientIp, rateLimiter } from "@/lib/server/email";
import { durableLimited, keyHash } from "@/lib/server/sendGuard";
import { notifyRfiAnswer } from "@/app/api/notify/answers";
import { serviceConfigured, serviceFetch, supabaseUrl } from "@/lib/server/supabaseAdmin";
import { publicRfiView, SHARE_TOKEN_RE, transition, type PublicRfiPhoto, type PublicRfiPlan } from "@/lib/rfis";
import { toLocal, toRemote } from "@/lib/syncMap";
import type { Rfi } from "@/lib/types";

const HOUR = 60 * 60 * 1000;
const readsPerIp = rateLimiter(HOUR, 300);
const answersPerIp = rateLimiter(HOUR, 30);
const answersPerToken = rateLimiter(HOUR, 10);
const SIGN_SECONDS = 60 * 60 * 24;
const BUCKET = "plans";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
const notFound = () => json({ error: "This link isn't available.", code: "not_found" }, 404);

async function rows<T>(path: string): Promise<T[]> {
  const r = await serviceFetch(path);
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return (await r.json()) as T[];
}

/** The live RFI behind a token (raw database row), or null. */
async function findByToken(token: string): Promise<Record<string, unknown> | null> {
  const list = await rows<Record<string, unknown>>(`/rest/v1/rfis?share_token=eq.${encodeURIComponent(token)}&deleted=is.false&select=*&limit=1`);
  return list[0] ?? null;
}

/** Signed download URLs for storage paths in the plans bucket (same order; null where signing failed). */
async function signPaths(paths: string[]): Promise<(string | null)[]> {
  if (!paths.length) return [];
  try {
    const r = await serviceFetch(`/storage/v1/object/sign/${BUCKET}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: SIGN_SECONDS, paths }),
    });
    if (!r.ok) return paths.map(() => null);
    const out = (await r.json()) as { path?: string; signedURL?: string | null; error?: string | null }[];
    const base = `${supabaseUrl()}/storage/v1`;
    return paths.map((p) => {
      const hit = out.find((o) => o.path === p);
      return hit?.signedURL ? (hit.signedURL.startsWith("http") ? hit.signedURL : base + hit.signedURL) : null;
    });
  } catch {
    return paths.map(() => null);
  }
}

async function buildView(raw: Record<string, unknown>) {
  const rfi = toLocal("rfis", raw) as unknown as Rfi;
  const pid = encodeURIComponent(rfi.projectId);
  const photoIds = (rfi.photoIds ?? []).filter((x) => typeof x === "string" && /^[\w-]{1,64}$/.test(x)).slice(0, 24);
  const [projects, photoRows, sheetRows] = await Promise.all([
    rows<{ address: string | null }>(`/rest/v1/projects?id=eq.${pid}&select=address&limit=1`),
    photoIds.length
      ? rows<{ id: string; image_id: string; width: number; height: number; caption: string | null; annotations: PublicRfiPhoto["annotations"] }>(
          `/rest/v1/photos?project_id=eq.${pid}&deleted=is.false&id=in.(${photoIds.map(encodeURIComponent).join(",")})&select=id,image_id,width,height,caption,annotations`,
        )
      : Promise.resolve([]),
    rfi.sheetId && rfi.x != null && rfi.y != null
      ? rows<{ image_id: string; image_path: string | null; width: number; height: number; name: string | null }>(
          `/rest/v1/sheets?id=eq.${encodeURIComponent(rfi.sheetId)}&project_id=eq.${pid}&deleted=is.false&select=image_id,image_path,width,height,name&limit=1`,
        )
      : Promise.resolve([]),
  ]);
  const ordered = photoIds.map((id) => photoRows.find((p) => p.id === id)).filter((p): p is (typeof photoRows)[number] => !!p);
  const sheet = sheetRows[0];
  const paths = [...ordered.map((p) => `${rfi.projectId}/${p.image_id}`), ...(sheet ? [sheet.image_path || `${rfi.projectId}/${sheet.image_id}`] : [])];
  const urls = await signPaths(paths);
  const photos: PublicRfiPhoto[] = [];
  ordered.forEach((p, i) => {
    const url = urls[i];
    if (url) photos.push({ url, width: Number(p.width) || 0, height: Number(p.height) || 0, caption: p.caption, annotations: p.annotations });
  });
  const planUrl = sheet ? urls[urls.length - 1] : null;
  const plan: PublicRfiPlan | null = sheet && planUrl ? { url: planUrl, width: Number(sheet.width) || 0, height: Number(sheet.height) || 0, x: Number(rfi.x), y: Number(rfi.y), sheetName: sheet.name } : null;
  return publicRfiView(rfi, projects[0] ?? null, photos, plan);
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t")?.trim() ?? "";
  if (!SHARE_TOKEN_RE.test(token)) return notFound();
  if (!serviceConfigured()) return json({ error: "Answer links need cloud sync on this server.", code: "not_configured" }, 501);
  if (readsPerIp.limited(clientIp(req))) return json({ error: "Too many requests. Wait a few minutes and try again.", code: "rate_limited" }, 429);
  try {
    const raw = await findByToken(token);
    if (!raw) return notFound();
    const view = await buildView(raw);
    return view ? json(view) : notFound();
  } catch {
    return json({ error: "Couldn't load this RFI right now. Try again in a minute.", code: "unavailable" }, 502);
  }
}

export async function POST(req: Request) {
  let body: { t?: unknown; answer?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request.", code: "bad_request" }, 400);
  }
  const token = typeof body.t === "string" ? body.t.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!SHARE_TOKEN_RE.test(token)) return notFound();
  if (!answer || answer.length > 5000) return json({ error: "Write an answer (up to 5,000 characters).", code: "bad_request" }, 400);
  if (!name || name.length > 80) return json({ error: "Add your name so they know who answered.", code: "bad_request" }, 400);
  if (!serviceConfigured()) return json({ error: "Answer links need cloud sync on this server.", code: "not_configured" }, 501);
  if (answersPerIp.limited(clientIp(req)) || answersPerToken.limited(token))
    return json({ error: "Too many tries. Wait a few minutes and try again.", code: "rate_limited" }, 429);
  const [ipOver, linkOver] = await Promise.all([durableLimited(keyHash("rfi-ip", clientIp(req)), HOUR, 30), durableLimited(keyHash("rfi-link", token), HOUR, 10)]);
  if (ipOver === true || linkOver === true) return json({ error: "Too many tries. Wait a few minutes and try again.", code: "rate_limited" }, 429);

  try {
    const raw = await findByToken(token);
    if (!raw) return notFound();
    const rfi = toLocal("rfis", raw) as unknown as Rfi;
    if (rfi.status === "void" || rfi.status === "draft") return notFound();
    if (rfi.status !== "open") return json({ error: "This RFI has already been answered.", code: "not_open", status: rfi.status }, 409);
    const now = new Date().toISOString();
    const next = transition(rfi, "answer", name, now, { answer });
    const remote = toRemote("rfis", next as unknown as Record<string, unknown>);
    // updated_at must beat the row's current stamp even when the device that last saved it has a clock running ahead
    // of this server: otherwise that device keeps its own (older) copy and never shows the answer.
    const prev = Date.parse(String(raw.updated_at ?? ""));
    const stamp = Number.isFinite(prev) && prev >= Date.parse(now) ? new Date(prev + 1).toISOString() : now;
    const patch = { answer: remote.answer, answered_by: remote.answered_by, answered_at: now, status: remote.status, ball_in_court: remote.ball_in_court, updated_at: stamp };
    // Only while it is still open, so two answers at once can't both land.
    const r = await serviceFetch(`/rest/v1/rfis?id=eq.${encodeURIComponent(rfi.id)}&status=eq.open&deleted=is.false`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return json({ error: "Couldn't save your answer. Try again in a minute.", code: "unavailable" }, 502);
    const saved = ((await r.json()) as Record<string, unknown>[])[0];
    if (!saved) return json({ error: "This RFI has already been answered.", code: "not_open" }, 409);
    // Tell whoever raised it (never fails the answer).
    await notifyRfiAnswer(req, rfi.id, now);
    const view = await buildView(saved).catch(() => null);
    return json({ ok: true, view });
  } catch {
    return json({ error: "Couldn't save your answer. Try again in a minute.", code: "unavailable" }, 502);
  }
}
