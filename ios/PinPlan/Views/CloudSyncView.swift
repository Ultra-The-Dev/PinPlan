import SwiftUI
import PinPlanCore

/// Sign in to the same cloud account as the web app so jobs, the catalog and products stay in step on every device.
struct CloudSyncView: View {
    @Environment(AppModel.self) private var app
    @State private var email = ""
    @State private var password = ""
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
                Section {
                    TextField("Email", text: $email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Password", text: $password).textContentType(.password)
                    Button { Task { await signIn(create: false) } } label: { HStack { Text(busy ? "Signing in…" : "Sign in"); Spacer(); if busy { ProgressView() } } }
                        .disabled(busy || email.isEmpty || password.isEmpty)
                    Button("Create account") { Task { await signIn(create: true) } }.disabled(busy || email.isEmpty || password.count < 6)
                } header: { Text("Account").textCase(nil) } footer: { Text("Use the same account as on the web app.") }
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

    private func signIn(create: Bool) async {
        busy = true; problem = nil
        defer { busy = false }
        do { try await app.cloud.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password, create: create); password = "" } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}
