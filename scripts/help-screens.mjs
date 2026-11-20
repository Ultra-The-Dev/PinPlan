// Screenshots for the Help center (public/help/*.webp), taken from the real app with the sample job, English UI.
// Other languages show the same pictures (docs/help-and-tours.md).
//
//   npm run build                                   (with NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY empty: local-only)
//   node scripts/help-screens.mjs                   (starts `next start` on a free port)
//   HELP_BASE_URL=http://localhost:3301 node scripts/help-screens.mjs   (an app that's already running)
//
// Desktop shots are 1280 × 800, phone shots 390 × 844 at 2× (src/lib/help/guides.ts SHOT_SIZE). Each is converted
// to WebP in the browser (no image library needed) and kept small; the whole folder stays well under 3 MB.
import { chromium, devices } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public", "help");
const PORT = Number(process.env.HELP_PORT || 3317);
const external = process.env.HELP_BASE_URL;
const BASE = external || `http://localhost:${PORT}`;
const QUALITY = { desktop: 0.72, phone: 0.68 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, ms = 120_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`no server at ${url}`);
}

/** PNG bytes → WebP file, encoded by the browser. */
async function saveWebp(converter, png, name, quality) {
  const b64 = png.toString("base64");
  const dataUrl = await converter.evaluate(
    async ({ b64, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      return c.toDataURL("image/webp", quality);
    },
    { b64, quality },
  );
  const file = path.join(OUT, `${name}.webp`);
  writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`  ${name}.webp  ${(statSync(file).size / 1024).toFixed(0)} KB`);
}

/** Quiet first-run things (the tour offer, one-time tips) so the pictures show the screen itself. */
async function quiet(page) {
  await page.goto(`${BASE}/offline`);
  await page.evaluate(() => {
    localStorage.setItem("pinplan.demo", "true");
    localStorage.setItem("pinplan.lang", "en");
    localStorage.setItem("pinplan.tour", JSON.stringify({ v: 1, tours: {}, tips: {}, tipsOff: true, offerAnswered: true }));
    localStorage.setItem("pinplan.onboarding", JSON.stringify({ dismissed: true }));
  });
}

/** Close every toast ("Quote finalized…") so it doesn't cover the screen. */
async function noToasts(page) {
  for (let i = 0; i < 6; i++) {
    const b = page.getByRole("button", { name: "Dismiss", exact: true }).first();
    if (!(await b.isVisible().catch(() => false))) break;
    await b.click().catch(() => undefined);
    await page.waitForTimeout(150);
  }
}

const viewerReady = (page) =>
  page.waitForFunction(() => window.__pinplanViewer?.viewport?.ready, null, { timeout: 60_000 }).then(() => page.waitForTimeout(800));

async function main() {
  mkdirSync(OUT, { recursive: true });
  let server = null;
  if (!external) {
    server = spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: root,
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", PINPLAN_ALLOW_OPEN: "1" },
      stdio: "ignore",
    });
  }
  const browser = await chromium.launch();
  try {
    await waitForServer(`${BASE}/offline`);
    const converter = await (await browser.newContext()).newPage();
    const shot = async (page, name, kind, opts = {}) => {
      await noToasts(page);
      await saveWebp(converter, await page.screenshot({ type: "png", ...opts }), name, QUALITY[kind]);
    };

    // ---------- desktop ----------
    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: "en-US" });
    const page = await desk.newPage();
    page.on("dialog", (d) => void d.accept());
    await quiet(page);

    // New job form.
    await page.goto(`${BASE}/jobs`);
    await page.getByRole("button", { name: "New job" }).first().click();
    await page.getByLabel("Job address").fill("12 Example St");
    await page.getByLabel("Client name").fill("Dana Whitfield");
    await page.waitForTimeout(300);
    await shot(page, "new-job", "desktop");
    await page.getByRole("button", { name: "Cancel" }).click();

    // The sample job (the same one the tours make), then close the tour it starts.
    await page.getByTestId("empty-start-tour").click();
    // Step 1 points at New job on this page; Next opens the sample job.
    await page.getByRole("dialog", { name: "Start a job" }).getByRole("button", { name: "Next" }).click();
    await page.waitForURL(/\/project\?id=/, { timeout: 60_000 });
    const id = new URL(page.url()).searchParams.get("id");
    await page.getByRole("button", { name: /Close the tour/ }).click();
    const job = `${BASE}/project?id=${id}`;

    // Choose and name pages: what you see right after uploading a PDF (names read from each page). Cancelled, so the
    // sample job keeps its one sheet.
    await page.goto(`${job}&tab=plan`);
    await viewerReady(page);
    await page.getByTestId("manage-sheets-open").click();
    await page.locator("input[type=file][multiple]").first().setInputFiles(path.join(root, "samples", "demo-plan-set.pdf"));
    await page.getByTestId("import-pages").waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="import-name"]')].length > 0 && [...document.querySelectorAll('[data-testid="import-name"]')].every((el) => el.value || el.placeholder !== "Reading…"), null, { timeout: 60_000 });
    // Skip the last page (as if it were the specs), so the picture shows a page left out.
    const keeps = page.getByTestId("import-keep");
    if ((await keeps.count()) > 2) await keeps.last().evaluate((el) => el.click());
    await page.waitForTimeout(2500);
    await shot(page, "pages", "desktop");
    await page.getByRole("button", { name: "Cancel import" }).click();
    await page.goto(`${job}&tab=plan`);
    await viewerReady(page);

    // Place a few devices.
    await page.getByRole("button", { name: /^Edit$/ }).first().click();
    await page.waitForTimeout(500);
    const canvas = page.locator("[data-plan-canvas]");
    const box = await canvas.boundingBox();
    const place = async (name, spots) => {
      await page.getByRole("button", { name }).first().click();
      for (const [fx, fy] of spots) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(150);
      }
      await page.keyboard.press("Escape");
    };
    await place(/^Indoor camera/, [
      [0.3, 0.35],
      [0.55, 0.4],
      [0.42, 0.62],
    ]);
    await place(/^Motion/, [
      [0.36, 0.5],
      [0.62, 0.55],
    ]);
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.1);
    // Closer in, so the devices read at this size.
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.waitForTimeout(700);
    await shot(page, "plan-edit", "desktop");

    // Find similar: read the door tags, accept; then the windows.
    const findSimilar = async (type) => {
      if (!(await page.getByTestId("find-type").isVisible().catch(() => false))) await page.getByTestId("find-similar-button").click();
      await page.getByTestId("find-type").selectOption({ label: type });
      await page.getByRole("radio", { name: "Read tags" }).click();
      await page.getByTestId("find-read-tags").click();
      await page.getByTestId("find-results").waitFor({ timeout: 30_000 });
      await page.waitForTimeout(600);
    };
    await findSimilar("Door");
    await shot(page, "find-similar", "desktop");
    await page.getByTestId("find-accept-all").click();
    await page.waitForTimeout(400);
    await findSimilar("Window");
    await page.getByTestId("find-accept-all").click();
    await page.waitForTimeout(400);

    // Add alarm sensors.
    await page.getByTestId("alarm-sensors-button").click();
    await page.waitForTimeout(1200);
    await shot(page, "sensors", "desktop");
    await page.getByRole("button", { name: /^Place \d+ sensors?$/ }).click();
    await page.waitForTimeout(500);

    // A camera with a photo and a task: its card shows "1 photo" and "1 task" (they open the Photos and Tasks tabs).
    const camId = await page.evaluate(() => {
      const st = window.__pinplanViewer.editor.getState();
      const cam = st.catalog.find((d) => /^Indoor camera/.test(d.name));
      return st.markers.find((m) => !m.deleted && m.deviceTypeId === cam?.id)?.id ?? null;
    });
    if (camId) {
      const planPng = await page.screenshot({ type: "png" });
      await page.goto(`${job}&tab=photos&device=${camId}`);
      await page.locator('input[type=file][accept="image/*"][multiple]').first().setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: planPng });
      await page.getByTestId("photo-device-filter").waitFor();
      await page.waitForTimeout(1500);
      await page.goto(`${job}&tab=tasks&tf=${encodeURIComponent(`dv:${camId}`)}`);
      await page.getByRole("button", { name: "Add task" }).first().click();
      const dlg = page.getByRole("dialog", { name: "New task" });
      await dlg.getByLabel("Title").fill("Aim the camera at the gate");
      await dlg.getByRole("button", { name: "Save" }).click();
      await page.waitForTimeout(800);
      await page.goto(`${job}&tab=plan`);
      await viewerReady(page);
      await page.evaluate((id) => window.__pinplanViewer.editor.getState().select({ table: "markers", id }), camId);
      await page.getByTestId("device-links").waitFor({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await shot(page, "device-links", "desktop");
      await page.keyboard.press("Escape");
    }

    // Takeoff.
    await page.goto(`${job}&tab=takeoff`);
    await page.locator('[data-tour="takeoff-table"]').waitFor();
    await page.waitForTimeout(600);
    await shot(page, "takeoff", "desktop");

    // Pricing: give the cameras and sensors a price on this job.
    await page.goto(`${job}&tab=money&step=pricing`);
    const prices = [
      [/^Unit price: Indoor camera/, "250"],
      [/^Unit price: Motion/, "65"],
      [/^Unit price: Door contact/, "35"],
      [/^Unit price: Window contact/, "35"],
    ];
    for (const [label, v] of prices) {
      const f = page.getByLabel(label).filter({ visible: true }).first();
      if (await f.count()) {
        await f.fill(v);
        await f.press("Tab");
      }
    }
    await page.waitForTimeout(600);
    await shot(page, "pricing", "desktop");

    // Quote: from the job's pricing, finalized.
    const steps = page.getByRole("navigation", { name: "Money steps" });
    await steps.getByRole("button", { name: /Quote$/ }).click();
    await page.getByRole("button", { name: /from job pricing/ }).click();
    await page.getByRole("button", { name: /^Create (quote|estimate|proposal|bid)$/i }).click();
    await page.getByRole("button", { name: "Finalize", exact: true }).click();
    await page.getByText(/finalized/).first().waitFor();
    await page.waitForTimeout(800);
    await shot(page, "quote", "desktop");

    // Invoice from the quote, finalized.
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Create invoice…", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Create invoice$/ }).click();
    await page.getByRole("button", { name: "Finalize", exact: true }).click();
    await page.getByText(/Invoice .*finalized/i).first().waitFor();
    await page.waitForTimeout(800);
    await shot(page, "invoice", "desktop");

    // The account menu with the languages.
    await page.goto(`${BASE}/jobs`);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.waitForTimeout(400);
    await shot(page, "languages", "desktop");

    // ---------- phone ----------
    const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
    void _ignored;
    const phoneCtx = await browser.newContext({ ...iphone, deviceScaleFactor: 2, locale: "en-US" });
    // The same device data: copy this job through the app's own backup? Simpler: the phone context shares nothing, so
    // build its own sample job the same way.
    const phone = await phoneCtx.newPage();
    phone.on("dialog", (d) => void d.accept());
    await quiet(phone);
    await phone.goto(`${BASE}/jobs`);
    await phone.getByTestId("empty-start-tour").click();
    await phone.getByRole("dialog", { name: "Start a job" }).getByRole("button", { name: "Next" }).click();
    await phone.waitForURL(/\/project\?id=/, { timeout: 60_000 });
    const pid = new URL(phone.url()).searchParams.get("id");
    await phone.getByRole("button", { name: /Close the tour/ }).click();
    const pjob = `${BASE}/project?id=${pid}`;

    await phone.goto(`${pjob}&tab=plan`);
    await viewerReady(phone);
    await phone.getByRole("button", { name: /^Edit$/ }).first().click();
    await phone.waitForTimeout(600);
    await shot(phone, "plan-phone", "phone");

    // A task for the crew, in the job's Tasks tab (bottom bar: Plan · Tasks · Photos · Money · More).
    await phone.goto(`${pjob}&tab=tasks`);
    for (const title of ["Mount the camera over the front door", "Run Cat6 to the office", "Label the panel"]) {
      await phone.getByRole("button", { name: "Add task" }).first().click();
      const dialog = phone.getByRole("dialog", { name: "New task" });
      await dialog.getByLabel("Title").fill(title);
      await dialog.getByRole("button", { name: "Save" }).click();
      await phone.waitForTimeout(600);
    }
    await noToasts(phone);
    await phone.waitForTimeout(500);
    await shot(phone, "crew-tasks", "phone");

    // Photos: the job's photos with one photo in it (a picture of the plan stands in for a site photo).
    await phone.goto(`${pjob}&tab=photos`);
    await phone.waitForTimeout(1000);
    const input = phone.locator('input[type=file][accept*="image"]').first();
    if (await input.count()) {
      await input.setInputFiles({ name: "site.png", mimeType: "image/png", buffer: await page.screenshot({ type: "png" }) });
      await phone.waitForTimeout(2500);
    }
    await noToasts(phone);
    await phone.waitForTimeout(500);
    await shot(phone, "crew-photos", "phone");

    // Daily log.
    await phone.goto(`${pjob}&tab=field&section=logs`);
    await phone.waitForTimeout(800);
    const start = phone.getByRole("button", { name: /Start today|Write today|Continue today/ }).first();
    if (await start.count()) {
      await start.click();
      await phone.waitForTimeout(1000);
    }
    await shot(phone, "daily-log", "phone");
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
