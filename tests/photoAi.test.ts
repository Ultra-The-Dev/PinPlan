// Photo AI routes with the Claude API mocked at the HTTP layer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function claudeReply(text: string, stop_reason = "end_turn") {
  return new Response(
    JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "test-model", content: [{ type: "text", text }], stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }),
    { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } },
  );
}

describe("photo AI routes", () => {
  let sent: Record<string, unknown>[] = [];
  beforeEach(() => {
    sent = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  const mockClaude = (text: string, stop?: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body ?? "{}")));
        return claudeReply(text, stop);
      }),
    );
  const req = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("captions and tags a photo", async () => {
    mockClaude(JSON.stringify({ caption: "  Two Cat6 drops at the TV wall  ", tags: ["Pre-wire", "TV", "", "Cat6", "extra"], issues: [] }));
    const { POST } = await import("@/app/api/photos/describe/route");
    const res = await POST(req("/api/photos/describe", { imageBase64: "AAAA", room: "Living", existingTags: ["Pre-wire"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ caption: "Two Cat6 drops at the TV wall", tags: ["Pre-wire", "TV", "Cat6", "extra"], issues: [] });
    const msg = sent[0] as { messages: { content: { type: string; text?: string }[] }[]; output_config: { effort: string } };
    expect(msg.output_config.effort).toBe("low");
    expect(msg.messages[0].content.find((c) => c.type === "text")!.text).toContain("Living");
  });

  it("drafts a daily log from photos", async () => {
    mockClaude(JSON.stringify({ title: "Rough-in, 2nd floor", body: "- Pulled Cat6 to 6 cameras" }));
    const { POST } = await import("@/app/api/photos/summary/route");
    const res = await POST(req("/api/photos/summary", { date: "2026-11-19", photos: [{ data: "AAAA", caption: "Hall camera" }, { data: "BBBB" }] }));
    expect(await res.json()).toEqual({ title: "Rough-in, 2nd floor", body: "- Pulled Cat6 to 6 cameras" });
    expect((sent[0] as { messages: { content: unknown[] }[] }).messages[0].content).toHaveLength(3);
  });

  it("explains a missing key and empty requests", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { POST } = await import("@/app/api/photos/describe/route");
    expect((await POST(req("/api/photos/describe", { imageBase64: "AAAA" }))).status).toBe(501);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.resetModules();
    const { POST: P2 } = await import("@/app/api/photos/summary/route");
    expect((await P2(req("/api/photos/summary", { photos: [] }))).status).toBe(400);
  });
});
