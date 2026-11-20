// Plan sheets, end to end, local-only: the import page picker (pages named from their title blocks, some skipped),
// the sheet names review, the sheet menu on the plan (rename, delete + Undo) and Manage sheets' multi-delete. Then a
// scanned PDF (no text layer): its floor name is read on the device by the self-hosted OCR engine.
// Screenshots go to SHEETS_SHOTS (default e2e/.output/sheets).
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const PDF = path.resolve(__dirname, "../samples/demo-plan-set.pdf");
const SCAN = path.resolve(__dirname, "fixtures/scanned-plan.pdf");
const SHOTS = process.env.SHEETS_SHOTS || path.resolve(__dirname, ".output/sheets");

const IGNORED = [/Download the React DevTools/i];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  if (process.env.SHEETS_DEBUG) page.on("console", (m) => console.log(`[browser] ${m.type()}: ${m.text()}`));
  return errors;
}

async function newJob(page: Page, client: string) {
  await page.goto("/jobs");
  await page.getByRole("button", { name: "New job" }).first().click();
  await page.getByLabel("Job address").fill("12 Maple Ridge Rd");
  await page.getByLabel("Client name").fill(client);
  await page.getByRole("button", { name: /Create & upload plans/ }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan&manage=1/);
  return new URL(page.url()).searchParams.get("id")!;
}

type Store = { getState: () => { sheets: { id: string; name: string; deleted?: boolean }[] } };
const sheetNames = (page: Page) => page.evaluate(() => (window as unknown as { __pinplanViewer?: { editor: Store } }).__pinplanViewer?.editor.getState().sheets.map((s) => s.name) ?? null);
const nameInputs = (page: Page) => page.locator('input[aria-label="Sheet name"]');
const values = (l: ReturnType<Page["locator"]>) => l.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test("import picker names pages, sheet menu renames and deletes, Manage sheets deletes several", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  page.on("dialog", (d) => void d.accept());
  const id = await newJob(page, "E2E Sheets Client");

  // 1. The picker: every page, named from its title block, all ticked.
  await page.locator("input[type=file][multiple]").setInputFiles(PDF);
  const picker = page.getByTestId("import-pages");
  await expect(picker.getByTestId("import-page")).toHaveCount(4, { timeout: 60_000 });
  await expect.poll(() => values(picker.getByTestId("import-name"))).toEqual(["Attic", "1st Fl", "2nd Fl", "Cellar"]);
  await expect(picker.getByText("Read from the page").first()).toBeVisible();
  await expect(picker.locator("img")).toHaveCount(4, { timeout: 30_000 });
  // Skip the cellar; rename the attic.
  await picker.getByTestId("import-keep").nth(3).uncheck({ force: true });
  await picker.getByTestId("import-name").nth(0).fill("Attic storage");
  await expect(page.getByTestId("import-pages-go")).toHaveText("Import 3 pages");
  await page.screenshot({ path: `${SHOTS}/1-import-page-picker.png` });
  // Tap a thumbnail to see the page large.
  await picker.getByRole("button", { name: "Enlarge page 2" }).click();
  await expect(page.getByTestId("import-enlarged").locator("img")).toBeVisible();
  await page.getByTestId("import-enlarged").click();
  await page.getByTestId("import-pages-go").click();

  // 2. The sheet names review (numbers A-101… are on the title blocks); names are already the confirmed ones.
  const review = page.getByRole("dialog", { name: "Review sheet names" });
  await expect(review).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => values(review.getByTestId("review-name"))).toEqual(["Attic storage", "1st Fl", "2nd Fl"]);
  await page.screenshot({ path: `${SHOTS}/2-sheet-names-review.png` });
  await review.getByTestId("review-save").click();
  await expect(nameInputs(page)).toHaveCount(3);
  await expect.poll(() => values(nameInputs(page))).toEqual(["Attic storage", "1st Fl", "2nd Fl"]);

  // 3. The plan's sheet menu: rename in place, then delete with Undo.
  await page.goto(`/project?id=${id}&tab=plan`);
  await page.waitForFunction(() => (window as unknown as { __pinplanViewer?: { viewport?: { ready?: boolean } } }).__pinplanViewer?.viewport?.ready, null, { timeout: 30_000 });
  await page.getByTestId("sheet-menu-button").click();
  const menu = page.getByTestId("sheet-menu");
  await expect(menu.getByRole("menuitem", { name: "Delete sheet" })).toBeVisible();
  await page.waitForTimeout(400); // let the menu finish fading in
  await page.screenshot({ path: `${SHOTS}/3-sheet-pill-menu.png` });
  await menu.getByTestId("sheet-menu-rename").click();
  await menu.getByTestId("sheet-menu-name").fill("Attic");
  await menu.getByTestId("sheet-menu-name").press("Enter");
  await expect(page.getByTestId("sheet-pill")).toContainText("Attic");
  await expect.poll(() => sheetNames(page)).toEqual(["Attic", "1st Fl", "2nd Fl"]);

  await page.getByTestId("sheet-menu-button").click();
  await page.getByTestId("sheet-menu-delete").click();
  await expect.poll(() => sheetNames(page)).toEqual(["1st Fl", "2nd Fl"]);
  await expect(page.getByTestId("sheet-pill")).toContainText("1st Fl");
  await page.getByTestId("toast-action").filter({ hasText: "Undo" }).click();
  await expect.poll(() => sheetNames(page)).toEqual(["Attic", "1st Fl", "2nd Fl"]);

  // 4. Manage sheets: select two, delete them as one step, Undo brings both back.
  // A long press on the pill (touch) opens the same menu.
  const pill = page.getByTestId("sheet-pill");
  await pill.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: 0, clientY: 0 });
  await expect(page.getByTestId("sheet-menu")).toBeVisible();
  await pill.dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true });
  await page.getByTestId("sheet-menu").getByRole("menuitem", { name: "Manage sheets" }).click();
  const drawer = page.getByTestId("manage-sheets-drawer");
  await drawer.getByTestId("select-sheets").click();
  await drawer.getByTestId("sheet-pick").nth(1).check({ force: true });
  await drawer.getByTestId("sheet-pick").nth(2).check({ force: true });
  await expect(drawer.getByText("2 selected")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/4-manage-sheets-multi-delete.png` });
  await drawer.getByTestId("delete-selected").click();
  await expect(drawer.getByTestId("sheet-card")).toHaveCount(1);
  await page.getByTestId("toast-action").filter({ hasText: "Undo" }).click();
  await expect(drawer.getByTestId("sheet-card")).toHaveCount(3);

  expect(errors).toEqual([]);
});

test("a scanned PDF (no text layer) is named by on-device OCR", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await newJob(page, "E2E Scan Client");
  await page.locator("input[type=file][multiple]").setInputFiles(SCAN);
  const picker = page.getByTestId("import-pages");
  await expect(picker.getByTestId("import-page")).toHaveCount(2, { timeout: 60_000 });
  // Read in the background, one page at a time, with the engine loaded from /vendor on first use.
  await expect.poll(() => values(picker.getByTestId("import-name")), { timeout: 150_000 }).toEqual(["1st Fl", "2nd Fl"]);
  await expect(picker.getByText("Read from the scan").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/5-import-scanned-ocr.png` });
  await page.getByTestId("import-pages-go").click();
  await expect.poll(() => values(nameInputs(page)), { timeout: 90_000 }).toEqual(["1st Fl", "2nd Fl"]);
  expect(errors).toEqual([]);
});
