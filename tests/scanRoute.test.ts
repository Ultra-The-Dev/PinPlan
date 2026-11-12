// End-to-end test of the AI scan route with the Claude API mocked at the HTTP layer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CATALOG = [
  { id: "cam-indoor", name: "Indoor camera", symbol: "C", category: "security" },
  { id: "speaker", name: "In-ceiling speaker", symbol: "S", category: "audio" },
];
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function claudeReply(text: string, stop_reason = "end_turn") {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "test-model",
      content: [{ type: "text", text }],
      stop_reason,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } },
  );
}

describe("POST /api/scan", () => {
  let calls: { url: string; body: Record<string, unknown> }[] = [];
  beforeEach(() => {
    calls = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("PINPLAN_ACCESS_CODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function post(body: unknown, reply: Response) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url instanceof Request ? url.url : url), body: JSON.parse(String(init?.body ?? "{}")) });
        return reply;
      }),
    );
    const { POST } = await import("@/app/api/scan/route");
    return POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  }

  it("sends the image with a JSON schema and returns validated suggestions", async () => {
    const modelJson = JSON.stringify({
      floorName: "1ST. FL",
      ledCallouts: [{ zone: "21", lf: 24, switchLabel: "S21", x: 0.4, y: 0.2, confidence: 0.9 }],
      symbols: [
        { deviceTypeId: "cam-indoor", symbolText: "C", x: 0.3, y: 0.3, confidence: 0.95, tentative: false },
        { deviceTypeId: "speaker", symbolText: "S?", x: 0.6, y: 0.5, confidence: 0.7, tentative: true },
        { deviceTypeId: "not-in-catalog", symbolText: "Z", x: 1.7, y: -2, confidence: 3, tentative: false },
      ],
    });
    const res = await post({ imageBase64: PNG_1PX, mime: "image/png", catalog: CATALOG, mode: "full" }, claudeReply(modelJson));
    expect(res.status).toBe(200);
    const j = await res.json();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/v1/messages");
    const content = (calls[0].body.messages as { content: { type: string; source?: { media_type: string } }[] }[])[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source?.media_type).toBe("image/png");
    expect(JSON.stringify(calls[0].body)).toContain("json_schema");

    expect(j.floorName).toBeTruthy();
    expect(j.ledCallouts[0]).toMatchObject({ zone: "21", lf: 24, switchLabel: "S21" });
    expect(j.symbols).toHaveLength(3);
    expect(j.symbols[1].tentative).toBe(true);
    // Unknown device ids are dropped to null and positions/confidence are clamped.
    expect(j.symbols[2].deviceTypeId).toBeNull();
    expect(j.symbols[2].x).toBeLessThanOrEqual(1);
    expect(j.symbols[2].y).toBeGreaterThanOrEqual(0);
    expect(j.symbols[2].confidence).toBeLessThanOrEqual(1);
  });

  it("reports a refusal clearly", async () => {
    const res = await post({ imageBase64: PNG_1PX, mime: "image/png", catalog: CATALOG }, claudeReply("", "refusal"));
    expect(res.status).toBe(422);
  });

  it("returns 501 without an API key and never calls out", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await post({ imageBase64: PNG_1PX, mime: "image/png", catalog: CATALOG }, claudeReply("{}"));
    expect(res.status).toBe(501);
    expect(calls).toHaveLength(0);
  });

  it("rejects unsupported image types", async () => {
    const res = await post({ imageBase64: PNG_1PX, mime: "image/tiff", catalog: CATALOG }, claudeReply("{}"));
    expect(res.status).toBe(400);
  });
});
