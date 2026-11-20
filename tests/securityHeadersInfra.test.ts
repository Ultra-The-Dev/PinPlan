// Deployment configuration that the app's own headers() can't cover: static-asset headers (public/_headers),
// the Worker's public addresses (wrangler.jsonc) and the CI workflows that hold the deploy credentials.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SVG_CSP, securityHeaders, staticAssetHeaderRules, staticAssetHeadersFile } from "@/lib/securityHeaders";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value;

/** Parses the Cloudflare `_headers` format: a path line, then indented `Name: value` lines. */
function parseHeadersFile(text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let cur: Map<string, string> | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      cur = new Map();
      out.set(line.trim(), cur);
    } else if (cur) {
      const i = line.indexOf(":");
      cur.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
    }
  }
  return out;
}

/** Drops // comments from JSONC (none of our strings contain //). */
const jsonc = (text: string) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/([^:"])\/\/.*$/gm, "$1"));

describe("public/_headers (static assets)", () => {
  const file = read("public/_headers");
  const rules = parseHeadersFile(file);

  it("is exactly what staticAssetHeadersFile() generates", () => {
    const body = file.split("\n").filter((l) => !l.startsWith("#")).join("\n");
    expect(body).toBe(staticAssetHeadersFile());
  });

  it("gives every static file the same baseline headers as the pages", () => {
    const all = rules.get("/*")!;
    const pages = securityHeaders({});
    for (const k of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"]) {
      expect(all.get(k), k).toBe(get(pages, k));
    }
    expect(all.get("X-Content-Type-Options")).toBe("nosniff");
    expect(all.get("Strict-Transport-Security")).toMatch(/max-age=\d{8}/);
  });

  it("locks SVGs down: no scripts, no requests", () => {
    expect(SVG_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(rules.get("/*.svg")!.get("Content-Security-Policy")).toBe(SVG_CSP);
    expect(SVG_CSP).not.toMatch(/script-src|unsafe-eval|https:|\*/);
  });

  it("revalidates the service worker on every load", () => {
    expect(rules.get("/sw.js")!.get("Cache-Control")).toBe("no-cache");
    expect(staticAssetHeaderRules().map((r) => r.path)).toEqual(["/*", "/*.svg", "/sw.js"]);
  });
});

describe("wrangler.jsonc", () => {
  const cfg = jsonc(read("wrangler.jsonc"));

  it("serves production only on the custom domain (no workers.dev, no preview URLs)", () => {
    expect(cfg.workers_dev).toBe(false);
    expect(cfg.preview_urls).toBe(false);
    expect(cfg.vars.PINPLAN_ENV).toBe("production");
  });
});

describe("CI workflows", () => {
  const dir = ".github/workflows";
  const workflows = readdirSync(join(root, dir)).filter((f) => /\.ya?ml$/.test(f));

  it("pins every third-party action to a full commit SHA with a version comment", () => {
    for (const f of workflows) {
      for (const m of read(`${dir}/${f}`).matchAll(/uses:\s*([^\s@]+)@(\S+)(.*)$/gm)) {
        const [, action, ref, rest] = m;
        if (action.startsWith("actions/") || action.startsWith("./")) continue;
        expect(ref, `${f}: ${action}`).toMatch(/^[0-9a-f]{40}$/);
        expect(rest, `${f}: ${action}`).toMatch(/#\s*v\d/);
      }
    }
  });

  it("has Dependabot keep the actions up to date", () => {
    expect(read(".github/dependabot.yml")).toMatch(/package-ecosystem:\s*github-actions/);
  });

  describe("cloudflare-deploy.yml", () => {
    const text = read(`${dir}/cloudflare-deploy.yml`);
    const jobHeader = text.slice(text.indexOf("jobs:"), text.indexOf("steps:"));
    const steps = text.slice(text.indexOf("steps:")).split(/\n      - /);
    const stepNamed = (name: string) => steps.find((s) => s.includes(`name: ${name}`)) ?? "";

    it("runs in the production environment", () => {
      expect(jobHeader).toMatch(/^\s+environment:\s*production\s*$/m);
    });

    it("keeps the Cloudflare credentials out of the job env, the install and the build", () => {
      expect(jobHeader).not.toContain("CLOUDFLARE_API_TOKEN");
      expect(jobHeader).not.toContain("CLOUDFLARE_ACCOUNT_ID");
      expect(jobHeader).not.toContain("secrets.");
      for (const s of [stepNamed("Install"), stepNamed("Build (OpenNext)")]) {
        expect(s).toBeTruthy();
        expect(s).not.toContain("secrets.");
      }
      const users = steps.filter((s) => s.includes("secrets.CLOUDFLARE_API_TOKEN")).map((s) => s.match(/name: (.*)/)?.[1]);
      expect(users.sort()).toEqual(["Cloudflare token set?", "Copy server settings into the Worker", "Deploy"].sort());
    });

    it("installs without dependency install scripts and copies the PDF.js worker itself", () => {
      const install = stepNamed("Install");
      expect(install).toContain("npm ci --ignore-scripts");
      expect(install).toContain("node scripts/copy-pdf-worker.mjs");
      expect(text).not.toMatch(/npm ci\s*$/m);
    });
  });

  it("signs iOS builds only in the appstore environment", () => {
    expect(read(`${dir}/ios-testflight.yml`)).toMatch(/^\s+environment:\s*appstore\s*$/m);
  });
});
