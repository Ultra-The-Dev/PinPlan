// A client's signature comes back from a public link page, so it is untrusted text. It is drawn only when it is a PNG
// data URL (what the signature pad makes); anything else (a remote URL, javascript:, SVG…) is not shown.
const PREFIX = "data:image/png;base64,";

/** The signature when it is a base64 PNG data URL, else null. */
export function safeSignature(s: string | null | undefined): string | null {
  return typeof s === "string" && s.startsWith(PREFIX) && /^[A-Za-z0-9+/=\s]*$/.test(s.slice(PREFIX.length)) ? s : null;
}
