# TestFlight and app updates (iPhone and iPad)

How the iPhone/iPad app reaches your team without being public, and how it stays up to date.

## How it works

- `.github/workflows/ios-testflight.yml` archives the app, signs it and uploads it to App Store Connect. It runs:
  - by itself on every push to the release branch that changes `ios/**`;
  - from Actions → iOS TestFlight → Run workflow;
  - for a tag like `ios-v1.1` (sets the version to 1.1).
- The build number is the workflow's run number, so every upload is newer than the last.
- Builds are **internal testing only** (`testFlightInternalTestingOnly` in `ios/ExportOptions.plist`):
  - only people on your App Store Connect team can install them;
  - they never appear on the App Store;
  - there is no Apple review.
- **Updates ("over the air"):**
  - With Automatic Updates on in the TestFlight app (the default), testers' devices install each new build on their own.
  - The app also checks `/api/ios/latest` when it opens, at most every 6 hours (`src/app/api/ios/latest/route.ts`). That route reads the newest successful TestFlight run.
  - When a newer build is ready, the jobs list shows **A new version of Northpin is ready → Update**, which opens TestFlight.
  - A run counts only 30 minutes after it finishes, while Apple processes the upload.
  - Apple doesn't allow an app to download new code itself, so app updates always come through TestFlight (later the App Store). Jobs, plans and settings already update live through sync.

## One-time setup (owner)

1. **App record.** In App Store Connect (on the Apple Developer account you use), go to Apps → + → New App.
   - Platform iOS; name e.g. "Northpin" (any free name; it isn't shown publicly for internal testing).
   - Bundle ID **`app.northpin.ios`**. Register it first under Certificates, IDs & Profiles → Identifiers if it isn't offered.
   - SKU `northpin-ios`.
   - A different bundle ID works too: set it as the repository variable `IOS_BUNDLE_ID`.
2. **API key.** Users and Access → Integrations → App Store Connect API → Team Keys → +.
   - Role **Admin** (needed so the build can create its own signing certificate and profile; App Manager works only if you add certificates yourself).
   - Download the `.p8` file (only once). Note the Key ID and the Issuer ID.
3. **Team ID.** developer.apple.com → Account → Membership details (10 characters).
4. **GitHub.** Settings → Environments → **appstore** (create it), and add these secrets:
   - `APPLE_TEAM_ID`;
   - `ASC_KEY_ID`;
   - `ASC_ISSUER_ID`;
   - `ASC_KEY_P8` (paste the whole `.p8` file, including the BEGIN/END lines).

   If the environment has "Deployment branches" rules, allow `claude/quirky-clarke-gjz5h1` and tags `ios-v*`.
5. **Testers.** App Store Connect → your app → TestFlight → Internal Testing → +, to create a group (e.g. "Northpin team").
   - Turn on **Automatic distribution**, so every new build goes to the group.
   - Add people. They must be users on your App Store Connect team; give them the lowest role, e.g. "Customer Support" or "Developer".
6. **Run it.** Actions → iOS TestFlight → Run workflow. After about 10–30 minutes of processing, testers get an email and install it with the TestFlight app.

Up to 100 internal testers, each on up to 30 devices. Builds expire after 90 days; any newer build replaces them.

## Notes

- **Bundle ID change.** Sideloaded copies (the unsigned IPA from `ios-ipa.yml`, bundle ID `com.pinplan.app` before this change) are a separate app from the TestFlight one. Anything signed in syncs; delete the old copy once the TestFlight app has synced.
- **Holding back the banner.** Set `IOS_LATEST_BUILD` on the server to pin the build number it reports. `IOS_RELEASE_REPO` names the GitHub repository whose runs it reads.
- **App Store listing.** For a public listing later, see `docs/app-store.md`.
