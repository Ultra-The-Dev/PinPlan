import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // `npm run test:coverage`. Thresholds guard only the money math (counts, prices, documents); the rest of
    // src/lib is reported but not gated. Raise these as tests are added, don't lower them.
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        "src/lib/takeoff.ts": { statements: 90, branches: 65, functions: 95, lines: 95 },
        "src/lib/estimate.ts": { statements: 85, branches: 75, functions: 85, lines: 88 },
        "src/lib/documents.ts": { statements: 90, branches: 75, functions: 88, lines: 92 },
      },
    },
  },
});
