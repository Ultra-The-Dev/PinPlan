// End-to-end check of job templates and Duplicate job against a local Supabase (needs .env.local), as office
// (phone size) and as a technician. Creates throwaway users and a team. Needs Playwright with Chromium.
//   npm run build && npx next start -p 3247 &
//   NODE_PATH=$(npm root -g):$PWD/node_modules node scripts/e2e-job-templates.cjs /tmp/job-templates-e2e
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const WT = path.resolve(__dirname, "..");
const BASE = process.env.BASE || "http://localhost:3247";
const OUT = path.resolve(process.argv[2] || "/tmp/tpl-e2e");
fs.mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  fs.readFileSync(path.join(WT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO = "demo-" + Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, info) {
  results.push({ name, ok: !!ok, info: info ?? null });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info != null ? `  ${typeof info === "string" ? info : JSON.stringify(info)}` : ""}`);
}
function psql(sql) {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-At", "-c", sql], { env: { ...process.env, PGPASSWORD: "postgres" } }).toString().trim();
}

async function setupUsers() {
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const tag = Date.now().toString(36);
  const owner = { email: `tpl-owner-${tag}@example.com`, password: "Tpl-test-pass-91!" };
  const tech = { email: `tpl-tech-${tag}@example.com`, password: "Tpl-test-pass-91!" };
  for (const u of [owner, tech]) {
    const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
    if (error) throw error;
    u.id = data.user.id;
  }
  const oc = createClient(URL_, ANON, { auth: { persistSession: false } });
  await oc.auth.signInWithPassword(owner);
  const { data: teamId, error: te } = await oc.rpc("create_team", { p_name: "Template Test Co", p_my_name: "Olive Owner" });
  if (te) throw te;
  const code = ("TPL" + tag.toUpperCase().replace(/[^A-Z0-9]/g, "") + "XXXXXXXX").slice(0, 10).replace(/[01ILO]/g, "X");
  const { error: ie } = await oc.from("team_invites").insert({ code, team_id: teamId, role: "tech", name: "Tom Tech" });
  if (ie) throw ie;
  const tc = createClient(URL_, ANON, { auth: { persistSession: false } });
  await tc.auth.signInWithPassword(tech);
  const { error: ae } = await tc.rpc("accept_team_invite", { p_code: code, p_name: "Tom Tech" });
  if (ae) throw ae;
  return { owner, tech, teamId };
}

/** A demo job with 520 devices on two floors, closets, home runs, LED, a photo, a ticked checklist, estimate edits. */
function demoBackup() {
  const ts = "2026-11-18T10:00:00.000Z";
  const pid = DEMO;
  // 2x2 PNG
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==";
  const images = [
    { id: "img-a", mime: "image/png", width: 2, height: 2, data: png },
    { id: "img-b", mime: "image/png", width: 2, height: 2, data: png },
    { id: "img-photo", mime: "image/png", width: 2, height: 2, data: png },
  ];
  const sheets = [
    { id: "sh-1", projectId: pid, name: "1st Fl", pageNumber: 1, order: 0, imageId: "img-a", width: 2, height: 2, pxPerFt: 0.05, scaleLabel: "1/4\" = 1'", createdAt: ts, updatedAt: ts },
    { id: "sh-2", projectId: pid, name: "2nd Fl", pageNumber: 2, order: 1, imageId: "img-b", width: 2, height: 2, pxPerFt: 0.05, createdAt: ts, updatedAt: ts },
  ];
  const closets = [{ id: "cl-eq", projectId: pid, sheetId: "sh-1", kind: "equipment", x: 0.1, y: 0.1, name: "Equipment", createdAt: ts, updatedAt: ts }];
  const types = ["cam-indoor", "wap", "speaker", "tv"];
  const markers = [];
  const runs = [];
  for (let i = 0; i < 520; i++) {
    const sheetId = i % 2 ? "sh-2" : "sh-1";
    const t = types[i % types.length];
    const id = `m-${i}`;
    markers.push({ id, projectId: pid, sheetId, deviceTypeId: t, x: ((i * 37) % 97) / 100, y: ((i * 53) % 89) / 100, label: `${t.toUpperCase()}-${i}`, room: "Room", mount: "ceiling", wireType: "Cat6", tentative: i % 50 === 0, notes: "", closetId: i < 20 ? "cl-eq" : null, photoId: i === 0 ? "img-photo" : null, createdAt: ts, updatedAt: ts });
    if (i < 10 && sheetId === "sh-1") runs.push({ id: `hr-${i}`, projectId: pid, sheetId, kind: "wire", points: [0.1, 0.1, 0.5, 0.5], wireType: "Cat6", markerId: id, closetId: "cl-eq", createdAt: ts, updatedAt: ts });
  }
  runs.push({ id: "led-1", projectId: pid, sheetId: "sh-2", kind: "led", deviceTypeId: "led-ceiling", points: [0.1, 0.1, 0.4, 0.1], typedFt: 42, zone: "1", switchLabel: "S1", createdAt: ts, updatedAt: ts });
  const project = { id: pid, clientName: "Demo Client", clientEmail: "demo@example.com", address: "1 Demo Way", status: "approved", notes: "Gate 4321", billduDocs: [], labels: ["Model home"], productChoices: { wap: "prod-u7" }, pricing: { markupPct: 25 }, createdAt: ts, updatedAt: ts };
  const checklists = [{ id: "ck-1", projectId: pid, name: "Pre-wire", items: [{ id: "ci-1", text: "Label every cable", done: true, doneBy: "Sam", doneAt: ts }, { id: "ci-2", text: "Photo of the rack", requiresPhoto: true, done: true }], createdAt: ts, updatedAt: ts }];
  const estimateLines = [
    { id: "el-1", projectId: pid, key: "custom:permit", description: "Permit fee", qty: 1, unit: "each", unitPrice: 250, updatedAt: ts },
    { id: "el-2", projectId: pid, key: "dev:wap", unitPrice: 199, updatedAt: ts },
  ];
  const photos = [{ id: "ph-1", projectId: pid, imageId: "img-photo", width: 2, height: 2, takenAt: ts, caption: "Rack", createdAt: ts, updatedAt: ts }];
  const products = [{ id: "prod-u7", deviceTypeId: "wap", brand: "Ubiquiti", model: "U7 Pro", unitPrice: 189, laborPrice: 95, updatedAt: ts }];
  return {
    format: "pinplan-backup",
    version: 1,
    exportedAt: ts,
    catalog: [],
    products,
    projects: [{ project, sheets, markers, runs, closets, estimateLines, photos, photoComments: [], checklists, jobLogs: [{ id: "log-1", projectId: pid, date: "2026-11-18", body: "Pulled wire", createdAt: ts, updatedAt: ts }], documents: [], images, salesDocs: [], salesPayments: [] }],
  };
}

/** All rows of a Dexie table, straight from IndexedDB. */
const idb = (page, table) =>
  page.evaluate(
    (table) =>
      new Promise((res, rej) => {
        const r = indexedDB.open("pinplan");
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction(table, "readonly");
          const q = tx.objectStore(table).getAll();
          q.onsuccess = () => res(q.result);
          q.onerror = () => rej(q.error);
        };
      }),
    table,
  );

async function login(ctx, user) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#li-email", user.email);
  await page.fill("#li-password", user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return page;
}

(async () => {
  const { owner, tech, teamId } = await setupUsers();
  console.log("team", teamId);
  const errors = [];
  const browser = await chromium.launch();

  // ---------------- office, on a phone ----------------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  ctx.on("page", (p) => {
    p.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
    p.on("dialog", (d) => d.accept());
  });
  const page = await login(ctx, owner);
  await page.goto(`${BASE}/`);
  const backupPath = path.join(OUT, "demo.pinplan.json");
  fs.writeFileSync(backupPath, JSON.stringify(demoBackup()).replace(/"(sh|m|hr|led|cl|ck|ci|el|ph|log|img)-/g, `"$1-${DEMO}-`));
  await page.waitForSelector('input[type=file][accept*="pinplan"]', { state: "attached", timeout: 30000 });
  await page.setInputFiles('input[type=file][accept*="pinplan"]', backupPath);
  await page.waitForFunction(() => document.body.innerText.includes("1 Demo Way"), null, { timeout: 30000 });
  check("demo job restored", true);

  await page.goto(`${BASE}/project?id=${DEMO}&tab=info`);
  await page.getByTestId("job-templates-card").waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, "01-info-card.png"), fullPage: false });
  await page.getByRole("button", { name: "Save as template" }).click();
  await page.fill("#tpl-name", "LV standard");
  await page.fill("#tpl-description", "Our usual low-voltage setup");
  await page.screenshot({ path: path.join(OUT, "02-save-sheet.png") });
  await page.getByRole("button", { name: "Save template" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Saved the template"), null, { timeout: 10000 });
  const tpls = (await idb(page, "jobTemplates")).filter((t) => !t.deleted);
  check("template saved locally", tpls.length === 1 && tpls[0].name === "LV standard", tpls.map((t) => t.name));
  const tjson = JSON.stringify(tpls[0] ?? {});
  check("template has no client data", !/Demo Client|1 Demo Way|demo@example|Gate 4321/.test(tjson));
  check("template keeps product choices + unticked checklist", tpls[0]?.payload.project.productChoices?.wap === "prod-u7" && tpls[0]?.payload.checklists[0]?.items.every((i) => !("done" in i)));

  // ---------------- new job from template ----------------
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.fill("#new-job-address", "77 Template Ave");
  await page.waitForSelector("#new-job-template", { timeout: 10000 });
  await page.selectOption("#new-job-template", { label: "LV standard" });
  await page.screenshot({ path: path.join(OUT, "03-new-job-template.png") });
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL(/\/project\?id=/, { timeout: 20000 });
  const newId = new URL(page.url()).searchParams.get("id");
  await sleep(500);
  const projects = await idb(page, "projects");
  const np = projects.find((p) => p.id === newId);
  const ncl = (await idb(page, "checklists")).filter((c) => c.projectId === newId && !c.deleted);
  check("new job: checklists exist", ncl.length === 1 && ncl[0].name === "Pre-wire", ncl.map((c) => c.name));
  check("new job: checklists unticked", ncl[0]?.items.length === 2 && ncl[0].items.every((i) => i.done === false && !i.doneBy));
  check("new job: product choices carried", np?.productChoices?.wap === "prod-u7", np?.productChoices);
  check("new job: labels + pricing", (np?.labels ?? []).includes("Model home") && np?.pricing?.markupPct === 25);
  const nel = (await idb(page, "estimateLines")).filter((l) => l.projectId === newId);
  check("new job: estimate lines", nel.some((l) => l.description === "Permit fee") && nel.some((l) => l.key === "dev:wap" && l.unitPrice === 199), nel.map((l) => l.key));
  check("new job: client is the new one", np?.address === "77 Template Ave" && !np.clientName);
  await page.goto(`${BASE}/project?id=${newId}&tab=field`);
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, "04-new-job-field.png") });

  // ---------------- duplicate ----------------
  await page.goto(`${BASE}/project?id=${DEMO}&tab=info`);
  await page.getByRole("button", { name: "Duplicate job" }).click();
  await page.fill("#dup-address", "Lot 12, 3 Demo Way");
  await page.screenshot({ path: path.join(OUT, "05-duplicate-sheet.png") });
  const t0 = Date.now();
  await page.getByRole("button", { name: /^Duplicate job$/ }).last().click();
  await page.waitForURL((u) => u.searchParams.get("id") && u.searchParams.get("id") !== DEMO, { timeout: 60000 });
  const dupMs = Date.now() - t0;
  const dupId = new URL(page.url()).searchParams.get("id");
  const live = (xs, pid) => xs.filter((x) => x.projectId === pid && !x.deleted);
  const [markers, runs, photos, closets, sheets, logs, cks] = await Promise.all(["markers", "runs", "photos", "closets", "sheets", "jobLogs", "checklists"].map((t) => idb(page, t)));
  const count = (pid) => {
    const ms = live(markers, pid);
    const sh = Object.fromEntries(live(sheets, pid).map((s) => [s.id, s.name]));
    const by = {};
    for (const m of ms) by[`${sh[m.sheetId]}|${m.deviceTypeId}|${m.tentative}`] = (by[`${sh[m.sheetId]}|${m.deviceTypeId}|${m.tentative}`] ?? 0) + 1;
    return Object.fromEntries(Object.entries(by).sort(([a], [b]) => a.localeCompare(b)));
  };
  check("duplicate: takeoff counts identical", JSON.stringify(count(dupId)) === JSON.stringify(count(DEMO)) && live(markers, dupId).length === 520, { ms: dupMs, n: live(markers, dupId).length });
  check("duplicate: runs + closets copied", live(runs, dupId).length === live(runs, DEMO).length && live(closets, dupId).length === 1);
  const dm = live(markers, dupId);
  const dclosets = new Set(live(closets, dupId).map((c) => c.id));
  const dmarkers = new Set(dm.map((m) => m.id));
  const dsheets = new Set(live(sheets, dupId).map((s) => s.id));
  check("duplicate: no dangling refs", dm.every((m) => dsheets.has(m.sheetId) && (!m.closetId || dclosets.has(m.closetId))) && live(runs, dupId).every((r) => dsheets.has(r.sheetId) && (!r.markerId || dmarkers.has(r.markerId)) && (!r.closetId || dclosets.has(r.closetId))));
  check("duplicate: no photos, logs", live(photos, dupId).length === 0 && live(logs, dupId).length === 0 && dm.every((m) => !m.photoId));
  check("duplicate: calibration kept, images copied", live(sheets, dupId).every((s) => s.pxPerFt === 0.05 && !s.imageId.startsWith("img-")));
  check("duplicate: checklist reset", live(cks, dupId)[0]?.items.every((i) => i.done === false));
  await page.goto(`${BASE}/project?id=${dupId}&tab=takeoff`);
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "06-dup-takeoff.png") });
  const dupTakeoff = await page.locator("main").innerText();
  await page.goto(`${BASE}/project?id=${DEMO}&tab=takeoff`);
  await sleep(2000);
  const origTakeoff = await page.locator("main").innerText();
  const strip = (s) => s.replace(/1 Demo Way|Lot 12, 3 Demo Way|Demo Client/g, "").split("\n").sort().join("\n");
  check("duplicate: takeoff tab text identical", strip(dupTakeoff) === strip(origTakeoff));
  if (strip(dupTakeoff) !== strip(origTakeoff)) { fs.writeFileSync(path.join(OUT, "dup.txt"), dupTakeoff); fs.writeFileSync(path.join(OUT, "orig.txt"), origTakeoff); }

  // ---------------- settings ----------------
  await page.goto(`${BASE}/settings#templates`);
  await page.getByTestId("job-template-row").first().waitFor({ state: "attached", timeout: 15000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(OUT, "07-settings-fail.png"), fullPage: true });
    fs.writeFileSync(path.join(OUT, "settings.txt"), await page.locator("body").innerText());
    console.log("settings row missing", e.message.split("\n")[0], errors);
  });
  await page.locator("#templates").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "07-settings.png") });
  check("settings lists the template", (await page.getByTestId("job-template-row").count()) === 1);

  // Wait for the owner's device to push to the cloud.
  let cloud = "";
  for (let i = 0; i < 40 && !cloud.includes("LV standard"); i++) {
    await sleep(1500);
    cloud = psql(`select name || '|' || coalesce(team_id::text,'') from job_templates where created_by = '${owner.id}'`);
  }
  check("template synced with the team id", cloud === `LV standard|${teamId}`, cloud);
  let proj = "";
  for (let i = 0; i < 40 && proj !== "1"; i++) {
    await sleep(1500);
    proj = psql(`select count(*) from projects where id = '${DEMO}' and owner_id = '${owner.id}'`);
  }

  // ---------------- tech ----------------
  const tctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  tctx.on("page", (p) => p.on("pageerror", (e) => errors.push(`tech pageerror ${e.message}`)));
  const tp = await login(tctx, tech);
  await tp.goto(`${BASE}/`);
  await tp.waitForFunction(() => document.body.innerText.includes("1 Demo Way"), null, { timeout: 60000 });
  await tp.goto(`${BASE}/project?id=${DEMO}&tab=info`);
  await tp.waitForSelector("#job-address", { timeout: 30000 });
  await sleep(1000);
  check("tech: Duplicate is hidden", (await tp.getByRole("button", { name: "Duplicate job" }).count()) === 0 && (await tp.getByTestId("job-templates-card").count()) === 0);
  await tp.screenshot({ path: path.join(OUT, "08-tech-info.png") });
  // Tech can still start a job from the template, without prices.
  await tp.goto(`${BASE}/`);
  await tp.getByRole("button", { name: "New project" }).first().click();
  await tp.fill("#new-job-address", "Tech Street 5");
  await tp.waitForSelector("#new-job-template", { timeout: 20000 });
  const opts = await tp.locator("#new-job-template option").allInnerTexts();
  check("tech: picker lists Blank first", opts[0] === "Blank" && opts.includes("LV standard"), opts);
  await tp.selectOption("#new-job-template", { label: "LV standard" });
  const hint = await tp.locator("#new-job-template + p").innerText();
  check("tech: no prices in picker", !/pricing|estimate line/.test(hint), hint);
  await tp.getByRole("button", { name: /Create/ }).click();
  await tp.waitForURL(/\/project\?id=/, { timeout: 20000 });
  const tid = new URL(tp.url()).searchParams.get("id");
  await sleep(500);
  const tproj = (await idb(tp, "projects")).find((p) => p.id === tid);
  const tel = (await idb(tp, "estimateLines")).filter((l) => l.projectId === tid);
  const tcl = (await idb(tp, "checklists")).filter((c) => c.projectId === tid);
  check("tech: template applied without prices", tcl.length === 1 && tel.length === 0 && !tproj?.pricing && tproj?.productChoices?.wap === "prod-u7");

  check("no page errors", errors.length === 0, errors.slice(0, 5));
  await browser.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} FAILED` : "ALL PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
