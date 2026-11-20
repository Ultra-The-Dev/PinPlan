// The legal launch gate (scripts/check-legal.mjs, run before every build): placeholders live only in src/lib/legal.ts,
// production builds fail while any remain, and AI wording / the AI subprocessor only appear while AI is switched on.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkLegal, pagePlaceholders, scanText, securityTxtProblems, sourcePlaceholders, strictMode } from "../scripts/check-legal.mjs";
import { activeSubprocessors, ALL_SUBPROCESSORS, COMPANY, isPlaceholder, LEGAL_EFFECTIVE_DATE, legalPlaceholders, RETENTION, SUBPROCESSORS } from "@/lib/legal";

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts/check-legal.mjs");

function runScript(env: Record<string, string>): number {
  try {
    execFileSync(process.execPath, [script], { env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

describe("legal placeholders", () => {
  it("are never typed straight into a legal page: values come from src/lib/legal.ts", () => {
    expect(pagePlaceholders(root)).toEqual([]);
  });

  it("the script finds exactly the placeholders legal.ts reports", () => {
    expect(sourcePlaceholders(root).length).toBe(legalPlaceholders().length);
  });

  it("recognises placeholders, and leaves class names, arrays and comments alone", () => {
    expect(isPlaceholder("[Company legal name]")).toBe(true);
    expect(isPlaceholder("Acme Wiring LLC")).toBe(false);
    expect(isPlaceholder(30)).toBe(false);
    const code = [
      `const a = "[Company legal name]";`,
      `<Ph>[35]</Ph> and <span>[time zone]</span>`,
      `className="[&_h2]:mt-12 [&_p]:mt-4"`,
      `const list = ["One", "Two"];`,
      `// a "[comment]" is fine`,
      ` * also "[fine]" in a block comment`,
    ].join("\n");
    expect(scanText("x.tsx", code).map((h) => h.text)).toEqual([`"[Company legal name]"`, "[35]", "[time zone]"]);
    expect(scanText("security.txt", "# [comment]\nContact: mailto:[Security email]", "plain").map((h) => h.text)).toEqual(["[Security email]"]);
  });

  it("security.txt exists and its Expires date is valid and in the future", () => {
    const problems = securityTxtProblems(root).filter((p) => !p.text.startsWith("["));
    expect(problems).toEqual([]);
    expect(securityTxtProblems(root, new Date("2100-01-01")).some((p) => /in the past/.test(p.text))).toBe(true);
    expect(readFileSync(path.join(root, "public/.well-known/security.txt"), "utf8")).toMatch(/^Contact: mailto:/m);
  });

  it("only LEGAL_CHECK=strict builds fail (production deploys warn until launch day)", () => {
    expect(strictMode({ VERCEL_ENV: "production" })).toBe(false);
    expect(strictMode({ LEGAL_CHECK: "strict" })).toBe(true);
    expect(strictMode({ VERCEL_ENV: "preview" })).toBe(false);
    expect(strictMode({})).toBe(false);
  });

  it("the prebuild script warns outside production and fails a production build while placeholders remain", () => {
    expect(runScript({})).toBe(0);
    expect(runScript({ VERCEL_ENV: "preview" })).toBe(0);
    expect(runScript({ VERCEL_ENV: "production" })).toBe(0);
    expect(runScript({ LEGAL_CHECK: "strict" })).toBe(checkLegal(root).length > 0 ? 1 : 0);
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toContain("scripts/check-legal.mjs");
  });

  // The launch gate itself: runs with LEGAL_CHECK=strict, where every value must be real.
  it.runIf(strictMode())("nothing is left to fill in (launch gate)", () => {
    expect(legalPlaceholders()).toEqual([]);
    expect(isPlaceholder(LEGAL_EFFECTIVE_DATE)).toBe(false);
    for (const v of Object.values(COMPANY)) expect(isPlaceholder(v)).toBe(false);
    expect(checkLegal(root)).toEqual([]);
  });
});

describe("legal facts", () => {
  it("lists the AI provider as a subprocessor only while AI is on", () => {
    const anthropic = ALL_SUBPROCESSORS.find((s) => s.onlyWhen === "ai");
    expect(anthropic).toBeTruthy();
    expect(activeSubprocessors(false)).not.toContain(anthropic);
    expect(activeSubprocessors(true)).toContain(anthropic);
    // AI is off for launch (src/lib/features.ts).
    expect(SUBPROCESSORS.some((s) => s.onlyWhen === "ai")).toBe(false);
  });

  it("promises a deletion window for written requests (there is no automatic purge yet)", () => {
    expect(RETENTION.deletionRequestDays).toBeGreaterThan(0);
    expect(RETENTION.deletionRequestDays).toBeLessThanOrEqual(45);
    const privacy = readFileSync(path.join(root, "src/app/privacy/page.tsx"), "utf8");
    expect(privacy).toContain("RETENTION.deletionRequestDays");
    expect(privacy).not.toMatch(/30 days after a subscription ends/);
  });

  it("keeps AI wording behind AI_ENABLED on the legal pages", () => {
    for (const f of ["src/app/privacy/page.tsx", "src/app/terms/page.tsx", "src/app/support/page.tsx"]) {
      const src = readFileSync(path.join(root, f), "utf8");
      expect(src, f).toContain("AI_ENABLED");
      // Every mention of the AI provider sits in a section opened by an AI_ENABLED guard, or in an FAQ entry marked onlyWhen "ai".
      for (const m of src.matchAll(/Anthropic/g)) {
        const before = src.slice(0, m.index);
        const inGuardedSection = before.lastIndexOf("AI_ENABLED &&") > before.lastIndexOf("</Section>");
        const inAiFaq = src.slice(m.index, src.indexOf("}", m.index)).includes('onlyWhen: "ai"');
        expect(inGuardedSection || inAiFaq, `${f}: Anthropic mentioned outside an AI_ENABLED guard`).toBe(true);
      }
    }
  });

  it("names every kind of Customer Data the product holds", () => {
    const terms = readFileSync(path.join(root, "src/app/terms/page.tsx"), "utf8");
    const privacy = readFileSync(path.join(root, "src/app/privacy/page.tsx"), "utf8");
    for (const word of ["quotes", "invoices", "payment records", "RFIs", "change orders", "forms", "schedules", "daily reports"]) {
      expect(terms, word).toContain(word);
      expect(privacy, word).toContain(word);
    }
    expect(privacy).toContain('id="cookies"');
    expect(privacy).not.toMatch(/Google Fonts/);
  });
});
