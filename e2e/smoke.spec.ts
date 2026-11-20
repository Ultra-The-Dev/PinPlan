// The money path, end to end in a real browser, local-only (no Supabase):
// new job → import the sample plan set → place 3 devices → takeoff shows 3 → Money › Pricing total > 0
// → quote → finalize → invoice → finalize → PDF download. Any console error or uncaught page error fails the test.
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";

const PDF = path.resolve(__dirname, "../samples/demo-plan-set.pdf");

/** Console noise that isn't an app error. Keep this list short and specific. */
const IGNORED = [/Download the React DevTools/i];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Placed devices in the editor store (the debug handle the plan canvas exposes for tests and support). */
const markerCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __pinplanViewer: { editor: { getState: () => { markers: unknown[] } } } }).__pinplanViewer.editor.getState().markers.length);

const money = (s: string | null) => Number((s ?? "").replace(/[^0-9.-]/g, ""));

test("money path: job → plans → devices → takeoff → pricing → quote → invoice → PDF", async ({ page }) => {
  const errors = watchErrors(page);
  page.on("dialog", (d) => void d.accept());

  // 1. New job.
  await page.goto("/jobs");
  await page.getByRole("button", { name: "New job" }).first().click();
  await page.getByLabel("Job address").fill("100 Example Ave");
  await page.getByLabel("Client name").fill("E2E Test Client");
  await page.getByRole("button", { name: /Create & upload plans/ }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan&manage=1/);
  const projectUrl = new URL(page.url());
  const id = projectUrl.searchParams.get("id")!;

  // 2. Import the sample plan set (4 pages) on Plan › manage sheets.
  await page.locator("input[type=file][multiple]").setInputFiles(PDF);
  await expect(page.locator('input[aria-label="Sheet name"]')).toHaveCount(4, { timeout: 90_000 });

  // 3. Place 3 devices on the first sheet.
  await page.goto(`/project?id=${id}&tab=plan`);
  const canvas = page.locator("[data-plan-canvas]");
  await canvas.waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => (window as unknown as { __pinplanViewer?: { viewport?: { ready?: boolean } } }).__pinplanViewer?.viewport?.ready, null, { timeout: 30_000 });
  await expect(page.getByText("Loading sheet…")).toHaveCount(0, { timeout: 30_000 });
  expect(await markerCount(page)).toBe(0);
  await page.getByRole("button", { name: /^Indoor camera/ }).first().click();
  const box = (await canvas.boundingBox())!;
  for (const [fx, fy] of [
    [0.35, 0.4],
    [0.5, 0.5],
    [0.65, 0.6],
  ]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(250);
  }
  await expect.poll(() => markerCount(page)).toBe(3);
  await page.keyboard.press("Escape");

  // 4. Takeoff counts exactly the placed devices.
  await page.getByRole("navigation", { name: "Job sections" }).getByRole("button", { name: "Takeoff", exact: true }).click();
  // The first table is the per-floor count; its last column is the job total.
  const camRow = page.getByRole("row", { name: /^Indoor camera\b/ }).first();
  await expect(camRow.locator("td").last()).toHaveText("3");

  // 5. Money › Pricing prices them.
  await page.getByRole("navigation", { name: "Job sections" }).getByRole("button", { name: "Money", exact: true }).click();
  const steps = page.getByRole("navigation", { name: "Money steps" });
  await expect(steps.getByRole("button", { name: /Pricing$/ })).toHaveAttribute("aria-current", "step");
  // A fresh catalog has no prices, so type one in (an override stored on this job only).
  const price = page.getByLabel(/^Unit price: Indoor camera/).filter({ visible: true }).first();
  await price.fill("250");
  await price.press("Tab");
  const total = page.locator("dt", { hasText: /^Total$/ }).locator("xpath=following-sibling::dd[1]");
  await expect(total).toBeVisible();
  await expect.poll(async () => money(await total.textContent())).toBeGreaterThan(0);

  // 6. Quote from the job's pricing, then finalize it (gives it a number; local-only it is then "ready to send").
  await steps.getByRole("button", { name: /Quote$/ }).click();
  await page.getByRole("button", { name: /from job pricing/ }).click();
  // The quote's name is a setting (it defaults to "Quote").
  await page.getByRole("button", { name: /^Create (quote|estimate|proposal|bid)$/i }).click();
  await page.getByRole("button", { name: "Finalize", exact: true }).click();
  await expect(page.getByText(/finalized/).first()).toBeVisible();

  // 7. Invoice from the quote.
  // "More" is a disclosure list of plain buttons (not an ARIA menu).
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Create invoice…", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Create invoice$/ }).click();
  await expect(page.getByRole("button", { name: "Finalize", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finalize", exact: true }).click();
  await expect(page.getByText(/Invoice .*finalized/i).first()).toBeVisible();

  // 8. The invoice PDF downloads and is a real PDF.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^PDF$/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const file = await download.path();
  expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");

  expect(errors, errors.join("\n")).toEqual([]);
});
