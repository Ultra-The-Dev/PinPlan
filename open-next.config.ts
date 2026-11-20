// Cloudflare Workers build (OpenNext): `npm run cf:build`, `npm run cf:preview`, `npm run cf:deploy`.
// The app's pages are prerendered and nothing revalidates, so the build's prerendered output is served straight from
// Workers static assets (no R2 bucket or KV namespace to set up). See docs/cloudflare.md.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
