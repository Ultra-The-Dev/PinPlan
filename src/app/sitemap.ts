// /sitemap.xml: the public pages only (list in src/components/marketing/seo.ts). No lastModified: the pages are
// prerendered and a build-time date would claim every page changed on every deploy.
import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/components/marketing/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
