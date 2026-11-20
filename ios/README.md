# PinPlan for iPhone & iPad (native SwiftUI)

Native app for electrical, low-voltage and specialty trade crews on site: import the plan set, tap to place devices,
draw runs, get the takeoff and the priced estimate, and run the field work (photos, checklists, tasks, logs). Works
fully offline; data is stored on the device and syncs with the web app when you sign in.

## Get the app

- **App Store / TestFlight** (how customers and the team install it). Open PinPlan, then
  **Settings › Account and cloud sync** and sign in with the same email and password as the web app, or create an
  account (that also sets up your company). Nothing else to set up: the server address is built into the app.
- **Shipping a build:** Actions → **iOS TestFlight** → *Run workflow* (or push a tag `ios-v1.0.1`). It archives,
  signs and uploads the build; it appears in App Store Connect → TestFlight after processing. See
  [docs/app-store.md](../docs/app-store.md) for the one-time setup (secrets, App Store Connect record) and the listing.

### Release builds: what is built in

| Build setting | Info.plist key | Set by |
| --- | --- | --- |
| `PINPLAN_SERVER_URL` | `PinPlanServerURL` | the repository variable `PINPLAN_SERVER_URL` (TestFlight workflow) |
| `MARKETING_VERSION` | `CFBundleShortVersionString` | `project.yml`, or the `ios-v…` tag |
| `CURRENT_PROJECT_VERSION` | `CFBundleVersion` | the workflow run number |
| `DEVELOPMENT_TEAM` | — | the `APPLE_TEAM_ID` secret (never committed) |

On first launch the app asks that server for the cloud settings, so the account screen opens straight at email +
password. Server address, access code and the cloud project can still be changed under
**Settings › More › Advanced** (only for a company running its own copy of PinPlan).

**On site:** New project → **Sheets** → *Scan paper plans* (camera finds and flattens the page) or *Digital plans*
(PDF) → **Plan** tab: tap a device type, tap the plan to place it; draw runs; set the scale by drawing a line over a
known dimension (or it's read automatically from PDFs) → **Takeoff** and **Estimate** fill in by themselves.

## Build & run (developers)
Requirements: a Mac with Xcode 26 (iOS 17+ deployment target).

```bash
brew install xcodegen          # one time
cd ios
xcodegen                       # generates PinPlan.xcodeproj from project.yml
open PinPlan.xcodeproj         # pick your team under Signing & Capabilities, choose an iPad/iPhone, Run
```

A local build has no server built in. To try it against a server, either set it once under
**Settings › More › Advanced**, or build with it: `xcodebuild … PINPLAN_SERVER_URL=https://your-server`.
(In an `.xcconfig` file write `https:/$()/your-server`, because `//` starts a comment there.)
Don't commit your team ID: pick it in Xcode's Signing tab or pass `DEVELOPMENT_TEAM=…` on the command line.

Debug builds accept launch arguments used by the screenshot workflows (`--demo`, `--tab plan`, `--settings`,
`--cloud-test <url>` …). Release builds ignore them (`#if DEBUG`).

### Developer note: sideloading a test build
For a quick test on a device without TestFlight: Actions → **iOS IPA (sideload)** → *Run workflow* → download the
**PinPlan-ipa** artifact, then install `PinPlan.ipa` with Sideloadly or AltStore using your own Apple ID (trust the
profile under Settings › General › VPN & Device Management; turn on Developer Mode if iOS asks). With a free Apple
ID the app runs for 7 days. This is for developers only; customers use the App Store.

## Layout
- `PinPlanCore/` — Swift package with all business logic (Foundation only, no UI): models, catalog, geometry,
  takeoff, estimate, editing operations, backup format, team and sign-up rules. Tested with XCTest (`swift test`),
  including the sample job hand counts and reading a backup exported by the web app.
- `PinPlan/` — the SwiftUI app.
  - `App/` app entry and app-wide model · `Persistence/Store.swift` on-device storage (JSON + JPEGs in Documents)
  - `Editor/` plan canvas (pinch, pan, tap to place, drag, run drawing), device menu, inspector, dialogs
  - `Views/` projects, sheets, takeoff, estimate, crew, job, settings, account, catalog
  - `Services/` PDF import (PDFKit), document scanner (VisionKit), PDF export, cloud sync, PinPlan server client
- `ExportOptions.plist` — App Store upload options for the TestFlight workflow (the team ID is added in CI).

## Plans: import, scanning and accuracy
- **Digital plans (best):** PDFs from Files, iCloud Drive, Mail or AirDrop ("Open in PinPlan"), drag & drop on iPad.
  Each page is rendered from its vector content (crop box and page rotation honoured), the **original PDF is kept**, and
  when you zoom past the image resolution the visible area is **re-drawn from vector** — fine print stays crisp at any zoom.
- **Automatic scale:** the printed scale on each PDF page (`SCALE: 1/4" = 1'-0"`, `1/8"=1'`, `1:48`…) is read and applied,
  so runs and home runs are measured immediately. Floor names come from the title block. "NTS" sheets are left unscaled.
- **Paper plans:** the document camera finds the page, straightens and crops it; then a review screen lets you pick
  **Clean** (flattens shadows/uneven light to white paper, boosts contrast, sharpens lines, keeps red callouts),
  **B&W** or **Original**, rotate, adjust corners, and confirms the floor name read by on-device text recognition.
- **Photos & image files** (JPG, PNG, HEIC, TIFF): page edges detected automatically (Vision), perspective-corrected,
  and cleaned the same way; drag the four corners to fine-tune.
- **Precision:** set the scale by drawing a line over a known dimension with a **magnifier loupe** (drag to aim, release
  to place); measure any distance the same way.

## Native features
- **Plan canvas**: pinch-zoom around your fingers, pan, tap to place, long-press/tap to edit, drag to move,
  haptics; runs, wire runs, closets, measure tool, find-device, layers, labels, undo/redo.
- **iPad**: device menu and inspector as side panels. **iPhone**: the same panels as sheets.
- **Exports** via the share sheet (AirDrop, Mail, Files): marked-up plan PDF with legend and count box, crew wiring
  PDF with the home-run schedule (no prices), branded client estimate PDF, CSVs, and `.pinplan.json` backups that
  open in both this app and the web app.

## Billdu and AI scan
Billdu credentials and the Anthropic key never live on the device. The app calls your deployed PinPlan web app:
set its address (and the team access code, if used) in **Settings → PinPlan server**. Without a server everything
else works, and you can share the estimate PDF/CSV instead. The Billdu card on the estimate shows only when the server
says Billdu is connected (`GET /api/billdu/credentials`); otherwise it says to connect Billdu on the web
(Settings → Connected apps).

## Cloud sync
Same tables and rules as the web app (`PinPlanCore/Sync.swift` mirrors `src/lib/syncMap.ts`):
- Pulls page by `synced_at >= watermark − 30 s`, ordered by `(synced_at, id)` with offsets (`SyncPaging.swift`), so
  rows that share a timestamp are never skipped. Each table is pulled on its own: a table the database doesn't have yet
  is skipped, and one that errors keeps what was fetched. Rows that couldn't be applied are fetched again by id.
- Joining or changing teams clears the pull watermarks once (everything comes down again).
- The ledger file records its account. Signing in with another account on a device that holds the previous account's
  jobs stops syncing until those jobs are removed from the device (they are never pushed into the new account).
- Pulled only (made on the web): plan markups, schedule, measurements, plan links, and — for the office — quotes,
  invoices and payments (Job → Quotes & invoices, read-only). RFIs: drafts made on the device go up.
- Technicians never send catalog, product or price rows (the database refuses them).
## Billdu
Billdu keys never live on the device. An owner or admin connects the company's Billdu account in the web app
(Settings › Billdu); the app's **Send to Billdu** goes through the PinPlan server with the user's own sign-in, so it
always uses their company's connection. **Settings › Billdu** in the app shows whether it is connected.

## CI
- `ios.yml` runs the core tests and builds the app (Debug for the Simulator, and an unsigned Release build) on every
  change under `ios/`.
- `ios-testflight.yml` archives, signs and uploads to TestFlight (on demand or on an `ios-v…` tag).
- `ios-screenshots.yml` (on demand) screenshots every screen on an iPhone and an iPad simulator.
- `ios-real-plans.yml` (on demand) runs real plans from the internet through the app's import, scan cleanup and plan
  reader on both simulators.
- `ios-ipa.yml` (on demand, developers only) builds an unsigned IPA for sideloading.
