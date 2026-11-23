import SwiftUI
import UIKit
import PinPlanCore

/// "A new version is ready" for people who installed the app from TestFlight (docs/testflight.md). TestFlight can
/// also update the app by itself (Automatic Updates in the TestFlight app); this banner covers people who turned that
/// off or haven't opened TestFlight. Apple doesn't let an app download new code itself, so updates always come
/// through TestFlight (or the App Store later).
@MainActor
@Observable
final class AppUpdate {
    static let shared = AppUpdate()

    private(set) var latest: Int?
    private(set) var dismissed: Int
    @ObservationIgnored private var lastCheck: Date?
    @ObservationIgnored private var checking = false

    private static let dismissedKey = "northpin.update.dismissedBuild"

    init() {
        dismissed = UserDefaults.standard.integer(forKey: Self.dismissedKey)
    }

    /// This build's number (CFBundleVersion).
    var current: Int {
        let raw = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        return Int(raw) ?? 0
    }

    /// Installed from TestFlight (a sandbox receipt), so TestFlight can update it. Debug builds: `--update-banner`.
    var fromTestFlight: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--update-banner") { return true }
        #endif
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
    }

    /// The build to offer now, if any.
    var offer: Int? {
        AppUpdateLogic.offer(current: current, latest: latest, dismissed: dismissed, eligible: fromTestFlight)
    }

    /// Asks the server for the newest build (at most every few hours).
    func check(serverURL: String, force: Bool = false) async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--update-banner") { latest = current + 1; return }
        #endif
        guard fromTestFlight, !checking else { return }
        guard force || AppUpdateLogic.shouldCheck(last: lastCheck, now: Date()) else { return }
        guard let base = APIClient.url(serverURL) else { return }
        checking = true
        defer { checking = false }
        var request = URLRequest(url: base.appendingPathComponent("api/ios/latest"))
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return }
        lastCheck = Date()
        latest = AppUpdateLogic.parse(data)
    }

    /// Hide the banner for this build (a newer one shows it again).
    func dismiss() {
        guard let build = offer else { return }
        dismissed = build
        UserDefaults.standard.set(build, forKey: Self.dismissedKey)
    }

    /// Opens the TestFlight app, where the update is one tap.
    func openTestFlight() {
        guard let url = URL(string: "itms-beta://") else { return }
        UIApplication.shared.open(url)
    }
}

/// The banner on the jobs list when a newer TestFlight build is ready.
struct AppUpdateBanner: View {
    private var update: AppUpdate { .shared }

    var body: some View {
        if update.offer != nil {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "arrow.down.circle.fill")
                    .foregroundStyle(Color.accentColor)
                    .padding(.top, 2)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("A new version of Northpin is ready")
                        .font(.subheadline.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Update in TestFlight to get the latest fixes and features.")
                        .font(.subheadline)
                        .foregroundStyle(Color.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Update") { update.openTestFlight() }
                        .font(.subheadline.weight(.semibold))
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("update-open")
                }
                Spacer(minLength: 0)
                Button {
                    update.dismiss()
                } label: {
                    Image(systemName: "xmark").font(.footnote.weight(.semibold)).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.secondary)
                .accessibilityLabel(Text("Not now"))
            }
            .padding(.leading, 14)
            .padding(.vertical, 6)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityElement(children: .contain)
        }
    }
}
