// Help center and the guided tour, local-only like smoke.spec.ts: /help searches the guides, a guide shows its
// screenshots, and "Your first job" makes the sample job and walks into it. Any console error fails the test.
import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Download the React DevTools/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test("help center: search the guides and open one", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help and tutorials", level: 1 })).toBeVisible();
  const rows = page.locator(".help-index tbody tr");
  await expect(rows).toHaveCount(10);
  await page.getByRole("searchbox", { name: "Search the guides" }).fill("doors");
  await expect(rows).toHaveCount(1);
  await rows.getByRole("link").click();
  await expect(page).toHaveURL(/\/help\/doors-windows$/);
  const shot = page.getByRole("img", { name: /Find similar showing the doors/ });
  await shot.scrollIntoViewIfNeeded();
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("first-run tour: offer → sample job → plan, and Help can resume it", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/offline");
  await page.evaluate(() => localStorage.setItem("pinplan.demo", "true"));
  await page.goto("/jobs");
  await page.getByTestId("tour-offer").getByRole("button", { name: "Start the tour" }).click();
  const card = page.getByRole("dialog", { name: "Start a job" });
  await expect(card).toBeVisible();
  // The spotlight points at New job.
  await expect(page.locator(".tour-spot")).toBeVisible();
  await card.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan/, { timeout: 60_000 });
  await expect(page.getByRole("dialog", { name: "Upload plans and name pages" })).toBeVisible();
  // Esc closes it for now; Help offers to resume at the same step.
  await page.getByRole("dialog", { name: "Upload plans and name pages" }).getByRole("heading").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour-card")).toHaveCount(0);
  await page.goto("/help");
  await expect(page.getByTestId("tour-start-first-job")).toHaveText(/Resume \(step 2 of 10\)/);
  // The sample job is on the jobs list.
  await page.goto("/jobs");
  await expect(page.getByText("Sample job · 12 Example St")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});
