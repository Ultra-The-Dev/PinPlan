// Search and sharing plumbing for the public pages: canonical URLs, Open Graph, the sitemap list and the robots rules.
// The origin comes from siteUrl() (NEXT_PUBLIC_SITE_URL, then COMPANY.website) in src/lib/legal.ts.
import type { Metadata, MetadataRoute } from "next";
import { siteUrl } from "@/lib/legal";
import { PLANS, PRODUCT_NAME, TRIAL_DAYS } from "@/lib/plans";

/** One line on what the product is: the Open Graph image, the footer and JSON-LD use it. */
export const TAGLINE = "Plan takeoff, quotes, invoices and field work for electrical, low-voltage and specialty contractors.";

/** The generated share card (src/app/opengraph-image.tsx, 1200 × 630). */
export const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: `${PRODUCT_NAME}: ${TAGLINE}` };

/** Pages people should find from a search engine, most important first. Everything else is the app or a private link. */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
  { path: "/signup", priority: 0.7, changeFrequency: "monthly" },
  { path: "/support", priority: 0.5, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/subprocessors", priority: 0.2, changeFrequency: "monthly" },
  { path: "/legal/dpa", priority: 0.2, changeFrequency: "yearly" },
  { path: "/accessibility", priority: 0.2, changeFrequency: "yearly" },
];

/**
 * Paths crawlers should stay out of: the signed-in app (local-first shells with nothing to index), the API, and the
 * share links sent to clients (/p proposal, /q RFI, /r photo report, /co change order, /d document). Share links are
 * matched as "/p$" and "/p?" so the rule can't also catch /pricing or /privacy (robots rules are prefixes).
 */
export const DISALLOWED_PATHS: string[] = [
  "/api/",
  "/admin",
  "/catalog",
  "/invoices",
  "/jobs",
  "/join",
  "/login",
  "/map",
  "/photos",
  "/products",
  "/project",
  "/reset",
  "/schedule",
  "/settings",
  "/start",
  "/tasks",
  ...["p", "q", "r", "co", "d"].flatMap((s) => [`/${s}$`, `/${s}?`]),
];

/** Metadata for a public page: title, description, canonical link and Open Graph / Twitter cards. */
export function publicMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  return {
    metadataBase: new URL(siteUrl()),
    title,
    description,
    alternates: { canonical: path },
    // Page-level openGraph replaces the inherited one, so the share card (src/app/opengraph-image.tsx) is named here.
    openGraph: { title, description, url: path, type: "website", siteName: PRODUCT_NAME, locale: "en_US", images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [SHARE_IMAGE] },
  };
}

/** schema.org SoftwareApplication with one Offer per plan, for the /pricing page (prices are display prices, USD). */
export function pricingJsonLd(origin = siteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PRODUCT_NAME,
    description: TAGLINE,
    url: `${origin}/`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iPadOS, iOS",
    offers: PLANS.map((p) => ({
      "@type": "Offer",
      name: p.name,
      url: `${origin}/pricing`,
      price: p.basePrice,
      priceCurrency: "USD",
      description: `${TRIAL_DAYS}-day free trial. Includes ${p.includedSeats} users; each extra user is $${p.seatPrice} a month. Plus applicable tax.`,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: p.basePrice,
        priceCurrency: "USD",
        unitText: "MONTH",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
      },
    })),
  };
}

/** A JSON-LD object as <script> content, with "<" escaped so text can't close the tag. */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function robotsRules(origin = siteUrl()): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: [...new Set(["/", ...PUBLIC_PAGES.map((p) => p.path)])], disallow: DISALLOWED_PATHS },
    sitemap: `${origin}/sitemap.xml`,
  };
}

export function sitemapEntries(origin = siteUrl()): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({ url: `${origin}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
