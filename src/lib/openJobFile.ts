"use client";
// Opening a job file (a document attached to the job, a file a plan link points at) safely.
//
// A blob: URL has the app's origin, so a file opened in a tab runs with the user's session if the browser renders it
// as a page (HTML, SVG, XML…). Whatever the row's `mime` says, a file opens in a tab only when its first bytes prove
// it is a PDF or a raster image; the tab gets a fresh blob typed from those bytes and no link back to this window.
// Anything else downloads.
import { downloadBlob } from "./download";

/** The types a job file may be shown as in a tab. */
export type ViewableType = "application/pdf" | "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/heic";

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

/** The viewable type the bytes prove, by their magic number; null for anything else. */
export function sniffViewableType(b: Uint8Array): ViewableType | null {
  const at = (i: number, s: string) => s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  if (at(0, "%PDF-")) return "application/pdf";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (at(0, "GIF87a") || at(0, "GIF89a")) return "image/gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (b.length >= 12 && at(4, "ftyp") && HEIC_BRANDS.has(String.fromCharCode(b[8], b[9], b[10], b[11]))) return "image/heic";
  return null;
}

/** A type for a file being attached: page-like types (HTML, SVG, XML, scripts) are stored as plain bytes. */
export function safeUploadMime(type: string | null | undefined): string {
  const t = (type ?? "").trim().toLowerCase();
  if (!t) return "application/octet-stream";
  if (/(html|svg|xml|javascript|ecmascript|xsl)/.test(t) || (t.startsWith("text/") && t !== "text/plain" && t !== "text/csv")) return "application/octet-stream";
  return t;
}

/** Might the file show in a tab? Only a hint, from the row, used to open the tab inside the tap. */
export const mightView = (mime: string | null | undefined) => mime === "application/pdf" || /^image\/(png|jpe?g|gif|webp|heic|heif)$/.test(mime ?? "");

/**
 * Open a blank tab inside the click (Safari/iPad block windows opened after an await), cut off from this window.
 * Pass the result to openJobFile, which fills it in or closes it.
 */
export function openBlankTab(mime: string | null | undefined): Window | null {
  if (!mightView(mime)) return null;
  const win = window.open("", "_blank");
  if (win) {
    try {
      win.opener = null;
    } catch {
      /* already cut off */
    }
  }
  return win;
}

/**
 * Show a job file: in `win` (from openBlankTab) when its bytes are a PDF or a raster image, else download it.
 * Returns what happened, for callers and tests.
 */
export async function openJobFile(rec: { blob: Blob }, doc: { name: string }, win: Window | null = null): Promise<"opened" | "downloaded"> {
  const bytes = new Uint8Array(await rec.blob.arrayBuffer());
  const type = sniffViewableType(bytes);
  if (type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    if (win) win.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "opened";
  }
  win?.close();
  downloadBlob(new Blob([bytes], { type: "application/octet-stream" }), doc.name || "file");
  return "downloaded";
}
