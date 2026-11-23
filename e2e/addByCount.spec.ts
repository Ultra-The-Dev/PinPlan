// Count without pinning ("Add by count", docs/find-similar.md): add 12 windows as ONE pin on a sheet → the takeoff
// counts 12 → Add alarm sensors places one window contact ×12 → the takeoff counts 12 window contacts. Local-only
// (no Supabase). Any console error or uncaught page error fails the test.
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const PDF = path.resolve(__dirname, "../samples/demo-plan-set.pdf");
const IGNORED = [/Download the React DevTools/i];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

type Pin = { deviceTypeId: string; count?: number | null; deleted?: boolean };
/** Placed devices in the editor store (the debug handle the plan canvas exposes for tests and support). */
const pins = (page: Page) =>
  page.evaluate(() => (window as unknown as { __pinplanViewer: { editor: { getState: () => { markers: Pin[] } } } }).__pinplanViewer.editor.getState().markers.filter((m) => !m.deleted).map((m) => ({ deviceTypeId: m.deviceTypeId, count: m.count ?? null })));

const jobSection = (page: Page, name: string) => page.getByRole("navigation", { name: "Job sections" }).getByRole("button", { name, exact: true });

test("add 12 windows by count → takeoff 12 → alarm sensors: one window contact ×12", async ({ page }) => {
  const errors = watchErrors(page);
  page.on("dialog", (d) => void d.accept());

  // A job with the sample plan set.
  await page.goto("/jobs");
  await page.getByRole("button", { name: "New job" }).first().click();
  await page.getByLabel("Job address").fill("12 Window Way");
  await page.getByLabel("Client name").fill("E2E Count Client");
  await page.getByRole("button", { name: /Create & upload plans/ }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan&manage=1/);
  const id = new URL(page.url()).searchParams.get("id")!;
  await page.locator("input[type=file][multiple]").setInputFiles(PDF);
  await page.getByTestId("import-pages-go").click();
  await expect(page.locator('input[aria-label="Sheet name"]')).toHaveCount(4, { timeout: 90_000 });

  // The plan, in Edit.
  await page.goto(`/project?id=${id}&tab=plan`);
  await page.locator("[data-plan-canvas]").waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => (window as unknown as { __pinplanViewer?: { viewport?: { ready?: boolean } } }).__pinplanViewer?.viewport?.ready, null, { timeout: 30_000 });
  await expect(page.getByText("Loading sheet…")).toHaveCount(0, { timeout: 30_000 });
  expect(await pins(page)).toEqual([]);

  // Add by count: Window, 12, Living room.
  await page.getByTestId("add-by-count-button").click();
  const dialog = page.getByTestId("add-by-count");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("count-type-gen-window").click();
  await dialog.getByTestId("count-input").fill("12");
  await dialog.getByTestId("count-room").fill("Living room");
  await expect(dialog.getByTestId("count-place")).toHaveText(/Window ×12/);
  await dialog.getByTestId("count-place").click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => pins(page)).toEqual([{ deviceTypeId: "gen-window", count: 12 }]);
  // The device card shows the count, and it can be changed there.
  await expect(page.getByTestId("marker-count")).toHaveValue("12");

  // Takeoff: 12 windows.
  await jobSection(page, "Takeoff").click();
  const winRow = page.getByRole("row", { name: /^Window \d/ }).first();
  await expect(winRow.locator("td").last()).toHaveText("12");

  // Add alarm sensors: one window contact pin standing for 12.
  await jobSection(page, "Plan").click();
  await page.locator("[data-plan-canvas]").waitFor({ timeout: 30_000 });
  await page.getByTestId("alarm-sensors-button").click();
  await expect(page.getByTestId("alarm-openings")).toContainText("12");
  await expect(page.getByTestId("alarm-summary")).toContainText("12 window contacts");
  await page.getByTestId("alarm-place").click();
  await expect.poll(async () => (await pins(page)).find((m) => m.deviceTypeId === "window-contact")).toEqual({ deviceTypeId: "window-contact", count: 12 });

  await jobSection(page, "Takeoff").click();
  const wcRow = page.getByRole("row", { name: /^Window contact\b/ }).first();
  await expect(wcRow.locator("td").last()).toHaveText("12");

  expect(errors, errors.join("\n")).toEqual([]);
});
