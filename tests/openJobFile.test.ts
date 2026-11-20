// Opening job files: only bytes that prove to be a PDF or a raster image open in a tab (as a fresh blob typed from the
// bytes, cut off from the app window); HTML, SVG and anything else downloads, whatever the row's mime type claims.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const downloads: { blob: Blob; name: string }[] = [];
vi.mock("@/lib/download", () => ({ downloadBlob: (blob: Blob, name: string) => downloads.push({ blob, name }) }));

const { mightView, openBlankTab, openJobFile, safeUploadMime, sniffViewableType } = await import("@/lib/openJobFile");

const enc = (s: string) => new TextEncoder().encode(s);
const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...enc(p)] : p)));
const PDF = bytes("%PDF-1.7\n%âãÏÓ\n1 0 obj");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "....IHDR");
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "..JFIF");
const GIF = bytes("GIF89a....");
const WEBP = bytes("RIFF", [0x10, 0, 0, 0], "WEBPVP8 ");
const HEIC = bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "mif1heic");
const HTML = bytes("<!doctype html><script>fetch('/api/account')</script>");
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

let created: Blob[];
let opened: { url: string; target?: string; features?: string }[];
beforeEach(() => {
  downloads.length = 0;
  created = [];
  opened = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    created.push(b as Blob);
    return `blob:app/${created.length}`;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.stubGlobal("window", {
    open: (url: string, target?: string, features?: string) => {
      opened.push({ url, target, features });
      return null;
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeTab() {
  const tab = { location: { href: "" }, closed: false, opener: {} as unknown, close: () => void (tab.closed = true) };
  return tab as unknown as Window & { closed: boolean };
}

describe("sniffViewableType", () => {
  it("knows PDFs and raster images by their first bytes", () => {
    expect(sniffViewableType(PDF)).toBe("application/pdf");
    expect(sniffViewableType(PNG)).toBe("image/png");
    expect(sniffViewableType(JPEG)).toBe("image/jpeg");
    expect(sniffViewableType(GIF)).toBe("image/gif");
    expect(sniffViewableType(WEBP)).toBe("image/webp");
    expect(sniffViewableType(HEIC)).toBe("image/heic");
  });
  it("refuses pages, SVG, empty and near misses", () => {
    expect(sniffViewableType(HTML)).toBeNull();
    expect(sniffViewableType(SVG)).toBeNull();
    expect(sniffViewableType(new Uint8Array())).toBeNull();
    expect(sniffViewableType(bytes("RIFF....WAVE"))).toBeNull();
    expect(sniffViewableType(bytes(" %PDF-1.4"))).toBeNull();
    expect(sniffViewableType(bytes([0, 0, 0, 0x18], "ftypisom"))).toBeNull();
  });
});

describe("openJobFile", () => {
  it("opens a verified PDF in the tab as a new blob typed from the bytes (not the row's mime)", async () => {
    const tab = fakeTab();
    const r = await openJobFile({ blob: new Blob([PDF], { type: "text/html" }) }, { name: "permit.pdf" }, tab);
    expect(r).toBe("opened");
    expect(tab.location.href).toBe("blob:app/1");
    expect(created[0].type).toBe("application/pdf");
    expect(new Uint8Array(await created[0].arrayBuffer())).toEqual(PDF);
    expect(downloads).toHaveLength(0);
  });

  it("downloads an HTML file that claims to be a PDF, and closes the tab", async () => {
    const tab = fakeTab();
    const r = await openJobFile({ blob: new Blob([HTML], { type: "application/pdf" }) }, { name: "permit.pdf" }, tab);
    expect(r).toBe("downloaded");
    expect(tab.closed).toBe(true);
    expect(tab.location.href).toBe("");
    expect(created).toHaveLength(0);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe("permit.pdf");
    expect(downloads[0].blob.type).toBe("application/octet-stream");
  });

  it("downloads an SVG that claims to be an image", async () => {
    const r = await openJobFile({ blob: new Blob([SVG], { type: "image/svg+xml" }) }, { name: "logo.svg" }, fakeTab());
    expect(r).toBe("downloaded");
    expect(downloads[0].blob.type).toBe("application/octet-stream");
  });

  it("without a pre-opened tab opens with noopener", async () => {
    const r = await openJobFile({ blob: new Blob([PNG]) }, { name: "photo.png" });
    expect(r).toBe("opened");
    expect(opened).toEqual([{ url: "blob:app/1", target: "_blank", features: "noopener,noreferrer" }]);
    expect(created[0].type).toBe("image/png");
  });
});

describe("openBlankTab", () => {
  it("opens a tab only for rows that might be viewable, cut off from this window", () => {
    const tab = fakeTab();
    vi.stubGlobal("window", { open: () => tab });
    expect(openBlankTab("application/pdf")).toBe(tab);
    expect((tab as unknown as { opener: unknown }).opener).toBeNull();
    expect(openBlankTab("text/html")).toBeNull();
    expect(openBlankTab("image/svg+xml")).toBeNull();
    expect(mightView("image/jpeg")).toBe(true);
    expect(mightView("image/svg+xml")).toBe(false);
  });
});

describe("safeUploadMime", () => {
  it("stores page-like types as plain bytes", () => {
    for (const t of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/xml", "text/javascript", "application/javascript", ""])
      expect(safeUploadMime(t)).toBe("application/octet-stream");
  });
  it("keeps ordinary types", () => {
    for (const t of ["application/pdf", "image/png", "image/jpeg", "text/plain", "text/csv", "application/zip"]) expect(safeUploadMime(t)).toBe(t);
  });
});
