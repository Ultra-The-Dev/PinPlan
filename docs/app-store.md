# PinPlan on the App Store — listing and review draft

Draft answers for App Store Connect. Replace every `<…>` placeholder before submitting. Keep the privacy answers in
step with `ios/PinPlan/PrivacyInfo.xcprivacy`.

## How PinPlan is sold (read first)

PinPlan is a business service sold on the web, per company, and used on the web, iPhone and iPad. The iOS app sells
nothing:

- No prices, plans, "subscribe", "upgrade" or "buy" buttons anywhere in the app.
- Owners and admins see a neutral **Manage your account on the web** link (Settings › Team, and the billing notice).
  It opens `<server>/settings#billing` in Safari. Technicians see "Ask your office."
- Notices use neutral wording: "Your company's PinPlan subscription needs attention."
- A company whose subscription has lapsed can still sign in, view and export everything (read-only); edits stay on
  the device until the company is active again.

This is the multiplatform business-service pattern (App Review Guidelines 3.1.3(b) / 3.1.3(f)). If App Review asks
for the web link to be removed, delete the `manageOnWeb` button in `ios/PinPlan/Views/AccountViews.swift`; nothing
else depends on it.

## App information

| Field | Value |
| --- | --- |
| Name | PinPlan — Floor Plan Takeoff |
| Subtitle (30 chars) | Pin devices, count, estimate |
| Primary category | Business |
| Secondary category | Productivity |
| Bundle ID | `com.pinplan.app` |
| SKU | `pinplan-ios` |
| Age rating | 4+ (no objectionable content; no unrestricted web access; no user-to-public sharing) |
| Copyright | `<© 2026 Your Company LLC>` |
| Privacy policy URL | `https://<your-server>/privacy` |
| Terms of use (EULA) | `https://<your-server>/terms` (or Apple's standard EULA) |
| Support URL | `https://<your-server>/support` |
| Marketing URL | `https://<your-server>/` |

### Promotional text (170 chars)

Mark up plan sets on site, get per-floor device counts and a priced estimate in minutes. Works offline; syncs with
your office on the web.

### Description

PinPlan turns a floor plan into a takeoff and an estimate for low-voltage, AV, security and smart-home installers.

PLAN IT ON SITE
• Import PDF plan sets, photos or scan paper plans with the camera
• Tap to pin cameras, Wi-Fi, speakers, TVs, keypads, sensors and LED runs
• Draw wire runs and home runs to the closet; set the scale once per sheet

COUNT AND PRICE IT
• Per-floor takeoff that updates as you work
• Priced estimate from your own catalog, products, markup, labor and wire
• Client proposals with options and e-signature; send to Billdu

DOCUMENT THE JOB
• Job photos with mark-up, checklists, daily logs, tasks and documents
• Photo and daily-log reports as PDFs or a link for the client

WORK AS A TEAM
• Office staff and technicians each get their own sign-in
• Technicians do field work without seeing prices
• Works offline; changes sync between iPhone, iPad and the web app

PinPlan is a service for companies. Your company's PinPlan account is set up and managed on the web; sign in with
the same email and password here.

### Keywords (100 chars)

`takeoff,floor plan,estimate,low voltage,AV,security,installer,blueprint,markup,field,contractor`

### What's new (1.0)

First release.

## App Review information

- **Sign-in required:** yes (for sync and teams; the app also works fully offline without an account).
- **Demo account:** `<review@yourcompany.com>` / `<password>` — owner of the team "<Demo Company>" with demo jobs.
  Make sure the team is `comped` or `active` so it isn't read-only during review.
- **Server setup the reviewer needs:** none if the build ships with the server address pre-filled; otherwise:
  Settings › PinPlan server → `<your-server>` → Check connection, then Settings › Account and cloud sync →
  "Get cloud settings from my PinPlan server" → Sign in.
- **Notes for the reviewer:**

  > PinPlan is a business tool for installation companies, sold per company on our website and used on the web,
  > iPhone and iPad. The app has no in-app purchases and shows no prices or purchase buttons. Owners can open their
  > account page on our website from Settings › Team ("Manage your account on the web").
  >
  > To try it without signing in: Projects › More › Create demo job. To see team features, sign in with the demo
  > account above.
  >
  > Account deletion: Settings › Account and cloud sync › Delete account… (type DELETE to confirm). It deletes the
  > account on our server and clears the device.
  >
  > Camera: scanning paper plans and job photos. Photo library: picking plan and job photos (picker only).
  > Location: optional, stamps where a job photo was taken.

## App Privacy ("nutrition label")

Tracking: **No** (no tracking, no third-party SDKs, no ads, no analytics).

Data collected (all **linked to the user**, **not used for tracking**, purpose **App Functionality** only):

| Category | Type | Why |
| --- | --- | --- |
| Contact info | Email address | Sign-in, team invites, password reset |
| Contact info | Name | Shown to teammates on photos, logs and tasks |
| Contact info | Phone number | Client phone numbers entered on jobs |
| Contact info | Physical address | Job and client addresses |
| User content | Photos or videos | Plan images and job photos synced to the account |
| User content | Customer support | Messages sent through the support page |
| User content | Other user content | Plans, notes, checklists, logs, documents |
| Location | Precise location | Optional: where a job photo was taken (stored with the photo) |
| Identifiers | User ID | The account that owns the jobs |

Not collected: health, financial info (payments are handled on the web by Stripe, never in the app), browsing or
search history, contacts, usage data, diagnostics, device ID, purchases, sensitive info.

Data without an account stays on the device and is not collected.

Required-reason APIs declared in the manifest: UserDefaults (`CA92.1`, the app's own settings). No file-timestamp,
boot-time, disk-space or keyboard APIs are used.

## Export compliance

`ITSAppUsesNonExemptEncryption = NO` is set in the Info.plist (`ios/project.yml`). The app only uses standard HTTPS
(URLSession / App Transport Security) and the system Keychain, which is exempt. No proprietary or non-standard
encryption. No export documentation is needed.

## Before you submit

- [ ] Web server deployed with `/terms`, `/privacy`, `/support`, `/reset` and `DELETE /api/account` working.
- [ ] Supabase Auth › URL configuration: add `https://<your-server>/reset` to the allowed redirect URLs (password reset
      from the app sends `redirect_to` there).
- [ ] Demo account created, team comped/active, a couple of demo jobs synced.
- [ ] Screenshots from the "iOS screenshots" workflow (iPhone 6.9" and iPad 13"): home, plan, takeoff, estimate,
      photos, team. Don't use `billing*` / `deleteaccount` captures in the listing (they're for QA).
- [ ] Version and build bumped in `ios/project.yml` (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`).
- [ ] App Privacy answers above entered in App Store Connect; privacy policy URL matches.
