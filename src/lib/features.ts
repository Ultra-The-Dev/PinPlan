// Feature switches. AI (plan scan assist, photo captions, daily-log drafts) is off for now; set
// NEXT_PUBLIC_AI_ENABLED=1 (web, at build time) and AI_ENABLED=1 (server) to bring it back.
export const AI_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED === "1";

/** Server side: the AI routes answer only when AI is switched on. */
export function aiEnabledOnServer(): boolean {
  return process.env.AI_ENABLED === "1" || process.env.NEXT_PUBLIC_AI_ENABLED === "1";
}
