// The public website pages: the marketing home, pricing, support and the legal pages. They don't start the app's
// runtime (local database, sync, Supabase, tours; Providers), so a first visit downloads only what the page shows.
// Every other path (the app, sign-in, client links, help) starts it as before.
const PUBLIC_PAGES = ["/", "/welcome", "/pricing", "/support", "/terms", "/privacy", "/accessibility"];
const PUBLIC_PREFIXES = ["/legal"];

/** True for a public website page (trailing slash ignored). */
export function isPublicPage(path: string): boolean {
  const p = path.replace(/\/+$/, "") || "/";
  return PUBLIC_PAGES.includes(p) || PUBLIC_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
}
