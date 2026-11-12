import { requireUser } from "@/lib/server/auth";
import Anthropic from "@anthropic-ai/sdk";
import { ASK_SCHEMA, EXPLAIN_SCHEMA, buildAskPrompt, buildExplainPrompt, parseAnswer, parseExplanation } from "@/lib/planRead";

// Plan reader: Claude (vision) reads one sheet and explains it, or answers a question about it.
// Body: { imageBase64, mime, mode: "explain" | "ask", question?, sheetName?, knownScale? }

export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Plan reading is not configured: set ANTHROPIC_API_KEY on the server." }, { status: 501 });
  }
  let body: { imageBase64?: string; mime?: string; mode?: string; question?: string; sheetName?: string; knownScale?: string | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request: expected JSON." }, { status: 400 });
  }
  const imageBase64 = String(body.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
  const mime = (body.mime || "image/jpeg") as ImageMime;
  const mode = body.mode === "ask" ? "ask" : "explain";
  const question = String(body.question || "").trim();
  if (!imageBase64) return Response.json({ error: "No image sent." }, { status: 400 });
  if (!MIMES.includes(mime)) return Response.json({ error: `Unsupported image type ${mime}.` }, { status: 400 });
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) return Response.json({ error: "Image too large (max 5 MB)." }, { status: 413 });
  if (mode === "ask" && !question) return Response.json({ error: "Type a question about the plan." }, { status: 400 });

  const context = { sheetName: body.sheetName ? String(body.sheetName).slice(0, 80) : undefined, knownScale: body.knownScale ? String(body.knownScale).slice(0, 60) : null };
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: mode === "ask" ? "medium" : "high",
        format: { type: "json_schema", schema: mode === "ask" ? ASK_SCHEMA : EXPLAIN_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: imageBase64 } },
            { type: "text", text: mode === "ask" ? buildAskPrompt(question, context) : buildExplainPrompt(context) },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return Response.json({ error: "The model declined to read this sheet." }, { status: 422 });
    if (response.stop_reason === "max_tokens") return Response.json({ error: "The sheet had too much to read in one pass. Try a single floor." }, { status: 422 });
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return Response.json(mode === "ask" ? { mode, ...parseAnswer(text) } : { mode, ...parseExplanation(text) });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: "ANTHROPIC_API_KEY was rejected." }, { status: 502 });
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: "Rate limited by the AI service. Try again in a minute." }, { status: 429 });
    if (error instanceof Anthropic.BadRequestError) return Response.json({ error: `AI request rejected: ${error.message}` }, { status: 502 });
    if (error instanceof Anthropic.APIError) return Response.json({ error: `AI service error (${error.status ?? "network"}).` }, { status: 502 });
    return Response.json({ error: error instanceof Error ? error.message : "Plan reading failed" }, { status: 500 });
  }
}
