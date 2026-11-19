// End-to-end check of the job schedule (Field → Schedule), the crew board (/schedule) and the phone agenda.
//
//   npm run build && npx next start -p 3247 &
//   NODE_PATH=$(npm root -g) BASE=http://localhost:3247 node scripts/e2e-schedule.cjs /tmp/schedule-out
//
// Needs Playwright with Chromium (not a project dependency). Writes screenshots to the out folder; exits 1 on failure.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE || "http://localhost:3247";
const OUT = path.resolve(process.argv[2] || "schedule-e2e");
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const errors = [];
function check(name, ok, info) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info != null ? `  ${JSON.stringify(info)}` : ""}`);
}

/** Two jobs, plus two more where Tom is booked on the same day (the crew board's red cell). */
async function seed(page) {
  await page.evaluate(async () => {
    localStorage.setItem("pinplan.author", "Tom");
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("pinplan");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const now = new Date().toISOString();
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const tx = db.transaction(["projects", "scheduleItems"], "readwrite");
    const job = (id, clientName, address) => tx.objectStore("projects").put({ id, clientName, address, status: "approved", billduDocs: [], createdAt: now, updatedAt: now });
    job("p-sched", "Schedule test", "1 Gantt Way");
    job("p-a", "Alpha Homes", "10 Alpha St");
    job("p-b", "Bravo Build", "20 Bravo Rd");
    const item = (id, projectId, name) =>
      tx.objectStore("scheduleItems").put({ id, projectId, name, start: day, end: day, crew: ["Tom"], hoursPlanned: 6, progress: 20, dependsOn: [], sheetIds: [], workdaysOnly: false, createdAt: now, updatedAt: now });
    item("s-a", "p-a", "Rough-in");
    item("s-b", "p-b", "Trim");
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  // /tasks has a known hydration warning when a name is saved on the device (its "Mine (name)" option); not ours.
  page.on("pageerror", (e) => !(/\/tasks/.test(page.url()) && /#418/.test(e.message)) && errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|supabase|fetch|#418/i.test(m.text()) && errors.push(m.text()));
  page.on("dialog", (d) => d.accept());

  // Open the app once so Dexie creates the tables, then seed.
  await page.goto(`${BASE}/tasks`);
  await page.waitForSelector("h1");
  await page.waitForTimeout(800);
  await seed(page);

  // 1. Field → Schedule → Start from template: five phases with arrows.
  await page.goto(`${BASE}/project?id=p-sched&tab=field`);
  await page.getByRole("button", { name: "Schedule" }).click();
  await page.getByRole("button", { name: "Start from template" }).click();
  await page.waitForSelector('[data-testid="gantt"]');
  const bars = await page.locator('[data-testid^="bar-"]').count();
  const arrows = await page.locator('[data-testid="dep-arrow"]').count();
  check("template adds 5 phases", bars === 5, bars);
  check("dependency arrows drawn", arrows === 4, arrows);
  await page.screenshot({ path: path.join(OUT, "gantt.png"), fullPage: true });

  // 2. Drag "Rough inspection" three days right: Trim (waits on it) moves, the toast offers Undo, Undo restores.
  const rough = page.getByTestId("bar-Rough inspection");
  const trim = page.getByTestId("bar-Trim");
  const trimBefore = await trim.getAttribute("data-start");
  const roughBefore = await rough.getAttribute("data-start");
  const box = await rough.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + (108 * i) / 10, box.y + box.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const trimAfter = await trim.getAttribute("data-start");
  const roughAfter = await rough.getAttribute("data-start");
  check("dragged phase moved", roughAfter > roughBefore, { roughBefore, roughAfter });
  check("dependent Trim pushed later", trimAfter > trimBefore, { trimBefore, trimAfter });
  const toastText = await page.getByRole("status").filter({ hasText: /Moved \d+ dependent phase/ }).textContent().catch(() => "");
  check("toast says dependents moved", /Moved \d+ dependent phase/.test(toastText || ""), toastText);
  await page.screenshot({ path: path.join(OUT, "gantt-moved.png"), fullPage: true });
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(400);
  check("undo restores Trim", (await trim.getAttribute("data-start")) === trimBefore);
  check("undo restores the dragged phase", (await rough.getAttribute("data-start")) === roughBefore);

  // Look-ahead filter and the editor open.
  await page.getByRole("button", { name: "3 weeks" }).click();
  await page.waitForTimeout(200);
  const la = await page.locator('[data-testid^="bar-"]').count();
  check("3-week look-ahead shows a subset", la >= 1 && la <= 5, la);
  await page.getByRole("button", { name: "All" }).click();
  await page.getByTestId("bar-Trim").click();
  await page.waitForSelector('[role="dialog"]');
  check("click opens the editor", await page.getByRole("dialog").isVisible());
  await page.screenshot({ path: path.join(OUT, "editor.png") });
  await page.getByRole("button", { name: "Cancel" }).click();

  // 3. Crew board: Tom on two jobs the same day is red.
  await page.goto(`${BASE}/schedule`);
  await page.waitForSelector('[data-testid="crew-board"]');
  const red = await page.locator('[data-testid="overbooked"]').count();
  check("crew board flags the double-booked tech", red >= 1, red);
  const tomRow = await page.locator("tbody tr", { hasText: "Tom" }).count();
  check("crew board has a row for Tom", tomRow === 1, tomRow);
  await page.screenshot({ path: path.join(OUT, "crew-board.png"), fullPage: true });

  // My Tasks: this week's phases Tom is on.
  await page.goto(`${BASE}/tasks`);
  await page.waitForTimeout(800);
  const strip = await page.getByRole("region", { name: "This week on the schedule" }).count();
  check("My Tasks shows the This week strip", strip === 1, strip);
  await page.screenshot({ path: path.join(OUT, "tasks.png"), fullPage: true });

  // 4. Phone: agenda list instead of the chart.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const p2 = await phone.newPage();
  p2.on("pageerror", (e) => !(/\/tasks/.test(p2.url()) && /#418/.test(e.message)) && errors.push(e.message));
  await p2.goto(`${BASE}/tasks`);
  await p2.waitForTimeout(500);
  await seed(p2);
  await p2.goto(`${BASE}/project?id=p-a&tab=field&section=schedule`);
  await p2.waitForSelector('[data-testid="schedule-agenda"]', { timeout: 15000 }).catch(() => null);
  check("phone shows the agenda list", (await p2.locator('[data-testid="schedule-agenda"]').count()) === 1);
  check("phone has no Gantt", (await p2.locator('[data-testid="gantt"]').count()) === 0);
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("no horizontal page scroll on phone", overflow <= 1, overflow);
  await p2.screenshot({ path: path.join(OUT, "phone-agenda.png"), fullPage: true });
  await p2.goto(`${BASE}/schedule`);
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: path.join(OUT, "phone-crew-board.png"), fullPage: true });

  check("no page errors", errors.length === 0, errors.slice(0, 5));
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
