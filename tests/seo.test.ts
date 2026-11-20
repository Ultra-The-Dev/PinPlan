// Search and sharing plumbing: site URL, robots rules, sitemap, canonical links, JSON-LD, and client pages that make
// no requests to Google (fonts are self-hosted).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { DISALLOWED_PATHS, jsonLdHtml, pricingJsonLd, PUBLIC_PAGES, publicMetadata, robotsRules, sitemapEntries } from "@/components/marketing/seo";
import { siteUrl } from "@/lib/legal";
import { PLANS } from "@/lib/plans";
import { contentSecurityPolicy } from "@/lib/securityHeaders";

const root = path.resolve(__dirname, "..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

/** Google's robots.txt matching: prefix match, "*" wildcard, "$" end anchor. */
function blocked(url: string, rules: string[]): boolean {
  return rules.some((r) => {
    const anchored = r.endsWith("$");
    const body = (anchored ? r.slice(0, -1) : r)
      .split("*")
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(url);
  });
}

describe("site URL", () => {
  it("prefers NEXT_PUBLIC_SITE_URL, then the Vercel production domain, then localhost", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.com/some/path/" })).toBe("https://example.com");
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "example.com", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://example.com");
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "pinplan-x.vercel.app" })).toBe("https://pinplan-x.vercel.app");
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "  " })).toBe("http://localhost:3000");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});

describe("robots.txt", () => {
  const rules = robotsRules("https://example.com");
  const disallow = ([] as string[]).concat((rules.rules as { disallow?: string | string[] }).disallow ?? []);

  it("points at the sitemap", () => {
    expect(rules.sitemap).toBe("https://example.com/sitemap.xml");
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("keeps every public page crawlable", () => {
    for (const p of PUBLIC_PAGES) expect(blocked(p.path, disallow), p.path).toBe(false);
    // "/" stays crawlable so search engines read its canonical link to /welcome.
    for (const p of ["/", "/privacy", "/pricing", "/.well-known/security.txt"]) expect(blocked(p, disallow), p).toBe(false);
  });

  it("keeps crawlers out of the app, the API and client share links", () => {
    for (const p of ["/api/billdu/sync", "/project?id=1&tab=plan", "/settings", "/catalog", "/admin", "/invoices", "/schedule", "/tasks", "/map", "/photos"])
      expect(blocked(p, disallow), p).toBe(true);
    for (const p of ["/p?t=abc", "/q?t=abc", "/r?t=abc", "/co?t=abc", "/d?t=abc", "/p", "/co"]) expect(blocked(p, disallow), p).toBe(true);
    expect(DISALLOWED_PATHS).not.toContain("/p");
  });
});

describe("sitemap.xml", () => {
  it("lists the public pages, including the legal pages, and nothing blocked by robots", () => {
    const entries = sitemapEntries("https://example.com");
    const urls = entries.map((e) => e.url);
    for (const p of ["/welcome", "/pricing", "/terms", "/privacy", "/support", "/accessibility", "/legal/dpa", "/legal/subprocessors"])
      expect(urls).toContain(`https://example.com${p}`);
    for (const u of urls) expect(blocked(new URL(u).pathname, DISALLOWED_PATHS), u).toBe(false);
    expect(sitemap().length).toBe(PUBLIC_PAGES.length);
  });

  it("every listed page exists", () => {
    for (const p of PUBLIC_PAGES) expect(existsSync(path.join(root, "src/app", p.path, "page.tsx")), p.path).toBe(true);
  });
});

describe("page metadata", () => {
  it("builds a canonical link and Open Graph card from the path", () => {
    const m = publicMetadata({ path: "/pricing", title: "T", description: "D" });
    expect(m.alternates?.canonical).toBe("/pricing");
    expect(m.metadataBase).toBeInstanceOf(URL);
    expect(m.openGraph).toMatchObject({ url: "/pricing", title: "T" });
  });

  it("each public page we own sets its canonical path, and / points at /welcome", () => {
    const owned = PUBLIC_PAGES.filter((p) => p.path !== "/signup");
    for (const p of owned) expect(read(`src/app${p.path}/page.tsx`), p.path).toMatch(new RegExp(`publicMetadata\\(\\{\\s*path: "${p.path}"`));
    expect(read("src/app/page.tsx")).toMatch(/publicMetadata\(\{\s*path: "\/welcome"/);
  });

  it("has a share image", () => {
    expect(existsSync(path.join(root, "src/app/opengraph-image.tsx"))).toBe(true);
  });
});

describe("pricing JSON-LD", () => {
  it("offers every plan in USD at its display price", () => {
    const ld = pricingJsonLd("https://example.com");
    expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.offers).toHaveLength(PLANS.length);
    ld.offers.forEach((o, i) => {
      expect(o.price).toBe(PLANS[i].basePrice);
      expect(o.priceCurrency).toBe("USD");
      expect(o.url).toBe("https://example.com/pricing");
    });
  });

  it("can't close its script tag", () => {
    expect(jsonLdHtml({ a: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});

describe("no Google requests from client pages", () => {
  it("client link pages use the self-hosted font", () => {
    for (const f of ["src/components/rfis/PublicRfi.tsx", "src/components/ClientProposal.tsx", "src/components/photos/ClientPhotoReport.tsx"]) {
      const src = read(f);
      expect(src, f).not.toContain("fonts.googleapis.com");
      expect(src, f).toContain("CLIENT_FONT_FAMILY");
    }
  });

  it("the CSP no longer allows Google Fonts", () => {
    const csp = contentSecurityPolicy({});
    expect(csp).not.toContain("fonts.googleapis.com");
    expect(csp).not.toContain("fonts.gstatic.com");
  });
});

describe("marketing copy", () => {
  const files = ["Landing.tsx", "PricingPage.tsx", "Pricing.tsx", "Site.tsx"].map((f) => `src/components/marketing/${f}`);
  it("makes no Billdu or AI claims, and doesn't overpromise on hidden prices", () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/Billdu/);
      expect(src, f).not.toMatch(/\bAI\b/);
      expect(src, f).not.toMatch(/never (see|show) prices/i);
    }
  });

  it("says prices are USD plus tax", () => {
    expect(read("src/components/marketing/Pricing.tsx")).toContain("USD, plus applicable tax");
    expect(read("src/components/marketing/Landing.tsx")).toContain("USD, plus applicable tax");
  });

  it("has a skip link and a small-screen menu", () => {
    const site = read("src/components/marketing/Site.tsx");
    expect(site).toContain("Skip to content");
    expect(site).toMatch(/aria-controls="site-menu"/);
    expect(read("src/components/legal/LegalDoc.tsx")).toContain("MK_ROOT");
  });
});
