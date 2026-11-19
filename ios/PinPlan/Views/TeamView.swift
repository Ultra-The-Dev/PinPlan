import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import PinPlanCore

// Settings › Team: start a company team or join one with a code, see who's on it, invite people and set roles.
// Same states as the web app's team page (src/app/team). The team calls live in CloudSync (+ company team).

/// The Team screen in its own sheet (from the Projects screen's company menu).
struct TeamSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            TeamView()
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

struct TeamView: View {
    @Environment(AppModel.self) private var app
    @State private var invites: [TeamInvite] = []
    @State private var problem: String?
    @State private var newInvite = false
    @State private var card: InviteCardItem?
    @State private var toRemove: TeamMember?
    @State private var confirmLeave = false
    @State private var shownHookCard = false

    var body: some View {
        let cloud = app.cloud
        SentenceForm {
            if cloud.teamNeedsMigration { MigrationNeededSection() }
            if cloud.config == nil || !cloud.signedIn {
                SignedOutTeamSection()
                JoinTeamSection()
            } else if cloud.onTeam {
                TeamDetailsSection { problem = $0 }
                TeamPlanSection()
                MembersSection(toRemove: $toRemove) { problem = $0 }
                if cloud.can(.manageTeam) {
                    InvitesSection(invites: invites, onNew: { newInvite = true }, onOpen: { show($0) }, onRevoke: { revoke($0) })
                }
                if cloud.role != .owner {
                    Section {
                        Button("Leave team", role: .destructive) { confirmLeave = true }
                    } footer: {
                        Text("You'll keep working alone. The team's jobs stay with the team.")
                    }
                }
            } else if !cloud.teamNeedsMigration {
                StartTeamSection { problem = $0 }
                JoinTeamSection()
            }
            if let problem {
                Section { Label(problem, systemImage: "exclamationmark.triangle.fill").font(.callout).foregroundStyle(Color.red) }
            }
        }
        .navigationTitle("Team")
        .task { await reload() }
        .refreshable { await reload() }
        .onChange(of: cloud.team?.team?.id) { _, _ in Task { await loadInvites() } }
        .sheet(isPresented: $newInvite) {
            NewInviteSheet { code, role, name in
                Task { await loadInvites() }
                card = InviteCardItem(code: code, role: role, name: name)
            }
        }
        .sheet(item: $card) { c in InviteCardView(item: c) }
        .confirmationDialog(removeTitle, isPresented: Binding(get: { toRemove != nil }, set: { if !$0 { toRemove = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                if let m = toRemove { Task { await run { try await app.cloud.removeMember(m.userId) } } }
                toRemove = nil
            }
        } message: {
            Text("They can no longer open the team's jobs. Their photos and notes stay on the jobs.")
        }
        .confirmationDialog("Leave \(cloud.team?.team?.name ?? "the team")?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Leave team", role: .destructive) { Task { await run { try await app.cloud.leaveTeam() } } }
        } message: {
            Text("You'll need a new invite code to join again.")
        }
    }

    private var removeTitle: String { "Remove \(toRemove?.label ?? "this person") from the team?" }

    private func reload() async {
        await app.cloud.loadTeam()
        await loadInvites()
    }

    private func loadInvites() async {
        guard app.cloud.onTeam, app.cloud.can(.manageTeam) else { invites = []; return }
        do { invites = try await app.cloud.listInvites() } catch { problem = teamErrorText(error) }
        // Screenshot hook: `--invite-card` shows the newest waiting invite's code.
        if ProcessInfo.processInfo.arguments.contains("--invite-card"), card == nil, !shownHookCard, let i = invites.first(where: { $0.state() == .open }) {
            shownHookCard = true
            show(i)
        }
    }

    private func show(_ i: TeamInvite) { card = InviteCardItem(code: i.code, role: i.role, name: i.name) }

    private func revoke(_ i: TeamInvite) {
        Task {
            await run { try await app.cloud.revokeInvite(i.code) }
            await loadInvites()
        }
    }

    private func run(_ work: () async throws -> Void) async {
        problem = nil
        do { try await work() } catch { problem = teamErrorText(error) }
    }
}

func teamErrorText(_ error: Error) -> String { (error as? LocalizedError)?.errorDescription ?? error.localizedDescription }

// MARK: - pieces shared with other screens

/// Shown where a technician would otherwise see prices.
struct OfficeOnlyView: View {
    let what: String
    var body: some View {
        ContentUnavailableView {
            Label("Office only", systemImage: "lock")
        } description: {
            Text("\(what) and prices are handled by the office. Your role on the team is Technician.")
        }
    }
}

/// "Acme AV · Technician" chip at the top of the Projects screen; opens the Team screen.
struct TeamBadge: View {
    @Environment(AppModel.self) private var app
    let action: () -> Void
    var body: some View {
        if let t = app.cloud.team?.team, let r = app.cloud.role {
            Button(action: action) {
                HStack(spacing: 6) {
                    Image(systemName: "person.2.fill").font(.caption)
                    Text(t.name.isEmpty ? "Your team" : t.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text("·").foregroundStyle(Color.secondary)
                    Text(r.name).font(.subheadline).foregroundStyle(Color.secondary).lineLimit(1)
                }
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color(.secondarySystemGroupedBackground), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Team \(t.name), your role \(r.name)")
        }
    }
}

struct RoleBadge: View {
    let role: TeamRole
    var body: some View {
        Text(role.short)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(tint)
            .background(tint.opacity(0.14), in: Capsule())
    }
    private var tint: Color {
        switch role {
        case .owner: return Color.brand
        case .admin: return Color.blue
        case .tech: return Color.green
        }
    }
}

/// Round initials for a member row.
private struct MemberAvatar: View {
    let label: String
    var body: some View {
        let initials = label.split(separator: " ").prefix(2).compactMap { $0.first }.map { String($0) }.joined().uppercased()
        Text(initials.isEmpty ? "?" : initials)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.white)
            .frame(width: 36, height: 36)
            .background(Color.brand.opacity(0.85), in: Circle())
    }
}

// MARK: - states

private struct MigrationNeededSection: View {
    var body: some View {
        Section {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text("The cloud database needs the team update").font(.subheadline.weight(.semibold))
                    Text("Run \(TeamLogic.migrationFile) in the Supabase SQL editor, then pull to refresh.")
                        .font(.callout).foregroundStyle(Color.secondary)
                }
            } icon: {
                Image(systemName: "wrench.and.screwdriver").foregroundStyle(Color.orange)
            }
        }
    }
}

private struct SignedOutTeamSection: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text("Work as a team").font(.headline)
                Text("Give your office staff and technicians their own sign-in. Everyone sees the team's jobs; technicians don't see prices, quotes or invoices.")
                    .font(.callout).foregroundStyle(Color.secondary)
            }
            .padding(.vertical, 4)
            NavigationLink { CloudSyncView() } label: {
                Label(app.cloud.config == nil ? "Connect cloud sync" : "Sign in or create an account", systemImage: "person.crop.circle.badge.plus")
            }
        } footer: {
            Text("Starting a team needs a cloud account. Joining one? Enter your invite code below.")
        }
    }
}

private struct StartTeamSection: View {
    @Environment(AppModel.self) private var app
    let onError: (String) -> Void
    @State private var company = ""
    @State private var myName = ""
    @State private var busy = false

    var body: some View {
        Section {
            TextField("Company name", text: $company).textContentType(.organizationName)
            TextField("Your name", text: $myName).textContentType(.name)
            Button { Task { await start() } } label: {
                HStack {
                    Label(busy ? "Starting…" : "Start your team", systemImage: "person.2.badge.plus").fontWeight(.semibold)
                    Spacer()
                    if busy { ProgressView() }
                }
            }
            .disabled(busy || company.trimmingCharacters(in: .whitespaces).isEmpty)
        } header: {
            Text("Start your team").textCase(nil)
        } footer: {
            Text("You'll be the owner. Your jobs and price list become the team's, and you can invite office staff and technicians.")
        }
        .onAppear {
            if company.isEmpty { company = app.settings.business.name }
            if myName.isEmpty { myName = FieldAuthor.stored }
        }
    }

    private func start() async {
        busy = true
        defer { busy = false }
        do {
            try await app.cloud.createTeam(name: company, myName: myName)
            if !myName.trimmingCharacters(in: .whitespaces).isEmpty { FieldAuthor.set(myName) }
        } catch { onError(teamErrorText(error)) }
    }
}

/// Enter an invite code: dashes, spaces and lower case are fine. Looks the code up, then joins (or, before
/// signing in, remembers it and asks for an account).
private struct JoinTeamSection: View {
    @Environment(AppModel.self) private var app
    @State private var code = ""
    @State private var name = ""
    @State private var info: InviteInfo?
    @State private var invalid = false
    @State private var looking = false
    @State private var joining = false
    @State private var problem: String?
    @State private var needsAccount = false

    private var normalized: String { TeamLogic.normalizeCode(code) }

    var body: some View {
        Section {
            TextField("Invite code, e.g. K7QM-XR4T-PA", text: $code)
                .font(.body.monospaced())
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .onSubmit { Task { await lookUp() } }
                .onChange(of: code) { _, _ in
                    info = nil; invalid = false; problem = nil
                    if normalized.count == TeamLogic.codeLength { Task { await lookUp() } }
                }
            if let info {
                InviteSummaryRow(info: info)
                TextField("Your name", text: $name).textContentType(.name)
                Button { Task { await join(info) } } label: {
                    HStack {
                        Text(joinTitle(info)).fontWeight(.semibold)
                        Spacer()
                        if joining { ProgressView() }
                    }
                }
                .disabled(joining)
            } else if looking {
                HStack { ProgressView(); Text("Looking up the code…").foregroundStyle(Color.secondary) }
            } else if invalid {
                Label("That code isn't valid: it may be mistyped, already used, expired or cancelled. Ask for a new one.", systemImage: "xmark.octagon")
                    .font(.callout).foregroundStyle(Color.red)
            } else {
                Button("Look up code") { Task { await lookUp() } }
                    .disabled(normalized.count < 8 || app.cloud.config == nil)
            }
            if let problem { Text(problem).font(.callout).foregroundStyle(Color.red) }
        } header: {
            Text("Join a team").textCase(nil)
        } footer: {
            Text(app.cloud.config == nil ? "Connect cloud sync first (Settings › Cloud sync), then enter the code." : "Got a code from your company? Enter it here.")
        }
        if needsAccount, let info {
            AccountSection(intro: "Sign in or create your account to join \(info.team.isEmpty ? "the team" : info.team). You'll join as soon as you're signed in.")
        }
    }

    private func joinTitle(_ info: InviteInfo) -> String {
        if joining { return "Joining…" }
        return "Join \(info.team.isEmpty ? "the team" : info.team) as \(info.role.name)"
    }

    private func lookUp() async {
        let c = normalized
        guard c.count >= 8, !looking else { return }
        looking = true; problem = nil
        defer { looking = false }
        do {
            let found = try await app.cloud.inviteInfo(c)
            guard c == normalized else { return }   // typed on meanwhile
            info = found
            invalid = found == nil
            if let found, name.isEmpty { name = found.name.isEmpty ? FieldAuthor.stored : found.name }
        } catch { problem = teamErrorText(error) }
    }

    private func join(_ info: InviteInfo) async {
        guard app.cloud.signedIn else {
            // No account yet (or waiting on the confirmation email): join automatically after signing in.
            app.cloud.rememberPendingInvite(code: normalized, name: name)
            needsAccount = true
            return
        }
        joining = true; problem = nil
        defer { joining = false }
        do {
            let r = try await app.cloud.acceptInvite(normalized, name: name)
            app.cloud.teamNotice = "You joined \(r.team.isEmpty ? "the team" : r.team) as \(r.role.name)."
            code = ""
            await app.cloud.syncNow()   // bring in the team's jobs
        } catch { problem = teamErrorText(error) }
    }
}

private struct InviteSummaryRow: View {
    let info: InviteInfo
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.2.badge.plus").font(.title2).foregroundStyle(Color.brand)
            VStack(alignment: .leading, spacing: 2) {
                Text(info.team.isEmpty ? "A PinPlan team" : info.team).font(.headline)
                Text(info.role.description).font(.caption).foregroundStyle(Color.secondary)
            }
            Spacer(minLength: 0)
            RoleBadge(role: info.role)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - on a team

private struct TeamDetailsSection: View {
    @Environment(AppModel.self) private var app
    let onError: (String) -> Void

    var body: some View {
        let cloud = app.cloud
        let canManage = cloud.can(.manageTeam)
        Section {
            if let n = cloud.teamNotice {
                Label(n, systemImage: "checkmark.circle.fill").font(.callout).foregroundStyle(Color.green)
            }
            LabeledContent("Team name") {
                if canManage {
                    CommitField(title: "Team name", value: cloud.team?.team?.name ?? "", prompt: "Company name") { v in
                        Task { await save { try await app.cloud.renameTeam(v) } }
                    }
                    .multilineTextAlignment(.trailing)
                } else {
                    Text(cloud.team?.team?.name ?? "")
                }
            }
            LabeledContent("Your name") {
                CommitField(title: "Your name", value: cloud.teamMe?.name ?? "", prompt: "Shown on photos and logs") { v in
                    Task { await save { try await app.cloud.setMyName(v) } }
                    FieldAuthor.set(v)
                }
                .multilineTextAlignment(.trailing)
            }
            LabeledContent("Your role") {
                if let r = cloud.role { RoleBadge(role: r) }
            }
        } header: {
            Text("Your team").textCase(nil)
        } footer: {
            Text(cloud.role?.description ?? "")
        }
    }

    private func save(_ work: () async throws -> Void) async {
        do { try await work() } catch { onError(teamErrorText(error)) }
    }
}

private struct MembersSection: View {
    @Environment(AppModel.self) private var app
    @Binding var toRemove: TeamMember?
    let onError: (String) -> Void

    var body: some View {
        let cloud = app.cloud
        let members = cloud.teamMembers
        Section {
            ForEach(members) { m in
                MemberRow(member: m, isMe: m.userId == cloud.session?.userId, editable: editable(m)) { role in
                    Task {
                        do { try await app.cloud.setMemberRole(m.userId, role: role) } catch { onError(teamErrorText(error)) }
                    }
                }
                .swipeActions {
                    if editable(m) {
                        Button(role: .destructive) { toRemove = m } label: { Label("Remove", systemImage: "person.badge.minus") }
                    }
                }
                .contextMenu {
                    if editable(m) {
                        Button(role: .destructive) { toRemove = m } label: { Label("Remove from team", systemImage: "person.badge.minus") }
                    }
                }
            }
        } header: {
            Text("People (\(members.count))").textCase(nil)
        } footer: {
            if cloud.can(.manageTeam) && members.count > 1 {
                Text("Change someone's role with the menu on their row. Swipe left to remove them.")
            }
        }
    }

    /// The owner or an admin can change and remove anyone except the owner and themselves.
    private func editable(_ m: TeamMember) -> Bool {
        app.cloud.can(.manageTeam) && m.role != .owner && m.userId != app.cloud.session?.userId
    }
}

private struct MemberRow: View {
    let member: TeamMember
    let isMe: Bool
    let editable: Bool
    let onRole: (TeamRole) -> Void

    var body: some View {
        HStack(spacing: 12) {
            MemberAvatar(label: member.label)
            VStack(alignment: .leading, spacing: 2) {
                Text(isMe ? "\(member.label) (you)" : member.label).font(.body.weight(.medium)).lineLimit(1)
                if let e = member.email, !e.isEmpty {
                    Text(e).font(.caption).foregroundStyle(Color.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if editable {
                Menu {
                    Picker("Role", selection: Binding(get: { member.role }, set: { onRole($0) })) {
                        ForEach(TeamRole.invitable, id: \.self) { r in
                            Text(r.name).tag(r)
                        }
                    }
                } label: {
                    HStack(spacing: 3) {
                        RoleBadge(role: member.role)
                        Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(Color.secondary)
                    }
                }
                .accessibilityLabel("Role: \(member.role.name). Change")
            } else {
                RoleBadge(role: member.role)
            }
        }
        .padding(.vertical, 2)
    }
}

private struct InvitesSection: View {
    let invites: [TeamInvite]
    let onNew: () -> Void
    let onOpen: (TeamInvite) -> Void
    let onRevoke: (TeamInvite) -> Void

    var body: some View {
        // Waiting codes first, then the ones joined; expired and cancelled ones stay out of the way.
        let waiting = invites.filter { $0.state() == .open }
        let done = invites.filter { $0.state() != .open }.prefix(8)
        Section {
            Button(action: onNew) { Label("Invite someone", systemImage: "person.badge.plus").fontWeight(.semibold) }
            ForEach(waiting) { i in
                Button { onOpen(i) } label: { InviteRow(invite: i) }
                    .buttonStyle(.plain)
                    .swipeActions {
                        Button(role: .destructive) { onRevoke(i) } label: { Label("Cancel invite", systemImage: "xmark") }
                    }
                    .contextMenu {
                        Button { onOpen(i) } label: { Label("Show code", systemImage: "qrcode") }
                        Button(role: .destructive) { onRevoke(i) } label: { Label("Cancel invite", systemImage: "xmark") }
                    }
            }
            ForEach(Array(done)) { i in InviteRow(invite: i) }
        } header: {
            Text("Invites").textCase(nil)
        } footer: {
            Text("Each code works once and runs out after 14 days. Tap a waiting code to show or share it again.")
        }
    }
}

private struct InviteRow: View {
    let invite: TeamInvite
    var body: some View {
        let state = invite.state()
        HStack(spacing: 12) {
            Image(systemName: icon(state)).foregroundStyle(tint(state)).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(invite.name.isEmpty ? TeamLogic.formatCode(invite.code) : invite.name).font(.body.weight(.medium))
                Text("\(TeamLogic.formatCode(invite.code)) · \(invite.role.name)").font(.caption.monospaced()).foregroundStyle(Color.secondary)
            }
            Spacer(minLength: 8)
            Text(state.label).font(.caption.weight(.semibold)).foregroundStyle(tint(state))
        }
        .contentShape(Rectangle())
        .opacity(state == .open || state == .used ? 1 : 0.6)
    }
    private func icon(_ s: InviteState) -> String {
        switch s {
        case .open: return "hourglass"
        case .used: return "checkmark.circle.fill"
        case .expired: return "clock.badge.xmark"
        case .revoked: return "xmark.circle"
        }
    }
    private func tint(_ s: InviteState) -> Color {
        switch s {
        case .open: return Color.orange
        case .used: return Color.green
        case .expired: return Color.secondary
        case .revoked: return Color.secondary
        }
    }
}

// MARK: - inviting

/// Who to invite and as what; makes the code.
private struct NewInviteSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onCreated: (String, TeamRole, String) -> Void
    @State private var name = ""
    @State private var role: TeamRole = .tech
    @State private var busy = false
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            SentenceForm {
                Section {
                    TextField("Their name", text: $name).textContentType(.name)
                } footer: { Text("So you know whose code is whose. They can change it when they join.") }
                Section {
                    Picker("Role", selection: $role) {
                        ForEach(TeamRole.invitable, id: \.self) { r in Text(r.name).tag(r) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: { Text("Role").textCase(nil) } footer: { Text(role.description) }
                if let problem { Section { Text(problem).foregroundStyle(Color.red) } }
            }
            .navigationTitle("Invite someone")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Creating…" : "Create code") { Task { await create() } }.disabled(busy)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func create() async {
        busy = true; problem = nil
        defer { busy = false }
        do {
            let code = try await app.cloud.createInvite(role: role, name: name)
            dismiss()
            onCreated(code, role, name.trimmingCharacters(in: .whitespaces))
        } catch { problem = teamErrorText(error) }
    }
}

struct InviteCardItem: Identifiable {
    let code: String
    let role: TeamRole
    let name: String
    var id: String { code }
}

/// The code, big and readable, with the join link, a QR code and ways to send it.
private struct InviteCardView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let item: InviteCardItem
    @State private var copied = false
    /// The PinPlan server can send email: offer to email the invite too.
    @State private var canEmail = false

    private var link: String? {
        app.settings.serverURL.trimmingCharacters(in: .whitespaces).isEmpty ? nil : TeamLogic.joinURL(origin: app.settings.serverURL, code: item.code)
    }
    private var shareText: String {
        TeamLogic.inviteMessage(team: app.cloud.team?.team?.name ?? "", role: item.role, name: item.name, code: item.code, link: link)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    InviteCodeHeader(item: item)
                    InviteQR(text: link ?? TeamLogic.formatCode(item.code))
                    if let link {
                        Text(link).font(.footnote.monospaced()).foregroundStyle(Color.secondary).multilineTextAlignment(.center).textSelection(.enabled)
                    } else {
                        Text("Set your PinPlan server (Settings › PinPlan server) to also share a join link.").font(.footnote).foregroundStyle(Color.secondary).multilineTextAlignment(.center)
                    }
                    InviteShareButtons(code: item.code, shareText: shareText, link: link, copied: $copied)
                    if canEmail { InviteEmailBox(code: item.code, name: item.name) }
                    Text("They open the link, or in the app go to Settings › Team and type the code. It works once and runs out in 14 days.")
                        .font(.footnote).foregroundStyle(Color.secondary).multilineTextAlignment(.center)
                }
                .padding(24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .background(Color.paper)
            .task {
                guard let api = APIClient(settings: app.settings) else { return }
                canEmail = await api.emailConfigured()
            }
            .navigationTitle("Invite code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct InviteCodeHeader: View {
    let item: InviteCardItem
    private var title: String { item.name.isEmpty ? "Invite" : "For \(item.name)" }
    private var spokenCode: String { "Code " + item.code.map { String($0) }.joined(separator: " ") }
    var body: some View {
        VStack(spacing: 8) {
            Text(title).font(.headline)
            RoleBadge(role: item.role)
            Text(TeamLogic.formatCode(item.code))
                .font(.system(size: 40, weight: .bold, design: .monospaced))
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .textSelection(.enabled)
                .padding(.top, 6)
                .accessibilityLabel(spokenCode)
        }
    }
}

private struct InviteQR: View {
    let text: String
    var body: some View {
        if let img = QRCode.image(text) {
            Image(uiImage: img)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(width: 220, height: 220)
                .padding(14)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityLabel("QR code for the invite")
        }
    }
}

private struct InviteShareButtons: View {
    let code: String
    let shareText: String
    let link: String?
    @Binding var copied: Bool

    var body: some View {
        VStack(spacing: 10) {
            ShareLink(item: shareText, subject: Text("Join our team on PinPlan")) {
                Label("Share invite", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            HStack(spacing: 10) {
                Button {
                    UIPasteboard.general.string = TeamLogic.formatCode(code)
                    copied = true
                } label: {
                    Label(copied ? "Copied" : "Copy code", systemImage: copied ? "checkmark" : "doc.on.doc").frame(maxWidth: .infinity)
                }
                if let link {
                    Button {
                        UIPasteboard.general.string = link
                        copied = true
                    } label: {
                        Label("Copy link", systemImage: "link").frame(maxWidth: .infinity)
                    }
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
    }
}

/// QR codes drawn with Core Image (no network, no library).
enum QRCode {
    static func image(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cg = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
