# Vendored browser libraries

Served from our own origin so they work offline and need no third-party host in the CSP.

| File | Source | License |
| --- | --- | --- |
| `opencv-4.10.0.js` | OpenCV.js 4.10.0, unmodified copy of `https://docs.opencv.org/4.10.0/opencv.js` (SHA-256 `e9aa95159522347410aba2321a72b19a71764de737b29030a341439ab60ea724`) | Apache-2.0 (OpenCV) |
| `tesseract-7.0.0/tesseract.min.js`, `worker.min.js`, `LICENSE.txt` | Tesseract.js 7.0.0 (`dist/` of the npm package `tesseract.js@7.0.0`) | Apache-2.0 (Tesseract.js) |
| `tesseract-7.0.0/tesseract-core-simd-lstm.wasm.js` | Tesseract.js-core 7.0.0 (npm `tesseract.js-core@7.0.0`): the Tesseract OCR engine compiled to WebAssembly, LSTM-only build with SIMD | Apache-2.0 (Tesseract, Tesseract.js-core) |
| `tesseract-7.0.0/lang/eng.traineddata.gz` | English model, `4.0.0_best_int` from npm `@tesseract.js-data/eng@1.0.0` (from tesseract-ocr/tessdata_best) | Apache-2.0 (tessdata); package MIT |

OpenCV.js is only loaded when someone uses the photo-straightening tool (`src/lib/perspective.ts`). The service worker
caches it on that first use rather than on install (it is about 10 MB). To upgrade: download the new `opencv.js`, save
it under a new versioned name, and update `OPENCV_URL` in `src/lib/perspective.ts` and this table.

Tesseract.js (on-device text recognition, `src/lib/ocr.ts`) is only loaded when a scanned page or a photo needs its
floor name read (the import page picker, photo import). The service worker caches the files on that first use (about
7 MB). `node scripts/vendor-ocr.mjs` downloads them from the npm registry at the pinned versions and checks each file's
SHA-256 (`--check` verifies the files in place); to upgrade, change the pins there, `OCR_BASE` in `src/lib/ocr.ts`
and this table.
