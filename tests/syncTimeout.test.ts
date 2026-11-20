import { describe, expect, it } from "vitest";
import { isRowRefusal } from "@/lib/syncMap";
import { REST_TIMEOUT_MS, STORAGE_TIMEOUT_MS, timedFetch } from "@/lib/supabase";

/** A fetch that never answers until its signal fires (a stalled connection). */
function stalled(seen: { signal?: AbortSignal | null }[]): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ signal: init?.signal });
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })));
    });
  }) as typeof fetch;
}

describe("timedFetch: no request waits for ever", () => {
  it("limits REST requests to 30 s and storage to 2 min", () => {
    expect(REST_TIMEOUT_MS).toBe(30_000);
    expect(STORAGE_TIMEOUT_MS).toBe(120_000);
  });

  it("a request aborted by the caller fails like a dropped connection (kept queued, not set aside)", async () => {
    const seen: { signal?: AbortSignal | null }[] = [];
    const ctl = new AbortController();
    const p = timedFetch("https://x.supabase.co/rest/v1/markers", { signal: ctl.signal }, stalled(seen));
    ctl.abort();
    const err = await p.catch((e: Error) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect((err as Error).message).toMatch(/Failed to fetch/);
    // What sync does with it: not the rows' fault.
    expect(isRowRefusal({ message: `TypeError: ${(err as Error).message}` }, 0)).toBe(false);
  });

  it("passes the answer through and leaves other errors alone", async () => {
    const ok = (async () => new Response("[]", { status: 200 })) as typeof fetch;
    expect((await timedFetch("https://x.supabase.co/rest/v1/markers", {}, ok)).status).toBe(200);
    const bad = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    await expect(timedFetch("https://x.supabase.co/storage/v1/object/plans/a", {}, bad)).rejects.toThrow("boom");
  });
});
