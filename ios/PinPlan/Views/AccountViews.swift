import SwiftUI
import StoreKit
import LocalAuthentication
import PinPlanCore

// Account and subscription pieces: the billing notice, the team's plan line, account deletion and the About links.
//
// App Store rule (business SaaS sold on the web): nothing here sells. No prices, no subscribe / buy buttons. On the
// United States storefront owners and admins get a neutral "Manage your account on the web" link; everywhere else
// the app only says, in plain text, that the account is managed outside the app (guideline 3.1.3(f)). Technicians
// are told to ask their office.

/// Shown instead of the web link outside the United States storefront: no link, no call to action.
let accountManagedOutsideText = String(localized: "Your Northpin account is managed outside this app.")

/// Whether this device's App Store storefront allows the web account link (United States only).
func webAccountLinkAllowed() async -> Bool {
    SignupLogic.mayLinkToWebAccount(storefrontCountry: await Storefront.current?.countryCode)
}

/// Colour for a billing tone.
func billingToneColor(_ tone: BillingTone) -> Color {
    switch tone {
    case .green: return Color.green
    case .slate: return Color.secondary
    case .amber: return Color.orange
    case .red: return Color.red
    }
}

/// "<server>/settings#billing", when the Northpin server is set up.
func manageAccountURL(_ settings: AppSettings) -> URL? {
    guard let s = BillingLogic.manageURL(origin: settings.serverURL) else { return nil }
    return URL(string: s)
}

/// "<server>/terms" etc., when the Northpin server is set up.
func serverPageURL(_ settings: AppSettings, _ path: String) -> URL? {
    guard let s = BillingLogic.webURL(origin: settings.serverURL, path: path) else { return nil }
    return URL(string: s)
}

// MARK: - billing notice

/// The notice on the Projects screen and in a job: trial ending, needs attention, or read-only. Nothing otherwise.
struct BillingBannerView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    var compact = false
    var outer = EdgeInsets()

    var body: some View {
        if let banner = app.cloud.billingBanner {
            BillingBannerContent(banner: banner, manageURL: manageAccountURL(app.settings), compact: compact) { url in openURL(url) }
                .padding(outer)
        }
    }
}

private struct BillingBannerContent: View {
    let banner: BillingBanner
    let manageURL: URL?
    let compact: Bool
    let open: (URL) -> Void

    private var tint: Color { banner.tone == .red ? Color.red : Color.orange }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: banner.readOnly ? "lock.fill" : "exclamationmark.circle.fill")
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(banner.text)
                    .font(compact ? Font.footnote : Font.subheadline)
                    .foregroundStyle(Color.primary)
                    .fixedSize(horizontal: false, vertical: true)
                BillingBannerAction(action: banner.action, manageURL: manageURL, open: open)
            }
            Spacer(minLength: 0)
        }
        .padding(compact ? 10 : 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct BillingBannerAction: View {
    let action: BillingBanner.Action
    let manageURL: URL?
    let open: (URL) -> Void
    @State private var linkAllowed = false

    var body: some View {
        switch action {
        case .manageOnWeb:
            Group {
                if linkAllowed, let url = manageURL {
                    Button { open(url) } label: {
                        Label(BillingLogic.manageLinkTitle, systemImage: "safari").font(.footnote.weight(.semibold))
                    }
                    .buttonStyle(.borderless)
                } else {
                    Text(accountManagedOutsideText).font(.footnote).foregroundStyle(Color.secondary)
                }
            }
            .task { linkAllowed = await webAccountLinkAllowed() }
        case .askOffice:
            EmptyView()   // the text already says "Ask your office."
        }
    }
}

// MARK: - Settings › Team: plan

/// Plan status and seats for the team (owners and admins also get the web link).
struct TeamPlanSection: View {
    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    @State private var linkAllowed = false

    var body: some View {
        let cloud = app.cloud
        if let b = cloud.billing {
            let line = BillingLogic.statusLine(b)
            let office = cloud.can(.manageTeam)
            Section {
                LabeledContent(String(localized: "Plan (billing)", defaultValue: "Plan")) {
                    Text(line.label).foregroundStyle(billingToneColor(line.tone))
                }
                LabeledContent("Seats") {
                    Text(BillingLogic.seatsText(b)).monospacedDigit()
                }
                if office, linkAllowed, let url = manageAccountURL(app.settings) {
                    Button { openURL(url) } label: { Label(BillingLogic.manageLinkTitle, systemImage: "safari") }
                }
            } header: {
                Text(String(localized: "Plan (billing)", defaultValue: "Plan")).textCase(nil)
            } footer: {
                Text(footer(line: line, billing: b, office: office))
            }
            .task { linkAllowed = await webAccountLinkAllowed() }
        }
    }

    private func footer(line: BillingStatusLine, billing: TeamBilling, office: Bool) -> String {
        var parts: [String] = []
        if !line.detail.isEmpty { parts.append(line.detail) }
        if BillingLogic.seatsFull(billing) { parts.append(String(localized: "Every seat is in use, so a new person can't join until a seat is free.")) }
        parts.append(office ? (linkAllowed ? String(localized: "The account is managed on the Northpin website.") : accountManagedOutsideText) : String(localized: "The owner or office manages the account."))
        return parts.joined(separator: " ")
    }
}

// MARK: - read-only sync status

/// "Read-only — subscription inactive · 3 changes kept on this iPad" (Cloud sync screen).
struct ReadOnlySyncRow: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let cloud = app.cloud
        if cloud.readOnly {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(BillingLogic.readOnlyStatus(pending: cloud.pendingChanges, device: UIDevice.current.model))
                        .font(.callout.weight(.semibold))
                    Text("Changes from other devices still come in. Yours go up once your company's subscription is active again.")
                        .font(.footnote).foregroundStyle(Color.secondary)
                }
            } icon: {
                Image(systemName: "lock.fill").foregroundStyle(Color.red)
            }
        }
    }
}

// MARK: - account deletion (App Store 5.1.1(v))

/// Explains what is deleted, asks to type DELETE, then deletes the account on the server and clears this device.
/// The server only deletes on a fresh sign-in: when it asks (401 reauth_required), the person enters their password
/// or a code emailed to the account, and the delete is sent again with that fresh sign-in. The device's passcode or
/// Face ID is asked first when the device has one.
struct DeleteAccountView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var confirm = ""
    @State private var busy = false
    @State private var problem: String?
    /// The server said no because the user owns a team that still has other people (409).
    @State private var teamInTheWay = false
    @State private var deletedEmail: String?
    /// The sign-in isn't fresh: the server wants the person to sign in again (401 reauth_required).
    @State private var needsReauth = false
    @State private var password = ""
    @State private var code = ""
    @State private var codeSent = false

    var body: some View {
        SentenceForm {
            if let email = deletedEmail {
                AccountDeletedSection(email: email) { dismiss() }
            } else {
                DeleteExplanationSection()
                DeleteAccountActionSection(confirm: $confirm, password: $password, code: $code, needsReauth: needsReauth, codeSent: codeSent,
                                           busy: busy, problem: problem, teamInTheWay: teamInTheWay,
                                           onDelete: { Task { await delete() } }, onSendCode: { Task { await sendCode() } })
            }
        }
        .navigationTitle("Delete account")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(deletedEmail != nil)
    }

    private func delete() async {
        guard confirm.trimmingCharacters(in: .whitespaces) == "DELETE", !busy else { return }
        guard let api = APIClient(settings: app.settings) else { return }
        busy = true
        problem = nil
        teamInTheWay = false
        defer { busy = false }
        let email = app.cloud.session?.email ?? ""
        do {
            // The device's own lock first (passcode, Face ID or Touch ID), when it has one.
            guard await deviceOwnerConfirms() else { problem = String(localized: "Deleting the account needs your device passcode."); return }
            if needsReauth {
                if !code.trimmingCharacters(in: .whitespaces).isEmpty {
                    try await app.cloud.verifyReauthCode(code)
                } else {
                    try await app.cloud.reauthenticate(password: password)
                }
                password = ""
                code = ""
            }
            switch try await app.cloud.deleteAccount(api: api) {
            case .deleted:
                app.wipeLocalData()
                deletedEmail = email
            case .needsEmail(let message):
                // 401 reauth_required: signed in, just not recently enough. Sign in again here and try once more.
                needsReauth = true
                problem = message == AccountDeletionResult.needsEmailFallback
                    ? String(localized: "To keep your account safe, enter your password again (or get a code by email), then delete your account.")
                    : message
            case .teamInTheWay(let message):
                problem = message
                teamInTheWay = true
            case .unavailable:
                problem = String(localized: "Account deletion isn't switched on for this Northpin server yet. Visit \(api.supportURL) and we'll delete your account for you.")
            case .failed(let message):
                problem = message
            }
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func sendCode() async {
        guard !busy else { return }
        busy = true
        problem = nil
        defer { busy = false }
        do {
            try await app.cloud.sendReauthCode()
            codeSent = true
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// True when the device has no passcode set (nothing to ask) or its owner confirmed.
    private func deviceOwnerConfirms() async -> Bool {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return true }
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: String(localized: "Confirm it's you to delete your Northpin account"))) == true
    }
}

private struct DeleteExplanationSection: View {
    var body: some View {
        Section {
            DeleteBullet(icon: "person.crop.circle.badge.xmark", text: String(localized: "Your Northpin sign-in (email and password) and your name on the team."))
            DeleteBullet(icon: "folder", text: String(localized: "Jobs you own, with their plans, devices, estimates, photos, documents, checklists and logs, and links you shared with clients."))
            DeleteBullet(icon: "ipad.and.iphone", text: String(localized: "Everything Northpin keeps on this device, including changes that haven't synced yet."))
        } header: {
            Text("What's deleted").textCase(nil)
        } footer: {
            Text("This can't be undone. If you own a company team that still has other people on it, remove them (or hand the team over) first. Jobs that belong to someone else's team stay with that team. Export anything you want to keep before you continue.")
        }
    }
}

private struct DeleteBullet: View {
    let icon: String
    let text: String
    var body: some View {
        Label {
            Text(text).font(.callout)
        } icon: {
            Image(systemName: icon).foregroundStyle(Color.red)
        }
    }
}

private struct DeleteAccountActionSection: View {
    @Environment(AppModel.self) private var app
    @Binding var confirm: String
    @Binding var password: String
    @Binding var code: String
    /// The server asked for a fresh sign-in.
    let needsReauth: Bool
    let codeSent: Bool
    let busy: Bool
    let problem: String?
    var teamInTheWay = false
    let onDelete: () -> Void
    let onSendCode: () -> Void

    private var ready: Bool {
        guard confirm.trimmingCharacters(in: .whitespaces) == "DELETE", !busy else { return false }
        return !needsReauth || !password.isEmpty || !code.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        let cloud = app.cloud
        if !cloud.signedIn {
            Section {
                Text("Sign in first (Settings › Account and cloud sync), then come back here to delete your account.")
                    .font(.callout).foregroundStyle(Color.secondary)
            }
        } else if APIClient(settings: app.settings) == nil {
            Section {
                Text("The account can't be deleted from this device. Sign in to Northpin on the web and choose Settings › Account › Delete account, or contact support and we'll delete it for you.")
                    .font(.callout).foregroundStyle(Color.secondary)
            }
        } else {
            Section {
                LabeledContent("Account", value: cloud.session?.email ?? "")
                TextField("Type DELETE to confirm", text: $confirm)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                if needsReauth {
                    // A fresh sign-in, so a borrowed or stolen session alone can't delete the account.
                    SecureField("Your password", text: $password)
                        .textContentType(.password)
                    if codeSent {
                        TextField("Code from the email", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                    } else {
                        Button("No password? Email me a code", action: onSendCode)
                            .font(.callout)
                            .disabled(busy)
                    }
                }
                Button(role: .destructive, action: onDelete) {
                    HStack {
                        Text(busy ? "Deleting…" : "Delete my account").fontWeight(.semibold)
                        Spacer()
                        if busy { ProgressView() }
                    }
                }
                .disabled(!ready)
                if let problem {
                    Label(problem, systemImage: "exclamationmark.triangle.fill").font(.callout).foregroundStyle(Color.red)
                }
                if teamInTheWay {
                    // Owners first remove their teammates (or hand the team over) on the Team screen.
                    NavigationLink { TeamView() } label: { Label("Open Team", systemImage: "person.2") }
                }
            } footer: {
                Text(needsReauth
                     ? (codeSent ? String(localized: "Type DELETE in capitals, and your password or the code we emailed to \(cloud.session?.email ?? String(localized: "your address")).") : String(localized: "Type DELETE in capitals and your password to confirm it's you."))
                     : String(localized: "Type DELETE in capitals to confirm."))
            }
        }
    }
}

private struct AccountDeletedSection: View {
    let email: String
    let onDone: () -> Void
    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Label("Account deleted", systemImage: "checkmark.circle.fill").font(.headline).foregroundStyle(Color.green)
                Text(email.isEmpty ? "Your Northpin account has been deleted and this device has been cleared." : "The Northpin account \(email) has been deleted and this device has been cleared.")
                    .font(.callout)
                Text("You can keep using Northpin on this device without an account, or create a new one any time.")
                    .font(.footnote).foregroundStyle(Color.secondary)
            }
            .padding(.vertical, 4)
            Button("Done", action: onDone)
        }
    }
}

// MARK: - About

/// Settings › About: terms, privacy, support and the app version.
struct AboutSection: View {
    @Environment(AppModel.self) private var app

    private var version: String {
        let info = Bundle.main.infoDictionary
        let v = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = info?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        Section {
            // Short guides and tours (the web Help center, opened in-app; HelpViews.swift).
            HelpRow()
            // The web app's jobs list (/jobs; "/" is the public home page): quotes, invoices and change orders live there.
            AboutLink(title: String(localized: "Northpin on the web"), icon: "safari", url: serverPageURL(app.settings, WebLinks.jobs))
            AboutLink(title: String(localized: "Terms of service"), icon: "doc.text", url: serverPageURL(app.settings, "terms"))
            AboutLink(title: String(localized: "Privacy policy"), icon: "hand.raised", url: serverPageURL(app.settings, "privacy"))
            AboutLink(title: String(localized: "Support"), icon: "questionmark.circle", url: serverPageURL(app.settings, "support"))
            LabeledContent("Version", value: version)
        } header: {
            Text("About").textCase(nil)
        } footer: {
            if app.settings.serverURL.trimmingCharacters(in: .whitespaces).isEmpty {
                Text("The terms, privacy policy and support pages open once this copy of Northpin is connected (Settings › More › Advanced).")
            }
        }
    }
}

private struct AboutLink: View {
    let title: String
    let icon: String
    let url: URL?
    var body: some View {
        if let url {
            Link(destination: url) {
                HStack {
                    Label(title, systemImage: icon)
                    Spacer()
                    Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(Color.secondary)
                }
            }
        } else {
            Label(title, systemImage: icon).foregroundStyle(Color.secondary)
        }
    }
}

// MARK: - email invite

/// On the invite card: email the invite (only when the Northpin server can send email).
struct InviteEmailBox: View {
    @Environment(AppModel.self) private var app
    let code: String
    let name: String
    @State private var email = ""
    @State private var busy = false
    @State private var sentTo: String?
    @State private var problem: String?

    private var ready: Bool { !busy && email.contains("@") && email.contains(".") }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Email invite").font(.subheadline.weight(.semibold))
            HStack(spacing: 8) {
                TextField("name@company.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { Task { await send() } }
                Button { Task { await send() } } label: {
                    Text(busy ? "Sending…" : "Send")
                }
                .buttonStyle(.borderedProminent)
                .disabled(!ready)
            }
            if let sentTo {
                Label("Invite emailed to \(sentTo).", systemImage: "checkmark.circle.fill").font(.footnote).foregroundStyle(Color.green)
            }
            if let problem {
                Text(problem).font(.footnote).foregroundStyle(Color.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func send() async {
        guard ready, let api = APIClient(settings: app.settings) else { return }
        busy = true
        problem = nil
        sentTo = nil
        defer { busy = false }
        let to = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await app.cloud.emailInvite(api: api, code: code, email: to, name: name)
            sentTo = to
            email = ""
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

// MARK: - launch setup and creating an account in the app

extension CloudSync {
    /// Run when the app opens: server calls carry the user's own session from now on, and a fresh install fetches
    /// the cloud settings from the server built into the app, so the account screen starts at email + password.
    func prepareAtLaunch(settings: AppSettings) async {
        APIClient.sessionToken = { [weak self] in
            guard let self, self.signedIn else { return nil }
            return try? await self.accessToken()
        }
        await connectIfNeeded(settings: settings)
        await finishPendingCompany()
    }

    /// Fetch the cloud settings from the Northpin server when this device has none yet. Nil when connected (or there
    /// is no server to ask); otherwise a plain message to show.
    @discardableResult
    func connectIfNeeded(settings: AppSettings) async -> String? {
        guard config == nil, let api = APIClient(settings: settings) else { return nil }
        // The cloud project named by the server gets the person's password and sign-in: only take it from the built-in
        // server or one the person confirmed (a mistyped or planted address mustn't choose where passwords go).
        guard api.mayCarrySession else {
            return String(localized: "To sign in through this server, choose “Use my sign-in with this server” under Settings › More › Advanced first.")
        }
        do {
            try await configure(from: api)
            return nil
        } catch {
            return String(localized: "Couldn't connect to Northpin. Check your internet connection and try again.")
        }
    }

    // A company named while creating an account that had to confirm its email first is set up on the first sign-in
    // on this device (like the web app's pending company).

    struct PendingCompany: Codable, Equatable {
        var company: String
        var name: String
        var email: String
    }

    private static let pendingCompanyKey = "pinplan.pendingCompany"

    var pendingCompany: PendingCompany? {
        guard let d = UserDefaults.standard.data(forKey: Self.pendingCompanyKey) else { return nil }
        return try? JSONDecoder().decode(PendingCompany.self, from: d)
    }

    func clearPendingCompany() { UserDefaults.standard.removeObject(forKey: Self.pendingCompanyKey) }

    /// Create an account with the person's name, company and when they agreed to the Terms and Privacy Policy (saved
    /// with the account). True when it signed straight in and the company is set up; false when the email has to be
    /// confirmed first (the company is then made on the first sign-in). Joining from an invite makes no company.
    func createAccount(email: String, password: String, name: String, company: String, acceptedAt: Date) async throws -> Bool {
        guard let config else { throw SupabaseClient.Failure(message: String(localized: "Still connecting to Northpin. Try again in a moment.")) }
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let meta = SignupLogic.metadata(name: name, company: company, acceptedAt: acceptedAt)
        let signedInNow = try await SupabaseClient(config: config).signUp(email: e, password: password, metadata: meta)
        let c = company.trimmingCharacters(in: .whitespacesAndNewlines)
        if !c.isEmpty && pendingInvite == nil {
            let p = PendingCompany(company: c, name: name.trimmingCharacters(in: .whitespacesAndNewlines), email: e.lowercased())
            if let d = try? JSONEncoder().encode(p) { UserDefaults.standard.set(d, forKey: Self.pendingCompanyKey) }
        }
        guard signedInNow else { return false }
        try await signIn(email: e, password: password, create: false)
        await finishPendingCompany()
        return true
    }

    /// After a sign-in: make the company remembered at sign-up, unless this account is already on a team.
    func finishPendingCompany() async {
        guard let p = pendingCompany, signedIn, let s = session else { return }
        // Someone else signed in on this device, or they joined a team from an invite instead.
        guard s.email.lowercased() == p.email, pendingInvite == nil else { clearPendingCompany(); return }
        // The team hasn't loaded for this account yet (offline): try again next time.
        guard let snap = team, snap.userId == s.userId else { return }
        if snap.team != nil || teamNeedsMigration { clearPendingCompany(); return }
        do {
            try await createTeam(name: p.company, myName: p.name)
            clearPendingCompany()
            teamNotice = String(localized: "\(p.company) is set up. Invite your office and technicians from Settings › Team.")
        } catch let e as SupabaseClient.Failure where e.status != 0 {
            clearPendingCompany()
            teamNotice = String(localized: "Couldn't set up \(p.company): \(e.message) Create it from Settings › Team.")
        } catch {
            // Offline: try again after the next sign-in or launch.
        }
    }
}

extension SupabaseClient {
    /// Create an account (`POST /auth/v1/signup`) with profile details saved as `user_metadata`. True when it came
    /// back signed in; false when the email has to be confirmed first (or already has an account: the cloud answers
    /// the same way then and sends nothing).
    func signUp(email: String, password: String, metadata: [String: String]) async throws -> Bool {
        var r = URLRequest(url: base.appendingPathComponent("auth/v1/signup"))
        r.httpMethod = "POST"
        r.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(config.anonKey)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.timeoutInterval = 60
        r.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password, "data": metadata])
        let (data, resp) = try await URLSession.shared.data(for: r)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (200..<300).contains(status) else {
            var msg = (j?["error_description"] ?? j?["msg"] ?? j?["message"] ?? j?["error"]) as? String
            switch (j?["error_code"] as? String) ?? "" {
            case "user_already_exists", "email_exists": msg = String(localized: "This email already has an account. Tap Sign in instead.")
            case "weak_password": msg = String(localized: "Choose a longer password: at least \(SignupLogic.passwordMin) characters.")
            case "email_address_invalid": msg = String(localized: "Enter a valid email address.")
            case "over_email_send_rate_limit": msg = String(localized: "Too many emails sent. Wait an hour, or sign in if the account already exists.")
            case "signup_disabled": msg = String(localized: "New accounts can't be created right now. Try again later.")
            default: break
            }
            throw Failure(message: msg ?? String(localized: "Couldn't create the account (\(status)). Try again."), status: status, code: j?["code"] as? String)
        }
        return j?["access_token"] is String
    }
}
