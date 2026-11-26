// End-to-end check of the plan viewer (pan/zoom, tiles, sheet browser, layers, minimap, editing) on desktop, tablet
// and phone, plus frame-rate numbers with a synthetic 9000 px sheet and 1,500 devices.
//
//   npm run build && npx next start -p 3301 &
//   NODE_PATH=$(npm root -g) node scripts/e2e-plan-viewer.cjs /tmp/plan-viewer-out
//
// Needs Playwright with Chromium (not a project dependency). Writes screenshots and results.json to the out folder.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE || "http://localhost:3301";
const OUT = path.resolve(process.argv[2] || "plan-viewer-e2e");
const PDF = path.resolve(__dirname, "../samples/demo-plan-set.pdf");
const PROFILE = path.join(OUT, "profile");
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

const results = [];
const consoleErrors = [];
const perf = {};
function check(name, ok, info) {
  results.push({ name, ok: !!ok, info: info ?? null });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info != null ? `  ${typeof info === "string" ? info : JSON.stringify(info)}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(opts) {
  const ctx = await chromium.launchPersistentContext(PROFILE, { ...opts, args: ["--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`[${opts.label}] ${m.text()}`));
  page.on("pageerror", (e) => consoleErrors.push(`[${opts.label}] pageerror ${e.message}`));
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}

const V = (page, fn, arg) => page.evaluate(fn, arg);
const vp = (page) => V(page, () => ({ ...window.__pinplanViewer.viewport.transform }));
const state = (page) =>
  V(page, () => {
    const s = window.__pinplanViewer.editor.getState();
    return { active: s.activeSheetId, sheets: s.sheets.map((x) => x.id), markers: s.markers.length, runs: s.runs.length, closets: s.closets.length, tool: s.tool.kind };
  });
const pct = async (page) => parseInt((await page.getByTestId("zoom-pct").textContent()).replace("%", ""), 10);
const settle = async (page, ms = 450) => {
  await sleep(ms);
  await page.waitForFunction(() => !window.__pinplanViewer.viewport.moving, null, { timeout: 5000 });
};
async function planBox(page) {
  return page.locator("[data-plan-canvas]").boundingBox();
}
async function waitPlan(page) {
  await page.waitForSelector("[data-plan-canvas]", { timeout: 30000 });
  await page.waitForFunction(() => window.__pinplanViewer?.viewport?.ready, null, { timeout: 30000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Loading sheet…"), null, { timeout: 30000 });
  await settle(page);
}

/** A big synthetic sheet (drawn in the page) with many devices, written straight into IndexedDB. */
async function seedSynthetic(page, n) {
  return V(
    page,
    async ({ n }) => {
      const W = 9000;
      const H = 6400;
      const c = new OffscreenCanvas(W, H);
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "#222";
      for (let x = 200; x < W; x += 700) {
        g.lineWidth = x % 2100 === 200 ? 14 : 4;
        g.beginPath();
        g.moveTo(x, 200);
        g.lineTo(x, H - 200);
        g.stroke();
      }
      for (let y = 200; y < H; y += 600) {
        g.lineWidth = y % 1800 === 200 ? 14 : 4;
        g.beginPath();
        g.moveTo(200, y);
        g.lineTo(W - 200, y);
        g.stroke();
      }
      g.fillStyle = "#333";
      g.font = "48px sans-serif";
      for (let x = 260, i = 0; x < W - 700; x += 700) for (let y = 300; y < H - 600; y += 600) g.fillText(`ROOM ${++i}`, x + 40, y + 80);
      g.font = "12px sans-serif";
      for (let x = 260; x < W - 700; x += 700) for (let y = 300; y < H - 600; y += 600) g.fillText("fine print 1/8\" = 1'-0\" DETAIL", x + 40, y + 200);
      const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open("pinplan");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const now = new Date().toISOString();
      const types = ["cam-indoor", "wap", "speaker", "tv", "keypad", "data-drop", "cam-outdoor", "shade"];
      const tx = db.transaction(["projects", "sheets", "images", "markers", "closets"], "readwrite");
      tx.objectStore("projects").put({ id: "p-e2e", clientName: "Viewer test", address: "1 Synthetic Way", status: "estimate", billduDocs: [], createdAt: now, updatedAt: now });
      tx.objectStore("images").put({ id: "img-synth", blob, width: W, height: H, mime: "image/jpeg" });
      tx.objectStore("sheets").put({ id: "s-synth", projectId: "p-e2e", name: "Synthetic 9000 px", pageNumber: 9, order: 50, imageId: "img-synth", width: W, height: H, pxPerFt: 48, scaleLabel: `1/4" = 1'-0"`, createdAt: now, updatedAt: now });
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) {
        const t = types[i % types.length];
        tx.objectStore("markers").put({ id: `m-${i}`, projectId: "p-e2e", sheetId: "s-synth", deviceTypeId: t, x: 0.03 + rnd() * 0.94, y: 0.03 + rnd() * 0.94, label: `${t.slice(0, 3).toUpperCase()}${i}`, room: `Room ${1 + (i % 9)}`, mount: "ceiling", wireType: "Cat6", tentative: i % 9 === 0, notes: "", createdAt: now, updatedAt: now });
      }
      tx.objectStore("closets").put({ id: "c-synth", projectId: "p-e2e", sheetId: "s-synth", kind: "equipment", name: "MDF", x: 0.5, y: 0.5, createdAt: now, updatedAt: now });
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      return true;
    },
    { n },
  );
}

/** Drive the view for `ms` (pan in a loop + zoom in and out) and measure frame times. */
async function bench(page, ms, labels) {
  return V(
    page,
    async ({ ms }) => {
      const v = window.__pinplanViewer.viewport;
      const st = window.__pinplanViewer;
      const fit = v.limits.fit;
      const { w, h } = v.viewSize;
      const S = v.sheetDims;
      const frames = [];
      const mk = [];
      const sh = [];
      const levels = new Set();
      let last = performance.now();
      const t0 = last;
      v.beginInteraction();
      await new Promise((res) => {
        const step = (now) => {
          frames.push(now - last);
          last = now;
          mk.push(st.markerStats.ms);
          sh.push(st.sheetStats.ms);
          levels.add(st.sheetStats.level);
          const k = (now - t0) / 1000;
          const s = fit * Math.pow(8, (1 - Math.cos(k * 1.6)) / 2);
          const cx = S.width * (0.5 + 0.3 * Math.sin(k * 1.1));
          const cy = S.height * (0.5 + 0.3 * Math.cos(k * 0.9));
          v.set({ scale: s, x: w / 2 - cx * s, y: h / 2 - cy * s }, { clamp: false });
          if (now - t0 < ms) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      });
      v.endInteraction();
      const f = frames.slice(2).sort((a, b) => a - b);
      const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      const total = frames.slice(2).reduce((a, b) => a + b, 0);
      return {
        frames: f.length,
        fps: Math.round((f.length / total) * 1000 * 10) / 10,
        p50: Math.round(f[Math.floor(f.length * 0.5)] * 10) / 10,
        p95: Math.round(f[Math.floor(f.length * 0.95)] * 10) / 10,
        worst: Math.round(f[f.length - 1] * 10) / 10,
        markerDrawMs: Math.round(avg(mk) * 100) / 100,
        sheetDrawMs: Math.round(avg(sh) * 100) / 100,
        markers: st.markerStats.total,
        levels: [...levels].sort(),
      };
    },
    { ms, labels },
  );
}

/** Real input: a mouse-drag pan while counting frames. */
async function inputPanFps(page, box) {
  await V(page, () => {
    window.__frames = [];
    let last = performance.now();
    window.__frameStop = false;
    const loop = (now) => {
      window.__frames.push(now - last);
      last = now;
      if (!window.__frameStop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Space held: pans even when the drag starts on a device.
  await page.keyboard.down("Space");
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 120; i++) await page.mouse.move(cx + Math.sin(i / 12) * 300, cy + Math.cos(i / 15) * 200, { steps: 1 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i % 2 ? 100 : -100);
  await sleep(500);
  return V(page, () => {
    window.__frameStop = true;
    const f = window.__frames.slice(2).sort((a, b) => a - b);
    const total = f.reduce((a, b) => a + b, 0);
    return { frames: f.length, fps: Math.round((f.length / total) * 10000) / 10, p95: Math.round(f[Math.floor(f.length * 0.95)] * 10) / 10 };
  });
}

async function touch(cdp, type, pts) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
}
async function pinch(cdp, cx, cy, from, to, steps = 12) {
  await touch(cdp, "touchStart", [
    [cx - from, cy],
    [cx + from, cy],
  ]);
  for (let i = 1; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps;
    await touch(cdp, "touchMove", [
      [cx - d, cy],
      [cx + d, cy],
    ]);
    await sleep(16);
  }
  await touch(cdp, "touchEnd", []);
}
async function swipe(cdp, x0, y0, x1, y1, steps = 10, holdMs = 0) {
  await touch(cdp, "touchStart", [[x0, y0]]);
  if (holdMs) await sleep(holdMs);
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, "touchMove", [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
    await sleep(16);
  }
  await touch(cdp, "touchEnd", []);
}
async function tap(cdp, x, y) {
  await touch(cdp, "touchStart", [[x, y]]);
  await sleep(30);
  await touch(cdp, "touchEnd", []);
}
const markerScreen = (page, id) =>
  V(
    page,
    (id) => {
      const s = window.__pinplanViewer.editor.getState();
      const m = s.markers.find((x) => x.id === id);
      const p = window.__pinplanViewer.viewport.relToScreen({ x: m.x, y: m.y });
      const r = document.querySelector("[data-plan-canvas]").getBoundingClientRect();
      return { x: p.x + r.left, y: p.y + r.top, mx: m.x, my: m.y };
    },
    id,
  );

(async () => {
  // ---------------- desktop 1440 × 900 ----------------
  let { ctx, page } = await open({ label: "desktop", viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/catalog`);
  await page.waitForTimeout(1500);
  await seedSynthetic(page, 1500);
  await page.goto(`${BASE}/project?id=p-e2e&tab=sheets`);
  await page.waitForSelector("input[type=file][multiple]", { state: "attached" });
  await page.locator("input[type=file][multiple]").setInputFiles(PDF);
  await page.waitForFunction(() => document.querySelectorAll('input[aria-label="Sheet name"]').length >= 5, null, { timeout: 90000 });
  check("sample PDF imported (4 sheets + synthetic)", true);
  await page.goto(`${BASE}/project?id=p-e2e&tab=plan`);
  await waitPlan(page);
  let s = await state(page);
  // The imported sheets come first (order 0…); go to sheet 1.
  await V(page, (id) => window.__pinplanViewer.editor.getState().setActiveSheet(id), s.sheets[0]);
  await waitPlan(page);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/desktop-1-fit.png` });

  const box = await planBox(page);
  const c = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.45 };
  const p0 = await pct(page);
  const relBefore = await V(page, ([x, y]) => window.__pinplanViewer.viewport.screenToRel({ x, y }), [c.x - box.x, c.y - box.y]);
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -100);
    await sleep(60);
  }
  await settle(page);
  const p1 = await pct(page);
  const relAfter = await V(page, ([x, y]) => window.__pinplanViewer.viewport.screenToRel({ x, y }), [c.x - box.x, c.y - box.y]);
  check("wheel zooms in", p1 > p0 * 1.6, `${p0}% → ${p1}%`);
  check("wheel zoom keeps the point under the cursor", Math.hypot(relAfter.x - relBefore.x, relAfter.y - relBefore.y) < 0.003, { relBefore, relAfter });
  // Trackpad pinch = ctrl+wheel.
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 40);
  await page.keyboard.up("Control");
  await settle(page);
  check("ctrl+wheel (trackpad pinch) zooms out", (await pct(page)) < p1, `${await pct(page)}%`);
  // 100%: past the preview's resolution, so tiles of the full-resolution level are drawn.
  await page.keyboard.press("1");
  await settle(page);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/desktop-2-zoomed-tiles.png` });
  const tiles = await V(page, () => ({ ...window.__pinplanViewer.sheetStats }));
  check("at 100%: full-resolution tiles drawn, none missing", tiles.level === 0 && tiles.drawn > 0 && tiles.missing === 0, tiles);
  await page.keyboard.press("0");
  await settle(page);

  // Drag-pan.
  const t0 = await vp(page);
  const before = await state(page);
  await page.mouse.move(box.x + 300, box.y + 400);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 300 + i * 20, box.y + 400 + i * 8);
  await page.mouse.up();
  await settle(page, 900);
  const t1 = await vp(page);
  check("mouse drag pans (with momentum)", t1.x - t0.x >= 195 && t1.y - t0.y >= 75, { dx: Math.round(t1.x - t0.x), dy: Math.round(t1.y - t0.y) });
  check("pan didn't change any device", JSON.stringify(before) === JSON.stringify(await state(page)));

  // Keyboard.
  await page.locator("body").press("0");
  await settle(page);
  const fitPct = await pct(page);
  await page.keyboard.press("+");
  await settle(page);
  check("+ zooms in, 0 fits", (await pct(page)) > fitPct, `${fitPct}% → ${await pct(page)}%`);
  const tk = await vp(page);
  await page.keyboard.press("ArrowLeft");
  await settle(page);
  check("arrow keys pan", (await vp(page)).x > tk.x + 50);
  await page.keyboard.press("-");
  await page.keyboard.press("0");
  await settle(page);

  // Sheets: ] / [ and the browser.
  s = await state(page);
  await page.keyboard.press("]");
  await waitPlan(page);
  check("] goes to the next sheet", (await state(page)).active === s.sheets[1]);
  await page.keyboard.press("[");
  await waitPlan(page);
  check("[ goes back", (await state(page)).active === s.sheets[0]);

  // Remember the view per sheet.
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await settle(page);
  const remembered = await pct(page);
  await page.keyboard.press("]");
  await waitPlan(page);
  await page.keyboard.press("[");
  await waitPlan(page);
  check("zoom remembered per sheet", Math.abs((await pct(page)) - remembered) <= 1, `${remembered}% → ${await pct(page)}%`);
  await page.keyboard.press("0");
  await settle(page);

  await page.getByTestId("sheet-pill").click();
  await page.getByTestId("sheet-browser").waitFor();
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/desktop-3-sheet-browser.png` });
  await page.getByTestId("sheet-browser").getByRole("listitem").nth(2).getByRole("button").click();
  await waitPlan(page);
  check("sheet browser switches sheets and closes", (await state(page)).active === s.sheets[2] && !(await page.getByTestId("sheet-browser").count()));

  // Minimap.
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await settle(page);
  const mm = await page.getByTestId("minimap").locator("[role=slider]").boundingBox();
  await page.mouse.click(mm.x + mm.width * 0.15, mm.y + mm.height * 0.2);
  await settle(page, 600);
  const centre = await V(page, () => {
    const v = window.__pinplanViewer.viewport;
    return v.screenToRel({ x: v.viewSize.w / 2, y: v.viewSize.h / 2 });
  });
  check("minimap click moves the view there", Math.abs(centre.x - 0.15) < 0.08 && Math.abs(centre.y - 0.2) < 0.12, centre);
  await page.screenshot({ path: `${OUT}/desktop-4-minimap.png` });
  await page.keyboard.press("0");
  await settle(page);

  // Place a device, a closet, an LED run and a wire run (edit mode, the default for owners).
  check("owner starts in edit mode", (await page.getByTestId("plan-editor").getAttribute("data-mode")) === "edit");
  const b2 = await planBox(page);
  const at = (fx, fy) => [b2.x + b2.width * fx, b2.y + b2.height * fy];
  let st0 = await state(page);
  await page.getByRole("button", { name: /^Indoor camera/ }).first().click();
  await page.mouse.click(...at(0.42, 0.42));
  await sleep(300);
  check("tap places a device", (await state(page)).markers === st0.markers + 1);
  await page.getByRole("button", { name: /Equipment closet/ }).first().click();
  await page.mouse.click(...at(0.6, 0.6));
  await sleep(300);
  check("tap places a closet", (await state(page)).closets === st0.closets + 1);
  await page.keyboard.press("Escape");
  st0 = await state(page);
  await page.getByRole("button", { name: /^Wire run|^Cable run|^Home run/ }).first().click();
  await page.mouse.click(...at(0.42, 0.42));
  await page.mouse.click(...at(0.5, 0.42));
  await page.mouse.click(...at(0.6, 0.6));
  await sleep(600);
  check("wire run: device → point → closet", (await state(page)).runs === st0.runs + 1);
  await page.getByRole("button", { name: /^LED · ceiling/ }).first().click();
  await page.mouse.click(...at(0.3, 0.3));
  await page.mouse.click(...at(0.5, 0.3));
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await sleep(400);
  check("LED run drawn and saved", (await state(page)).runs === st0.runs + 2);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await sleep(200);
  await page.screenshot({ path: `${OUT}/desktop-5-edit.png` });

  // Drag a device (mouse) then undo.
  const newest = await V(page, () => {
    const s = window.__pinplanViewer.editor.getState();
    return s.markers.filter((m) => m.sheetId === s.activeSheetId).slice(-1)[0].id;
  });
  const m0 = await markerScreen(page, newest);
  await page.mouse.move(m0.x, m0.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(m0.x + i * 10, m0.y + i * 5);
  await page.mouse.up();
  await sleep(400);
  const m1 = await markerScreen(page, newest);
  check("edit mode: mouse drag moves a device", Math.abs(m1.mx - m0.mx) > 0.005, { from: m0.mx, to: m1.mx });
  await page.keyboard.press("Control+z");
  await sleep(300);
  check("undo puts it back", Math.abs((await markerScreen(page, newest)).mx - m0.mx) < 1e-6);

  // View only: the same drag pans instead.
  await page.getByTestId("mode-view").click();
  const tv = await vp(page);
  const m2 = await markerScreen(page, newest);
  await page.mouse.move(m2.x, m2.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(m2.x + i * 10, m2.y + i * 5);
  await page.mouse.up();
  await settle(page, 700);
  check("view only: dragging a device pans instead", Math.abs((await markerScreen(page, newest)).mx - m2.mx) < 1e-9 && (await vp(page)).x !== tv.x);
  await page.screenshot({ path: `${OUT}/desktop-6-view-mode.png` });
  await page.getByTestId("mode-edit").click();

  // Synthetic sheet: layers and frame rates.
  await V(page, () => window.__pinplanViewer.editor.getState().setActiveSheet("s-synth"));
  await waitPlan(page);
  // Let the worker finish the pyramid (first open of a 9000 px image).
  const tBuild = Date.now();
  await page.waitForFunction(() => window.__pinplanViewer.sheetStats.level === -1 || window.__pinplanViewer.sheetStats.missing === 0, null, { timeout: 60000 });
  await sleep(4000);
  perf.firstOpenSettleMs = Date.now() - tBuild;
  await page.screenshot({ path: `${OUT}/desktop-7-synthetic-fit.png` });
  const total = await V(page, () => window.__pinplanViewer.markerStats.total);
  check("synthetic sheet shows 1,500 devices", total === 1500, total);
  await page.getByTestId("layers-button").click();
  await page.getByTestId("layers-panel").waitFor();
  await page.getByTestId("layer-security").click();
  await sleep(300);
  const afterHide = await V(page, () => window.__pinplanViewer.markerStats.total);
  check("hiding a layer hides its devices", afterHide < total && afterHide > 0, `${total} → ${afterHide}`);
  await page.screenshot({ path: `${OUT}/desktop-8-layers.png` });
  await page.getByTestId("layer-security").click();
  await page.getByTestId("type-wap").getByText("Only").click().catch(() => undefined);
  await page.locator('[data-testid="layers-panel"] button:has-text("Only")').nth(0).isVisible();
  await page.keyboard.press("Escape");
  await sleep(200);
  check("layer back on", (await V(page, () => window.__pinplanViewer.markerStats.total)) === total);

  perf.desktopBench = await bench(page, 5000);
  check("synthetic pan/zoom benchmark ran", perf.desktopBench.frames > 30, perf.desktopBench);
  await page.keyboard.press("l");
  perf.desktopBenchLabels = await bench(page, 3000);
  check("benchmark with labels on", perf.desktopBenchLabels.frames > 20, perf.desktopBenchLabels);
  await page.keyboard.press("l");
  await page.keyboard.press("0");
  await settle(page);
  perf.desktopInputPan = await inputPanFps(page, await planBox(page));
  check("input-driven pan/zoom", perf.desktopInputPan.frames > 10, perf.desktopInputPan);
  await page.keyboard.press("0");
  await settle(page);
  // Reopen: the pyramid comes from IndexedDB.
  await page.reload();
  const tr = Date.now();
  await waitPlan(page);
  perf.reopenPreviewMs = Date.now() - tr;
  await page.screenshot({ path: `${OUT}/desktop-9-reopen.png` });
  await ctx.close();

  // ---------------- tablet 1024 × 1366 (touch) ----------------
  ({ ctx, page } = await open({ label: "tablet", viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }));
  await page.goto(`${BASE}/project?id=p-e2e&tab=plan`);
  await waitPlan(page);
  await V(page, () => window.__pinplanViewer.editor.getState().setActiveSheet(window.__pinplanViewer.editor.getState().sheets[0].id));
  await waitPlan(page);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/tablet-1-plan.png` });
  let cdp = await ctx.newCDPSession(page);
  let tb = await planBox(page);
  const tp0 = await pct(page);
  await pinch(cdp, tb.x + tb.width / 2, tb.y + tb.height / 2, 60, 200);
  await settle(page);
  check("tablet: pinch zooms in", (await pct(page)) > tp0 * 2, `${tp0}% → ${await pct(page)}%`);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/tablet-2-pinched.png` });
  await V(page, () => window.__pinplanViewer.editor.getState().setActiveSheet("s-synth"));
  await waitPlan(page);
  await sleep(1500);
  perf.tabletBench = await bench(page, 4000);
  check("tablet benchmark", perf.tabletBench.frames > 20, perf.tabletBench);
  await ctx.close();

  // ---------------- phone 390 × 844 (touch) ----------------
  ({ ctx, page } = await open({ label: "phone", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }));
  await page.goto(`${BASE}/project?id=p-e2e&tab=plan`);
  await waitPlan(page);
  await V(page, () => window.__pinplanViewer.editor.getState().setActiveSheet("s-synth"));
  await waitPlan(page);
  await page.keyboard.press("0");
  await settle(page);
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/phone-1-plan.png` });
  cdp = await ctx.newCDPSession(page);
  tb = await planBox(page);
  const cx = tb.x + tb.width / 2;
  const cy = tb.y + tb.height / 2;
  const ph0 = await pct(page);
  await pinch(cdp, cx, cy, 40, 140);
  await settle(page);
  const ph1 = await pct(page);
  check("phone: pinch zooms in", ph1 > ph0 * 2, `${ph0}% → ${ph1}%`);
  // One-finger pan that starts on a device: pans, the device stays.
  const some = await V(page, () => {
    const v = window.__pinplanViewer.viewport;
    const s = window.__pinplanViewer.editor.getState();
    const { w, h } = v.viewSize;
    const m = s.markers.find((m) => {
      if (m.sheetId !== "s-synth") return false;
      const p = v.relToScreen(m);
      return p.x > w * 0.3 && p.x < w * 0.7 && p.y > h * 0.3 && p.y < h * 0.7;
    });
    return m?.id;
  });
  if (some) {
    const a = await markerScreen(page, some);
    const tv0 = await vp(page);
    await swipe(cdp, a.x, a.y, a.x + 80, a.y + 120);
    await settle(page, 900);
    const a2 = await markerScreen(page, some);
    check("phone: a quick drag across a device pans (device doesn't move)", a2.mx === a.mx && a2.my === a.my && (await vp(page)).y !== tv0.y);
    // Long-press then drag moves it (edit mode).
    const a3 = await markerScreen(page, some);
    await swipe(cdp, a3.x, a3.y, a3.x + 60, a3.y + 40, 8, 600);
    await sleep(400);
    const a4 = await markerScreen(page, some);
    check("phone: long-press then drag moves the device", Math.abs(a4.mx - a3.mx) > 0.001, { from: a3.mx, to: a4.mx });
    await V(page, () => window.__pinplanViewer.editor.getState().undo());
  } else check("phone: found a device to drag", false);
  // Double-tap zooms in, two-finger tap zooms out.
  await page.keyboard.press("0");
  await settle(page);
  const d0 = await pct(page);
  await tap(cdp, cx + 7, cy + 140);
  await sleep(80);
  await tap(cdp, cx + 7, cy + 140);
  await settle(page, 600);
  const d1 = await pct(page);
  check("phone: double-tap zooms in", d1 > d0 * 1.5, `${d0}% → ${d1}%`);
  await touch(cdp, "touchStart", [
    [cx - 40, cy],
    [cx + 40, cy],
  ]);
  await sleep(60);
  await touch(cdp, "touchEnd", []);
  await settle(page, 600);
  check("phone: two-finger tap zooms out", (await pct(page)) < d1 * 0.8, `${d1}% → ${await pct(page)}%`);
  // Edge swipes: in from the right → next sheet, in from the left → back.
  const sBefore = (await state(page)).active;
  const order = (await state(page)).sheets;
  await swipe(cdp, tb.x + tb.width - 6, cy, tb.x + tb.width - 170, cy + 10, 8);
  await sleep(600);
  const sAfter = (await state(page)).active;
  check("phone: swipe in from the right edge → next sheet", order.indexOf(sAfter) === order.indexOf(sBefore) + 1, `${sBefore} → ${sAfter}`);
  await waitPlan(page);
  await swipe(cdp, tb.x + 6, cy, tb.x + 170, cy + 10, 8);
  await sleep(600);
  check("phone: swipe in from the left edge → previous sheet", (await state(page)).active === sBefore);
  await swipe(cdp, tb.x + tb.width - 6, cy, tb.x + tb.width - 170, cy + 10, 8);
  await sleep(600);
  await waitPlan(page);
  await page.screenshot({ path: `${OUT}/phone-2-after-swipe.png` });
  await page.getByTestId("sheet-pill").click();
  await page.getByTestId("sheet-browser").waitFor();
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/phone-3-sheet-browser.png` });
  await page.getByTestId("sheet-browser").getByRole("listitem").nth(4).getByRole("button").click();
  await waitPlan(page);
  await page.getByTestId("layers-button").click();
  await page.getByTestId("layers-panel").waitFor();
  await sleep(300);
  await page.screenshot({ path: `${OUT}/phone-4-layers.png` });
  await page.getByRole("button", { name: "Close layers" }).click();
  await page.getByTestId("mode-view").click();
  await sleep(200);
  await page.screenshot({ path: `${OUT}/phone-5-view-mode.png` });
  await V(page, () => window.__pinplanViewer.editor.getState().setActiveSheet("s-synth"));
  await waitPlan(page);
  await sleep(1000);
  perf.phoneBench = await bench(page, 4000);
  check("phone benchmark", perf.phoneBench.frames > 20, perf.phoneBench);
  await page.setViewportSize({ width: 844, height: 390 });
  await settle(page, 800);
  await page.screenshot({ path: `${OUT}/phone-6-landscape.png` });
  await page.getByTestId("mode-edit").click();
  await ctx.close();

  const ok = results.every((r) => r.ok);
  const relevantErrors = consoleErrors.filter((e) => !/Failed to load resource|supabase|ERR_/i.test(e));
  check("no console errors", relevantErrors.length === 0, relevantErrors.slice(0, 10));
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ ok: ok && !relevantErrors.length, results, perf, consoleErrors }, null, 2));
  console.log(JSON.stringify(perf, null, 2));
  process.exit(ok && !relevantErrors.length ? 0 : 1);
})().catch((e) => {
  console.error(e);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ ok: false, error: String(e && e.stack), results, perf, consoleErrors }, null, 2));
  process.exit(2);
});
