import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/securityHeaders";

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
  // Security headers (CSP, HSTS, …) on every route. See src/lib/securityHeaders.ts for what the CSP allows and why.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          dev: process.env.NODE_ENV === "development",
          vercelPreview: process.env.VERCEL_ENV === "preview",
          reportOnly: process.env.CSP_REPORT_ONLY === "1",
        }),
      },
    ];
  },
};

export default nextConfig;
