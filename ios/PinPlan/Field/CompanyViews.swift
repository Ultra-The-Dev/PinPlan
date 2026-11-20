import SwiftUI
import MapKit
import PinPlanCore

/// Every job's photos in one feed, newest first (CompanyCam-style company feed). Tap a photo to open its job.
struct AllPhotosView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onOpen: (String) -> Void
    @State private var search = ""
    @State private var tag: String?
    /// Only this job's photos; nil = every job.
    @State private var jobId: String?

    private struct Item: Identifiable { let photo: Photo; let job: String; var id: String { photo.id } }

    private static func title(_ p: Project) -> String {
        p.address.isEmpty ? (p.clientName.isEmpty ? String(localized: "Untitled job") : p.clientName) : p.address
    }

    /// Jobs that have at least one photo, A–Z, for the job picker.
    private var jobsWithPhotos: [ProjectBundle] {
        app.projects.filter { $0.project.deleted != true && !$0.livePhotos.isEmpty }
            .sorted { Self.title($0.project).localizedCaseInsensitiveCompare(Self.title($1.project)) == .orderedAscending }
    }

    private var all: [Item] {
        app.projects.filter { $0.project.deleted != true && (jobId == nil || $0.project.id == jobId) }.flatMap { b in
            b.livePhotos.map { Item(photo: $0, job: Self.title(b.project)) }
        }
    }

    var body: some View {
        let items = all
        let tags = FieldDocs.tagOptions(items.map(\.photo)).filter { t in items.contains { ($0.photo.tags ?? []).contains(t) } }
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        let shown = items.filter { i in
            (tag == nil || (i.photo.tags ?? []).contains(tag!)) &&
            (q.isEmpty || "\(i.job) \(i.photo.caption ?? "") \(i.photo.room ?? "") \(i.photo.takenBy ?? "") \((i.photo.tags ?? []).joined(separator: " "))".lowercased().contains(q))
        }
        let days = Dictionary(grouping: shown) { FieldDocs.localDay($0.photo.takenAt) }
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !tags.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(tags.prefix(16), id: \.self) { t in
                                    let on = tag == t
                                    Button { tag = on ? nil : t } label: {
                                        Text(t).font(.subheadline.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 5)
                                            .background(on ? Color.accentColor : Color(.secondarySystemFill), in: Capsule())
                                            .foregroundStyle(on ? Color.white : Color.primary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    if items.isEmpty {
                        ContentUnavailableView("No photos yet", systemImage: "camera", description: Text("Photos taken on any job show up here, newest first."))
                            .padding(.top, 40)
                    } else if shown.isEmpty {
                        ContentUnavailableView.search(text: search)
                    }
                    ForEach(days.keys.sorted(by: >), id: \.self) { d in
                        let group = days[d]!.sorted { $0.photo.takenAt > $1.photo.takenAt }
                        Text("\(dayTitle(d)) · \(group.count)").font(.headline)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120, maximum: 200), spacing: 6)], spacing: 6) {
                            ForEach(group) { i in
                                Button { dismiss(); onOpen(i.photo.projectId) } label: {
                                    PhotoThumb(photo: i.photo)
                                        .overlay(alignment: .bottomLeading) {
                                            Text(i.job).font(.caption2.weight(.semibold)).lineLimit(1).foregroundStyle(.white)
                                                .padding(.horizontal, 6).padding(.vertical, 3).background(.black.opacity(0.55), in: Capsule()).padding(5)
                                        }
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(Text(verbatim: "\(i.photo.caption ?? String(localized: "Photo")) — \(i.job)"))
                            }
                        }
                    }
                }
                .padding()
            }
            .searchable(text: $search, prompt: "Job, caption, room, person")
            .navigationTitle("All photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Picker("Job", selection: $jobId) {
                        Text("All jobs").tag(String?.none)
                        ForEach(jobsWithPhotos, id: \.project.id) { b in
                            Text(Self.title(b.project)).tag(String?.some(b.project.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .disabled(jobsWithPhotos.count < 2 && jobId == nil)
                }
            }
            .onChange(of: jobId) { _, _ in tag = nil }
        }
    }
}

/// Jobs on a map, coloured by status. A job gets its place from its first GPS photo or from the Job tab.
struct JobsMapView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onOpen: (String) -> Void

    /// Statuses shown on the map; empty = every status.
    @State private var statuses: Set<ProjectStatus> = []
    @State private var position: MapCameraPosition = .automatic

    /// Fit all jobs (with some padding); a single job gets a neighbourhood-level zoom instead of street level.
    static func start(_ placed: [ProjectBundle]) -> MapCameraPosition {
        let coords: [CLLocationCoordinate2D] = placed.compactMap { b in
            guard let lat = b.project.lat, let lng = b.project.lng else { return nil }
            return CLLocationCoordinate2D(latitude: lat, longitude: lng)
        }
        guard let first = coords.first else { return .automatic }
        var minLat: Double = first.latitude, maxLat: Double = first.latitude
        var minLng: Double = first.longitude, maxLng: Double = first.longitude
        for c in coords {
            minLat = min(minLat, c.latitude); maxLat = max(maxLat, c.latitude)
            minLng = min(minLng, c.longitude); maxLng = max(maxLng, c.longitude)
        }
        let latSpan: Double = min(max((maxLat - minLat) * 1.4, 0.04), 170.0)
        let lngSpan: Double = min(max((maxLng - minLng) * 1.4, 0.04), 360.0)
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2.0, longitude: (minLng + maxLng) / 2.0)
        return .region(MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: latSpan, longitudeDelta: lngSpan)))
    }

    private func color(_ s: ProjectStatus) -> Color { s == .estimate ? .orange : s == .approved ? .brand : .green }

    private var allPlaced: [ProjectBundle] {
        app.projects.filter { $0.project.deleted != true && $0.project.lat != nil && $0.project.lng != nil }
    }

    private func shown(_ list: [ProjectBundle], _ filter: Set<ProjectStatus>) -> [ProjectBundle] {
        filter.isEmpty ? list : list.filter { filter.contains($0.project.status) }
    }

    private func toggle(_ s: ProjectStatus) {
        var next = statuses
        if next.contains(s) { next.remove(s) } else { next.insert(s) }
        statuses = next
        let fit = shown(allPlaced, next)
        if !fit.isEmpty { withAnimation { position = Self.start(fit) } }
    }

    var body: some View {
        let placed = shown(allPlaced, statuses)
        let unplaced = shown(app.projects.filter { $0.project.deleted != true && ($0.project.lat == nil || $0.project.lng == nil) }, statuses)
        NavigationStack {
            VStack(spacing: 0) {
                Map(position: $position) {
                    ForEach(placed, id: \.project.id) { b in
                        Annotation(b.project.address.isEmpty ? b.project.clientName : b.project.address,
                                   coordinate: CLLocationCoordinate2D(latitude: b.project.lat!, longitude: b.project.lng!)) {
                            Button { dismiss(); onOpen(b.project.id) } label: {
                                Image(systemName: "house.fill").font(.caption.weight(.bold)).foregroundStyle(.white)
                                    .frame(width: 30, height: 30).background(color(b.project.status), in: Circle())
                                    .overlay(Circle().stroke(.white, lineWidth: 2)).shadow(radius: 2)
                            }
                            .accessibilityLabel("Open \(b.project.address)")
                        }
                    }
                }
                .mapControls { MapUserLocationButton(); MapCompass() }
                .onAppear { position = Self.start(placed) }
                .overlay(alignment: .top) {
                    if placed.isEmpty && !statuses.isEmpty && !allPlaced.isEmpty {
                        Text("No matching jobs on the map").font(.footnote.weight(.medium))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(.regularMaterial, in: Capsule()).padding(.top, 10)
                    }
                }
                HStack(spacing: 8) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            // Status legend doubles as a filter: tap to show only those statuses.
                            ForEach([ProjectStatus.estimate, .approved, .installed], id: \.self) { s in
                                let on = statuses.contains(s)
                                Button { toggle(s) } label: {
                                    Label(tr(s.rawValue.capitalized, context: "Job status"), systemImage: "circle.fill").font(.caption.weight(.medium))
                                        .foregroundStyle(on ? Color.white : color(s))
                                        .padding(.horizontal, 9).padding(.vertical, 5)
                                        .background(on ? color(s) : Color(.secondarySystemFill), in: Capsule())
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(on ? .isSelected : [])
                                .accessibilityLabel("Show \(tr(s.rawValue.capitalized, context: "Job status")) jobs")
                            }
                            if !statuses.isEmpty {
                                Button("All") { statuses = []; let all = allPlaced; if !all.isEmpty { withAnimation { position = Self.start(all) } } }
                                    .font(.caption)
                            }
                        }
                    }
                    if !unplaced.isEmpty {
                        Menu("\(unplaced.count) not on the map") {
                            ForEach(unplaced, id: \.project.id) { b in
                                Button(b.project.address.isEmpty ? String(localized: "Untitled job") : b.project.address) { dismiss(); onOpen(b.project.id) }
                            }
                        }
                        .font(.caption)
                    }
                }
                .padding()
                .background(.bar)
            }
            .navigationTitle("Jobs map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .overlay {
                if allPlaced.isEmpty {
                    ContentUnavailableView("No jobs on the map yet", systemImage: "map",
                                           description: Text("Take a photo on site with location on, or set the location on the job’s Job tab."))
                        .background(.regularMaterial)
                }
            }
        }
    }
}

/// Open checklist / punch-list items assigned to someone or with a due date, across every job (CompanyCam-style tasks).
struct TasksView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onOpen: (String) -> Void
    @State private var who = "__me"
    /// A tick refused because jobs are read-only (lapsed subscription or ended trial).
    @State private var readOnlyNotice: String?

    var body: some View {
        let me = FieldAuthor.name(app)
        let today = FieldDocs.localDay(isoNow())
        let filter: String? = who == "__me" ? me : who == "__all" ? nil : who
        let tasks = FieldDocs.openTasks(app.projects, today: today, who: filter)
        let names = FieldAuthor.teamNames(app).filter { $0.caseInsensitiveCompare(me) != .orderedSame }
        NavigationStack {
            List {
                if tasks.isEmpty {
                    ContentUnavailableView(filter.map { String(localized: "No open tasks for \($0)") } ?? String(localized: "No open tasks"), systemImage: "checklist",
                                           description: Text("On a job’s Field tab, start a Punch list (or any checklist), then swipe an item right — or long-press it — to assign it and set a due date."))
                        .listRowBackground(Color.clear)
                }
                ForEach(FieldDocs.TaskBucket.allCases, id: \.self) { b in
                    let list = tasks.filter { $0.bucket == b }
                    if !list.isEmpty {
                        Section {
                            ForEach(list) { t in row(t, me: me) }
                        } header: {
                            Text(verbatim: "\(tr(b.title, context: "Task due")) · \(list.count)").foregroundStyle(b == .overdue ? Color.red : b == .today ? Color.orange : Color.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Tasks")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Jobs are read-only", isPresented: Binding(get: { readOnlyNotice != nil }, set: { if !$0 { readOnlyNotice = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(readOnlyNotice ?? "")
            }
            .onAppear {
                // Nothing assigned to you yet: show everyone's instead of an empty list.
                if who == "__me", FieldDocs.openTasks(app.projects, today: today, who: me).isEmpty { who = "__all" }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Picker("Whose tasks", selection: $who) {
                        Text("Mine (\(me))").tag("__me")
                        Text("Everyone").tag("__all")
                        ForEach(names, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
            }
        }
    }

    private func row(_ t: FieldDocs.OpenTask, me: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Button { complete(t, me: me) } label: { Image(systemName: "circle").font(.title2).foregroundStyle(.secondary) }
                .buttonStyle(.plain)
                .accessibilityLabel("Mark done: \(t.item.text)")
            VStack(alignment: .leading, spacing: 4) {
                Text(t.item.text)
                Button { dismiss(); onOpen(t.project.id) } label: {
                    Text(verbatim: "\(t.project.address.isEmpty ? String(localized: "Job") : t.project.address) · \(t.checklist.name)").font(.caption.weight(.medium))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.accentColor)
                TaskChips(item: t.item)
                if t.item.requiresPhoto == true { Text("Photo required — add it on the job").font(.caption).foregroundStyle(.orange) }
            }
            // The photo a task was made from (photo comment → task).
            if let pid = t.item.photoId, let photo = app.projects.first(where: { $0.project.id == t.project.id })?.photos.first(where: { $0.id == pid && $0.deleted != true }) {
                Spacer(minLength: 0)
                Button { dismiss(); onOpen(t.project.id) } label: { PhotoThumb(photo: photo, size: 48) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open the job of this photo")
            }
        }
        .padding(.vertical, 2)
    }

    /// Tick an item done from the list (saved and synced like an edit on the job).
    private func complete(_ t: FieldDocs.OpenTask, me: String) {
        guard app.cloud.canEdit else {
            readOnlyNotice = app.cloud.editBlockedMessage ?? String(localized: "Jobs are read-only right now — you can still view and export everything.")
            return
        }
        guard var b = app.projects.first(where: { $0.project.id == t.project.id }),
              var c = b.checklists.first(where: { $0.id == t.checklist.id }),
              let i = c.items.firstIndex(where: { $0.id == t.item.id }) else { return }
        c.items[i].done = true
        c.items[i].doneBy = me
        c.items[i].doneAt = isoNow()
        b.save(c, in: \.checklists)
        app.store.save(b)
        app.didSave(b)
        if app.openEditor?.bundle.project.id == b.project.id { app.openEditor?.replaceFromSync(b) }
    }
}
