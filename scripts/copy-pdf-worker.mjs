// Copy the PDF.js worker into /public so it is served (and cached offline) from our own origin. The file name carries
// the pdfjs-dist version (pdf.worker.<version>.min.mjs, matching `lib.version` in src/lib/importPlans.ts), so a
// PDF.js upgrade never pairs a new library with an old worker cached on a device. Older copies are removed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";

const pkg = "node_modules/pdfjs-dist/package.json";
const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(src) && existsSync(pkg)) {
  const { version } = JSON.parse(readFileSync(pkg, "utf8"));
  const name = `pdf.worker.${version}.min.mjs`;
  mkdirSync("public", { recursive: true });
  for (const f of readdirSync("public")) if (/^pdf\.worker\..*mjs$/.test(f) && f !== name) rmSync(`public/${f}`);
  copyFileSync(src, `public/${name}`);
}
