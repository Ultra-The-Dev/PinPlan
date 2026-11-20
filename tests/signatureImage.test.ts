// Client signatures come from public link pages: only a base64 PNG data URL is ever drawn.
import { describe, expect, it } from "vitest";
import { safeSignature } from "@/lib/signatureImage";

describe("safeSignature", () => {
  it("keeps a PNG data URL", () => {
    expect(safeSignature("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
  });
  it("drops anything else", () => {
    for (const s of [
      null,
      undefined,
      "",
      "data:x",
      "https://tracker.example.com/pixel.png",
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:text/html;base64,PHNjcmlwdD4=",
      'data:image/png;base64,AAAA" onerror="alert(1)',
      "DATA:IMAGE/PNG;BASE64,AAAA",
    ])
      expect(safeSignature(s)).toBeNull();
  });
});
