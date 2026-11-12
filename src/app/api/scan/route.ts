import Anthropic from "@anthropic-ai/sdk";
import { buildScanPrompt, parseScanResult, SCAN_SCHEMA, TITLE_SCHEMA, type ScanCatalogEntry } from "@/lib/scanParse";

// AI scan assist: sends one sheet image to Claude (vision) and returns suggestions as strict JSON.
// Results are only suggestions; the client shows them as ghost markers the user must accept.

export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // API limit per image (base64-decoded)
type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "AI scan is not configured: set ANTHROPIC_API_KEY on the server (e.g. in .env.local or the Vercel project settings)." },
      { status: 501 },
    );
  }

  let imageBase64 = "";
  let mime = "image/jpeg";
  let catalog: ScanCatalogEntry[] = [];
  let mode: "full" | "title" = "full";
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("image");
      if (!(file instanceof Blob)) throw new Error("missing image");
      imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      mime = file.type || mime;
      catalog = JSON.parse(String(form.get("catalog") || "[]"));
      mode = form.get("mode") === "title" ? "title" : "full";
    } else {
      const body = await request.json();
      imageBase64 = String(body.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
      mime = body.mime || mime;
      catalog = Array.isArray(body.catalog) ? body.catalog : [];
      mode = body.mode === "title" ? "title" : "full";
    }
  } catch {
    return Response.json({ error: "Bad request: expected an image, a catalog and a mode." }, { status: 400 });
  }
  if (!imageBase64) return Response.json({ error: "No image sent." }, { status: 400 });
  if (!MIMES.includes(mime as ImageMime)) return Response.json({ error: `Unsupported image type ${mime}.` }, { status: 400 });
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES)
    return Response.json({ error: "Image too large (max 5 MB). Downscale before sending." }, { status: 413 });
  catalog = catalog
    .filter((c) => c && typeof c.id === "string")
    .slice(0, 200)
    .map((c) => ({ id: c.id, name: String(c.name ?? ""), symbol: String(c.symbol ?? ""), category: String(c.category ?? "") }));

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: mode === "title" ? "low" : "medium",
        format: { type: "json_schema", schema: mode === "title" ? TITLE_SCHEMA : SCAN_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime as ImageMime, data: imageBase64 } },
            { type: "text", text: buildScanPrompt(catalog, mode) },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The model declined to read this sheet." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens") {
      return Response.json({ error: "The sheet had too many items to read in one pass. Try cropping it." }, { status: 422 });
    }
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const result = parseScanResult(text, catalog.map((c) => c.id));
    return Response.json({ ...result, model: response.model });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError)
      return Response.json({ error: "ANTHROPIC_API_KEY was rejected." }, { status: 502 });
    if (error instanceof Anthropic.RateLimitError)
      return Response.json({ error: "Rate limited by the AI service. Try again in a minute." }, { status: 429 });
    if (error instanceof Anthropic.BadRequestError)
      return Response.json({ error: `AI request rejected: ${error.message}` }, { status: 502 });
    if (error instanceof Anthropic.APIError)
      return Response.json({ error: `AI service error (${error.status ?? "network"}).` }, { status: 502 });
    return Response.json({ error: error instanceof Error ? error.message : "Scan failed" }, { status: 500 });
  }
}
