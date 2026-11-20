// End-to-end check of install progress (Progress view, walk mode, undo, device sheet, Field → More → Install progress
// (old ?tab=crew; now ?tab=field&section=progress), as-built PDF, takeoff
// unchanged) against a local build:
//
//   npm run build && npx next start -p 3248 &
//   BASE=http://localhost:3248 NODE_PATH=$(npm root -g) node scripts/e2e-install-progress.cjs /tmp/install-progress-out
//
// Needs Playwright with Chromium (not a project dependency). Writes screenshots and the as-built PDF to the out folder.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE || "http://localhost:3248";
const OUT = path.resolve(process.argv[2] || "install-progress-e2e");
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(OUT, "profile");
fs.rmSync(PROFILE, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

async function seed(page) {
  return page.evaluate(async () => {
    const W = 2400, H = 1600;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#333";
    g.lineWidth = 8;
    g.strokeRect(100, 100, W - 200, H - 200);
    g.beginPath(); g.moveTo(1200, 100); g.lineTo(1200, H - 100); g.stroke();
    const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    const db = await new Promise((res, rej) => { const r = indexedDB.open("pinplan"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const now = new Date().toISOString();
    const tx = db.transaction(["projects", "sheets", "images", "markers", "closets", "runs", "settings"], "readwrite");
    tx.objectStore("projects").put({ id: "p-pp", clientName: "Progress test", address: "7 Walk Way", status: "approved", billduDocs: [], createdAt: now, updatedAt: now });
    tx.objectStore("images").put({ id: "img-pp", blob, width: W, height: H, mime: "image/jpeg" });
    tx.objectStore("sheets").put({ id: "s-pp", projectId: "p-pp", name: "1st Fl", pageNumber: 1, order: 0, imageId: "img-pp", width: W, height: H, pxPerFt: 24, createdAt: now, updatedAt: now });
    const pos = [[0.2, 0.3], [0.4, 0.3], [0.6, 0.3], [0.8, 0.3], [0.3, 0.7], [0.7, 0.7]];
    pos.forEach(([x, y], i) => {
      tx.objectStore("markers").put({ id: `m${i}`, projectId: "p-pp", sheetId: "s-pp", deviceTypeId: i % 2 ? "wap" : "cam-indoor", x, y, label: `D${i}`, room: "Den", mount: "ceiling", wireType: "Cat6", closetId: "c1", tentative: i === 5, notes: "", createdAt: now, updatedAt: now });
    });
    tx.objectStore("closets").put({ id: "c1", projectId: "p-pp", sheetId: "s-pp", kind: "equipment", name: "MDF", x: 0.5, y: 0.5, createdAt: now, updatedAt: now });
    tx.objectStore("runs").put({ id: "r0", projectId: "p-pp", sheetId: "s-pp", kind: "wire", points: [0.2, 0.3, 0.5, 0.5], markerId: "m0", closetId: "c1", wireType: "Cat6", measuredFt: 40, createdAt: now, updatedAt: now });
    const st = tx.objectStore("settings");
    const cur = await new Promise((res) => { const r = st.get("app"); r.onsuccess = () => res(r.result); });
    if (cur) st.put({ ...cur, installPhotoRequired: [] });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    return !!cur;
  });
}

const statuses = (page) => page.evaluate(() => window.__pinplanViewer.editor.getState().markers.map((m) => [m.id, m.install?.status ?? "planned"]));
const markerScreen = (page, id) =>
  page.evaluate((id) => {
    const s = window.__pinplanViewer.editor.getState();
    const m = s.markers.find((x) => x.id === id);
    const p = window.__pinplanViewer.viewport.relToScreen({ x: m.x, y: m.y });
    const r = document.querySelector("[data-plan-canvas]").getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top };
  }, id);

async function takeoffText(page) {
  await page.goto(`${BASE}/project?id=p-pp&tab=takeoff`);
  await page.waitForTimeout(2500);
  return (await page.locator("main").innerText()).replace(/\s+/g, " ");
}

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, { viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/catalog`);
  await page.evaluate(() => localStorage.setItem("pinplan.demo", "true"));
  await page.goto(`${BASE}/catalog`);
  await page.waitForTimeout(2000);
  check("seeded (settings existed)", await seed(page));

  const before = await takeoffText(page);

  await page.goto(`${BASE}/project?id=p-pp&tab=plan`);
  await page.waitForSelector("[data-plan-canvas]");
  await page.waitForFunction(() => window.__pinplanViewer?.viewport?.ready, null, { timeout: 30000 });
  await sleep(1500);
  await page.getByRole("button", { name: "Progress" }).click();
  await sleep(500);
  await page.screenshot({ path: `${OUT}/1-progress-on.png` });
  check("all planned (grey)", (await statuses(page)).every(([, s]) => s === "planned"));
  check("counter 0/5 tested", (await page.getByTestId("progress-counter").innerText()).includes("0/5"), await page.getByTestId("progress-counter").innerText());

  await page.getByTestId("walk-toggle").click();
  await page.getByRole("radio", { name: /Mark Installed/ }).click();
  for (const id of ["m0", "m1", "m2"]) {
    const p = await markerScreen(page, id);
    await page.mouse.click(p.x + 6, p.y + 4);
    await sleep(700);
  }
  // A tap on the tentative device does nothing.
  const pt = await markerScreen(page, "m5");
  await page.mouse.click(pt.x, pt.y);
  await sleep(600);
  let st = Object.fromEntries(await statuses(page));
  check("3 devices installed", ["m0", "m1", "m2"].every((id) => st[id] === "installed") && st.m3 === "planned", st);
  check("tentative not marked", st.m5 === "planned");
  const counter = await page.getByTestId("progress-counter").innerText();
  check("counter 3/5 installed", counter.includes("3/5") && /installed/i.test(counter), counter);
  await page.screenshot({ path: `${OUT}/2-walk-installed.png` });

  await page.getByRole("button", { name: "Undo" }).first().click();
  await sleep(700);
  st = Object.fromEntries(await statuses(page));
  check("undo reverts one", st.m2 === "planned" && st.m0 === "installed" && st.m1 === "installed", st);

  // Right-click opens the device sheet.
  const p1 = await markerScreen(page, "m1");
  await page.mouse.click(p1.x, p1.y, { button: "right" });
  await sleep(600);
  check("right-click opens install sheet", await page.getByTestId("device-install-sheet").isVisible());
  await page.screenshot({ path: `${OUT}/3-sheet.png` });
  await page.getByRole("button", { name: "Pass" }).click();
  await page.getByLabel("Test reading").fill("0.4 dB");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await sleep(600);
  st = Object.fromEntries(await statuses(page));
  check("test pass → tested", st.m1 === "tested", st);
  await page.keyboard.press("Escape");
  await sleep(300);

  // Phone layout screenshot.
  await page.setViewportSize({ width: 390, height: 800 });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/4-phone.png` });
  await page.setViewportSize({ width: 1280, height: 860 });

  await page.goto(`${BASE}/project?id=p-pp&tab=field&section=progress`);
  await page.waitForSelector("[data-testid=progress-panel]", { timeout: 20000 });
  await sleep(800);
  const pct = await page.getByTestId("progress-pct").innerText();
  check("Field install progress shows progress", pct.trim() === "20%", pct);
  await page.getByTestId("progress-panel").screenshot({ path: `${OUT}/5-field-progress.png` });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByTestId("asbuilt-pdf").click()]);
  const pdfPath = path.join(OUT, "as-built.pdf");
  await dl.saveAs(pdfPath);
  const size = fs.statSync(pdfPath).size;
  check("as-built PDF downloads", size > 5000 && fs.readFileSync(pdfPath).subarray(0, 4).toString() === "%PDF", size);

  const after = await takeoffText(page);
  check("takeoff totals unchanged", before === after, before === after ? undefined : { before: before.slice(0, 300), after: after.slice(0, 300) });

  check("no page errors", errors.length === 0, errors.slice(0, 5));
  await ctx.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
