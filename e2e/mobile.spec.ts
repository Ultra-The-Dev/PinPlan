// Phones and tablets with touch: key pages fit the screen (no sideways page scroll), the main actions are
// finger-sized (44×44 CSS px, counting the invisible hit area `.btn` / `.tab` / `.tap` add on touch screens), and
// text fields use 16px text so iOS doesn't zoom into them. Local-only, like smoke.spec.ts.
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

const PDF = path.resolve(__dirname, "../samples/demo-plan-set.pdf");
const MIN = 44;

/** Device descriptors without `defaultBrowserType` (not allowed in test.use inside a describe). */
function device(name: string) {
  const d: Partial<(typeof devices)[string]> = { ...devices[name] };
  delete d.defaultBrowserType;
  return { ...d, hasTouch: true };
}

const PHONES = ["iPhone SE", "iPhone 13", "Pixel 7"];
const TABLETS = ["iPad Mini", "iPad Pro 11 landscape"];

async function noSidewaysScroll(page: Page, where: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `${where}: page is ${sw}px wide in a ${iw}px viewport`).toBeLessThanOrEqual(iw + 1);
}

/** The touch target: the element's box, or its ::after hit area when that is bigger. */
async function targetSize(loc: Locator) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, "::after");
    const hit = a.content && a.content !== "none" && a.position === "absolute";
    return { w: Math.max(r.width, hit ? parseFloat(a.width) || 0 : 0), h: Math.max(r.height, hit ? parseFloat(a.height) || 0 : 0) };
  });
}

async function fingerSized(loc: Locator, what: string) {
  await expect(loc, what).toBeVisible();
  const { w, h } = await targetSize(loc);
  expect(Math.round(w), `${what} is ${Math.round(w)}px wide`).toBeGreaterThanOrEqual(MIN);
  expect(Math.round(h), `${what} is ${Math.round(h)}px tall`).toBeGreaterThanOrEqual(MIN);
}

/** Every visible text field on the page is at least 16px (iOS zooms into smaller ones on focus). */
async function fieldsDontZoom(page: Page, where: string) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("input, select, textarea")]
      .filter((el) => {
        const type = (el as HTMLInputElement).type ?? "";
        if (/^(checkbox|radio|range|file|color|hidden|button|submit)$/.test(type)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && parseFloat(getComputedStyle(el).fontSize) < 16;
      })
      .map((el) => el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.id || el.tagName),
  );
  expect(small, `${where}: fields under 16px`).toEqual([]);
}

async function newJob(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("pinplan.demo", "true"));
  await page.goto("/jobs");
  await fingerSized(page.getByRole("button", { name: "New job" }).first(), "New job");
  await page.getByRole("button", { name: "New job" }).first().click();
  await page.getByLabel("Job address").fill("100 Example Ave");
  await page.getByLabel("Client name").fill("E2E Mobile Client");
  await page.getByRole("button", { name: /Create & upload plans/ }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan&manage=1/);
  return new URL(page.url()).searchParams.get("id")!;
}

async function check(page: Page, url: string, where: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await noSidewaysScroll(page, where);
  await fieldsDontZoom(page, where);
}

for (const name of [...PHONES, ...TABLETS]) {
  const phone = PHONES.includes(name);
  test.describe(`touch: ${name}`, () => {
    test.use(device(name));

    test("pages fit and the main actions are finger-sized", async ({ page }) => {
      for (const p of ["/", "/pricing", "/login", "/signup"]) await check(page, p, p);

      const id = await newJob(page);
      const job = `/project?id=${id}`;

      await check(page, "/jobs", "/jobs");
      const main = page.getByRole("navigation", { name: "Main" });
      for (const label of ["Jobs", "Tasks"]) await fingerSized(main.getByRole("link", { name: label, exact: true }), `header ${label}`);

      await check(page, `${job}&tab=overview`, "job overview");
      await fingerSized(page.getByRole("link", { name: "Back to jobs" }), "Back to jobs");
      const tabs = page.getByRole("navigation", { name: "Job sections" }).filter({ visible: true });
      for (const label of ["Overview", "Plan", "Takeoff", "Field"]) await fingerSized(tabs.getByRole("button", { name: label, exact: true }), `job tab ${label}`);

      await check(page, `${job}&tab=field&section=today`, "field today");
      await fingerSized(page.getByRole("button", { name: /Take photo/ }).first(), "Take photo");
      const field = page.getByRole("navigation", { name: "Field sections" });
      for (const label of ["Today", "Tasks", "Daily log", "Files", "More"]) await fingerSized(field.getByRole("button", { name: label }), `field section ${label}`);

      await check(page, `${job}&tab=field&section=tasks`, "field tasks");
      await fingerSized(page.getByRole("button", { name: "Add task" }).first(), "Add task");
      await fingerSized(page.getByRole("button", { name: /^Mine/ }).first(), "Mine filter");
      await fingerSized(page.getByRole("button", { name: /^Open \d/ }).first(), "Open status chip");

      await check(page, `${job}&tab=field&section=checklists`, "checklists");
      await check(page, `${job}&tab=field&section=logs`, "daily log");
      await check(page, `${job}&tab=field&section=photos`, "job photos");
      await check(page, `${job}&tab=takeoff`, "takeoff");
      await check(page, `${job}&tab=money&step=pricing`, "money pricing");
      await check(page, `${job}&tab=money&step=invoices`, "money invoices");
      await check(page, "/tasks", "/tasks");
      await check(page, "/catalog", "/catalog");
      await check(page, "/invoices", "/invoices");
      await check(page, "/settings", "/settings");
    });

    // The plan needs a real sheet: import the sample set once on the smallest phone and one tablet.
    if (name === "iPhone SE" || name === "iPad Pro 11 landscape") {
      test("plan view: touch-sized controls and no page zoom", async ({ page }) => {
        test.setTimeout(240_000);
        const id = await newJob(page);
        await page.locator("input[type=file][multiple]").setInputFiles(PDF);
        await expect(page.locator('input[aria-label="Sheet name"]')).toHaveCount(4, { timeout: 120_000 });
        await page.goto(`/project?id=${id}&tab=plan`);
        await page.waitForFunction(() => (window as unknown as { __pinplanViewer?: { viewport?: { ready?: boolean } } }).__pinplanViewer?.viewport?.ready, null, { timeout: 30_000 });
        await noSidewaysScroll(page, "plan");
        for (const label of ["Zoom in", "Zoom out"]) await fingerSized(page.getByRole("button", { name: label, exact: true }), label);
        await fingerSized(page.getByRole("button", { name: "Measure takeoff" }), "Measure");
        const tools = page.getByRole("toolbar", { name: "Plan tools" });
        const n = await tools.getByRole("button").count();
        for (let i = 0; i < n; i++) {
          const b = tools.getByRole("button").nth(i);
          if (await b.isVisible()) await fingerSized(b, `plan tool ${(await b.getAttribute("aria-label")) ?? i}`);
        }
        // The plan takes the gestures: the canvas blocks browser panning/zooming, the page never zooms.
        expect(await page.locator("[data-plan-canvas]").evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
        expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
        if (phone) {
          await page.getByRole("button", { name: /^Edit$/ }).first().click();
          await page.getByRole("button", { name: /Devices/ }).first().click();
          const item = page.getByRole("button", { name: /^Indoor camera/ }).first();
          await fingerSized(item, "palette device");
          await fieldsDontZoom(page, "device palette");
        }
      });
    }
  });
}
