import SwiftUI
import UniformTypeIdentifiers
import PinPlanCore

struct ProjectsView: View {
    @Environment(AppModel.self) private var app
    @State private var search = ""
    @State private var status: ProjectStatus?
    @State private var showNew = false
    @State private var showSettings = false
    @State private var showCatalog = false
    @State private var showRestore = false
    @State private var path: [String] = []
    @State private var message: String?
    @State private var toDelete: ProjectBundle?

    private func openDemo() {
        Task { path.append(await app.createDemo().project.id) }
    }

    private var filtered: [ProjectBundle] {
        app.projects.filter { b in
            (status == nil || b.project.status == status) &&
            (search.isEmpty || "\(b.project.address) \(b.project.clientName)".localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                if app.projects.isEmpty {
                    EmptyProjects(onNew: { showNew = true }, onDemo: openDemo).padding(.top, 60)
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        Picker("Status", selection: $status) {
                            Text("All").tag(ProjectStatus?.none)
                            ForEach(ProjectStatus.allCases, id: \.self) { s in Text(s.rawValue.capitalized).tag(Optional(s)) }
                        }
                        .pickerStyle(.segmented)
                        .frame(maxWidth: 480)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 16)], spacing: 16) {
                            ForEach(filtered, id: \.project.id) { b in
                                NavigationLink(value: b.project.id) { ProjectCard(bundle: b) }
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        Button(role: .destructive) { toDelete = b } label: { Label("Delete", systemImage: "trash") }
                                    }
                            }
                        }
                        if filtered.isEmpty { Text("No projects match.").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(40) }
                    }
                    .padding()
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Projects")
            .searchable(text: $search, prompt: "Client or address")
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { showCatalog = true } label: { Label("Catalog", systemImage: "shippingbox") }
                    Button { showSettings = true } label: { Label("Settings", systemImage: "gearshape") }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Menu {
                        Button { showRestore = true } label: { Label("Restore backup…", systemImage: "square.and.arrow.down") }
                        Button(action: openDemo) { Label("Create demo job", systemImage: "wand.and.stars") }
                    } label: { Label("More", systemImage: "ellipsis.circle") }
                    Button { showNew = true } label: { Label("New project", systemImage: "plus") }.buttonStyle(.borderedProminent)
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
            .fileImporter(isPresented: $showRestore, allowedContentTypes: [.json, .data]) { result in
                do {
                    let n = try app.restore(from: result.get())
                    message = "Restored \(n) project\(n == 1 ? "" : "s")"
                } catch { message = error.localizedDescription }
            }
            .task {
                // Screenshot/automation hook: `--demo` opens (creating if needed) the demo job.
                let args = ProcessInfo.processInfo.arguments
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
                if args.contains("--settings") || args.contains("--server") { showSettings = true }
                if args.contains("--catalog") { showCatalog = true }
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
            .confirmationDialog("Delete this project and its sheets?", isPresented: Binding(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), titleVisibility: .visible) {
                Button("Delete", role: .destructive) { if let b = toDelete { app.delete(b) }; toDelete = nil }
            }
        }
    }
}

private struct EmptyProjects: View {
    let onNew: () -> Void
    let onDemo: () -> Void
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "mappin.and.ellipse").font(.system(size: 44)).foregroundStyle(Color.brand)
                .frame(width: 84, height: 84).background(Color.brand.opacity(0.1), in: RoundedRectangle(cornerRadius: 22))
            Text("Start your first job").font(.title2.bold())
            Text("Create a project, import the plan set (PDF, photos or the document scanner), then tap to place cameras, Wi-Fi, speakers, TVs, LED runs and closets.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary).frame(maxWidth: 420)
            HStack(spacing: 12) {
                Button(action: onNew) { Label("New project", systemImage: "plus") }.buttonStyle(.borderedProminent)
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
        let tint: Color = status == .estimate ? .orange : status == .approved ? .brand : .green
        HStack(spacing: 5) {
            Circle().fill(tint).frame(width: 7, height: 7)
            Text(status.rawValue.capitalized).font(.caption.weight(.medium)).foregroundStyle(.primary)
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
                    if let id = bundle.liveSheets.first?.imageId, let img = app.store.image(id) {
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
                Text(summary(sheets: bundle.liveSheets.count, devices: bundle.liveMarkers.count, led: led))
                    .font(.footnote).foregroundStyle(.secondary).monospacedDigit().padding(.top, 6)
            }
            .padding(14)
        }
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.07), radius: 10, y: 4)
    }

    private func summary(sheets: Int, devices: Int, led: Double) -> String {
        var parts = ["\(sheets) sheet\(sheets == 1 ? "" : "s")", "\(devices) device\(devices == 1 ? "" : "s")"]
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
            Form {
                Section("Job") { TextField("Job address", text: $address, prompt: Text("20 Hilltop Dr E")) }
                Section("Client") {
                    TextField("Client name", text: $client)
                    TextField("Email", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    TextField("Phone", text: $phone).keyboardType(.phonePad)
                }
            }
            .navigationTitle("New project")
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
            List {
                Section {
                    Label("\(app.incomingFiles.count) file\(app.incomingFiles.count == 1 ? "" : "s"): \(app.incomingFiles.map { $0.lastPathComponent.split(separator: "-", maxSplits: 5).last.map(String.init) ?? "" }.joined(separator: ", "))",
                          systemImage: "doc.richtext")
                        .font(.callout).foregroundStyle(.secondary)
                }
                Section("New project") {
                    TextField("Job address", text: $newAddress)
                    Button("Create and import") {
                        let b = app.createProject(address: newAddress.trimmingCharacters(in: .whitespaces), client: "", email: "", phone: "")
                        dismiss()
                        onPick(b.project.id)
                    }
                    .disabled(newAddress.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if !app.projects.isEmpty {
                    Section("Add to a project") {
                        ForEach(app.projects, id: \.project.id) { b in
                            Button { dismiss(); onPick(b.project.id) } label: {
                                VStack(alignment: .leading) {
                                    Text(b.project.address.isEmpty ? "Untitled job" : b.project.address).foregroundStyle(.primary)
                                    Text("\(b.liveSheets.count) sheets · \(b.project.clientName)").font(.caption).foregroundStyle(.secondary)
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
