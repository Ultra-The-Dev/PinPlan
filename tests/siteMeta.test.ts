// Site-wide metadata and launch copy: pinch-zoom allowed, no connected-app names in the pitch, a wide share card,
// canonical links on public pages, and pricing-card claims that match what ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { SHARE_IMAGE } from "@/components/marketing/seo";
import { siteUrl } from "@/lib/legal";
import { PLANS } from "@/lib/plans";

const root = path.resolve(__dirname, "..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

describe("root layout metadata", () => {
  const layout = read("src/app/layout.tsx");
  it("lets people pinch-zoom (no maximum-scale / user-scalable limits)", () => {
    const viewport = layout.match(/export const viewport[^=]*=\s*\{([^}]*)\}/)?.[1];
    expect(viewport).toBeDefined();
    expect(viewport).not.toMatch(/maximumScale|minimumScale|userScalable/);
  });
  it("doesn't pitch a connected app in the description", () => {
    expect(layout).not.toMatch(/Billdu/i);
  });
  it("sets metadataBase from the site URL env vars", () => {
    // One rule for the whole site: siteUrl() in src/lib/legal.ts (NEXT_PUBLIC_SITE_URL, then PINPLAN_APP_URL, …;
    // tested in seo.test.ts), the same origin the canonicals, sitemap and robots.txt use.
    expect(layout).toMatch(/metadataBase: new URL\(siteUrl\(\)\)/);
    expect(layout).toContain('import { siteUrl } from "@/lib/legal"');
    expect(siteUrl({ PINPLAN_APP_URL: "https://northpin.app" })).toBe("https://northpin.app");
  });
  it("shares the wide card, never the square icon", () => {
    expect(layout).toContain("SHARE_IMAGE");
    expect(layout).not.toMatch(/images:\s*\[[^\]]*icon-512/);
    expect(SHARE_IMAGE).toMatchObject({ width: 1200, height: 630 });
  });
});

describe("share card", () => {
  const og = read("src/app/opengraph-image.tsx");
  it("is 1200 × 630 in Blueprint Ink, with no external font fetch", () => {
    expect(og).toMatch(/width:\s*1200,\s*height:\s*630/);
    expect(og.toLowerCase()).toContain("#0f2340");
    expect(og).not.toMatch(/fetch\(|fonts\.googleapis|\.ttf|\.woff/);
  });
});

describe("manifest", () => {
  it("doesn't mention a connected app", () => {
    expect(JSON.stringify(manifest())).not.toMatch(/Billdu/i);
  });
});

describe("pricing card", () => {
  it("doesn't over-promise that technicians never see a price", () => {
    for (const p of PLANS) for (const f of p.features) expect(f).not.toMatch(/never show prices/i);
  });
});

describe("signup page", () => {
  it("has its own canonical link", () => {
    expect(read("src/app/signup/page.tsx")).toMatch(/publicMetadata\(\{\s*path: "\/signup"/);
  });
});

describe("job stage labels on screen", () => {
  it("lists, cards, map and header use the label, not the raw status", () => {
    for (const f of ["src/components/ProjectsList.tsx", "src/components/ProjectView.tsx", "src/components/JobsMap.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/projectStatusLabel|PROJECT_STATUS_LABEL/);
      expect(src, f).not.toMatch(/>\{(p|project|s)\.status\}<|>Estimate</);
    }
  });
});
