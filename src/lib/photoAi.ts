// Prompts, JSON schemas and parsers for the photo AI routes (caption + tags; daily-log draft from photos).
import { SUGGESTED_TAGS } from "./fieldDocs";

export const DESCRIBE_SCHEMA = {
  type: "object",
  properties: {
    caption: { type: "string", description: "One short sentence describing what the photo shows, for a job record." },
    tags: { type: "array", items: { type: "string" }, description: "1–4 tags." },
    issues: { type: "array", items: { type: "string" }, description: "Visible problems worth flagging (damage, missing labels, unsafe work); empty if none." },
  },
  required: ["caption", "tags", "issues"],
  additionalProperties: false,
} as const;

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "3–6 word title for the day." },
    body: { type: "string", description: "Daily log: work done, rooms/areas, issues, next steps. Plain sentences or short '- ' bullets." },
  },
  required: ["title", "body"],
  additionalProperties: false,
} as const;

export function describePrompt(ctx: { room?: string; device?: string; existingTags?: string[] }) {
  return [
    "You are documenting a low-voltage / smart-home installation job (cameras, Wi-Fi, speakers, TVs, network racks, LED lighting, pre-wire).",
    "Describe this job-site photo for the company's records.",
    ctx.room ? `It was taken in: ${ctx.room}.` : "",
    ctx.device ? `It is linked to the device: ${ctx.device}.` : "",
    `Prefer these tags when they fit: ${[...new Set([...(ctx.existingTags ?? []), ...SUGGESTED_TAGS])].join(", ")}. Add a new short tag only if none fit.`,
    "Keep the caption factual and specific (what is installed or wired, where, its state). Do not guess brands you can't read.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function summaryPrompt(ctx: { date: string; address?: string; notes?: string; captions: string[] }) {
  return [
    `Write a short daily log for a low-voltage / smart-home installation job${ctx.address ? ` at ${ctx.address}` : ""} on ${ctx.date}, from the attached job-site photos.`,
    "Say what work was done and where, anything that looks unfinished or wrong, and sensible next steps. Be factual; don't invent quantities or names.",
    ctx.captions.some(Boolean) ? `Photo notes, in order: ${ctx.captions.map((c, i) => `${i + 1}) ${c || "—"}`).join("; ")}` : "",
    ctx.notes?.trim() ? `The installer's own notes (keep their facts): ${ctx.notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseDescribe(text: string): { caption: string; tags: string[]; issues: string[] } {
  const j = JSON.parse(text) as Record<string, unknown>;
  const arr = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
  return { caption: str(j.caption, 240), tags: arr(j.tags, 4, 30), issues: arr(j.issues, 5, 200) };
}

export function parseSummary(text: string): { title: string; body: string } {
  const j = JSON.parse(text) as Record<string, unknown>;
  return { title: str(j.title, 80), body: str(j.body, 4000) };
}
