// Writes the text of the sample plan sets (samples/*.pdf) into tests/fixtures/floorNames.json ("samples"), so the
// Swift floor-name tests (ios/PinPlanCore) read exactly what PDF.js gives the web app. The hand-written cases in the
// same file are kept. Run after changing a sample: node scripts/floor-name-fixture.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "tests/fixtures/floorNames.json");
const fixture = JSON.parse(readFileSync(out, "utf8"));

// Same mapping as textItemBox in src/lib/importPlans.ts (kept tiny here so this script needs no TypeScript).
function box(item, vp) {
  const [a, b, c, d, e, f] = item.transform;
  const along = Math.hypot(a, b) || 1;
  const upLen = Math.hypot(c, d) || 1;
  const h = item.height || upLen;
  const dir = { x: a / along, y: b / along };
  const up = { x: c / upLen, y: d / upLen };
  const pts = [
    { x: e, y: f },
    { x: e + dir.x * item.width, y: f + dir.y * item.width },
    { x: e + up.x * h, y: f + up.y * h },
    { x: e + dir.x * item.width + up.x * h, y: f + dir.y * item.width + up.y * h },
  ];
  const [m0, m1, m2, m3, m4, m5] = vp.transform;
  const xs = pts.map((p) => m0 * p.x + m2 * p.y + m4);
  const ys = pts.map((p) => m1 * p.x + m3 * p.y + m5);
  const r = (n) => Math.round(n * 1e5) / 1e5;
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: r(x0 / vp.width), y: r(y0 / vp.height), w: r((Math.max(...xs) - x0) / vp.width), h: r((Math.max(...ys) - y0) / vp.height) };
}

const samples = {};
for (const file of ["demo-plan-set.pdf", "doors-windows-demo.pdf"]) {
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path.join(root, "samples", file))), verbosity: 0 });
  const doc = await task.promise;
  samples[file] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    samples[file].push(tc.items.filter((it) => it.str?.trim()).map((it) => ({ str: it.str, ...box(it, vp) })));
  }
  await task.destroy();
}
fixture.samples = samples;
writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, out)}`);
