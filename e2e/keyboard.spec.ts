// Keyboard only (no mouse, no clicks): place devices, open and change the device card, close it with Escape, then price
// the job and create a quote. Local-only like smoke.spec.ts. Focus must stay where a keyboard user can see it: in a
// dialog while it is open, back on the plan when the device card closes, never dropped onto the page body.
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Download the React DevTools/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function quiet(page: Page) {
  await page.goto("/offline");
  await page.evaluate(() => {
    localStorage.setItem("pinplan.demo", "true");
    localStorage.setItem("pinplan.lang", "en");
    localStorage.setItem("pinplan.tour", JSON.stringify({ v: 1, tours: {}, tips: {}, tipsOff: true, offerAnswered: true }));
  });
}

/** What has focus: its accessible-ish name, test id and whether it sits in an open dialog. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { name: "", testId: "", inDialog: false, inAside: false, body: true };
    const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : null;
    const name = (el.getAttribute("aria-label") || label || el.textContent || "").trim().replace(/\s+/g, " ");
    return { name, testId: el.getAttribute("data-testid") ?? "", inDialog: !!el.closest("dialog[open]"), inAside: !!el.closest("aside")?.querySelector('[aria-label="One more"]'), body: false };
  });

/** Press Tab (or Shift+Tab) until the focused element matches, like a keyboard user would. */
async function tabTo(page: Page, match: (f: { name: string; testId: string }) => boolean, what: string, max = 150, back = false) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    if (match(await focused(page))) return;
  }
  throw new Error(`Tab never reached ${what}`);
}

type Ed = { getState: () => { markers: { id: string; count?: number; deleted?: boolean }[]; selection: { id: string } | null } };
const editorState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __pinplanViewer: { editor: Ed } }).__pinplanViewer.editor.getState();
    const live = s.markers.filter((m) => !m.deleted);
    return { n: live.length, sel: s.selection?.id ?? null, counts: live.map((m) => m.count ?? 1) };
  });

test("keyboard only: place devices, change the count on the device card, Escape, price, create a quote", async ({ page }) => {
  const errors = watchErrors(page);
  await quiet(page);

  // A new job with the sample plan set's first page (set up with the mouse; the keyboard part starts on the plan).
  await page.goto("/jobs");
  await page.getByRole("button", { name: "New job" }).first().click();
  await page.getByLabel("Job address").fill("7 Keyboard Ln");
  await page.getByRole("button", { name: /Create & upload plans/ }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan&manage=1/);
  const id = new URL(page.url()).searchParams.get("id")!;
  await page.locator("input[type=file][multiple]").setInputFiles(path.resolve(__dirname, "../samples/demo-plan-set.pdf"));
  await page.getByTestId("import-pages-go").click();
  await expect(page.locator('input[aria-label="Sheet name"]')).toHaveCount(4, { timeout: 90_000 });
  await page.goto(`/project?id=${id}&tab=plan`);
  await page.waitForFunction(() => (window as unknown as { __pinplanViewer?: { viewport?: { ready?: boolean } } }).__pinplanViewer?.viewport?.ready, null, { timeout: 30_000 });
  await expect(page.getByText("Loading sheet…")).toHaveCount(0, { timeout: 30_000 });
  expect((await editorState(page)).n).toBe(0);

  // 1. "By count" opens a dialog with focus already in the number field (not on its Close button).
  await tabTo(page, (f) => f.name === "By count", "the By count button");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("add-by-count")).toBeVisible();
  await expect.poll(async () => (await focused(page)).testId).toBe("count-input");
  // Pick a priced device in the list (type-ahead on the select), back to the number: typing replaces it (it is selected
  // on focus); Enter places the pin and closes the dialog.
  await tabTo(page, (f) => f.testId === "count-type", "the device list", 20, true);
  await page.keyboard.type("Indoor camera");
  await expect(page.getByTestId("count-type")).toHaveValue(/cam/i);
  await tabTo(page, (f) => f.testId === "count-input", "the number field", 10);
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("add-by-count")).toHaveCount(0);
  await expect.poll(async () => (await editorState(page)).counts).toEqual([3]);
  // Focus went back to the button that opened the dialog.
  expect((await focused(page)).name).toBe("By count");

  // 2. The device card is open for the new pin: Tab into it and press "One more".
  const card = page.getByRole("complementary").filter({ has: page.getByRole("button", { name: "One more" }) });
  await expect(card).toBeVisible();
  await tabTo(page, (f) => f.name === "One more", "the card's One more button");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await editorState(page)).counts).toEqual([4]);

  // 3. Escape closes the card from inside it, and focus lands on the plan (not the page body).
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  expect((await editorState(page)).sel).toBeNull();
  const after = await focused(page);
  expect(after.body, "focus fell onto the page body").toBe(false);
  expect(after.testId).toBe("plan-view");

  // 4. An existing device: the floor count lists it by type; expand the type, pick the pin, and its card opens with
  // focus in it. Escape again closes it (the floor count comes back in the same panel, focus stays there).
  await tabTo(page, (f) => /^Indoor camera\s*\d+$/.test(f.name), "Indoor camera in the floor count");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(card).toBeVisible();
  await expect.poll(async () => (await focused(page)).inAside, "focus moved into the device card").toBe(true);
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  expect((await focused(page)).body, "focus fell onto the page body").toBe(false);

  // 5. Money: price the device, then make a quote, all from the keyboard.
  await tabTo(page, (f) => f.name === "Money", "the Money tab", 200, true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/tab=money/);
  await tabTo(page, (f) => /^Unit price: /.test(f.name), "a unit price field");
  await page.keyboard.type("250");
  await page.keyboard.press("Tab");
  await tabTo(page, (f) => /Quote$/.test(f.name), "the Quote step", 200, true);
  await page.keyboard.press("Enter");
  await tabTo(page, (f) => /from job pricing/.test(f.name), "New quote from job pricing");
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  expect((await focused(page)).inDialog, "focus starts inside the dialog").toBe(true);
  await tabTo(page, (f) => /^Create (quote|estimate|proposal|bid)$/i.test(f.name), "Create quote");
  expect((await focused(page)).inDialog, "Tab stays inside the dialog").toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Finalize", exact: true })).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("dialogs: Escape closes, Tab stays inside, focus returns to the opener", async ({ page }) => {
  const errors = watchErrors(page);
  await quiet(page);
  await page.goto("/jobs");
  await tabTo(page, (f) => f.name === "New job", "New job");
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  // The first field has focus (autoFocus), not the first button.
  await expect.poll(async () => (await focused(page)).name).toBe("Job address");
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect((await focused(page)).inDialog, `Tab #${i + 1} left the dialog`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  expect((await focused(page)).name).toBe("New job");
  expect(errors, errors.join("\n")).toEqual([]);
});
