// Everyday job screens, local-only like smoke.spec.ts: Overview's numbers match the tabs they open, empty states lead
// somewhere, the job header fits a desktop screen in a long language, and translated statuses read as statuses.
// Any console error fails a test.
import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Download the React DevTools/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Demo mode, no tips or tour offer; `lang` is the app language (localStorage, as the language switcher saves it). */
async function quiet(page: Page, lang = "en") {
  await page.goto("/offline");
  await page.evaluate((lang) => {
    localStorage.setItem("pinplan.demo", "true");
    localStorage.setItem("pinplan.lang", lang);
    localStorage.setItem("pinplan.tour", JSON.stringify({ v: 1, tours: {}, tips: {}, tipsOff: true, offerAnswered: true }));
  }, lang);
}

async function newJob(page: Page) {
  await page.goto("/jobs");
  await page.getByRole("button", { name: "New job" }).first().click();
  await page.getByLabel("Job address").fill("22 Overview Ave");
  await page.getByRole("button", { name: /Create & upload plans/ }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan&manage=1/);
  return new URL(page.url()).searchParams.get("id")!;
}

async function addTask(page: Page, title: string, status?: string) {
  await page.getByRole("button", { name: "Add task" }).first().click();
  const dlg = page.getByRole("dialog", { name: "New task" });
  await dlg.getByLabel("Title").fill(title);
  if (status) await dlg.getByRole("button", { name: status, exact: true }).click();
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(dlg).toBeHidden();
}

test("Overview counts the Tasks tab's open tasks and opens them", async ({ page }) => {
  const errors = watchErrors(page);
  page.on("dialog", (d) => void d.accept());
  await quiet(page);
  const id = await newJob(page);
  const job = `/project?id=${id}`;

  await page.goto(`${job}&tab=tasks`);
  await addTask(page, "Pull cable to the gate camera");
  // A completed task no longer counts.
  await addTask(page, "Label the patch panel", "Completed");

  await page.goto(`${job}&tab=overview`);
  const stat = page.getByRole("link", { name: /Open tasks/ });
  await expect(stat).toContainText("1");
  await stat.click();
  await expect(page).toHaveURL(/tab=tasks/);
  await expect(page).toHaveURL(/tf=/);
  await expect(page.getByText("Pull cable to the gate camera")).toBeVisible();
  await expect(page.getByText("Label the patch panel")).toHaveCount(0);

  // No devices yet: the quote's empty state says why "New quote" is off and opens the plan.
  await page.goto(`${job}&tab=money&step=quote`);
  await expect(page.getByText("Place devices and price the job first")).toBeVisible();
  await page.getByTestId("quote-empty-plan").click();
  await expect(page).toHaveURL(/tab=plan/);

  // The history shows only the filters that have something (no Billdu chip on a job that never used it).
  await page.goto(`${job}&tab=field&section=timeline`);
  await expect(page.getByText("Job created")).toBeVisible();
  await expect(page.getByRole("button", { name: "Billdu", exact: true })).toHaveCount(0);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("translated: the task status reads as a status, and the job header fits a desktop screen", async ({ page }) => {
  const errors = watchErrors(page);
  page.on("dialog", (d) => void d.accept());
  await quiet(page);
  // The sample job (it has a plan sheet, so the plan tab's header also shows Manage sheets).
  await page.goto("/jobs");
  await page.getByTestId("empty-start-tour").click();
  await page.getByRole("dialog", { name: "Start a job" }).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan/, { timeout: 60_000 });
  const id = new URL(page.url()).searchParams.get("id")!;
  await page.getByRole("button", { name: /Close the tour/ }).click();
  // A long job name (the header gives it the room that's left, cut short with "…").
  await page.goto(`/project?id=${id}&tab=overview`);
  await page.getByLabel("Job address").fill("1450 West Riverside Industrial Parkway, Building C");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("job-name")).toHaveText("1450 West Riverside Industrial Parkway, Building C");
  await page.goto(`/project?id=${id}&tab=tasks`);
  await addTask(page, "Mount the keypad");
  await page.evaluate(() => localStorage.setItem("pinplan.lang", "pl"));
  await page.reload();
  // "Open" as a task status is "Otwarte" (open), not "Otwórz" (the verb).
  await expect(page.getByText("Otwarte", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Otwórz", { exact: true })).toHaveCount(0);

  // A long language: nothing runs off the right edge of the job header.
  await page.evaluate(() => localStorage.setItem("pinplan.lang", "vi"));
  for (const width of [1024, 1194, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ["overview", "plan"]) {
      await page.goto(`/project?id=${id}&tab=${tab}`);
      await page.waitForLoadState("networkidle");
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(sw, `${tab} at ${width}px: page is ${sw}px wide`).toBeLessThanOrEqual(iw + 1);
      // The name keeps some room (the tabs move to a second row before it is squeezed away).
      const nameWidth = await page.getByTestId("job-name").evaluate((el) => el.getBoundingClientRect().width);
      expect(nameWidth, `${tab} at ${width}px: job name is ${Math.round(nameWidth)}px wide`).toBeGreaterThanOrEqual(80);
    }
  }
  expect(errors, errors.join("\n")).toEqual([]);
});
