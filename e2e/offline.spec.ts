// Offline first load: after one online visit the service worker (public/sw.js, production build only) has the whole
// app, so with no connection /, /jobs and a job open in the person's language (every language is loaded lazily, Russian
// included: src/lib/i18n/dictionaries.ts), shown, not left hidden by the boot script's data-i18n-wait or in English.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/** Demo mode, no tips or tour offer, the app language set like the language switcher does. */
async function quiet(page: Page, lang: string) {
  await page.goto("/offline");
  await page.evaluate((lang) => {
    localStorage.setItem("pinplan.demo", "true");
    localStorage.setItem("pinplan.lang", lang);
    localStorage.setItem("pinplan.tour", JSON.stringify({ v: 1, tours: {}, tips: {}, tipsOff: true, offerAnswered: true }));
  }, lang);
}

/** Wait until the service worker is active, controls the page and has precached the pages used below. */
async function waitForOfflineReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first visit isn't controlled yet (no skipWaiting/claim race): reload once under the worker.
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          for (const k of keys) {
            if (!k.startsWith("pinplan-") || k === "pinplan-meta") continue;
            const c = await caches.open(k);
            const ok = (await c.match("/jobs")) && (await c.match("/project")) && (await c.match("/"));
            if (ok) return true;
          }
          return false;
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
}

/** The page is in `lang` and shown (the boot script's wait is over; it also ends by itself after 2 s, so the tests
 *  below look for translated text too). */
async function expectShownIn(page: Page, lang: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).not.toHaveAttribute("data-i18n-wait", /.*/);
}

async function newJob(page: Page): Promise<string> {
  await page.goto("/jobs");
  await page.getByRole("button", { name: "New job" }).first().click();
  await page.getByLabel("Job address").fill("9 Offline Rd");
  await page.getByRole("button", { name: /Create & upload plans/ }).click();
  await expect(page).toHaveURL(/\/project\?id=.+&tab=plan&manage=1/);
  return new URL(page.url()).searchParams.get("id")!;
}

const CASES = [
  { lang: "ru", newJobText: "Новый объект", jobsText: /Объект/, overview: "Обзор", landing: "Один объект — от первого обхода до итогового счёта" },
  { lang: "es", newJobText: "Nueva obra", jobsText: /Obra/, overview: "Resumen", landing: "Una obra, desde el primer recorrido hasta la factura final" },
];

for (const { lang, newJobText, jobsText, overview, landing } of CASES) {
  // chosenOffline: the language is picked with no connection, so its translations (never downloaded) can only come
  // from the service worker's precache.
  for (const chosenOffline of [false, true]) {
    test(`offline reload shows /, /jobs and a job in ${lang}${chosenOffline ? " (language chosen offline)" : ""}`, async ({ page, context }: { page: Page; context: BrowserContext }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await quiet(page, "en");
      const id = await newJob(page);
      if (!chosenOffline) await page.evaluate((lang) => localStorage.setItem("pinplan.lang", lang), lang);
      await page.goto("/jobs");
      await waitForOfflineReady(page);
      // Visit the job once online too, like a person would.
      await page.goto(`/project?id=${id}&tab=overview`);
      await expectShownIn(page, chosenOffline ? "en" : lang);

      await context.setOffline(true);
      try {
        if (chosenOffline) await page.evaluate((lang) => localStorage.setItem("pinplan.lang", lang), lang);
        const jobs = await page.goto("/jobs");
        // Answered by the service worker (the network really is off).
        expect(jobs?.fromServiceWorker()).toBe(true);
        await expectShownIn(page, lang);
        await expect(page.getByRole("button", { name: newJobText }).first()).toBeVisible();
        await expect(page.getByText(jobsText).first()).toBeVisible();
        await expect(page.getByText("9 Offline Rd").first()).toBeVisible();

        await page.reload();
        await expectShownIn(page, lang);
        await expect(page.getByRole("button", { name: newJobText }).first()).toBeVisible();

        await page.goto(`/project?id=${id}&tab=overview`);
        await expectShownIn(page, lang);
        await expect(page.getByText("9 Offline Rd").first()).toBeVisible();
        await expect(page.getByText(overview, { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Overview", { exact: true })).toHaveCount(0);

        await page.goto("/");
        await expectShownIn(page, lang);
        await expect(page.getByText(landing).first()).toBeVisible();

        // A page that was never saved shows the offline page, not a browser error.
        const res = await page.goto("/no-such-page-offline");
        expect(res?.fromServiceWorker()).toBe(true);
        expect(res?.status()).toBe(200);
        await expectShownIn(page, lang);
      } finally {
        await context.setOffline(false);
      }
      expect(errors).toEqual([]);
    });
  }
}
