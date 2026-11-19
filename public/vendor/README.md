# Vendored browser libraries

Served from our own origin so they work offline and need no third-party host in the CSP.

| File | Source | License |
| --- | --- | --- |
| `opencv-4.10.0.js` | OpenCV.js 4.10.0, unmodified copy of `https://docs.opencv.org/4.10.0/opencv.js` (SHA-256 `e9aa95159522347410aba2321a72b19a71764de737b29030a341439ab60ea724`) | Apache-2.0 (OpenCV) |

OpenCV.js is only loaded when someone uses the photo-straightening tool (`src/lib/perspective.ts`). The service worker
caches it on that first use rather than on install (it is about 10 MB). To upgrade: download the new `opencv.js`, save
it under a new versioned name, and update `OPENCV_URL` in `src/lib/perspective.ts` and this table.
