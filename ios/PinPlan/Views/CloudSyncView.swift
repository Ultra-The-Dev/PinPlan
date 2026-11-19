import SwiftUI
import PinPlanCore

/// Sign in to the same cloud account as the web app so jobs, the catalog and products stay in step on every device.
struct CloudSyncView: View {
    @Environment(AppModel.self) private var app
    @State private var busy = false
    @State private var problem: String?
    @State private var manualURL = ""
    @State private var manualKey = ""
    @State private var showManual = false

    var body: some View {
        let cloud = app.cloud
        SentenceForm {
            if cloud.config == nil {
                Section {
                    Button {
                        Task { await connect() }
                    } label: { HStack { Text(busy ? "Connecting…" : "Get cloud settings from my PinPlan server"); Spacer(); if busy { ProgressView() } } }
                    .disabled(busy || APIClient(settings: app.settings) == nil)
                    if APIClient(settings: app.settings) == nil { Text("Set up the PinPlan server first (Settings → PinPlan server).").font(.callout).foregroundStyle(.secondary) }
                    DisclosureGroup("Enter them by hand", isExpanded: $showManual) {
                        TextField("https://xxxx.supabase.co", text: $manualURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        TextField("Anon (public) key", text: $manualKey).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Save") { cloud.setConfig(url: manualURL, anonKey: manualKey) }.disabled(manualURL.isEmpty || manualKey.isEmpty)
                    }
                } header: { Text("Connect").textCase(nil) } footer: {
                    Text("Uses the same Supabase project as the web app. The project address and public key aren't secret; your password never leaves this sign-in.")
                }
            } else if !cloud.signedIn {
                AccountSection()
            } else {
                Section {
                    LabeledContent("Signed in as", value: cloud.session?.email ?? "")
                    Button { Task { await cloud.syncNow() } } label: {
                        HStack { Label(cloud.syncing ? "Syncing…" : "Sync now", systemImage: "arrow.triangle.2.circlepath"); Spacer(); if cloud.syncing { ProgressView() } }
                    }
                    .disabled(cloud.syncing)
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
            }
            if let problem { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
            if cloud.config != nil && !cloud.signedIn {
                Section { Button("Use a different cloud project") { cloud.setConfig(url: "", anonKey: "") } }
            }
        }
        .navigationTitle("Cloud sync")
    }

    private func connect() async {
        guard let api = APIClient(settings: app.settings) else { return }
        busy = true; problem = nil
        defer { busy = false }
        do { try await app.cloud.configure(from: api) } catch { problem = (error as? LocalizedError)?.errorDescription ?? "Couldn't reach the server." }
    }

}

/// Sign in, or create an account right here (Supabase email + password). When the project asks new accounts to
/// confirm their email, says so; an invite code remembered for this device is used after the next sign-in.
struct AccountSection: View {
    @Environment(AppModel.self) private var app
    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "Sign in", create = "Create account"
        var id: String { rawValue }
    }
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var problem: String?
    @State private var info: String?
    /// Shown above the fields (e.g. "Create your account to join Acme").
    var intro: String? = nil

    var body: some View {
        Section {
            Picker("Account", selection: $mode) {
                ForEach(Mode.allCases) { m in Text(m.rawValue).tag(m) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
            if let intro { Text(intro).font(.callout).foregroundStyle(.secondary) }
            TextField("Email", text: $email)
                .keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
            SecureField(mode == .create ? "Password (6 characters or more)" : "Password", text: $password)
                .textContentType(mode == .create ? UITextContentType.newPassword : UITextContentType.password)
            Button { Task { await go() } } label: {
                HStack {
                    Text(buttonTitle).fontWeight(.semibold)
                    Spacer()
                    if busy { ProgressView() }
                }
            }
            .disabled(!ready)
            if let info { Label(info, systemImage: "envelope.badge").font(.callout).foregroundStyle(Color.secondary) }
            if let problem { Text(problem).font(.callout).foregroundStyle(Color.red) }
            if let p = app.cloud.pendingInvite {
                Label("After you sign in you'll join the team with code \(TeamLogic.formatCode(p.code)).", systemImage: "person.badge.plus")
                    .font(.callout).foregroundStyle(Color.secondary)
            }
        } header: { Text("Account").textCase(nil) } footer: {
            Text(mode == .create ? "Creates your PinPlan cloud account. The same email and password work on the web app." : "Use the same account as on the web app.")
        }
        .onChange(of: mode) { _, _ in problem = nil }
    }

    private var buttonTitle: String {
        switch mode {
        case .signIn: return busy ? "Signing in…" : "Sign in"
        case .create: return busy ? "Creating account…" : "Create account"
        }
    }

    private var ready: Bool {
        let e = email.trimmingCharacters(in: .whitespaces)
        guard !busy, e.contains("@") else { return false }
        return mode == .create ? password.count >= 6 : !password.isEmpty
    }

    private func go() async {
        busy = true; problem = nil; info = nil
        defer { busy = false }
        let e = email.trimmingCharacters(in: .whitespaces)
        do {
            switch mode {
            case .signIn:
                try await app.cloud.signIn(email: e, password: password, create: false)
                password = ""
            case .create:
                if try await app.cloud.createAccount(email: e, password: password) {
                    password = ""
                } else {
                    info = CloudSync.SignUpOutcome.confirmEmail(e).message
                    mode = .signIn
                    password = ""
                }
            }
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}
