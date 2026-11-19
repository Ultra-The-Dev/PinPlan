// End-to-end check of the sheet index and plan links: import a 2-sheet PDF whose pages reference each other, accept
// the proposed names, follow the red callout link to the other sheet and back, then draw a link to a job document
// and open it. Desktop and phone.
//
//   node scripts/make-sheet-links-fixture.cjs        # writes tests/fixtures/sheet-links.pdf
//   npm run build && npx next start -p 3242 &
//   BASE=http://localhost:3242 NODE_PATH=$(npm root -g) node scripts/e2e-sheet-links.cjs /tmp/sheet-links-out
//
// Needs Playwright with Chromium (not a project dependency). Writes screenshots and results.json to the out folder.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE || "http://localhost:3242";
const OUT = path.resolve(process.argv[2] || "sheet-links-e2e");
const PDF = path.resolve(__dirname, "../tests/fixtures/sheet-links.pdf");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const errors = [];
function check(name, ok, info) {
  results.push({ name, ok: !!ok, info: info ?? null });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info != null ? `  ${typeof info === "string" ? info : JSON.stringify(info)}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Rows of a Dexie table, read straight from IndexedDB. */
const idbAll = (page, store) =>
  page.evaluate(
    (store) =>
      new Promise((res, rej) => {
        const r = indexedDB.open("pinplan");
        r.onsuccess = () => {
          const q = r.result.transaction(store).objectStore(store).getAll();
          q.onsuccess = () => res(q.result.map((x) => ({ ...x, blob: undefined })));
          q.onerror = () => rej(q.error);
        };
        r.onerror = () => rej(r.error);
      }),
    store,
  );

async function seedProject(page, id) {
  await page.evaluate(
    (id) =>
      new Promise((res, rej) => {
        const r = indexedDB.open("pinplan");
        r.onsuccess = () => {
          const now = new Date().toISOString();
          const tx = r.result.transaction(["projects", "images", "documents"], "readwrite");
          tx.objectStore("projects").put({ id, clientName: "Links test", address: "2 Callout Ave", status: "estimate", billduDocs: [], createdAt: now, updatedAt: now });
          // A 1x1 PNG "cut sheet" (headless Chromium has no PDF viewer, so a PDF would download instead of opening).
          const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
          const blob = new Blob([png], { type: "image/png" });
          tx.objectStore("images").put({ id: "f-cut", blob, width: 1, height: 1, mime: "image/png" });
          tx.objectStore("documents").put({ id: "doc-cut", projectId: id, name: "Panel LP-1 cut sheet.png", mime: "image/png", size: blob.size, fileId: "f-cut", createdAt: now, updatedAt: now });
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        };
      }),
    id,
  );
}

const editor = (page) =>
  page.evaluate(() => {
    const s = window.__pinplanViewer.editor.getState();
    return { active: s.activeSheetId, sheets: s.sheets.map((x) => ({ id: x.id, number: x.number, title: x.title, discipline: x.discipline })) };
  });

async function waitPlan(page) {
  await page.waitForSelector("[data-plan-canvas]", { timeout: 30000 });
  await page.waitForFunction(() => window.__pinplanViewer?.viewport?.ready, null, { timeout: 30000 });
  await sleep(700);
  await page.waitForFunction(() => !window.__pinplanViewer.viewport.moving, null, { timeout: 5000 });
}

/** Page coordinates of the centre of a relative rect on the current sheet. */
const rectCenter = (page, r) =>
  page.evaluate((r) => {
    const v = window.__pinplanViewer.viewport;
    const p = v.relToScreen({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const b = document.querySelector("[data-plan-canvas]").getBoundingClientRect();
    return { x: p.x + b.left, y: p.y + b.top };
  }, r);

async function run(label, opts, projectId) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`[${label}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror ${e.message}`));
  page.on("dialog", (d) => d.accept());

  await page.goto(`${BASE}/catalog`);
  await sleep(1500);
  await seedProject(page, projectId);
  await page.goto(`${BASE}/project?id=${projectId}&tab=sheets`);
  await page.waitForSelector("input[type=file][multiple]", { state: "attached" });
  await page.locator("input[type=file][multiple]").setInputFiles(PDF);

  // Names are proposed from the title blocks.
  const review = page.getByRole("dialog", { name: "Review sheet names" });
  await review.waitFor({ timeout: 60000 });
  const numbers = await review.locator('input[aria-label^="Sheet number"]').evaluateAll((els) => els.map((e) => e.value));
  const titles = await review.locator('input[aria-label^="Sheet title"]').evaluateAll((els) => els.map((e) => e.value));
  check(`${label}: names proposed`, numbers.join() === "E-101,E-501" && titles[0] === "FIRST FLOOR POWER PLAN", { numbers, titles });
  await page.screenshot({ path: `${OUT}/${label}-1-review.png` });
  await review.getByTestId("review-save").click();
  await review.waitFor({ state: "detached" });
  await page.waitForSelector('[data-testid="sheet-meta"]');
  await page.screenshot({ path: `${OUT}/${label}-2-sheets.png` });
  const links = await idbAll(page, "sheetLinks");
  check(`${label}: callout links created`, links.length === 3 && links.every((l) => l.auto), links.map((l) => l.label));

  // Open sheet 1 on the plan: a red link sits over "3 / E-501".
  await page.goto(`${BASE}/project?id=${projectId}&tab=plan`);
  await waitPlan(page);
  let st = await editor(page);
  const s1 = st.sheets.find((s) => s.number === "E-101");
  const s2 = st.sheets.find((s) => s.number === "E-501");
  await page.evaluate((id) => window.__pinplanViewer.editor.getState().setActiveSheet(id), s1.id);
  await waitPlan(page);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/${label}-3-plan-links.png` });
  const bubble = links.find((l) => l.sheetId === s1.id && l.label === "3/E-501");
  const c = await rectCenter(page, bubble);
  const pxRed = await page.evaluate(({ x, y }) => {
    const b = document.querySelector("[data-plan-canvas]").getBoundingClientRect();
    const canvases = [...document.querySelectorAll("[data-plan-canvas] canvas")];
    let red = false;
    for (const cv of canvases) {
      const k = cv.width / cv.getBoundingClientRect().width;
      const d = cv.getContext("2d").getImageData(Math.round((x - b.left) * k) - 30, Math.round((y - b.top) * k) - 30, 60, 60).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100 && d[i] > 200 && d[i + 1] < 120 && d[i + 2] < 120) red = true;
    }
    return red;
  }, c);
  check(`${label}: red link drawn on sheet 1`, pxRed);
  if (opts.hasTouch) await page.touchscreen.tap(c.x, c.y);
  else await page.mouse.click(c.x, c.y);
  await sleep(600);
  st = await editor(page);
  check(`${label}: tapping the link opens E-501`, st.active === s2.id);
  const back = page.getByTestId("link-back");
  check(`${label}: back pill names E-101`, (await back.textContent()).includes("E-101"), await back.textContent());
  await page.screenshot({ path: `${OUT}/${label}-4-followed.png` });
  await back.click();
  await sleep(400);
  st = await editor(page);
  check(`${label}: back returns to E-101`, st.active === s1.id);

  // Draw a link to the job document and open it.
  await page.getByTestId("link-tool").click();
  const surf = await page.getByTestId("link-draw-surface").boundingBox();
  const a = { x: surf.x + surf.width * 0.3, y: surf.y + surf.height * 0.42 };
  if (opts.hasTouch) {
    // A tap makes a standard-size box.
    await page.touchscreen.tap(a.x, a.y);
  } else {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 80, a.y + 40, { steps: 6 });
    await page.mouse.up();
  }
  const picker = page.getByRole("dialog", { name: "Link to…" });
  await picker.waitFor({ timeout: 8000 }).catch(async (e) => {
    await page.screenshot({ path: `${OUT}/${label}-fail-picker.png` });
    throw e;
  });
  await picker.getByRole("tab", { name: "Document" }).click();
  await picker.getByRole("button", { name: /Panel LP-1 cut sheet/ }).click();
  await picker.waitFor({ state: "detached" });
  await page.getByTestId("link-tool-done").click();
  await sleep(400);
  const manual = (await idbAll(page, "sheetLinks")).find((l) => !l.auto && !l.deleted);
  check(`${label}: manual document link saved`, manual?.target?.kind === "document" && manual.target.documentId === "doc-cut");
  await page.screenshot({ path: `${OUT}/${label}-5-manual-link.png` });
  const mc = await rectCenter(page, manual);
  const popup = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
  if (opts.hasTouch) await page.touchscreen.tap(mc.x, mc.y);
  else await page.mouse.click(mc.x, mc.y);
  const win = await popup;
  if (win) await win.waitForURL(/^blob:/, { timeout: 8000 }).catch(() => {});
  check(`${label}: document link opens the file`, !!win && win.url().startsWith("blob:"), win?.url());

  // Documents list shows where it's linked.
  await page.goto(`${BASE}/project?id=${projectId}&tab=field`);
  await sleep(1200);
  const docsTab = page.getByRole("button", { name: /^Documents/ });
  if (await docsTab.count()) await docsTab.first().click();
  await sleep(600);
  const chip = page.getByText("Linked on E-101");
  check(`${label}: document shows "Linked on E-101"`, (await chip.count()) > 0);
  await page.screenshot({ path: `${OUT}/${label}-6-documents.png` });

  // Sheet index: grouped, editable.
  await page.goto(`${BASE}/project?id=${projectId}&tab=sheets`);
  await page.getByTestId("sheet-index-open").click();
  await page.getByRole("dialog", { name: "Sheet index" }).waitFor();
  const rows = await page.getByTestId("index-row").count();
  check(`${label}: sheet index lists both sheets`, rows === 2);
  await page.screenshot({ path: `${OUT}/${label}-7-index.png` });
  await browser.close();
}

(async () => {
  try {
    await run("desktop", { viewport: { width: 1366, height: 860 } }, "p-links-d");
    await run("phone", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, "p-links-m");
  } catch (e) {
    check("no crash", false, e.message);
  }
  check("no console errors", errors.length === 0, errors.slice(0, 5));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, errors }, null, 2));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
