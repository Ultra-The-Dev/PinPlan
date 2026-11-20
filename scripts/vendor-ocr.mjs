// Downloads the self-hosted OCR engine (Tesseract.js, Apache-2.0) into public/vendor/tesseract-<version>/ from the
// npm registry, at exact pinned versions, and checks every file against its SHA-256. The files are committed, so this
// only needs running to restore or upgrade them (then update the pins here, OCR_BASE in src/lib/ocr.ts and
// public/vendor/README.md). Usage: node scripts/vendor-ocr.mjs [--check]
//   --check  only verify the files already in public/vendor (exit 1 when one is missing or different).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OCR_DIR = "tesseract-7.0.0";
const dest = path.join(root, "public/vendor", OCR_DIR);

/** Each package: its registry tarball, the tarball's npm integrity, and the files we copy (path in package → name, SHA-256). */
const PACKAGES = [
  {
    tarball: "https://registry.npmjs.org/tesseract.js/-/tesseract.js-7.0.0.tgz",
    integrity: "sha512-exPBkd+z+wM1BuMkx/Bjv43OeLBxhL5kKWsz/9JY+DXcXdiBjiAch0V49QR3oAJqCaL5qURE0vx9Eo+G5YE7mA==",
    files: [
      ["package/dist/tesseract.min.js", "tesseract.min.js", "000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e"],
      ["package/dist/worker.min.js", "worker.min.js", "576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d"],
      ["package/LICENSE.md", "LICENSE.txt", "b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1"],
    ],
  },
  {
    tarball: "https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-7.0.0.tgz",
    integrity: "sha512-WnNH518NzmbSq9zgTPeoF8c+xmilS8rFIl1YKbk/ptuuc7p6cLNELNuPAzcmsYw450ca6bLa8j3t0VAtq435Vw==",
    // The LSTM-only engine with WebAssembly SIMD (every browser the app supports; Safari 16.4+).
    files: [["package/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38"]],
  },
  {
    tarball: "https://registry.npmjs.org/@tesseract.js-data/eng/-/eng-1.0.0.tgz",
    integrity: "sha512-mbTumm6KQPUHyzTPQaF3ObXYnx0SqqfV2nabqFVQBwD6Kl7PhGSLSzOlfFTWy0P3BjghaSKA2W9GB19Jk+ZcTg==",
    // English, "best_int" (integer LSTM model from tessdata_best; Apache-2.0): ~2.9 MB gzipped.
    files: [["package/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz", "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91"]],
  },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function check() {
  const bad = [];
  for (const p of PACKAGES)
    for (const [, name, hash] of p.files) {
      const f = path.join(dest, name);
      if (!existsSync(f)) bad.push(`missing  public/vendor/${OCR_DIR}/${name}`);
      else if (sha256(readFileSync(f)) !== hash) bad.push(`changed  public/vendor/${OCR_DIR}/${name}`);
    }
  return bad;
}

if (process.argv.includes("--check")) {
  const bad = check();
  for (const b of bad) console.error(b);
  console.log(bad.length ? `OCR files: ${bad.length} problem(s). Run: node scripts/vendor-ocr.mjs` : "OCR files: all present and verified.");
  process.exit(bad.length ? 1 : 0);
}

const tmp = mkdtempSync(path.join(tmpdir(), "vendor-ocr-"));
try {
  for (const p of PACKAGES) {
    const res = await fetch(p.tarball);
    if (!res.ok) throw new Error(`${p.tarball}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const [algo, want] = p.integrity.split("-");
    const got = createHash(algo).update(buf).digest("base64");
    if (got !== want) throw new Error(`${p.tarball}: integrity mismatch`);
    const dir = mkdtempSync(path.join(tmp, "pkg-"));
    const tgz = path.join(dir, "pkg.tgz");
    writeFileSync(tgz, buf);
    execFileSync("tar", ["-xzf", tgz, "-C", dir]);
    for (const [from, name, hash] of p.files) {
      const data = readFileSync(path.join(dir, from));
      if (sha256(data) !== hash) throw new Error(`${from}: SHA-256 mismatch`);
      const out = path.join(dest, name);
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, data);
      console.log(`public/vendor/${OCR_DIR}/${name}  ${(data.length / 1e6).toFixed(1)} MB`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
