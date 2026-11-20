// The money path, end to end in a real browser, local-only (no Supabase):
// new job → import the sample plan set → place 3 devices → takeoff shows 3 → estimate total > 0
// → quote → issue → invoice → PDF download. Any console error or uncaught page error fails the test.
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

test("money path: job → plans → devices → takeoff → estimate → quote → invoice → PDF", async ({ page }) => {
  const errors = watchErrors(page);
  page.on("dialog", (d) => void d.accept());

  // 1. New job.
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Job address").fill("100 Example Ave");
  await page.getByLabel("Client name").fill("E2E Test Client");
  await page.getByRole("button", { name: /Create & upload plans/ }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=sheets/);
  const projectUrl = new URL(page.url());
  const id = projectUrl.searchParams.get("id")!;

  // 2. Import the sample plan set (4 pages).
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
  await page.getByRole("button", { name: "Takeoff", exact: true }).click();
  // The first table is the per-floor count; its last column is the job total.
  const camRow = page.getByRole("row", { name: /^Indoor camera\b/ }).first();
  await expect(camRow.locator("td").last()).toHaveText("3");

  // 5. Estimate prices them.
  await page.getByRole("button", { name: "Estimate", exact: true }).click();
  // A fresh catalog has no prices, so type one in (an override stored on this job only).
  const price = page.getByLabel(/^Unit price: Indoor camera/).filter({ visible: true }).first();
  await price.fill("250");
  await price.press("Tab");
  const total = page.locator("dt", { hasText: /^Total$/ }).locator("xpath=following-sibling::dd[1]");
  await expect(total).toBeVisible();
  await expect.poll(async () => money(await total.textContent())).toBeGreaterThan(0);

  // 6. Quote from the job's pricing, then issue it (local-only: "Issue & number").
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await page.getByRole("button", { name: /from job pricing/ }).click();
  // The quote's name is a setting (it defaults to "Estimate").
  await page.getByRole("button", { name: /^Create (quote|estimate|proposal|bid)$/i }).click();
  await page.getByRole("button", { name: /Issue/ }).click();
  await expect(page.getByText(/issued/).first()).toBeVisible();

  // 7. Invoice from the quote.
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /Create invoice/ }).click();
  await page.getByRole("button", { name: /^Create invoice$/ }).click();
  await expect(page.getByRole("button", { name: /Issue/ })).toBeVisible();
  await page.getByRole("button", { name: /Issue/ }).click();
  await expect(page.getByText(/Invoice .*issued/i).first()).toBeVisible();

  // 8. The invoice PDF downloads and is a real PDF.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^PDF$/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const file = await download.path();
  expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");

  expect(errors, errors.join("\n")).toEqual([]);
});
