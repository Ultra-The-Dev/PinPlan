// File types the private "plans" bucket accepts (supabase/migrations/20261124301000_access_guards.sql sets the same
// list on the bucket; tests/storageTypes.test.ts keeps them equal, and PinPlanCore's StorageTypes.swift too).
// A job document of any other type (SVG, HTML, a video format not listed…) is uploaded as application/octet-stream,
// so the bucket takes it and a browser downloads it instead of opening it.
export const PLANS_BUCKET_TYPES: readonly string[] = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/tiff", "image/bmp", "image/avif",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-word.document.macroEnabled.12", "application/vnd.ms-excel.sheet.macroEnabled.12",
  // Browsers lower-case a Blob's type; Apple's type table doesn't.
  "application/vnd.ms-word.document.macroenabled.12", "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation", "application/rtf", "text/rtf",
  "application/vnd.apple.pages", "application/vnd.apple.numbers", "application/vnd.apple.keynote",
  "application/vnd.ms-project", "application/vnd.visio", "application/vnd.ms-visio.drawing",
  "text/plain", "text/csv",
  "application/zip", "application/x-zip-compressed", "application/x-7z-compressed", "application/vnd.rar", "application/x-rar-compressed",
  "image/vnd.dwg", "image/x-dwg", "application/x-dwg", "image/vnd.dxf", "application/acad", "application/dxf", "application/x-autocad",
  "message/rfc822", "application/vnd.ms-outlook",
  "video/mp4", "video/quicktime", "video/x-m4v", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav",
  "application/octet-stream",
];

const byLower = new Map(PLANS_BUCKET_TYPES.map((t) => [t.toLowerCase(), t.toLowerCase()]));

/** The Content-Type to upload a file with: its own type when the bucket takes it, else application/octet-stream. */
export function plansUploadType(mime: string | null | undefined): string {
  const base = (mime ?? "").split(";")[0].trim().toLowerCase();
  return byLower.get(base) ?? "application/octet-stream";
}

/**
 * The body to upload: supabase-js sends a Blob as a form part typed with the Blob's own type (its contentType option
 * is ignored then), so a file whose type the bucket refuses is re-wrapped as application/octet-stream.
 */
export function plansUploadBody(blob: Blob, mime?: string | null): Blob {
  const type = plansUploadType(blob.type || mime);
  return blob.type === type ? blob : new Blob([blob], { type });
}
