import SwiftUI
import QuickLook
import UniformTypeIdentifiers
import PinPlanCore

/// Field documentation for the job: checklists, daily logs, documents and the timeline.
struct FieldView: View {
    enum Part: String, CaseIterable, Identifiable { case checklists = "Checklists", logs = "Daily logs", documents = "Documents", timeline = "Timeline"; var id: String { rawValue } }
    let model: EditorModel
    @State private var section: Part = {
        // Screenshot hook: `--field logs|documents|timeline`.
        let a = ProcessInfo.processInfo.arguments
        if let i = a.firstIndex(of: "--field"), a.indices.contains(i + 1) {
            switch a[i + 1] { case "logs": return .logs; case "documents": return .documents; case "timeline": return .timeline; default: break }
        }
        return .checklists
    }()

    var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $section) { ForEach(Part.allCases) { Text($0.rawValue).tag($0) } }
                .pickerStyle(.segmented)
                .padding([.horizontal, .top])
                .padding(.bottom, 8)
            switch section {
            case .checklists: ChecklistsView(model: model)
            case .logs: DailyLogsView(model: model)
            case .documents: DocumentsView(model: model)
            case .timeline: TimelineView(model: model)
            }
        }
    }
}

// MARK: - Checklists

struct ChecklistsView: View {
    let model: EditorModel
    @State private var naming = false
    @State private var name = ""
    @State private var openFirst = ProcessInfo.processInfo.arguments.contains("--checklist")

    var body: some View {
        let lists = model.bundle.liveChecklists
        List {
            if lists.isEmpty {
                ContentUnavailableView("No checklists yet", systemImage: "checklist", description: Text("Start from a template — pre-wire, trim-out, rack or final walkthrough — and require a photo for the items that need proof."))
                    .listRowBackground(Color.clear)
            }
            ForEach(lists) { c in
                let p = FieldDocs.progress(c, photos: model.bundle.photos)
                NavigationLink {
                    ChecklistDetail(model: model, id: c.id)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(c.name).font(.headline)
                            Spacer()
                            Text("\(p.done)/\(p.total)").monospacedDigit().foregroundStyle(p.done == p.total && p.total > 0 ? Color.green : Color.secondary)
                        }
                        ProgressView(value: Double(p.done), total: Double(max(1, p.total))).tint(p.done == p.total ? .green : .accentColor)
                        if p.missingPhotos > 0 {
                            Label("\(p.missingPhotos) ticked without the required photo", systemImage: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(.orange)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .swipeActions { Button("Delete", role: .destructive) { model.removeRows([c.id], in: \.checklists) } }
            }
        }
        .navigationDestination(isPresented: $openFirst) { if let c = lists.first { ChecklistDetail(model: model, id: c.id) } }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    ForEach(FieldDocs.templates) { t in
                        Button(t.name) {
                            let c = FieldDocs.checklist(from: t, projectId: model.bundle.project.id)
                            model.saveRow(c, in: \.checklists)
                        }
                    }
                    Divider()
                    Button("Blank checklist…") { name = ""; naming = true }
                } label: { Label("New checklist", systemImage: "plus") }
            }
        }
        .alert("New checklist", isPresented: $naming) {
            TextField("Name", text: $name)
            Button("Create") {
                let n = name.trimmingCharacters(in: .whitespaces)
                if !n.isEmpty { model.saveRow(Checklist(projectId: model.bundle.project.id, name: n, items: []), in: \.checklists) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

struct ChecklistDetail: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let id: String
    @State private var newItem = ""
    @State private var viewer: PhotoViewerItem?
    @State private var assigning: ChecklistItem?

    var body: some View {
        if let c = model.bundle.liveChecklists.first(where: { $0.id == id }) {
            List {
                Section {
                    ForEach(c.items) { item in row(c, item) }
                        .onDelete { idx in change(c) { $0.items.remove(atOffsets: idx) } }
                        .onMove { from, to in change(c) { $0.items.move(fromOffsets: from, toOffset: to) } }
                    HStack {
                        TextField("Add an item", text: $newItem).onSubmit { add(c) }
                        Button("Add") { add(c) }.disabled(newItem.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } footer: {
                    Text("Items with a camera badge need a photo before they count as done. Long-press an item to change that.")
                }
            }
            .navigationTitle(c.name)
            .toolbar { EditButton() }
            .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
            .sheet(item: $assigning) { item in
                TaskEditor(item: item, names: FieldDocs.teamNames(app.projects, me: FieldAuthor.name(app))) { who, due in
                    change(c) { x in
                        if let i = x.items.firstIndex(where: { $0.id == item.id }) { x.items[i].assignee = who; x.items[i].due = due }
                    }
                }
                .presentationDetents([.medium, .large])
            }
        } else {
            ContentUnavailableView("Checklist deleted", systemImage: "checklist")
        }
    }

    private func change(_ c: Checklist, _ f: (inout Checklist) -> Void) {
        var x = c
        f(&x)
        model.saveRow(x, in: \.checklists)
    }

    private func add(_ c: Checklist) {
        let t = newItem.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        change(c) { $0.items.append(ChecklistItem(text: t)) }
        newItem = ""
    }

    private func row(_ c: Checklist, _ item: ChecklistItem) -> some View {
        let photos = FieldDocs.itemPhotos(model.bundle.photos, checklistId: c.id, itemId: item.id).sorted { $0.takenAt < $1.takenAt }
        let complete = FieldDocs.itemComplete(item, photoCount: photos.count)
        let needsPhoto = item.done == true && !complete
        return HStack(alignment: .top, spacing: 12) {
            Button {
                let author = FieldAuthor.name(app)
                change(c) { x in
                    guard let i = x.items.firstIndex(where: { $0.id == item.id }) else { return }
                    let on = x.items[i].done != true
                    x.items[i].done = on
                    x.items[i].doneBy = on ? author : nil
                    x.items[i].doneAt = on ? isoNow() : nil
                }
            } label: {
                Image(systemName: complete ? "checkmark.circle.fill" : needsPhoto ? "exclamationmark.circle.fill" : "circle")
                    .font(.title2).foregroundStyle(complete ? Color.green : needsPhoto ? Color.orange : Color.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.done == true ? "Mark not done" : "Mark done")
            VStack(alignment: .leading, spacing: 6) {
                Text(item.text).strikethrough(complete, color: .secondary)
                if let by = item.doneBy, let at = item.doneAt { Text("\(by) · \(shortDate(at))").font(.caption).foregroundStyle(.secondary) }
                if item.assignee != nil || item.due != nil { TaskChips(item: item) }
                if needsPhoto { Text("Add a photo to finish this item").font(.caption).foregroundStyle(.orange) }
                if !photos.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            ForEach(photos) { p in
                                Button { viewer = PhotoViewerItem(ids: photos.map(\.id), start: p.id) } label: { PhotoThumb(photo: p, size: 54) }.buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            Spacer()
            PhotoAddMenu(model: model, extra: { p in
                p.checklistId = c.id
                p.checklistItemId = item.id
                p.tags = [c.name]
            }) {
                Image(systemName: item.requiresPhoto == true ? "camera.badge.ellipsis" : "camera").foregroundStyle(item.requiresPhoto == true ? Color.accentColor : .secondary)
            }
            .accessibilityLabel("Add photo")
        }
        .padding(.vertical, 2)
        .swipeActions(edge: .leading) {
            Button { assigning = item } label: { Label("Assign", systemImage: "person.crop.circle.badge.clock") }.tint(.accentColor)
        }
        .contextMenu {
            Button { assigning = item } label: { Label("Assign & due date…", systemImage: "person.crop.circle.badge.clock") }
            Button(item.requiresPhoto == true ? "Photo not required" : "Require a photo") {
                change(c) { x in if let i = x.items.firstIndex(where: { $0.id == item.id }) { x.items[i].requiresPhoto = !(x.items[i].requiresPhoto ?? false) } }
            }
        }
    }
}

// MARK: - Daily logs

struct DailyLogsView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var editing: JobLog?
    @State private var viewer: PhotoViewerItem?

    var body: some View {
        let logs = model.bundle.liveLogs
        List {
            if logs.isEmpty {
                ContentUnavailableView("No daily logs yet", systemImage: "book.closed", description: Text("Keep a short record of each day on site — crew, work done, issues, next steps — with that day’s photos."))
                    .listRowBackground(Color.clear)
            }
            ForEach(logs) { l in
                let ps = (l.photoIds ?? []).compactMap(model.photo)
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(dayTitle(l.date))\(l.author.map { " · \($0)" } ?? "")").font(.caption.weight(.medium)).foregroundStyle(.secondary)
                    if let t = l.title, !t.isEmpty { Text(t).font(.headline) }
                    if !l.body.isEmpty { Text(l.body).font(.subheadline) }
                    if !ps.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 4) {
                                ForEach(ps) { p in Button { viewer = PhotoViewerItem(ids: ps.map(\.id), start: p.id) } label: { PhotoThumb(photo: p, size: 60) }.buttonStyle(.plain) }
                            }
                        }
                    }
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
                .onTapGesture { editing = l }
                .swipeActions {
                    Button("Delete", role: .destructive) { model.removeRows([l.id], in: \.jobLogs) }
                    Button("Edit") { editing = l }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    editing = JobLog(projectId: model.bundle.project.id, date: FieldDocs.localDay(isoNow()), author: FieldAuthor.name(app))
                } label: { Label("New daily log", systemImage: "square.and.pencil") }
            }
        }
        .sheet(item: $editing) { l in LogEditor(model: model, log: l) }
        .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
    }
}

struct LogEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    @State var log: JobLog
    @State private var busy = false
    @State private var error: String?

    private var day: Binding<Date> {
        Binding(get: {
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
            return f.date(from: log.date) ?? Date()
        }, set: { d in
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
            log.date = f.string(from: d)
        })
    }

    var body: some View {
        let dayPhotos = model.bundle.livePhotos.filter { FieldDocs.localDay($0.takenAt) == log.date }
        let chosen = Set(log.photoIds ?? [])
        NavigationStack {
            Form {
                DatePicker("Day", selection: day, displayedComponents: .date)
                TextField("Title (e.g. Rough-in, 2nd floor)", text: Binding(get: { log.title ?? "" }, set: { log.title = $0 }))
                Section("What happened") {
                    TextField("Crew on site, work done, issues, what’s next…", text: $log.body, axis: .vertical).lineLimit(6...20)
                    if APIClient(settings: app.settings) != nil {
                        Button { Task { await draft(dayPhotos.filter { chosen.isEmpty || chosen.contains($0.id) }) } } label: {
                            if busy { HStack { ProgressView(); Text("Writing…") } } else { Label("Draft from this day’s photos", systemImage: "sparkles") }
                        }
                        .disabled(busy || dayPhotos.isEmpty)
                    }
                    if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                }
                Section {
                    if dayPhotos.isEmpty { Text("No photos taken on this day yet.").foregroundStyle(.secondary) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 70), spacing: 6)], spacing: 6) {
                        ForEach(dayPhotos) { p in
                            let on = chosen.contains(p.id)
                            Button {
                                log.photoIds = on ? (log.photoIds ?? []).filter { $0 != p.id } : (log.photoIds ?? []) + [p.id]
                            } label: {
                                PhotoThumb(photo: p)
                                    .opacity(on ? 1 : 0.55)
                                    .overlay(alignment: .topTrailing) { if on { Image(systemName: "checkmark.circle.fill").foregroundStyle(.white, Color.accentColor).padding(3) } }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    PhotoAddMenu(model: model, onAdded: { added in
                        if let first = added.first { log.date = FieldDocs.localDay(first.takenAt) }
                        log.photoIds = (log.photoIds ?? []) + added.map(\.id)
                    }) { Label("Add photos", systemImage: "camera") }
                } header: { Text("Photos from this day") }
            }
            .navigationTitle(model.bundle.jobLogs.contains { $0.id == log.id } ? "Edit log" : "New daily log")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var l = log
                        l.title = l.title?.trimmingCharacters(in: .whitespaces).isEmpty == true ? nil : l.title?.trimmingCharacters(in: .whitespaces)
                        l.body = l.body.trimmingCharacters(in: .whitespacesAndNewlines)
                        model.saveRow(l, in: \.jobLogs)
                        dismiss()
                    }
                    .bold()
                    .disabled(log.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (log.title ?? "").trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func draft(_ photos: [Photo]) async {
        guard let api = APIClient(settings: app.settings) else { return }
        busy = true; error = nil
        defer { busy = false }
        var list: [(UIImage, String)] = []
        for p in photos.prefix(8) {
            guard let img = app.store.image(p.imageId) else { continue }
            let parts: [String] = [p.caption, p.room].compactMap { $0 } + (p.tags ?? [])
            list.append((img, parts.joined(separator: " · ")))
        }
        do {
            let r = try await api.draftLog(date: log.date, address: model.bundle.project.address, notes: log.body, photos: list)
            if (log.title ?? "").isEmpty { log.title = r.title }
            log.body = r.body
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Documents

struct DocumentsView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var importing = false
    @State private var preview: URL?
    @State private var error: String?

    var body: some View {
        let docs = model.bundle.liveDocuments
        List {
            if docs.isEmpty {
                ContentUnavailableView("No documents yet", systemImage: "doc", description: Text("Keep contracts, spec sheets, permits and manuals with the job (up to 25 MB each). They sync to the web app."))
                    .listRowBackground(Color.clear)
            }
            if let error { Text(error).foregroundStyle(.red) }
            ForEach(docs) { d in
                Button { open(d) } label: {
                    HStack {
                        Image(systemName: icon(d.mime)).font(.title2).foregroundStyle(Color.accentColor).frame(width: 32)
                        VStack(alignment: .leading) {
                            Text(d.name).lineLimit(2)
                            Text("\(ByteCountFormatter.string(fromByteCount: Int64(d.size), countStyle: .file)) · \(shortDate(d.createdAt))\(app.store.fileData(d.fileId) == nil ? " · downloading…" : "")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .foregroundStyle(.primary)
                .swipeActions { Button("Delete", role: .destructive) { model.removeRows([d.id], in: \.documents) } }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button { importing = true } label: { Label("Add document", systemImage: "doc.badge.plus") } }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            error = nil
            var added: [JobDocument] = []
            for url in urls {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url) else { continue }
                if data.count > 25 * 1024 * 1024 { error = "\(url.lastPathComponent) is over 25 MB."; continue }
                let fileId = newId()
                app.store.saveFile(data, id: fileId)
                let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                added.append(JobDocument(projectId: model.bundle.project.id, name: url.lastPathComponent, mime: mime, size: Double(data.count), fileId: fileId))
            }
            model.saveRows(added, in: \.documents)
        }
        .quickLookPreview($preview)
    }

    private func open(_ d: JobDocument) {
        guard let data = app.store.fileData(d.fileId) else { error = "This file hasn't downloaded yet — it arrives with the next sync."; return }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("docs-\(d.id)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(d.name.replacingOccurrences(of: "/", with: "-"))
        try? data.write(to: url, options: .atomic)
        preview = url
    }

    private func icon(_ mime: String) -> String {
        if mime.hasPrefix("image/") { return "photo" }
        if mime == "application/pdf" { return "doc.richtext" }
        if mime.contains("sheet") || mime.contains("excel") || mime.contains("csv") { return "tablecells" }
        return "doc"
    }
}

// MARK: - Timeline

struct TimelineView: View {
    let model: EditorModel
    @State private var viewer: PhotoViewerItem?

    var body: some View {
        let events = FieldDocs.timeline(model.bundle)
        let days = Dictionary(grouping: events) { FieldDocs.localDay($0.at) }
        List {
            ForEach(days.keys.sorted(by: >), id: \.self) { day in
                Section(dayTitle(day)) {
                    ForEach(days[day]!) { e in
                        let ps = e.photoIds.compactMap(model.photo)
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: icon(e.kind)).foregroundStyle(.secondary).frame(width: 22)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(e.text).font(.subheadline.weight(.medium))
                                Text([e.who, FieldDocs.date(e.at)?.formatted(date: .omitted, time: .shortened)].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(.secondary)
                                if !ps.isEmpty {
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 4) {
                                            ForEach(ps.prefix(10)) { p in Button { viewer = PhotoViewerItem(ids: ps.map(\.id), start: p.id) } label: { PhotoThumb(photo: p, size: 52) }.buttonStyle(.plain) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
    }

    private func icon(_ k: FieldDocs.Event.Kind) -> String {
        switch k {
        case .created: return "folder.badge.plus"
        case .photos: return "camera"
        case .comment: return "bubble.left"
        case .checklist: return "checklist"
        case .log: return "book.closed"
        case .document: return "doc"
        case .billdu: return "doc.text"
        }
    }
}

/// "Alex · Due Wed, Nov 18" for a task item; red when overdue, amber when due today.
struct TaskChips: View {
    let item: ChecklistItem
    var body: some View {
        let bucket = FieldDocs.taskBucket(item.due, today: FieldDocs.localDay(isoNow()))
        HStack(spacing: 10) {
            if let who = item.assignee, !who.isEmpty { Label(who, systemImage: "person").foregroundStyle(.secondary) }
            if let due = item.due, !due.isEmpty {
                Label(dueText(due), systemImage: "calendar")
                    .foregroundStyle(item.done == true ? Color.secondary : bucket == .overdue ? Color.red : bucket == .today ? Color.orange : Color.secondary)
                    .fontWeight(item.done != true && (bucket == .overdue || bucket == .today) ? .semibold : .regular)
            }
        }
        .font(.caption)
        .labelStyle(.titleAndIcon)
    }
}

func dueText(_ day: String) -> String {
    let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: day) else { return day }
    return d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
}

/// Assign an item to someone and give it a due date (it then shows on their Tasks list).
struct TaskEditor: View {
    let item: ChecklistItem
    let names: [String]
    let onSave: (String?, String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var who = ""
    @State private var hasDue = false
    @State private var due = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(item.text).font(.headline) }
                Section("Assigned to") {
                    TextField("Name", text: $who).textInputAutocapitalization(.words)
                    if !names.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(names, id: \.self) { n in
                                    let on = who.caseInsensitiveCompare(n) == .orderedSame
                                    Button { who = n } label: {
                                        Text(n).font(.subheadline.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 5)
                                            .background(on ? Color.accentColor : Color(.secondarySystemFill), in: Capsule())
                                            .foregroundStyle(on ? Color.white : Color.primary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                Section {
                    Toggle("Due date", isOn: $hasDue)
                    if hasDue { DatePicker("Due", selection: $due, displayedComponents: .date).datePickerStyle(.graphical) }
                }
            }
            .navigationTitle("Assign")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
                        let w = who.trimmingCharacters(in: .whitespaces)
                        onSave(w.isEmpty ? nil : w, hasDue ? f.string(from: due) : nil)
                        dismiss()
                    }
                    .bold()
                }
            }
            .onAppear {
                who = item.assignee ?? ""
                if let d = item.due, !d.isEmpty {
                    let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
                    if let x = f.date(from: d) { due = x; hasDue = true }
                }
            }
        }
    }
}
