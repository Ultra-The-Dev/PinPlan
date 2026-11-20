# Offline, updates and image performance

PinPlan is local-first: jobs, plans and photos live in IndexedDB on the device (`src/lib/db.ts`). This page covers the
other half — keeping the app itself available with no signal, shipping updates without breaking open tabs, and keeping
image-heavy screens light enough for an iPad.

## Service worker

- **Generated per build.** `npm run build` runs `next build`, then `postbuild` → `scripts/build-sw.mjs`, which writes
  `public/sw.js` from `scripts/sw.template.js` (edit the template, never `public/sw.js`; it is gitignored). The script
  fills in the build id (`.next/BUILD_ID`) and the precache list:
  - every static page found under `src/app` (dynamic `[x]` routes, `/api` and `/admin` are skipped), always including
    `/`, `/project`, `/offline`, `/privacy`, `/terms` and `/support`;
  - every file under `.next/static` (JS chunks, CSS, fonts; no source maps) — about 7 MB;
  - the manifest, icons and the versioned PDF.js worker.
  - Not precached: `public/vendor` (OpenCV, ~10 MB). It is cached the first time the straightening tool uses it.
- **Install** fetches each URL on its own (`Promise.allSettled`), so one missing file never stops the rest from being
  cached. Only `ok`, same-origin (`type: "basic"`), non-redirected responses are stored.
- **Pages** are network first; a successful page is saved under its path (the query is ignored, so
  `/project?id=…` is one saved page for every job). Offline: the saved page, else `/offline`. On a weak signal
  (no answer and no failure within 4 s) the saved page is used; the late network answer still refreshes it.
- **Build files** (`/_next/static`, `/vendor`, the PDF.js worker) are cache first: their URLs change with their
  content. Workers get a fresh copy of the cached response so Turbopack's `#params=` bootstrap fragment survives.
- **RSC payloads** (`?_rsc=` / `RSC: 1`) are never cached; offline, the router falls back to a full page load, which
  the page cache answers.
- **Versions.** Each build has its own cache, `pinplan-<build id>`. On activation the worker records the build in
  `pinplan-meta` and keeps this build's cache and the previous one (a tab still on the old build can finish
  lazy-loading its chunks); older ones are deleted.

## Update flow

1. A deploy changes `/sw.js`. The browser downloads it on the next page load, when the tab comes back to the front, or
   on the hourly check in `src/components/UpdatePrompt.tsx`.
2. The new worker installs and precaches, then **waits** (no automatic `skipWaiting`): nothing changes under an open tab.
3. `UpdatePrompt` shows **Update ready · Reload**. Tapping Reload posts `SKIP_WAITING`; when the new worker takes control
   (`controllerchange`) the page reloads once. The × hides the prompt; the update applies the next time every tab of the
   app is closed.
4. If a tab still running an old build asks for a chunk that a deploy removed, `src/app/error.tsx` /
   `global-error.tsx` reload once (`src/lib/chunkError.ts`; a second failure within a minute shows the normal error page).

## PDF.js worker

`postinstall` (`scripts/copy-pdf-worker.mjs`) copies the worker to `public/pdf.worker.<version>.min.mjs` and removes
older copies; `src/lib/importPlans.ts` points `workerSrc` at the file for `lib.version`. `pdfjs-dist` is pinned to an
exact version in `package.json` so library and worker always match.

## Thumbnails

`src/lib/thumbs.ts` makes small JPEG previews — 480 px for sheets (job cards), 400 px for photos (photo grids) — and
keeps them in the local-only Dexie table `thumbs` (schema v49; never synced, safe to clear). Photos get theirs at
import from the canvas already drawn; sheets, and anything pulled from another device, get theirs the first time a card
or grid shows them. At most two full-size images are decoded at once while making thumbs. Use `useThumbUrl(imageId,
size)` (`src/lib/useImage.ts`) for cards and grids; open the full image only in a viewer or the plan editor.

Photo grids (`PhotosTab`, `PhotoFeed`) show the newest 60 photos and load the next 60 as you scroll
(`firstPhotos` in `src/lib/photos.ts`).

## Plan editor warm-up

After the first load, `src/components/Providers.tsx` imports the plan editor's code when the browser is idle (only on
devices that have jobs, and not with Data Saver on), so opening a Plan tab is instant.

## Map tiles and weather

Configured in `src/lib/endpoints.ts`. The defaults are fine for development but **not for a commercial launch**:

| What | Default | Set for production |
| --- | --- | --- |
| Jobs map tiles | OpenStreetMap's public tile server (its usage policy rules out an app's production traffic) | `NEXT_PUBLIC_MAP_TILE_URL` — a Leaflet template, e.g. `https://<provider>/{z}/{x}/{y}.png?key={key}`; `NEXT_PUBLIC_MAP_TILE_KEY` (a browser key — restrict it to your domain at the provider); `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` |
| Daily-log weather | Open-Meteo's free API (non-commercial use only) | `NEXT_PUBLIC_WEATHER_URL=/api/weather` plus server-only `OPEN_METEO_API_KEY`: requests go through `src/app/api/weather/v1/{forecast,archive}` (with the key: signed-in people only, rate-limited per IP and per person in the database), which adds the key and calls Open-Meteo's commercial hosts. Or an `https://` origin of a self-hosted Open-Meteo. |

Offline, the map shows "The map needs a connection" over the map while pins and the job list keep working; the weather
fields stay editable by hand. The CSP adds an off-site `NEXT_PUBLIC_WEATHER_URL` origin to `connect-src`; tiles are
images (already `img-src https:`). OpenCV.js is self-hosted (`public/vendor`), so no third-party script host is allowed.

## Checking it by hand

On a scratch copy (never in the repo root while `.claude/worktrees` exists in it):

1. `npm run build` (the last line reads `sw.js: build <id>, N pages + M files precached`), then `npx next start -p 32xx`.
2. Fresh browser profile: open `/`, wait a few seconds (DevTools → Application → Cache storage shows
   `pinplan-<build id>` with ~130 entries).
3. Create a job with a sheet, go offline (DevTools → Network → Offline), open `/project?id=…&tab=plan`: the plan
   loads and is editable. `/privacy`, `/photos` and `/map` load; an unknown path shows the offline page.
4. Update: change `const BUILD` in `public/sw.js` (or deploy again), reload: **Update ready · Reload** appears; Reload
   reloads once into the new build, and Cache storage holds the new and the previous build only.

Result on 2026-11-19 (production build, headless Chrome): all four steps passed — 136 entries precached, plan tab
offline with the sheet drawn, offline page for an unknown path, update prompt → reload → caches pruned to two builds.
