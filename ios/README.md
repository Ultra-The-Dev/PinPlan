# PinPlan for iPhone & iPad (native SwiftUI)

Native app for installers on site: import the plan set, tap to place devices, draw LED and wire runs, get the takeoff,
price the estimate and send it to Billdu. Works fully offline; data is stored on the device.

## Get it on your iPhone / iPad (about 15 minutes, needs a Mac)
1. On the Mac, install **Xcode** from the App Store (free) and open it once so it finishes setting up.
2. In Terminal: `brew install xcodegen` (install Homebrew from brew.sh first if you don't have it), then
   `git clone` this repo, check out this branch, `cd ios && xcodegen && open PinPlan.xcodeproj`.
3. In Xcode: **Settings → Accounts → +** and sign in with your Apple ID.
4. Click the **PinPlan** project → **Signing & Capabilities** → choose your team (your Apple ID). If Xcode says the
   bundle identifier is taken, change it to something unique, e.g. `com.yourcompany.pinplan`.
5. Plug in the iPhone or iPad (or pick it over Wi-Fi), select it at the top of Xcode and press **Run ▶**.
6. First launch on the device: **Settings → General → VPN & Device Management** → trust your developer profile.
   Turn on **Developer Mode** if iOS asks (Settings → Privacy & Security), then open PinPlan.

With a free Apple ID the app must be re-installed from Xcode every 7 days. With an Apple Developer account
($99/yr) archive once (Product → Archive → Distribute → TestFlight) and install it on every device from TestFlight.

**On site:** New project → **Sheets** → *Scan paper plans* (camera finds and flattens the page) or *Digital plans*
(PDF) → **Plan** tab: tap a device type, tap the plan to place it; draw LED runs; set the scale by drawing a line over a
known dimension (or it's read automatically from PDFs) → **Takeoff** and **Estimate** fill in by themselves.
Everything works offline; Billdu and the AI reader need the PinPlan server address in Settings.

## Build & run
Requirements: a Mac with Xcode 16+ (iOS 17+ deployment target).

```bash
brew install xcodegen          # one time
cd ios
xcodegen                       # generates PinPlan.xcodeproj from project.yml
open PinPlan.xcodeproj         # pick your team under Signing & Capabilities, choose an iPad/iPhone, Run
```

For TestFlight / App Store: set your bundle id in `project.yml` (`PRODUCT_BUNDLE_IDENTIFIER`), archive in Xcode
(Product → Archive) and upload from the Organizer.

## Layout
- `PinPlanCore/` — Swift package with all business logic (Foundation only, no UI): models, catalog, geometry,
  takeoff, estimate, editing operations, backup format. Tested with XCTest (`swift test`), including the
  20 Hilltop Dr E hand counts and reading a backup exported by the web app.
- `PinPlan/` — the SwiftUI app.
  - `App/` app entry and app-wide model · `Persistence/Store.swift` on-device storage (JSON + JPEGs in Documents)
  - `Editor/` plan canvas (pinch, pan, tap to place, drag, run drawing), device menu, inspector, AI scan, dialogs
  - `Views/` projects, sheets, takeoff, estimate, crew, job, settings, catalog
  - `Services/` PDF import (PDFKit), document scanner (VisionKit), PDF export, PinPlan server client

## Plans: import, scanning and accuracy
- **Digital plans (best):** PDFs from Files, iCloud Drive, Mail or AirDrop ("Open in PinPlan"), drag & drop on iPad.
  Each page is rendered from its vector content (crop box and page rotation honoured), the **original PDF is kept**, and
  when you zoom past the image resolution the visible area is **re-drawn from vector** — fine print stays crisp at any zoom.
- **Automatic scale:** the printed scale on each PDF page (`SCALE: 1/4" = 1'-0"`, `1/8"=1'`, `1:48`…) is read and applied,
  so LED runs and home runs are measured immediately. Floor names come from the title block. "NTS" sheets are left unscaled.
- **Paper plans:** the document camera finds the page, straightens and crops it; then a review screen lets you pick
  **Clean** (flattens shadows/uneven light to white paper, boosts contrast, sharpens lines, keeps red callouts),
  **B&W** or **Original**, rotate, adjust corners, and confirms the floor name read by on-device text recognition.
- **Photos & image files** (JPG, PNG, HEIC, TIFF): page edges detected automatically (Vision), perspective-corrected,
  and cleaned the same way; drag the four corners to fine-tune.
- **Precision:** set the scale by drawing a line over a known dimension with a **magnifier loupe** (drag to aim, release
  to place); measure any distance the same way.

## Native features
- **Plan canvas**: pinch-zoom around your fingers, pan, tap to place, long-press/tap to edit, drag to move,
  haptics; LED runs, stair LED (steps × LF), wire runs, closets, measure tool, find-device, layers, labels, undo/redo.
- **iPad**: device menu and inspector as side panels. **iPhone**: the same panels as sheets.
- **Exports** via the share sheet (AirDrop, Mail, Files): marked-up plan PDF with legend and count box, crew wiring
  PDF with the home-run schedule (no prices), branded client estimate PDF, CSVs, and `.pinplan.json` backups that
  open in both this app and the web app.

## Billdu and AI scan
Billdu credentials and the Anthropic key never live on the device. The app calls your deployed PinPlan web app:
set its address (and the team access code, if used) in **Settings → PinPlan server**. Without a server everything
else works, and you can share the estimate PDF/CSV instead.

## CI
- `.github/workflows/ios.yml` builds the app for the iOS Simulator and runs the core tests on every change under `ios/`.
- `ios-screenshots.yml` screenshots every screen on an iPhone and an iPad simulator (demo job + a generated architect sheet).
- `ios-real-plans.yml` downloads real plans from the internet (Revit-exported architect PDFs, a Library of Congress scan of
  a hand-drawn sheet, and a simulated phone photo of it from `scripts/make_plan_photo.py`) and runs them through the
  app's import, scan cleanup and plan reader on both simulators.
