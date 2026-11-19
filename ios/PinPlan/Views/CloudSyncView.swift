import SwiftUI
import PinPlanCore

/// Sign in to the same cloud account as the web app so jobs, the catalog and products stay in step on every device.
/// A fresh install connects by itself (the server is built into the app), so this starts at email + password.
struct CloudSyncView: View {
    @Environment(AppModel.self) private var app
    @State private var connecting = false
    @State private var problem: String?

    var body: some View {
        let cloud = app.cloud
        SentenceForm {
            if cloud.config == nil {
                Section {
                    if APIClient(settings: app.settings) == nil {
                        Text("This copy of PinPlan isn't connected to PinPlan accounts. Everything else works on this device without an account.")
                            .font(.callout).foregroundStyle(.secondary)
                        NavigationLink("Connection settings") { ServerSetupView() }
                    } else {
                        Button { Task { await connect() } } label: {
                            HStack { Text(connecting ? "Connecting…" : "Try again"); Spacer(); if connecting { ProgressView() } }
                        }
                        .disabled(connecting)
                    }
                } header: { Text("Account").textCase(nil) } footer: {
                    if let problem { Text(problem) }
                }
            } else if !cloud.signedIn {
                AccountSection()
            } else {
                Section {
                    LabeledContent("Signed in as", value: cloud.session?.email ?? "")
                    Button { Task { await cloud.syncNow(force: true) } } label: {
                        HStack { Label(cloud.syncing ? "Syncing…" : "Sync now", systemImage: "arrow.triangle.2.circlepath"); Spacer(); if cloud.syncing { ProgressView() } }
                    }
                    .disabled(cloud.syncing)
                    ReadOnlySyncRow()
                    if let e = cloud.lastError {
                        Label(e, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.callout)
                    } else if let d = cloud.lastSync {
                        LabeledContent("Last sync", value: "\(d.formatted(date: .omitted, time: .shortened)) · \(cloud.lastSummary ?? "")")
                    }
                } footer: {
                    Text("Syncs a few seconds after each change and every minute while the app is open. Works offline — changes go up when you're back online. If the same item is edited on two devices, the later edit wins.")
                }
                Section {
                    NavigationLink { TeamView() } label: {
                        LabeledContent {
                            Text(cloud.team?.team?.name ?? "Working alone")
                        } label: { Label("Team", systemImage: "person.2") }
                    }
                    if let n = cloud.teamNotice {
                        Label(n, systemImage: "info.circle").font(.callout).foregroundStyle(.secondary)
                    }
                }
                Section { Button("Sign out", role: .destructive) { cloud.signOut() } }
                Section {
                    NavigationLink { DeleteAccountView() } label: {
                        Label("Delete account…", systemImage: "person.crop.circle.badge.xmark").foregroundStyle(Color.red)
                    }
                } footer: {
                    Text("Permanently deletes your PinPlan account and its data, and clears this device.")
                }
            }
        }
        .navigationTitle("Account")
        .task {
            if cloud.config == nil { await connect() }
            // A company named at sign-up on another visit (email confirmed since) is set up now.
            if cloud.signedIn { await cloud.finishPendingCompany() }
        }
    }

    private func connect() async {
        guard APIClient(settings: app.settings) != nil, !connecting else { return }
        connecting = true
        defer { connecting = false }
        problem = await app.cloud.connectIfNeeded(settings: app.settings)
    }
}

/// Sign in, or create an account right here (email + password). Creating an account also sets up the company
/// (unless the person is joining a team from an invite) and records that they agreed to the Terms and Privacy
/// Policy. When the email has to be confirmed first, says so; the company is made on the next sign-in.
struct AccountSection: View {
    @Environment(AppModel.self) private var app
    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "Sign in", create = "Create account"
        var id: String { rawValue }
    }
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var company = ""
    @State private var name = ""
    @State private var agreed = false
    @State private var busy = false
    @State private var problem: String?
    @State private var info: String?
    @State private var resetting = false
    /// Shown above the fields (e.g. "Create your account to join Acme").
    var intro: String? = nil

    /// Joining a team from an invite: the team already exists, so no company name is asked for.
    private var joining: Bool { app.cloud.pendingInvite != nil }

    var body: some View {
        Section {
            Picker("Account", selection: $mode) {
                ForEach(Mode.allCases) { m in Text(m.rawValue).tag(m) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
            if let intro { Text(intro).font(.callout).foregroundStyle(.secondary) }
            if mode == .create {
                if !joining {
                    TextField("Company name", text: $company).textContentType(.organizationName)
                }
                TextField("Your name", text: $name).textContentType(.name)
            }
            TextField("Email", text: $email)
                .keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
            SecureField(mode == .create ? "Password (\(SignupLogic.passwordMin) characters or more)" : "Password", text: $password)
                .textContentType(mode == .create ? UITextContentType.newPassword : UITextContentType.password)
            if mode == .create {
                Toggle(isOn: $agreed) {
                    Text("I agree to the Terms of Service and Privacy Policy").font(.callout)
                }
                LegalLinks()
            }
            Button { Task { await go() } } label: {
                HStack {
                    Text(buttonTitle).fontWeight(.semibold)
                    Spacer()
                    if busy { ProgressView() }
                }
            }
            .disabled(!ready)
            if mode == .signIn {
                Button(resetting ? "Sending reset email…" : "Forgot password?") { Task { await resetPassword() } }
                    .font(.callout)
                    .disabled(resetting || busy)
            }
            if let info { Label(info, systemImage: "envelope.badge").font(.callout).foregroundStyle(Color.secondary) }
            if let problem { Text(problem).font(.callout).foregroundStyle(Color.red) }
            if let p = app.cloud.pendingInvite {
                Label("After you sign in you'll join the team with code \(TeamLogic.formatCode(p.code)).", systemImage: "person.badge.plus")
                    .font(.callout).foregroundStyle(Color.secondary)
            }
        } header: { Text("Account").textCase(nil) } footer: {
            Text(mode == .create
                 ? (joining ? "Creates your PinPlan account. The same email and password work on the web." : "Creates your PinPlan account and your company. The same email and password work on the web.")
                 : "Use the same account as on the web.")
        }
        .onChange(of: mode) { _, _ in problem = nil }
    }

    private var buttonTitle: String {
        switch mode {
        case .signIn: return busy ? "Signing in…" : "Sign in"
        case .create: return busy ? "Creating account…" : "Create account"
        }
    }

    /// Enough to try; the details are checked when the button is pressed (so the message can say what's wrong).
    private var ready: Bool {
        guard !busy, email.contains("@"), !password.isEmpty else { return false }
        return mode == .signIn || agreed
    }

    /// Email a reset link; the link opens the web app's reset page to set a new password.
    private func resetPassword() async {
        let e = email.trimmingCharacters(in: .whitespaces)
        problem = nil; info = nil
        guard e.contains("@") else { problem = "Enter your email above, then tap Forgot password?"; return }
        resetting = true
        defer { resetting = false }
        do {
            try await app.cloud.sendPasswordReset(email: e, serverURL: app.settings.serverURL)
            info = "Check your email (\(e)); follow the link to set a new password, then sign in here."
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func go() async {
        problem = nil; info = nil
        let e = email.trimmingCharacters(in: .whitespaces)
        if mode == .create, let p = SignupLogic.problem(email: e, password: password, name: name, company: company, needsCompany: !joining, acceptedTerms: agreed) {
            problem = p
            return
        }
        busy = true
        defer { busy = false }
        do {
            switch mode {
            case .signIn:
                try await app.cloud.signIn(email: e, password: password, create: false)
                password = ""
                await app.cloud.finishPendingCompany()
            case .create:
                if try await app.cloud.createAccount(email: e, password: password, name: name, company: joining ? "" : company, acceptedAt: Date()) {
                    password = ""
                } else {
                    info = "Check \(e) for the confirmation email (and your spam folder), tap the link, then sign in here. If this email already has an account, just sign in."
                    mode = .signIn
                    password = ""
                }
            }
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

/// "Terms of Service · Privacy Policy" links under the sign-up agreement (shown once the server is known).
private struct LegalLinks: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        if let terms = serverPageURL(app.settings, "terms"), let privacy = serverPageURL(app.settings, "privacy") {
            HStack(spacing: 16) {
                Link("Terms of Service", destination: terms)
                Link("Privacy Policy", destination: privacy)
            }
            .font(.footnote)
            .buttonStyle(.borderless)   // two links in one row: each opens its own page
        }
    }
}
