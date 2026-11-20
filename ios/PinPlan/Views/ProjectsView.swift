import SwiftUI
import UniformTypeIdentifiers
import PinPlanCore

struct ProjectsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var search = ""
    @State private var status: ProjectStatus?
    @State private var label: String?
    @State private var showNew = false
    @State private var showSettings = false
    @State private var showProducts = false
    @State private var showCatalog = false
    @State private var showAllPhotos = ProjectsView.launchFlag("--all-photos")
    @State private var showMap = ProjectsView.launchFlag("--jobs-map")
    @State private var showTasks = ProjectsView.launchFlag("--tasks")
    @State private var showRestore = false
    @State private var showTeam = false
    @State private var path: [String] = []
    @State private var message: String?
    @State private var toDelete: ProjectBundle?

    /// Screenshot / automation flags. Debug builds only: a release build ignores launch arguments.
    private static func launchFlag(_ name: String) -> Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains(name)
        #else
        return false
        #endif
    }

    /// The office (owner, admin, or working alone) creates jobs and restores backups; technicians work the jobs
    /// they're given.
    private var office: Bool { app.cloud.can(.deleteJob) }

    private func openDemo() {
        Task { path.append(await app.createDemo().project.id) }
    }

    private var filtered: [ProjectBundle] {
        app.projects.filter { b in
            (status == nil || b.project.status == status) &&
            (label == nil || (b.project.labels ?? []).contains(label!)) &&
            (search.isEmpty || "\(b.project.address) \(b.project.clientName) \((b.project.labels ?? []).joined(separator: " "))".localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                // Trial ending, needs attention or read-only (company teams only; nothing otherwise).
                BillingBannerView(outer: EdgeInsets(top: 8, leading: 16, bottom: 0, trailing: 16))
                if app.projects.isEmpty {
                    EmptyProjects(office: office, onNew: { showNew = true }, onDemo: openDemo).padding(.top, 60)
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        if app.cloud.onTeam { TeamBadge { showTeam = true } }
                        Picker("Status", selection: $status) {
                            Text("All").tag(ProjectStatus?.none)
                            ForEach(ProjectStatus.allCases, id: \.self) { s in Text(s.title).tag(Optional(s)) }
                        }
                        .pickerStyle(.segmented)
                        .frame(maxWidth: 480)
                        let labels = Array(Set(app.projects.flatMap { $0.project.labels ?? [] })).sorted()
                        if !labels.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(labels, id: \.self) { l in
                                        let on = label == l
                                        Button { label = on ? nil : l } label: {
                                            Label(l, systemImage: "tag").font(.subheadline.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 5)
                                                .background(on ? Color.ink : Color(.secondarySystemFill), in: Capsule())
                                                .foregroundStyle(on ? Color.white : Color.primary)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 16)], spacing: 16) {
                            ForEach(filtered, id: \.project.id) { b in
                                NavigationLink(value: b.project.id) { ProjectCard(bundle: b) }
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        // Only the office deletes jobs on a team (the database refuses a technician's delete too).
                                        if app.cloud.can(.deleteJob) {
                                            Button(role: .destructive) { toDelete = b } label: { Label("Delete", systemImage: "trash") }
                                        }
                                    }
                            }
                        }
                        if filtered.isEmpty { Text("No jobs match.").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(40) }
                    }
                    .padding()
                }
            }
            .background(Color.paper)
            .navigationTitle("Jobs")
            .searchable(text: $search, prompt: "Client or address")
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { showCatalog = true } label: { Label("Price list", systemImage: "tag") }
                    Button { showSettings = true } label: { Label("Settings", systemImage: "gearshape") }
                    if hSize == .compact {
                        // Phone: the company-wide views share one menu so the bar stays tidy.
                        Menu {
                            Button { showTasks = true } label: { Label("Tasks", systemImage: "checklist") }
                            Button { showAllPhotos = true } label: { Label("All photos", systemImage: "photo.on.rectangle.angled") }
                            Button { showMap = true } label: { Label("Jobs map", systemImage: "map") }
                            Divider()
                            Button { showTeam = true } label: { Label("Team", systemImage: "person.2") }
                        } label: { Label("Company", systemImage: "square.grid.2x2") }
                    } else {
                        Button { showTasks = true } label: { Label("Tasks", systemImage: "checklist") }
                        Button { showAllPhotos = true } label: { Label("All photos", systemImage: "photo.on.rectangle.angled") }
                        Button { showMap = true } label: { Label("Jobs map", systemImage: "map") }
                        Button { showTeam = true } label: { Label("Team", systemImage: "person.2") }
                    }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Menu {
                        if office { Button { showRestore = true } label: { Label("Restore backup…", systemImage: "square.and.arrow.down") } }
                        Button(action: openDemo) { Label("Create demo job", systemImage: "wand.and.stars") }
                    } label: { Label("More", systemImage: "ellipsis.circle") }
                    if office {
                        Button { showNew = true } label: { Label("New job", systemImage: "plus") }.buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationDestination(for: String.self) { id in
                if let b = app.projects.first(where: { $0.project.id == id }) { ProjectView(bundle: b) }
            }
            .sheet(isPresented: $showNew) {
                NewProjectSheet { b in path.append(b.project.id) }
            }
            .sheet(isPresented: $showSettings) { NavigationStack { SettingsView() } }
            .sheet(isPresented: $showCatalog) { NavigationStack { CatalogView() } }
            .fullScreenCover(isPresented: $showAllPhotos) { AllPhotosView { id in path = [id] } }
            .fullScreenCover(isPresented: $showMap) { JobsMapView { id in path = [id] } }
            .sheet(isPresented: $showTasks) { TasksView { id in path = [id] } }
            .sheet(isPresented: $showProducts) { NavigationStack { ProductLibraryView() } }
            .sheet(isPresented: $showTeam) { TeamSheet() }
            .fileImporter(isPresented: $showRestore, allowedContentTypes: [.json, .data]) { result in
                do {
                    let n = try app.restore(from: result.get())
                    message = "Restored \(n) job\(n == 1 ? "" : "s")"
                } catch { message = error.localizedDescription }
            }
            .task {
                // Server calls carry the user's session; a fresh install connects to the built-in server (AccountViews.swift).
                await app.cloud.prepareAtLaunch(settings: app.settings)
                #if DEBUG
                // Screenshot/automation hook: `--demo` opens (creating if needed) the demo job.
                let args = ProcessInfo.processInfo.arguments
                // Screenshot hook: `--team` opens the Team screen (with `--cloud-test`, the stand-in server's team fills it in).
                if args.contains("--team") { showTeam = true }
                // Test hook: sign in to a stand-in cloud server (the screenshots workflow runs one on the runner).
                if let i = args.firstIndex(of: "--cloud-test"), args.indices.contains(i + 1) {
                    app.cloud.setConfig(url: args[i + 1], anonKey: "test-anon-key")
                    app.settings.serverURL = args[i + 1]
                    try? await app.cloud.signIn(email: "test@example.com", password: "test-password", create: false)
                }
                if args.contains("--demo"), path.isEmpty {
                    if let demo = app.projects.first(where: { $0.project.address.hasPrefix("Demo") }) { path.append(demo.project.id) }
                    else { path.append(await app.createDemo().project.id) }
                }
                if args.contains("--arch-sample"), path.isEmpty {
                    if let s = app.projects.first(where: { $0.project.address.hasPrefix("Sample — architect") }) { path.append(s.project.id) }
                    else { path.append(await app.createArchitectSample().project.id) }
                }
                if let url = FileProject.launchFile("import-file"), path.isEmpty {
                    let address = "Test — \(url.deletingPathExtension().lastPathComponent)"
                    if let p = app.projects.first(where: { $0.project.address == address }) { path.append(p.project.id) }
                    else { path.append(await app.createProject(fromFile: url).project.id) }
                }
                // `--delete-account` opens Settings on the Delete account screen.
                if args.contains("--settings") || args.contains("--server") || args.contains("--delete-account") { showSettings = true }
                if args.contains("--products") { showProducts = true }
                if args.contains("--catalog") { showCatalog = true }
                #endif
            }
            .sheet(isPresented: Binding(get: { !app.incomingFiles.isEmpty }, set: { if !$0 { app.incomingFiles = [] } })) {
                ImportTargetSheet { projectId in
                    app.pendingImport = (projectId, app.incomingFiles)
                    app.incomingFiles = []
                    path = [projectId]
                }
            }
            .overlay {
                if app.creatingDemo {
                    VStack(spacing: 12) {
                        ProgressView().controlSize(.large)
                        Text("Drawing the demo job…").font(.headline)
                    }
                    .padding(28)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
                }
            }
            .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) { Button("OK") {} }
            .confirmationDialog("Delete this job and its plans?", isPresented: Binding(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), titleVisibility: .visible) {
                Button("Delete", role: .destructive) { if let b = toDelete { app.delete(b) }; toDelete = nil }
            }
        }
    }
}

private struct EmptyProjects: View {
    let office: Bool
    let onNew: () -> Void
    let onDemo: () -> Void
    var body: some View {
        VStack(spacing: 14) {
            LogoTile(size: 84)
            Text(office ? "Start your first job" : "No jobs yet").font(.title2.bold())
            Text(office
                 ? "Create a job, add its plans (PDF, photos or the document scanner), then tap to place devices, wire runs and panels."
                 : "Jobs your office adds show up here. Try the demo job to see how placing devices works.")
                .multilineTextAlignment(.center).foregroundStyle(Color.pencil).frame(maxWidth: 420)
            HStack(spacing: 12) {
                if office { Button(action: onNew) { Label("New job", systemImage: "plus") }.buttonStyle(.borderedProminent) }
                Button(action: onDemo) { Label("Try a demo job", systemImage: "wand.and.stars") }.buttonStyle(.bordered)
            }
            .controlSize(.large)
        }
        .padding()
        .frame(maxWidth: .infinity)
    }
}

struct StatusChip: View {
    let status: ProjectStatus
    var body: some View {
        // Approved is teal (brand); quoting is amber, installed is pencil grey (reads in light and dark).
        let tint: Color = status == .estimate ? Color.orange : status == .approved ? Color.approved : Color.pencil
        HStack(spacing: 5) {
            Circle().fill(tint).frame(width: 7, height: 7)
            Text(status.title).font(.caption.weight(.medium)).foregroundStyle(.primary)
        }
    }
}

private struct ProjectCard: View {
    @Environment(AppModel.self) private var app
    let bundle: ProjectBundle

    var body: some View {
        let p = bundle.project
        let led = TakeoffCalculator.compute(bundle).total.ledTotalFt
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                Group {
                    if let id = bundle.liveSheets.first?.imageId ?? bundle.livePhotos.first?.imageId, let img = app.store.image(id) {
                        Image(uiImage: img).resizable().scaledToFill()
                    } else {
                        Image(systemName: "doc.richtext").font(.largeTitle).foregroundStyle(.tertiary).frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .frame(height: 150).frame(maxWidth: .infinity).clipped().background(Color(.secondarySystemBackground))
                StatusChip(status: p.status).padding(.horizontal, 8).padding(.vertical, 4)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6, style: .continuous)).padding(10)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(p.address.isEmpty ? "Untitled job" : p.address).font(.headline).lineLimit(1)
                Text(p.clientName.isEmpty ? "No client" : p.clientName).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                if let labels = p.labels, !labels.isEmpty {
                    Text(labels.joined(separator: " · ")).font(.caption.weight(.semibold)).foregroundStyle(Color.pencil).lineLimit(1)
                }
                Text(summary(sheets: bundle.liveSheets.count, devices: bundle.liveMarkers.count, led: led, photos: bundle.livePhotos.count))
                    .font(.footnote).foregroundStyle(.secondary).monospacedDigit().padding(.top, 6)
            }
            .padding(14)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
        .paperCard()
        // A sheet lying on a desk: long, soft shadow.
        .shadow(color: Color.ink.opacity(0.10), radius: 14, y: 8)
    }

    private func summary(sheets: Int, devices: Int, led: Double, photos: Int) -> String {
        var parts = ["\(sheets) plan\(sheets == 1 ? "" : "s")", "\(devices) device\(devices == 1 ? "" : "s")"]
        if photos > 0 { parts.append("\(photos) photo\(photos == 1 ? "" : "s")") }
        if led > 0 { parts.append("\(led.clean) LF LED") }
        return parts.joined(separator: " · ")
    }
}

struct NewProjectSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onCreate: (ProjectBundle) -> Void
    @State private var address = ""
    @State private var client = ""
    @State private var email = ""
    @State private var phone = ""

    var body: some View {
        NavigationStack {
            SentenceForm {
                Section(sentence: "Job") { TextField("Job address", text: $address, prompt: Text("12 Maple Ridge Rd")) }
                Section(sentence: "Client") {
                    TextField("Client name", text: $client)
                    TextField("Email", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    TextField("Phone", text: $phone).keyboardType(.phonePad)
                }
            }
            .navigationTitle("New job")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let b = app.createProject(address: address.trimmingCharacters(in: .whitespaces), client: client.trimmingCharacters(in: .whitespaces), email: email, phone: phone)
                        dismiss()
                        onCreate(b)
                    }
                    .disabled(address.trimmingCharacters(in: .whitespaces).isEmpty && client.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}


/// Choose where plans opened from another app should go.
private struct ImportTargetSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onPick: (String) -> Void
    @State private var newAddress = ""

    var body: some View {
        NavigationStack {
            SentenceList {
                Section {
                    Label("\(app.incomingFiles.count) file\(app.incomingFiles.count == 1 ? "" : "s"): \(app.incomingFiles.map { $0.lastPathComponent.split(separator: "-", maxSplits: 5).last.map(String.init) ?? "" }.joined(separator: ", "))",
                          systemImage: "doc.richtext")
                        .font(.callout).foregroundStyle(.secondary)
                }
                Section(sentence: "New job") {
                    TextField("Job address", text: $newAddress)
                    Button("Create and import") {
                        let b = app.createProject(address: newAddress.trimmingCharacters(in: .whitespaces), client: "", email: "", phone: "")
                        dismiss()
                        onPick(b.project.id)
                    }
                    .disabled(newAddress.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if !app.projects.isEmpty {
                    Section(sentence: "Add to a job") {
                        ForEach(app.projects, id: \.project.id) { b in
                            Button { dismiss(); onPick(b.project.id) } label: {
                                VStack(alignment: .leading) {
                                    Text(b.project.address.isEmpty ? "Untitled job" : b.project.address).foregroundStyle(.primary)
                                    Text("\(b.liveSheets.count) plans · \(b.project.clientName)").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Import plans")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { app.incomingFiles = []; dismiss() } } }
        }
    }
}

/// The logo mark (docs/brand.md, LogoMark in the web app): an ink tile with the corner of a floor plan in white
/// linework and an electric-blue pin. Drawn, not an image, so it stays sharp at any size.
struct LogoTile: View {
    var size: CGFloat = 30

    var body: some View {
        Canvas { g, sz in
            let u = sz.width / 32
            g.fill(Path(roundedRect: CGRect(origin: .zero, size: sz), cornerRadius: 7 * u, style: .continuous), with: .color(.ink))
            var lines = Path()
            lines.move(to: CGPoint(x: 7 * u, y: 25 * u))
            lines.addLine(to: CGPoint(x: 7 * u, y: 7 * u))
            lines.addLine(to: CGPoint(x: 25 * u, y: 7 * u))
            lines.move(to: CGPoint(x: 7 * u, y: 16 * u))
            lines.addLine(to: CGPoint(x: 14 * u, y: 16 * u))
            g.stroke(lines, with: .color(.white.opacity(0.45)), style: StrokeStyle(lineWidth: 2.2 * u, lineCap: .square))
            var pin = Path()
            pin.move(to: CGPoint(x: 26 * u, y: 15.5 * u))
            pin.addArc(center: CGPoint(x: 21 * u, y: 15.5 * u), radius: 5 * u, startAngle: .degrees(0), endAngle: .degrees(180), clockwise: true)
            pin.addCurve(to: CGPoint(x: 21 * u, y: 24.5 * u), control1: CGPoint(x: 16 * u, y: 19.4 * u), control2: CGPoint(x: 21 * u, y: 24.5 * u))
            pin.addCurve(to: CGPoint(x: 26 * u, y: 15.5 * u), control1: CGPoint(x: 21 * u, y: 24.5 * u), control2: CGPoint(x: 26 * u, y: 19.4 * u))
            pin.closeSubpath()
            g.fill(pin, with: .color(.electric))
            g.fill(Path(ellipseIn: CGRect(x: 19.1 * u, y: 13.5 * u, width: 3.8 * u, height: 3.8 * u)), with: .color(.ink))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
