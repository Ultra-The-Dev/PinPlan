import type { NextConfig } from "next";
import { headerRules } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Security headers (CSP, HSTS, COOP, …) on every route, and a stricter CSP for the public client pages
  // (/d, /p, /r, /co, /q). See src/lib/securityHeaders.ts for what the CSP allows and why.
  async headers() {
    return headerRules({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      dev: process.env.NODE_ENV === "development",
      vercelPreview: process.env.VERCEL_ENV === "preview",
      reportOnly: process.env.CSP_REPORT_ONLY === "1",
      turnstile: !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    });
  },
};

export default nextConfig;
