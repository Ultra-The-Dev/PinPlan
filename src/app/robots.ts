// /robots.txt: crawl the public site, stay out of the app, the API and client share links. Rules in src/components/marketing/seo.ts.
import type { MetadataRoute } from "next";
import { robotsRules } from "@/components/marketing/seo";

export default function robots(): MetadataRoute.Robots {
  return robotsRules();
}
