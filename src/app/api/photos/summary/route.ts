import Anthropic from "@anthropic-ai/sdk";
import { SUMMARY_SCHEMA, parseSummary, summaryPrompt } from "@/lib/photoAi";
import { aiEnabledOnServer } from "@/lib/features";
import { requireUser } from "@/lib/server/auth";
import { limitAi } from "@/lib/server/rateLimit";

// AI daily-log draft from a day's photos. Body: { date, address?, notes?, photos: [{ data (JPEG base64), caption }] }
export const maxDuration = 180;

export async function POST(request: Request) {
  if (!aiEnabledOnServer()) return Response.json({ error: "AI features are turned off on this server.", code: "ai_disabled" }, { status: 404 });
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const limited = limitAi(request, auth.userId, "photoSummary");
  if (limited) return limited;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "AI is not configured: set ANTHROPIC_API_KEY on the server." }, { status: 501 });
  // No built-in default: the model is chosen per deployment (ANTHROPIC_MODEL), never hard-coded here.
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (!model) return Response.json({ error: "AI model not configured", code: "ai_model_not_configured" }, { status: 501 });
  let body: { date?: string; address?: string; notes?: string; photos?: { data: string; caption?: string }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request: expected JSON." }, { status: 400 });
  }
  const photos = (body.photos ?? []).filter((p) => typeof p?.data === "string" && p.data.length > 0).slice(0, 8);
  if (!photos.length) return Response.json({ error: "No photos sent." }, { status: 400 });
  if (photos.reduce((n, p) => n + (p.data.length * 3) / 4, 0) > 12 * 1024 * 1024) return Response.json({ error: "Photos too large." }, { status: 413 });
  const client = new Anthropic();
  try {
    const r = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            ...photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: p.data } })),
            { type: "text", text: summaryPrompt({ date: String(body.date || "").slice(0, 10), address: body.address?.slice(0, 120), notes: body.notes?.slice(0, 2000), captions: photos.map((p) => (p.caption ?? "").slice(0, 200)) }) },
          ],
        },
      ],
    });
    if (r.stop_reason === "refusal") return Response.json({ error: "The model declined to summarize these photos." }, { status: 422 });
    const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return Response.json(parseSummary(text));
  } catch (e) {
    console.error("[photo summary]", e);
    return Response.json({ error: "AI request failed. Try again in a minute." }, { status: 502 });
  }
}
