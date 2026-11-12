import { getClientOrError, handleError } from "@/lib/billdu/route-helpers";

/** Checks the credentials by reading back one page of clients (the FAQ calls the API one-way; this tests reads). */
export async function POST() {
  const client = await getClientOrError();
  if (client instanceof Response) return client;
  try {
    const raw = await client.request<unknown>("GET", "/clients", { query: { page: 1, limit: 1 } });
    const { extractList } = await import("@/lib/billdu/client");
    const list = extractList(raw);
    return Response.json({ ok: true, canRead: Array.isArray(raw) || list.length > 0 || raw != null, sampleCount: list.length });
  } catch (e) {
    return handleError(e);
  }
}
