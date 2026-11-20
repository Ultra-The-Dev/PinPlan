// POST /api/links/files { kind: "proposal" | "photoReport", token }
// Deletes the images behind a withdrawn client link (proposal plans, photo report photos) from the proposals bucket.
// They sit under the publisher's own folder, so only the service role can remove them when someone else on the office
// withdraws the link. The caller must be the publisher or an office member (owner/admin) of the link's job: the link
// row is read with the caller's own token, so row-level security decides whether they can see it at all. Only a link
// that is already withdrawn is cleaned up; a live link's images are never touched.
import { requireUser, teamRole } from "@/lib/server/auth";
import { bearer, serviceConfigured, serviceFetch, supabaseUrl, anonKey, userFetch } from "@/lib/server/supabaseAdmin";
import { linkFolder, removeLinkFiles, type LinkFilesBucket } from "@/lib/linkFiles";

const json = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const BUCKET = "proposals";

interface LinkRow {
  id: string;
  owner_id: string;
  project_id: string;
  status?: string;
  revoked?: boolean;
}

/** The proposals bucket through the Storage API with the service key. `failed` is set when a call goes wrong. */
function serviceBucket(): LinkFilesBucket & { failed: boolean } {
  const b = {
    failed: false,
    async list(path: string, opts?: { limit?: number }) {
      const r = await serviceFetch(`/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: path, limit: opts?.limit ?? 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
      });
      if (!r.ok) {
        b.failed = true;
        return { data: null, error: { message: `storage list ${r.status}` } };
      }
      return { data: (await r.json()) as { name: string; id?: string | null }[], error: null };
    },
    async remove(paths: string[]) {
      const r = await serviceFetch(`/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!r.ok) b.failed = true;
      return { error: r.ok ? null : { message: `storage delete ${r.status}` } };
    },
  };
  return b;
}

export async function POST(req: Request) {
  if (!supabaseUrl() || !anonKey() || !serviceConfigured()) return json({ error: "Client links need cloud sync, which isn't set up on this server.", code: "unavailable" }, 501);
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const token = bearer(req);
  if (!auth.userId || !token) return json({ error: "Sign in to withdraw links.", code: "sign_in_required" }, 401);

  let body: { kind?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request.", code: "bad_request" }, 400);
  }
  const kind = body.kind === "proposal" || body.kind === "photoReport" ? body.kind : null;
  const link = typeof body.token === "string" ? body.token : "";
  if (!kind || !TOKEN_RE.test(link)) return json({ error: "Invalid request.", code: "bad_request" }, 400);

  const table = kind === "proposal" ? "proposals" : "photo_reports";
  const cols = kind === "proposal" ? "id,owner_id,project_id,status" : "id,owner_id,project_id,revoked";
  let row: LinkRow | undefined;
  try {
    const r = await userFetch(token, `/rest/v1/${table}?id=eq.${encodeURIComponent(link)}&select=${cols}`);
    if (!r.ok) return json({ error: "Couldn't load the link. Try again.", code: "upstream" }, 502);
    row = ((await r.json()) as LinkRow[])[0];
  } catch {
    return json({ error: "Couldn't load the link. Try again.", code: "upstream" }, 502);
  }
  // Not visible with the caller's token: not their job (or no such link). Same answer either way.
  if (!row || row.id !== link || !row.owner_id) return json({ error: "That link wasn't found on your team.", code: "not_found" }, 404);

  if (row.owner_id !== auth.userId) {
    let role: Awaited<ReturnType<typeof teamRole>>;
    try {
      role = await teamRole(req, auth.userId);
    } catch (e) {
      return json({ error: (e as Error).message, code: "role_check_failed" }, 503);
    }
    // Not on a team but able to see the job: its owner, working alone. Technicians never.
    if (role === "tech") return json({ error: "Only the office or the person who shared the link can withdraw it.", code: "office_only" }, 403);
  }

  const withdrawn = kind === "proposal" ? row.status === "revoked" : row.revoked === true;
  if (!withdrawn) return json({ error: "Withdraw the link first.", code: "link_active" }, 409);

  const bucket = serviceBucket();
  const folder = linkFolder(row.owner_id, link, kind === "proposal" ? "proposal" : "report");
  let removed = 0;
  try {
    removed = await removeLinkFiles(bucket, folder);
  } catch {
    bucket.failed = true;
  }
  if (bucket.failed) return json({ error: "Couldn't delete the link's images. Try again.", code: "upstream" }, 502);
  return json({ ok: true, removed });
}
