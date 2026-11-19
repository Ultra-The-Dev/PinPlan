import Anthropic from "@anthropic-ai/sdk";
import { DESCRIBE_SCHEMA, describePrompt, parseDescribe } from "@/lib/photoAi";
import { aiEnabledOnServer } from "@/lib/features";
import { requireUser } from "@/lib/server/auth";
import { limitAi } from "@/lib/server/rateLimit";

// AI caption + tags for one job photo. Body: { imageBase64 (JPEG), room?, device?, existingTags? }
export const maxDuration = 120;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export async function POST(request: Request) {
  if (!aiEnabledOnServer()) return Response.json({ error: "AI features are turned off on this server.", code: "ai_disabled" }, { status: 404 });
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const limited = limitAi(request, auth.userId, "photoDescribe");
  if (limited) return limited;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "AI is not configured: set ANTHROPIC_API_KEY on the server." }, { status: 501 });
  let body: { imageBase64?: string; room?: string; device?: string; existingTags?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request: expected JSON." }, { status: 400 });
  }
  const data = String(body.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!data) return Response.json({ error: "No photo sent." }, { status: 400 });
  if ((data.length * 3) / 4 > 4 * 1024 * 1024) return Response.json({ error: "Photo too large." }, { status: 413 });
  const client = new Anthropic();
  try {
    const r = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: DESCRIBE_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
            { type: "text", text: describePrompt({ room: body.room?.slice(0, 80), device: body.device?.slice(0, 120), existingTags: (body.existingTags ?? []).slice(0, 30) }) },
          ],
        },
      ],
    });
    if (r.stop_reason === "refusal") return Response.json({ error: "The model declined to describe this photo." }, { status: 422 });
    const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return Response.json(parseDescribe(text));
  } catch (e) {
    return Response.json({ error: (e as Error).message || "AI request failed" }, { status: 502 });
  }
}
