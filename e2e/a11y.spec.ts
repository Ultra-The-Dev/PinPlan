// Accessibility scan (axe) of the public pages. Critical violations fail the test; the rest are attached to the
// report as a list to work through, so a new page can't ship with a critical problem but the backlog doesn't block CI.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/pricing", "/login", "/signup"];

for (const path of PAGES) {
  test(`a11y: ${path}`, async ({ page }, info) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const lines = violations.map((v) => `${v.impact ?? "?"}  ${v.id}  ×${v.nodes.length}  ${v.help}`);
    if (lines.length) await info.attach("axe-violations.txt", { body: lines.join("\n"), contentType: "text/plain" });
    for (const l of lines) info.annotations.push({ type: "axe", description: l });
    const critical = violations.filter((v) => v.impact === "critical");
    expect(critical.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
  });
}
