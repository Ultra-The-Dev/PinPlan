// Browser smoke tests (e2e/). CI builds the app once and Playwright starts it with `next start` on a fixed port.
// Locally: `npm run build && npm run e2e`, or point it at a server that is already running:
//   PLAYWRIGHT_BASE_URL=http://localhost:3201 npm run e2e
// Supabase env is cleared so the app runs local-only (no accounts; everything lives in IndexedDB).
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3123);
const external = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.output/results",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "e2e/.output/report", open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: external || `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [{ name: "chromium" }],
  webServer: external
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}/welcome`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
      },
});
