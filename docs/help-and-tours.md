# Help center, guided tours and tips

Three ways the app teaches itself, smallest first:

| What | Where | Code |
| --- | --- | --- |
| **One-time tips** | One line the first time someone opens Plan, Takeoff, Tasks, Photos or Money | `src/components/tour/RouteTip.tsx`, `TIPS` in `src/lib/tour/tours.ts` |
| **Guided tours** | A spotlight on the real screen and a short card: Next / Back / Skip | `src/lib/tour/*` (pure model, store), `src/components/tour/*` (UI) |
| **Help center** | `/help` and `/help/<guide>`: short step-by-step guides with screenshots | `src/lib/help/guides.ts`, `src/components/help/*`, `src/app/help/*` |

All three are written for the job tabs **Overview · Plan · Takeoff · Tasks · Photos · Money · Field** (phones: Plan ·
Tasks · Photos · Money · More). Words follow the glossary in `docs/ux-audit.md`.

## Where people find them

- **Web**: account menu › **Help & tutorials**; the public site header (**Help**) and footer (**Help & tutorials**);
  Settings › More › **Help & tips** (the tours with Start / Resume / Take it again, **Show tips**, **Show tours and tips
  again**, **Delete the sample job**); the empty jobs list (**Start the tour**, a Help link; technicians get the crew
  guide); the end of every tour and every tip (**Learn more**).
- **First run**: the jobs list offers **Your first job** (office people only, new companies, "Try it without an
  account" or no jobs yet). Answered once: Start, or ×.
- **iPad / iPhone**: Settings › About › **Help & tutorials** and Jobs › More › **Help & tutorials** open the native
  **Tutorials** screen (offline guided tours, the welcome pages, and the web Help center in a Safari view: address from
  `WebLinks.helpURL`, the app's server, else `https://northpin.app/help`). The Jobs screen's one first-run prompt
  offers the tour (see "Help in the iPad / iPhone app" below).
- Never on client pages (`/q`, `/d`, `/co`, `/p`, `/r`): `isClientPath` in `src/lib/tour/model.ts`.

## Tours

`TOURS` in `src/lib/tour/tours.ts`: **Your first job** (create a job → upload plans and name pages → Edit → place
devices → Find similar → Add alarm sensors → Takeoff → Money: price → quote → send), **Crew: a day on site** (Tasks,
the plan in View, the job's Tasks and Photos, checklists, daily log), **Office: quotes, invoices, payments**. Steps
marked `office: true` are left out for technicians; a tour with fewer than two visible steps isn't offered.

A tour runs on a job: **Your first job** always uses the **sample job** (one floor with doors and windows:
`public/samples/sample-plan.pdf`, a copy of `samples/doors-windows-demo.pdf`, made by `src/lib/tour/sampleJob.ts`
through the normal `put`/`saveImage`, so signed in it syncs like any job; its address says it's a sample and Settings
can delete it). The crew and office tours use the open job, else the newest job, else the sample job.

### How the engine works

- `TourHost` (mounted once in `Providers`, inside `<Suspense>`) loads the state and shows the running tour
  (`TourCoach`, loaded only while a tour runs) or the place's tip.
- Each step names **where** it happens (`at`: jobs list, Tasks, Settings, or a job tab with params) and **what** it
  points at (`anchor`, optionally `phoneAnchor`). Opening a step goes there once (`hrefFor` / `atLocation`); if the
  person wanders off, the card stays and Next carries on. A job step can name a `legacy` place for builds that don't
  have the tab yet (none of the built-in tours need it any more: Tasks and Photos are tabs).
- `whenOpen`: an anchor pointed at instead while it's on screen. The upload step points at **Manage sheets**
  (`plan-sheets`) and, once a PDF is uploaded, at the **Choose and name pages** screen (`plan-pages`). While a dialog
  is open the card is drawn inside it (`useTopModalSlot`, like the toasts), so it stays visible and clickable over
  the modal; Esc then closes the tour, not the dialog.
- The anchor is found with `[data-tour="id"]` (then the registry's `fallback` selector), the first one that's
  visible; it's followed every 200 ms and on scroll/resize, and scrolled into view once. **A missing anchor never
  blocks**: after 1.5 s the card shows in the middle of the screen (a bottom sheet on phones).
- The dimmed layer is a box-shadow around the element with `pointer-events: none`: every tap goes through, so people
  can do the step for real.
- Card placement is pure (`placeCard`): below, above, right, left of the element, inside the screen; under 640 px a
  sheet along the bottom, or the top when the element is in the lower half.
- Accessibility: the card is a non-modal `role="dialog"` labelled by its title; the title takes focus on each step;
  a polite live region says "Step 2 of 10: …"; Esc closes (Help offers **Resume**), ← / → move; reduced motion turns
  off the movement; forced colours get a plain outline.

### State

`src/lib/tour/store.ts` (zustand). Per device in `localStorage["pinplan.tour"]` (prefs) and
`["pinplan.tour.active"]` (the running tour, so a reload carries on); every read and write in try/catch, so a private
window still runs tours, it just doesn't remember them. Per account in Supabase `user_metadata.tour`
(`{ done, tips, tipsOff }`, like the language): finished or skipped tours, tips seen and **Show tips** follow the
person to a new device (`mergeAccount`); saved 1.5 s after the last change, best effort.

Every change goes through `tourReducer` (start / next / back / go / skip / close / reset): **close** keeps the tour
resumable, **skip** marks it skipped. `tourButton` decides Start / Resume (step n of N) / Take it again.

## Adding things

### A step

1. Add it to the tour in `src/lib/tour/tours.ts`: `id`, `title` and `body` in `msg("…")` (one or two short
   sentences: the test allows 170 characters), `at`, `anchor`, `office: true` if it's about prices.
2. If the element has no anchor yet: add the id to `TOUR_ANCHORS` in `src/lib/tour/anchors.ts` (with the file and a
   `fallback` selector if a stable `data-testid` or element id already exists), then mark the element with
   `{...tourAnchor("your-id")}`. `tests/tour.test.ts` fails if a `data-tour` id in `src/` isn't registered.
3. Translate the two strings in every `src/lib/i18n/<lang>/help.ts`; `npm run check:i18n` must stay at 100%.

### A tip

Add the id to `TipId` / `TIP_IDS` and `tipForLocation` (`model.ts`), and its line in `TIPS` (`tours.ts`) with the
guide its **Learn more** opens. Keep it to one line (110 characters).

### A guide

1. Add it to `GUIDES` in `src/lib/help/guides.ts`: an `id` (the URL), the next sheet number (`H-11`), `title`,
   `summary`, `audience`, 3–6 `steps` (each a short title and one or two sentences), optional `notes` and `tour`.
2. Screenshots: name the file in a step's `shot` (`/help/<name>.webp`, `device: "desktop" | "phone"`) and add the
   capture to `scripts/help-screens.mjs`. Desktop is 1280 × 800, phones 390 × 844 at 2× (`SHOT_SIZE`).
3. Translate in every `help.ts`. The page is prerendered (`generateStaticParams`) and precached by the service worker
   (`collectPrerendered` in `scripts/build-sw.mjs` reads `.next/prerender-manifest.json`; `collectHelpImages` adds
   `public/help/*`), so it opens offline after one online visit.

### Screenshots

```
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run build
node scripts/help-screens.mjs                       # starts next start on a free port
HELP_BASE_URL=http://localhost:3301 node scripts/help-screens.mjs   # or an app that's already running
```

The script uses the sample job (local-only, demo mode, tips and the tour offer turned off), uploads
`samples/demo-plan-set.pdf` to show **Choose and name pages** (then cancels), places a few devices, counts doors and
windows with **Read tags**, adds sensors, gives a camera a photo and a task for the device card's chips
(`device-links`), prices, finalizes a quote and an invoice, and takes the Tasks, Photos, daily-log and plan screens
(with the bottom tab bar) on an iPhone-sized page. It encodes WebP in the browser (no image library); the folder is about 0.5 MB
(`tests/tour.test.ts` keeps it under 3 MB). Screenshots are **English UI**: other languages show the same pictures
(guide H-10 says so). Re-run it after a UI change the pictures show (the pages screen after upload, the job tabs).

## Help in the iPad / iPhone app

A native tutorial that works offline (crews are often without signal on site), plus the web Help center.

- **Model** (PinPlanCore `Tutorials.swift`, tested in `TutorialTests`): two tours, **Your first job** (office: start a
  job → plans and pages → Edit → place devices → Find similar → alarm sensors → takeoff → price → quote) and **Crew
  basics** (technicians: open a job → the plan in View → tap a device → the job's Tasks → Photos → working with no
  signal); the welcome pages; `TutorialLogic.reduce` (start / next / back / go / skip / close / don't show again /
  reset); the card's placement (`TutorialLayout`); the launch arguments (`TutorialLaunch`). Steps reuse the web tours'
  English (and so their translations) where it fits the app; office steps (`officeOnly`) are left out for technicians.
- **State** in UserDefaults `pinplan.tutorial.prefs` (finished, skipped, paused with the step, first-run prompt
  answered, Don't show again). Anyone who closed the earlier Help tip (`pinplan.help.tipSeen`) isn't asked again. A
  tour on screen when the app quits is offered as **Resume**, not reopened.
- **First run**: one prompt on the Jobs screen (`HelpTipBanner`): **Start the tour** opens the welcome pages, which end
  on the tour for this person; **Help & tutorials** opens Tutorials; × answers it. Nothing opens by itself.
- **Coach marks** (`ios/PinPlan/Tutorial/`): `TutorialController` (shared, like `JobNav`) runs the tour; each step
  goes to its place once (the jobs list, or a section of the **demo job**, never the person's own jobs; drawn if
  missing). Controls are marked with `.tutorialAnchor("id")`, which reports the control's frame in window
  coordinates (so toolbar items work too); `TutorialTests` checks every step's anchor is marked in the app. A step can
  name other anchors for iPhone (`compactAnchors`) and fallbacks; **a missing anchor never blocks**: after a moment the
  card shows centred. The dimmed layer lets every tap through; the card has Skip · dots · Back · Next, × (resume
  later) and, on the first step, Don't show again. VoiceOver hears "Step 2 of 9: …" and focus moves to the title.
- **Replay**: **Tutorials** (Start / Resume (step n of N) / Take it again, the welcome pages, the web Help center,
  Reset tutorials).
- **Screenshots**: `--tutorial [welcome|first-job|crew-basics] --tutorial-step=N` (Debug builds) and the **tutorial**
  suite of `.github/workflows/ios-sim-screens.yml` (`ios/PinPlanUITests/TutorialScreens.swift`).

Anchors: jobs list `jobs-new` (New job), `jobs-list`; job `job-sections` (iPad section picker); plan `plan-sheets`
(sheet pill), `plan-mode` (View / Edit), `plan-palette` (iPad device list), `plan-devices` (Devices button),
`plan-tools` (Tools menu: Find similar, Add alarm sensors), `plan-canvas`; `takeoff-table`; `money-total`,
`money-quotes` (Quotes & invoices, when the app is connected to a server); `tasks-list`; `photos-add`, `photos-list`.

`WebLinks.help`, `WebLinks.helpGuide(_:)`, `WebLinks.helpURL(origin:guide:)` (PinPlanCore, tested in
`WebLinksTests`). Strings in `ios/PinPlan/Localizable.xcstrings` (the tours' words are marked `extractionState:
manual`: they come from PinPlanCore and are shown with `tr()`).
