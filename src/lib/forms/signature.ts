// Signature text and data-URL helpers for forms (pure; used by the fill screen and the PDF).
import type { FormSignature } from "../types";

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ""] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
  if (/;base64/i.test(head)) {
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return new Blob([out], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

/** True when the signature was collected for someone else (an inspector or the customer signing on this device). */
export const signedOnBehalf = (s: Pick<FormSignature, "name" | "signedBy">) =>
  !!s.signedBy && s.signedBy.trim().toLowerCase() !== s.name.trim().toLowerCase();

/** "Jane Smith (Inspector)" and, when someone else collected it, "Signed on behalf · collected by Mike". */
export function signatureLines(s: FormSignature, when: string): string[] {
  const who = `${s.name}${s.role ? ` (${s.role})` : ""}`;
  return [who, `Signed ${when}`, ...(signedOnBehalf(s) ? [`Signed on behalf · collected by ${s.signedBy}`] : [])];
}
