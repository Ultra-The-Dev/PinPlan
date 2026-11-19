// After a deploy, a tab still running the old build can ask for a code chunk that no longer exists ("ChunkLoadError").
// Reloading once picks up the new build; the time stamp stops a reload loop if the chunk is missing for another reason.

const KEY = "pinplan.chunkReloadAt";
/** A second chunk error within this window shows the error page instead of reloading again. */
const WINDOW_MS = 60_000;

/** A failed load of a JS/CSS chunk (webpack, Turbopack, or the browser's dynamic import), not an app bug. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  const m = typeof message === "string" ? message : "";
  return /Loading (CSS )?chunk [\w/.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load chunk/i.test(m);
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Reload the page once for a chunk error. True when a reload was started (render nothing meanwhile). */
export function reloadOnceForChunkError(error: unknown, store: Store | null = safeSession(), now = Date.now(), reload: () => void = () => location.reload()): boolean {
  if (!isChunkLoadError(error) || !store) return false;
  try {
    const last = Number(store.getItem(KEY) ?? 0);
    if (last && now - last < WINDOW_MS) return false;
    store.setItem(KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

function safeSession(): Store | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
