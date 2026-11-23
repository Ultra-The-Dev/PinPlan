# PinPlan on the App Store — listing and review draft

Draft answers for App Store Connect. Replace every `<…>` placeholder before submitting. Keep the privacy answers in
step with `ios/PinPlan/PrivacyInfo.xcprivacy`.

## How PinPlan is sold (read first)

PinPlan is a business service sold on the web, per company, and used on the web, iPhone and iPad. The iOS app is a
free companion to that paid web service and sells nothing:

- No prices, plans, "subscribe", "upgrade" or "buy" buttons anywhere in the app, and no in-app purchase.
- **United States storefront only:** owners and admins see a neutral **Manage your account on the web** link
  (Settings › Team, and the billing notice). It opens `<server>/settings#billing` in Safari. The app checks
  `Storefront.current?.countryCode == "USA"` (StoreKit) before showing it.
- **Every other storefront:** no link and no call to action. The app only says, in plain text, "Your PinPlan account
  is managed outside this app." Technicians everywhere see "Ask your office."
- Notices use neutral wording: "Your company's PinPlan subscription needs attention."
- A company whose subscription has lapsed can still sign in, view and export everything (read-only); edits stay on
  the device until the company is active again.

Guidelines this follows:

- **3.1.3(f) Free Stand-alone Apps:** a free app that works alongside a paid web tool does not need in-app purchase,
  provided there is no purchasing inside the app and no call to action to buy outside it. That is why the link is
  hidden outside the US.
- **United States storefront:** since the May 2025 guideline update, apps on the US storefront may include buttons and
  links to the developer's website (3.1.1(a) and 3.1.3 no longer bar this in the US). The US-only link relies on that.

If App Review asks for the link to be removed, delete the `manageOnWeb` button in
`ios/PinPlan/Views/AccountViews.swift` (or make `SignupLogic.mayLinkToWebAccount` return false); nothing else
depends on it.

## Creating an account in the app (5.1.1(v))

The app lets people create an account (email, password of at least 10 characters, their name and company) and sets
up the company in the same step. They must tick "I agree to the Terms of Service and Privacy Policy" (links to
`<server>/terms` and `<server>/privacy`); the time is saved with the account as `terms_accepted_at` in the user's
profile. Account deletion is in the app too (see below).

## App information

| Field | Value |
| --- | --- |
| Name | PinPlan — Plan Takeoff & Field |
| Subtitle (30 chars) | Takeoff, estimates, field work |
| Primary category | Business |
| Secondary category | Productivity |
| Bundle ID | `app.northpin.ios` |
| SKU | `pinplan-ios` |
| Age rating | 4+ (no objectionable content; no unrestricted web access; no user-to-public sharing) |
| Copyright | `<© 2026 Your Company LLC>` |
| Privacy policy URL | `https://<your-server>/privacy` |
| Terms of use (EULA) | `https://<your-server>/terms` (or Apple's standard EULA) |
| Support URL | `https://<your-server>/support` |
| Marketing URL | `https://<your-server>/` |

### Promotional text (170 chars)

Mark up plan sets on site, get per-floor counts and a priced estimate in minutes, then run the job. Works offline;
syncs with your office.

### Description

PinPlan turns a plan set into a takeoff, an estimate and a well-run job for electrical, low-voltage and specialty
trade contractors.

PLAN IT ON SITE
• Import PDF plan sets and photos, or scan paper plans with the camera
• Tap to place devices: receptacles, lights, switches, data drops, cameras, access control, speakers and more
• Draw wire runs and home runs; set the scale once per sheet

COUNT AND PRICE IT
• Per-floor takeoff that updates as you work
• Priced estimate from your own catalog, products, markup, labor and wire
• Client proposals with options and e-signature

RUN THE JOB
• Tasks and punch lists, plan markups, sheet revisions and measurements
• Job photos with mark-up, checklists, forms, daily reports and install progress
• Photo and daily-report PDFs, or a link for the client

WORK AS A TEAM
• Office staff and technicians each get their own sign-in
• Technicians do field work without seeing prices
• Works offline; changes sync between iPhone, iPad and the web app

PinPlan is a service for companies. Sign in with the same email and password as on the web, or create your
company's account in the app.

### Keywords (100 chars)

`takeoff,floor plan,estimate,electrical,low voltage,contractor,blueprint,markup,punch list,field`

### What's new (1.0)

First release.

## App Review information

- **Sign-in required:** yes for sync and teams; the app also works fully offline without an account.
- **Demo account:** `<review account email>` / `<password>` — owner of the team "<Demo Company>" with demo jobs.
  Make sure the team is `comped` or `active` so it isn't read-only during review.
- **Server setup the reviewer needs:** none. Release builds have the server built in (`PINPLAN_SERVER_URL`), so
  Settings › Account and cloud sync opens straight at email + password.
- **Notes for the reviewer:**

  > PinPlan is a business tool for trade contractors, sold per company on our website and used on the web, iPhone
  > and iPad. The app is free, has no in-app purchases and shows no prices or purchase buttons. On the United States
  > storefront, owners can open their account page on our website from Settings › Team ("Manage your account on the
  > web"); on other storefronts there is no link.
  >
  > To try it without signing in: Projects › More › Create demo job. To see team features, sign in with the demo
  > account above (Settings › Account and cloud sync).
  >
  > Account deletion: Settings › Account and cloud sync › Delete account… (type DELETE to confirm). It deletes the
  > account on our server and clears the device.
  >
  > Camera: scanning paper plans and job photos. Photo library: picking plan and job photos (picker only).
  > Location: optional, stamps where a job photo was taken.

## App Privacy ("nutrition label")

Tracking: **No** (no tracking, no third-party SDKs, no ads, no analytics).

Data collected (all **linked to the user**, **not used for tracking**, purpose **App Functionality** only). This is
exactly the list in `PrivacyInfo.xcprivacy`:

| Category | Type | Why |
| --- | --- | --- |
| Contact info | Email address | Sign-in, team invites, password reset |
| Contact info | Name | Shown to teammates on photos, logs and tasks |
| Contact info | Phone number | Client phone numbers entered on jobs |
| Contact info | Physical address | Job and client addresses |
| User content | Photos or videos | Plan images and job photos synced to the account |
| User content | Other user content | Plans, notes, checklists, forms, logs, documents |
| Location | Precise location | Optional: where a job photo was taken (stored with the photo) |
| Identifiers | User ID | The account that owns the jobs |

Not collected by the app: customer support messages (support is on the website), health, financial info (payments
are handled on the web by Stripe, never in the app), browsing or search history, contacts, usage data, diagnostics,
device ID, purchases, sensitive info.

Data without an account stays on the device and is not collected.

Required-reason APIs declared in the manifest: UserDefaults (`CA92.1`, the app's own settings). No file-timestamp,
boot-time, disk-space or keyboard APIs are used.

## Export compliance

`ITSAppUsesNonExemptEncryption = NO` is set in the Info.plist (`ios/project.yml`). The app only uses standard HTTPS
(URLSession / App Transport Security) and the system Keychain, which is exempt. No proprietary or non-standard
encryption. No export documentation is needed.

## Shipping builds (TestFlight)

One-time setup:

1. Apple Developer Program membership; create the app record in App Store Connect with bundle ID `app.northpin.ios`.
2. App Store Connect → Users and Access → Integrations → App Store Connect API: create a key with the **App Manager**
   role and download the `.p8` file (it can only be downloaded once).
3. GitHub → Settings → Secrets and variables → Actions:
   - secrets `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole `.p8` file text);
   - variable `PINPLAN_SERVER_URL` = the web app's `https://` address.

Each release: Actions → **iOS TestFlight** → Run workflow (or push a tag `ios-v1.0.1`, which also sets the version).
The build number is the workflow run number. Nothing about the team, keys or server is committed to the repo.

## Before you submit

- [ ] Web server deployed with `/terms`, `/privacy`, `/support`, `/reset`, `/api/config` and `DELETE /api/account`
      working.
- [ ] Supabase Auth › URL configuration: add `https://<your-server>/reset` to the allowed redirect URLs (password reset
      from the app sends `redirect_to` there). Minimum password length set to 10 to match the apps.
- [ ] TestFlight secrets and the `PINPLAN_SERVER_URL` variable set (above); a TestFlight build installed and signed in.
- [ ] Demo account created, team comped/active, a couple of demo jobs synced.
- [ ] Screenshots from the "iOS screenshots" workflow (iPhone 6.9" and iPad 13"): home, plan, takeoff, estimate,
      photos, team. Don't use `billing*` / `deleteaccount` captures in the listing (they're for QA).
- [ ] Version in `ios/project.yml` (`MARKETING_VERSION`) or the `ios-v…` tag.
- [ ] App Privacy answers above entered in App Store Connect; privacy policy URL matches.
