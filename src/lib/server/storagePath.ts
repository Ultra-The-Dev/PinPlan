// Storage paths for files the public links sign (server-only).
//
// Job files live in the private plans bucket at `<project id>/<image id>`. The public link routes (RFI answer link,
// change order link) sign download URLs with the service role, which can read every company's files. The rows they
// read the image ids from (photos, sheets, the frozen change order view) are written by the job's own members, so the
// ids are not trusted: a path is built only from the link's own project id and a plain image name, never taken whole
// from a row. Anything else ("../x", "other-project/x", "a/b") is dropped and never signed.

/** A plain storage object name: what the apps give every image (letters, digits, _ and -; no slashes or dots). */
export const IMAGE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** `<projectId>/<imageId>`, or null when either part isn't a plain name. */
export function jobImagePath(projectId: unknown, imageId: unknown): string | null {
  if (typeof projectId !== "string" || typeof imageId !== "string") return null;
  return IMAGE_ID_RE.test(projectId) && IMAGE_ID_RE.test(imageId) ? `${projectId}/${imageId}` : null;
}

/**
 * The storage path of a sheet's image, inside this job only. image_path is used only when it is exactly
 * `<projectId>/<plain image name>`; otherwise the path is built from image_id. Null when neither is safe.
 */
export function sheetImagePath(projectId: unknown, sheet: { image_id?: unknown; image_path?: unknown }): string | null {
  const p = sheet.image_path;
  if (typeof p === "string" && p && typeof projectId === "string") {
    const prefix = `${projectId}/`;
    if (p.startsWith(prefix) && jobImagePath(projectId, p.slice(prefix.length)) === p) return p;
  }
  return jobImagePath(projectId, sheet.image_id);
}
