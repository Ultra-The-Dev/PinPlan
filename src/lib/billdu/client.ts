// Server-only Billdu API client (never import from client components: it needs the API secret).
import { createSignature } from "./signature";

export const BILLDU_HOST = process.env.BILLDU_HOST || "https://api.billdu.com";

export interface BillduCreds {
  apiKey: string;
  apiSecret: string;
}

export class BillduError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
}

export interface BillduClientRecord {
  id: number;
  company?: string | null;
  fullname?: string | null;
  email?: string | null;
  [k: string]: unknown;
}

export interface BillduDocumentRecord {
  id: number;
  serial_number?: string | null;
  total_price?: number;
  price?: number;
  [k: string]: unknown;
}

export class BillduClient {
  constructor(private creds: BillduCreds, private host = BILLDU_HOST, private fetchImpl: typeof fetch = fetch) {}

  async request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, opts: { body?: Record<string, unknown>; query?: Record<string, string | number> } = {}): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createSignature(opts.body, this.creds.apiKey, this.creds.apiSecret, timestamp);
    const url = new URL(path, this.host);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
    url.searchParams.set("apiKey", this.creds.apiKey);
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("signature", signature);
    const res = await this.fetchImpl(url, {
      method,
      headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && ("message" in data || "error" in data)
          ? String((data as { message?: unknown; error?: unknown }).message ?? (data as { error?: unknown }).error)
          : typeof data === "string" && data
            ? data.slice(0, 300)
            : res.statusText) || `HTTP ${res.status}`;
      throw new BillduError(`Billdu ${method} ${path} failed (${res.status}): ${msg}`, res.status, data);
    }
    return data as T;
  }

  listClients(page = 1, limit = 50) {
    return this.request<unknown>("GET", "/clients", { query: { page, limit } }).then(extractList<BillduClientRecord>);
  }
  getClient(id: number) {
    return this.request<BillduClientRecord>("GET", `/clients/${id}`);
  }
  createClient(data: Record<string, unknown>) {
    return this.request<BillduClientRecord>("POST", "/clients/", { body: data });
  }
  createProduct(data: Record<string, unknown>) {
    return this.request<{ id: number }>("POST", "/products/", { body: data });
  }
  createDocument(data: Record<string, unknown>) {
    return this.request<BillduDocumentRecord>("POST", "/documents/", { body: data });
  }
  updateDocument(id: number, data: Record<string, unknown>) {
    return this.request<BillduDocumentRecord>("PATCH", `/documents/${id}`, { body: data });
  }
}

/** List responses may be a bare array or wrapped (HAL `_embedded`, `items`, `data`). */
export function extractList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["items", "data", "clients", "documents", "products"]) if (Array.isArray(o[key])) return o[key] as T[];
    if (o._embedded && typeof o._embedded === "object") {
      for (const v of Object.values(o._embedded as Record<string, unknown>)) if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}
