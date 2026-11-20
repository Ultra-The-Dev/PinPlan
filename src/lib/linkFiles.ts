// The images behind a client link (proposal plans, photo report photos) in the proposals bucket, and deleting them
// once the link is withdrawn. Pure: the browser (proposalCloud.ts) and the server (/api/links/files) both use it.

/** The bucket calls removeLinkFiles needs (a narrow slice of the Supabase storage client, so it can be tested). */
export interface LinkFilesBucket {
  list(path: string, opts?: { limit?: number }): Promise<{ data: { name: string; id?: string | null }[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

/** Where a withdrawn link's images live in the proposals bucket. Proposals: <owner>/<token>/; photo reports: <owner>/reports/<token>/. */
export function linkFolder(ownerId: string, token: string, kind: "proposal" | "report"): string {
  return kind === "report" ? `${ownerId}/reports/${token}` : `${ownerId}/${token}`;
}

/**
 * Delete the images behind a withdrawn link, so its picture URLs stop working too. Best effort: a failure never undoes the
 * withdrawal. Returns how many went.
 */
export async function removeLinkFiles(bucket: LinkFilesBucket, folder: string): Promise<number> {
  if (!/^[^/]+\/(reports\/)?[^/]+$/.test(folder)) return 0; // never a whole user folder
  const { data, error } = await bucket.list(folder, { limit: 1000 });
  if (error || !data?.length) return 0;
  // Sub-folders come back as entries without an id.
  const paths = data.filter((f) => f.id !== null && f.name && f.name !== ".emptyFolderPlaceholder").map((f) => `${folder}/${f.name}`);
  if (!paths.length) return 0;
  const { error: rmError } = await bucket.remove(paths);
  return rmError ? 0 : paths.length;
}
