import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAnswer, parseExplanation } from "@/lib/planRead";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const reply = (text: string, stop_reason = "end_turn") =>
  new Response(
    JSON.stringify({ id: "m", type: "message", role: "assistant", model: "test", content: [{ type: "text", text }], stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("plan reader parsing", () => {
  it("validates and clamps an explanation", () => {
    const e = parseExplanation(
      JSON.stringify({
        sheetTitle: "1ST FL", sheetType: "LED lighting plan", scale: `1/4" = 1'-0"`, summary: "Ground floor with 9 LED zones.",
        rooms: [{ name: "KITCHEN", size: `14'-6" × 12'-0"`, x: 0.4, y: 0.3 }, { name: "", size: null, x: 0, y: 0 }],
        dimensions: [{ text: `12'-6"`, feet: 12.5, describes: "kitchen wall", x: 55, y: 1.4 }, { text: "x", feet: -3, describes: null, x: 0, y: 0 }],
        notes: [{ text: "Driver in pantry", category: "lighting", x: 0.5, y: 0.5 }, { text: "Odd", category: "nonsense", x: 0.1, y: 0.1 }],
        verify: ["Confirm ceiling height in living room"],
      }),
    );
    expect(e.rooms).toHaveLength(1);
    expect(e.dimensions[0]).toMatchObject({ feet: 12.5, x: 0.55 });
    expect(e.dimensions[0].y).toBeCloseTo(0.014);
    expect(e.dimensions[1].feet).toBeNull();
    expect(e.notes[1].category).toBe("general");
    expect(e.verify).toEqual(["Confirm ceiling height in living room"]);
  });

  it("parses answers and tolerates plain text", () => {
    expect(parseAnswer(JSON.stringify({ answer: "About 24 LF.", points: [{ label: "Kitchen LED", x: 0.4, y: 0.2 }] }))).toEqual({
      answer: "About 24 LF.",
      points: [{ label: "Kitchen LED", x: 0.4, y: 0.2 }],
    });
    expect(parseAnswer("Plain answer").answer).toBe("Plain answer");
  });
});

describe("POST /api/plan/read", () => {
  let calls: Record<string, unknown>[] = [];
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

  async function post(body: unknown, r: Response) {
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? "{}")));
      return r;
    }));
    const { POST } = await import("@/app/api/plan/read/route");
    return POST(new Request("http://x/api/plan/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  }

  it("explains a sheet with a JSON schema and the image", async () => {
    const res = await post({ imageBase64: PNG, mime: "image/png", mode: "explain", sheetName: "1st Fl", knownScale: `1/8" = 1'-0"` },
      reply(JSON.stringify({ sheetTitle: "1ST FL", sheetType: "plan", scale: null, summary: "S", rooms: [], dimensions: [], notes: [], verify: [] })));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ mode: "explain", sheetTitle: "1ST FL", summary: "S" });
    const body = calls[0] as { model: string; messages: { content: { type: string; text?: string }[] }[] };
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.messages[0].content[0].type).toBe("image");
    expect(body.messages[0].content[1].text).toContain(`1/8" = 1'-0"`);
    expect(JSON.stringify(body)).toContain("json_schema");
  });

  it("answers questions and requires one", async () => {
    expect((await post({ imageBase64: PNG, mime: "image/png", mode: "ask" }, reply("{}"))).status).toBe(400);
    const res = await post({ imageBase64: PNG, mime: "image/png", mode: "ask", question: "Where is the equipment closet?" },
      reply(JSON.stringify({ answer: "In the cellar, by the stair.", points: [{ label: "AV closet", x: 0.3, y: 0.7 }] })));
    expect(await res.json()).toMatchObject({ mode: "ask", answer: "In the cellar, by the stair.", points: [{ label: "AV closet" }] });
  });

  it("returns 501 without a key and 422 on refusal", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await post({ imageBase64: PNG, mime: "image/png" }, reply("{}"))).status).toBe(501);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.resetModules();
    expect((await post({ imageBase64: PNG, mime: "image/png" }, reply("", "refusal"))).status).toBe(422);
  });
});
