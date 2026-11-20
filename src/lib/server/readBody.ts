// Reading a request body with a size limit (server-only).
//
// req.json() / req.text() read whatever the caller sends, however big, before the route can look at it. The public
// routes (answer links, notify, the Stripe webhook, sign-up) are open to anyone, so they read through these instead:
//   - a Content-Length over the limit is refused with 413 before anything is read;
//   - otherwise the body is streamed and reading stops (and the stream is cancelled) as soon as it passes the limit,
//     so a missing or lying Content-Length (chunked upload) can't get past it either.
// Results carry a ready Response for the failure, so a route can return it as is or answer in its own shape.

export const KB = 1024;

export type ReadFailure = { ok: false; status: 400 | 413; code: "bad_request" | "payload_too_large"; response: Response };
export type TextResult = { ok: true; text: string } | ReadFailure;
export type JsonResult<T> = { ok: true; value: T } | ReadFailure;

const failure = (status: 400 | 413): ReadFailure => {
  const code = status === 413 ? "payload_too_large" : "bad_request";
  const error = status === 413 ? "The request is too large." : "Invalid request.";
  return { ok: false, status, code, response: Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } }) };
};

/** The declared Content-Length, or null when absent or unreadable. */
function declaredLength(req: Request): number | null {
  const v = req.headers.get("content-length");
  if (v == null || !/^\d+$/.test(v.trim())) return null;
  return Number(v.trim());
}

/** The raw bytes of the body, or null when it is over maxBytes (declared or actual). */
export async function readBytesLimited(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = declaredLength(req);
  if (declared != null && declared > maxBytes) {
    // Don't read it; let the runtime drop the rest.
    await req.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The body as UTF-8 text, at most maxBytes long; 413 past that. */
export async function readTextLimited(req: Request, maxBytes: number): Promise<TextResult> {
  let bytes: Uint8Array | null;
  try {
    bytes = await readBytesLimited(req, maxBytes);
  } catch {
    return failure(400);
  }
  if (!bytes) return failure(413);
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

/** The body parsed as JSON, at most maxBytes long: 413 past that, 400 when it isn't JSON. */
export async function readJsonLimited<T = unknown>(req: Request, maxBytes: number): Promise<JsonResult<T>> {
  const r = await readTextLimited(req, maxBytes);
  if (!r.ok) return r;
  try {
    return { ok: true, value: JSON.parse(r.text) as T };
  } catch {
    return failure(400);
  }
}
