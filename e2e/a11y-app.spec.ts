// Accessibility scan (axe, WCAG 2.1 AA) of the signed-in app on the sample job, local-only, at desktop and phone size.
// Serious and critical violations fail (the public pages in a11y.spec.ts only fail on critical ones); minor and moderate
// ones are attached to the report. Covers the job tabs, the plan with its sheet browser and device card open, the quote
// editor and Settings.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function quiet(page: Page) {
  await page.goto("/offline");
  await page.evaluate(() => {
    localStorage.setItem("pinplan.demo", "true");
    localStorage.setItem("pinplan.lang", "en");
    localStorage.setItem("pinplan.tour", JSON.stringify({ v: 1, tours: {}, tips: {}, tipsOff: true, offerAnswered: true }));
  });
}

async function sampleJob(page: Page): Promise<string> {
  await page.goto("/jobs");
  await page.getByTestId("empty-start-tour").click();
  await page.getByRole("dialog", { name: "Start a job" }).getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan/, { timeout: 60_000 });
  const id = new URL(page.url()).searchParams.get("id")!;
  await page.getByRole("button", { name: /Close the tour/ }).click();
  return id;
}

async function scan(page: Page, info: TestInfo, where: string): Promise<string[]> {
  await page.waitForTimeout(300);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const lines = violations.map((v) => `${where}: ${v.impact ?? "?"}  ${v.id}  ×${v.nodes.length}  ${v.help}`);
  for (const l of lines) info.annotations.push({ type: "axe", description: l });
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${where}: ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}

const planReady = (page: Page) =>
  page.waitForFunction(() => (window as unknown as { __pinplanViewer?: { viewport?: { ready?: boolean } } }).__pinplanViewer?.viewport?.ready, null, { timeout: 30_000 });

for (const vp of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`a11y: app pages (${vp.name})`, async ({ page }, info) => {
    test.setTimeout(300_000);
    page.on("dialog", (d) => void d.accept());
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await quiet(page);
    const id = await sampleJob(page);
    const job = `/project?id=${id}`;
    const bad: string[] = [];
    const pages = [
      "/jobs",
      `${job}&tab=overview`,
      `${job}&tab=takeoff`,
      `${job}&tab=tasks`,
      `${job}&tab=photos`,
      `${job}&tab=money&step=pricing`,
      `${job}&tab=money&step=quote`,
      `${job}&tab=money&step=invoices`,
      `${job}&tab=field&section=today`,
      `${job}&tab=field&section=logs`,
      "/tasks",
      "/settings",
      "/help",
    ];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      bad.push(...(await scan(page, info, path.replace(/id=[^&]+&?/, ""))));
    }

    // Dialogs: New job, New task.
    await page.goto("/jobs");
    await page.getByRole("button", { name: "New job" }).first().click();
    await expect(page.getByRole("dialog", { name: "New job" })).toBeVisible();
    bad.push(...(await scan(page, info, "new job dialog")));
    await page.keyboard.press("Escape");
    await page.goto(`${job}&tab=tasks`);
    await page.getByRole("button", { name: "Add task" }).first().click();
    await expect(page.getByRole("dialog", { name: "New task" })).toBeVisible();
    bad.push(...(await scan(page, info, "new task dialog")));
    await page.keyboard.press("Escape");

    // The plan: view, the sheet browser, Layers, then Edit with "By count" and a device's card open.
    await page.goto(`${job}&tab=plan`);
    await planReady(page);
    bad.push(...(await scan(page, info, "plan")));
    await page.getByTestId("sheet-pill").click();
    bad.push(...(await scan(page, info, "plan: sheet browser")));
    await page.keyboard.press("Escape");
    await page.getByTestId("layers-button").click();
    bad.push(...(await scan(page, info, "plan: layers")));
    await page.keyboard.press("Escape");
    await page.getByTestId("mode-edit").click();
    // On a phone the tool sits in the toolbar's More sheet.
    if (await page.getByTestId("add-by-count-button").isVisible()) await page.getByTestId("add-by-count-button").click();
    else {
      await page.getByTestId("plan-more").click();
      await page.getByRole("button", { name: /^Add by count/ }).click();
    }
    await expect(page.getByTestId("add-by-count")).toBeVisible();
    bad.push(...(await scan(page, info, "plan: by count dialog")));
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
      const ed = (window as unknown as { __pinplanViewer: { editor: { getState: () => { catalog: { id: string; kind: string }[]; addMarker: (t: string, x: number, y: number) => Promise<{ id: string } | null>; select: (s: { table: string; id: string }) => void } } } }).__pinplanViewer.editor;
      const type = ed.getState().catalog.find((d) => d.kind === "device")!;
      const m = await ed.getState().addMarker(type.id, 0.5, 0.5);
      if (m) ed.getState().select({ table: "markers", id: m.id });
    });
    await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
    bad.push(...(await scan(page, info, "plan: device card")));

    // The quote editor.
    await page.goto(`${job}&tab=money&step=pricing`);
    const price = page.getByLabel(/^Unit price: /).filter({ visible: true }).first();
    await price.fill("100");
    await price.press("Tab");
    await page.goto(`${job}&tab=money&step=quote`);
    await page.getByRole("button", { name: /from job pricing/ }).click();
    bad.push(...(await scan(page, info, "new quote dialog")));
    await page.getByRole("button", { name: /^Create (quote|estimate|proposal|bid)$/i }).click();
    await expect(page.getByRole("button", { name: "Finalize", exact: true })).toBeVisible();
    bad.push(...(await scan(page, info, "quote editor")));

    expect(bad).toEqual([]);
  });
}
