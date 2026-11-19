import SwiftUI
import PinPlanCore

// Account and subscription pieces: the billing notice, the team's plan line, account deletion and the About links.
//
// App Store rule (business SaaS sold on the web): nothing here sells. No prices, no subscribe / buy buttons — only a
// neutral "Manage your account on the web" link for owners and admins. Technicians are told to ask their office.

/// Colour for a billing tone.
func billingToneColor(_ tone: BillingTone) -> Color {
    switch tone {
    case .green: return Color.green
    case .slate: return Color.secondary
    case .amber: return Color.orange
    case .red: return Color.red
    }
}

/// "<server>/settings#billing", when the PinPlan server is set up.
func manageAccountURL(_ settings: AppSettings) -> URL? {
    guard let s = BillingLogic.manageURL(origin: settings.serverURL) else { return nil }
    return URL(string: s)
}

/// "<server>/terms" etc., when the PinPlan server is set up.
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

    var body: some View {
        switch action {
        case .manageOnWeb:
            if let url = manageURL {
                Button { open(url) } label: {
                    Label(BillingLogic.manageLinkTitle, systemImage: "safari").font(.footnote.weight(.semibold))
                }
                .buttonStyle(.borderless)
            } else {
                Text("Manage your account in your PinPlan web app.").font(.footnote).foregroundStyle(Color.secondary)
            }
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

    var body: some View {
        let cloud = app.cloud
        if let b = cloud.billing {
            let line = BillingLogic.statusLine(b)
            let office = cloud.can(.manageTeam)
            Section {
                LabeledContent("Plan") {
                    Text(line.label).foregroundStyle(billingToneColor(line.tone))
                }
                LabeledContent("Seats") {
                    Text(BillingLogic.seatsText(b)).monospacedDigit()
                }
                if office, let url = manageAccountURL(app.settings) {
                    Button { openURL(url) } label: { Label(BillingLogic.manageLinkTitle, systemImage: "safari") }
                }
            } header: {
                Text("Plan").textCase(nil)
            } footer: {
                Text(footer(line: line, billing: b, office: office))
            }
        }
    }

    private func footer(line: BillingStatusLine, billing: TeamBilling, office: Bool) -> String {
        var parts: [String] = []
        if !line.detail.isEmpty { parts.append(line.detail) }
        if BillingLogic.seatsFull(billing) { parts.append("Every seat is in use, so a new person can't join until a seat is free.") }
        parts.append(office ? "The account is managed on the PinPlan website." : "The owner or office manages the account.")
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
struct DeleteAccountView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var confirm = ""
    @State private var busy = false
    @State private var problem: String?
    @State private var deletedEmail: String?

    var body: some View {
        SentenceForm {
            if let email = deletedEmail {
                AccountDeletedSection(email: email) { dismiss() }
            } else {
                DeleteExplanationSection()
                DeleteAccountActionSection(confirm: $confirm, busy: busy, problem: problem) { Task { await delete() } }
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
        defer { busy = false }
        let email = app.cloud.session?.email ?? ""
        do {
            try await app.cloud.deleteAccount(api: api)
            app.wipeLocalData()
            deletedEmail = email
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

private struct DeleteExplanationSection: View {
    var body: some View {
        Section {
            DeleteBullet(icon: "person.crop.circle.badge.xmark", text: "Your PinPlan sign-in (email and password) and your name on the team.")
            DeleteBullet(icon: "folder", text: "Jobs you own, with their plans, devices, estimates, photos, documents, checklists and logs, and links you shared with clients.")
            DeleteBullet(icon: "ipad.and.iphone", text: "Everything PinPlan keeps on this device, including changes that haven't synced yet.")
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
    let busy: Bool
    let problem: String?
    let onDelete: () -> Void

    private var ready: Bool { confirm.trimmingCharacters(in: .whitespaces) == "DELETE" && !busy }

    var body: some View {
        let cloud = app.cloud
        if !cloud.signedIn {
            Section {
                Text("Sign in first (Settings › Account and cloud sync), then come back here to delete your account.")
                    .font(.callout).foregroundStyle(Color.secondary)
            }
        } else if APIClient(settings: app.settings) == nil {
            Section {
                Text("This device isn't connected to your PinPlan server, so the account can't be deleted from here. Open the PinPlan web app and choose Settings › Account › Delete account, or visit its /support page and we'll delete it for you.")
                    .font(.callout).foregroundStyle(Color.secondary)
            }
        } else {
            Section {
                LabeledContent("Account", value: cloud.session?.email ?? "")
                TextField("Type DELETE to confirm", text: $confirm)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
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
            } footer: {
                Text("Type DELETE in capitals to confirm.")
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
                Text(email.isEmpty ? "Your PinPlan account has been deleted and this device has been cleared." : "The PinPlan account \(email) has been deleted and this device has been cleared.")
                    .font(.callout)
                Text("You can keep using PinPlan on this device without an account, or create a new one any time.")
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
            AboutLink(title: "Terms of service", icon: "doc.text", url: serverPageURL(app.settings, "terms"))
            AboutLink(title: "Privacy policy", icon: "hand.raised", url: serverPageURL(app.settings, "privacy"))
            AboutLink(title: "Support", icon: "questionmark.circle", url: serverPageURL(app.settings, "support"))
            LabeledContent("Version", value: version)
        } header: {
            Text("About").textCase(nil)
        } footer: {
            if app.settings.serverURL.trimmingCharacters(in: .whitespaces).isEmpty {
                Text("Set up your PinPlan server (above) to open the terms, privacy policy and support pages.")
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

/// On the invite card: email the invite (only when the PinPlan server can send email).
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
