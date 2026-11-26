import SwiftUI
import PhotosUI
import PinPlanCore

/// System camera (one shot at a time).
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let vc = UIImagePickerController()
        vc.sourceType = .camera
        vc.delegate = context.coordinator
        return vc
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ p: CameraPicker) { parent = p }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { parent.onImage(img) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// Adds photos to the job from the camera or the library. `extra` fills in links (device, checklist item, tags…).
struct PhotoAddMenu<LabelView: View>: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    var extra: (inout Photo) -> Void = { _ in }
    var onAdded: ([Photo]) -> Void = { _ in }
    @ViewBuilder var label: LabelView
    @State private var camera = false
    @State private var picked: [PhotosPickerItem] = []
    @State private var library = false

    var body: some View {
        Menu {
            if CameraPicker.isAvailable { Button { camera = true } label: { Label("Take photo", systemImage: "camera") } }
            Button { library = true } label: { Label("Choose from library", systemImage: "photo.on.rectangle") }
        } label: { label } primaryAction: {
            if CameraPicker.isAvailable { camera = true } else { library = true }
        }
        .photosPicker(isPresented: $library, selection: $picked, maxSelectionCount: 50, matching: .images)
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { img in
                Task { @MainActor in
                    let loc = await LocationOnce.shared.current()
                    if var p = PhotoImport.make(image: img, projectId: model.bundle.project.id, author: FieldAuthor.name(app), location: loc, store: app.store) {
                        extra(&p)
                        model.saveRows([p], in: \.photos)
                        onAdded([p])
                    }
                }
            }
            .ignoresSafeArea()
        }
        .onChange(of: picked) { _, items in
            guard !items.isEmpty else { return }
            picked = []
            Task { @MainActor in
                // Library photos carry their own GPS; ask for ours only as a fallback.
                let loc = await LocationOnce.shared.current()
                let projectId: String = model.bundle.project.id
                let author: String = FieldAuthor.name(app)
                let store: Store = app.store
                var added: [Photo] = []
                for item in items {
                    guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
                    // Decode, resize and encode off the main thread: up to 50 photos at a time would freeze the screen.
                    let made: Photo? = await Task.detached(priority: .userInitiated) { () -> Photo? in
                        PhotoImport.make(data: data, projectId: projectId, author: author, location: loc, store: store)
                    }.value
                    guard var p = made else { continue }
                    extra(&p)
                    added.append(p)
                }
                model.saveRows(added, in: \.photos)
                if !added.isEmpty { model.say(String(localized: "\(added.count) photos added")) }
                onAdded(added)
            }
        }
    }
}

/// The job's photos (a job section of its own), CompanyCam-style: grouped by day, filter by device (from a device's
/// card on the plan, JobNav.photoDevice) / tag / person / text, tap to view, select to tag/set room/link
/// device/report/delete.
struct PhotosView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var tags: Set<String> = []
    @State private var person: String?
    @State private var search = ""
    @State private var selecting = false
    @State private var selected: Set<String> = []
    @State private var viewer: PhotoViewerItem?
    @State private var report: [Photo]?
    @State private var tagging = false
    @State private var nameDraft = ""
    @State private var askName = false
    @State private var stampLocation = LocationOnce.enabled
    @State private var askRoom = false
    @State private var roomDraft = ""

    private var all: [Photo] { model.bundle.livePhotos }
    /// The device the gallery is narrowed to (the device card's "N photos" on the plan), if any.
    private var device: Marker? { JobNav.shared.photoDevice.flatMap { id in model.bundle.liveMarkers.first { $0.id == id } } }
    private var shown: [Photo] {
        let list = FieldDocs.filter(all, tags: tags, takenBy: person, text: search)
        guard let d = JobNav.shared.photoDevice else { return list }
        return list.filter { $0.markerId == d }
    }

    var body: some View {
        let groups = FieldDocs.byDay(shown)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                uploadStatus
                deviceFilter
                filters.tutorialAnchor("photos-list")
                if all.isEmpty {
                    ContentUnavailableView {
                        Label("No photos yet", systemImage: "camera")
                    } description: {
                        Text("Take photos on site — they're stamped with the time, who took them and where, and sync to the web app.")
                    } actions: {
                        PhotoAddMenu(model: model) { Label("Add photos", systemImage: "camera.fill") }.buttonStyle(.borderedProminent)
                    }
                    .padding(.top, 40)
                } else if shown.isEmpty {
                    ContentUnavailableView.search(text: search)
                }
                ForEach(groups, id: \.day) { g in
                    HStack {
                        Text(dayTitle(g.day)).font(.headline)
                        Text("\(g.photos.count)").foregroundStyle(.secondary)
                        Spacer()
                        if selecting {
                            Button(g.photos.allSatisfy { selected.contains($0.id) } ? "Deselect day" : "Select day") {
                                let ids = Set(g.photos.map(\.id))
                                if ids.isSubset(of: selected) { selected.subtract(ids) } else { selected.formUnion(ids) }
                            }
                            .font(.subheadline)
                        }
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 104, maximum: 180), spacing: 6)], spacing: 6) {
                        ForEach(g.photos) { p in tile(p) }
                    }
                }
            }
            .padding()
        }
        .safeAreaInset(edge: .bottom) { if selecting { selectionBar } }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if !all.isEmpty {
                    Button(selecting ? "Done" : "Select") { selecting.toggle(); selected = [] }
                }
                Menu {
                    Button { report = shown } label: { Label("Photo report (\(shown.count))", systemImage: "doc.richtext") }.disabled(shown.isEmpty)
                    Toggle(isOn: $stampLocation) { Label("Stamp location", systemImage: "location") }
                    Button { nameDraft = FieldAuthor.name(app); askName = true } label: { Label("Your name: \(FieldAuthor.name(app))", systemImage: "person") }
                } label: { Image(systemName: "ellipsis.circle") }
                .accessibilityLabel("More")
                // While narrowed to a device, new photos are linked to it.
                PhotoAddMenu(model: model, extra: { p in
                    if let m = device { p.markerId = m.id; p.sheetId = m.sheetId; if !m.room.isEmpty { p.room = m.room } }
                }) { Label("Add photos", systemImage: "camera.fill") }
                .tutorialAnchor("photos-add")
            }
        }
        .onChange(of: stampLocation) { _, v in LocationOnce.enabled = v }
        .onAppear {
            // Screenshot/automation hooks.
            let args = ProcessInfo.processInfo.arguments
            if args.contains("--open-photo"), viewer == nil, let first = shown.first { viewer = PhotoViewerItem(ids: shown.map(\.id), start: first.id) }
            if args.contains("--photo-report"), report == nil, !shown.isEmpty { report = shown }
        }
        .alert("Your name", isPresented: $askName) {
            TextField("Name", text: $nameDraft)
            Button("Save") { FieldAuthor.set(nameDraft, app: app) }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Shown on the photos, comments and logs you add.") }
        .fullScreenCover(item: $viewer) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
        .sheet(item: Binding(get: { report.map { ReportItem(photos: $0) } }, set: { report = $0?.photos })) { r in
            PhotoReportSheet(model: model, photos: r.photos)
        }
        .alert("Room for \(selected.count) photos", isPresented: $askRoom) {
            TextField("e.g. Kitchen", text: $roomDraft)
            Button("Set") {
                let r = roomDraft.trimmingCharacters(in: .whitespaces)
                if !r.isEmpty { bulk(.room(r), done: String(localized: "Room set to “\(r)”")) }
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $tagging) {
            TagPicker(options: FieldDocs.tagOptions(all)) { t in
                model.updateRows(selected, in: \.photos) { p in if !(p.tags ?? []).contains(t) { p.tags = (p.tags ?? []) + [t] } }
                model.say(String(localized: "Tagged \(selected.count) “\(t)”"))
            }
            .presentationDetents([.medium])
        }
    }

    private var people: [String] { Array(Set(all.compactMap(\.takenBy))).sorted() }

    /// "3 photos waiting to upload · Sync now" while this device still has files of this job to send.
    @ViewBuilder private var uploadStatus: some View {
        let cloud = app.cloud
        let backlog = cloud.uploadBacklog(projectId: model.bundle.project.id)
        if cloud.signedIn && backlog.total > 0 {
            HStack(spacing: 10) {
                Image(systemName: "icloud.and.arrow.up").foregroundStyle(Color.orange)
                VStack(alignment: .leading, spacing: 2) {
                    Text(backlog.summary).font(.subheadline.weight(.medium))
                    if let err = cloud.lastError, !cloud.syncing {
                        Text("Last sync failed: \(err)").font(.caption).foregroundStyle(Color.secondary).lineLimit(1)
                    }
                }
                Spacer()
                if cloud.syncing {
                    ProgressView()
                } else {
                    Button("Sync now") { Task { await cloud.syncNow() } }
                        .font(.subheadline)
                        .buttonStyle(.bordered)
                }
            }
            .padding(10)
            .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    /// "Device: P3 · Indoor camera ×" while the gallery shows one device's photos.
    @ViewBuilder private var deviceFilter: some View {
        if JobNav.shared.photoDevice != nil {
            let name = device.map { m in [m.label, app.type(m.deviceTypeId)?.name ?? ""].filter { !$0.isEmpty }.joined(separator: " · ") } ?? "—"
            HStack(spacing: 10) {
                Button { JobNav.shared.photoDevice = nil } label: {
                    HStack(spacing: 6) {
                        Text("Device: \(name)").lineLimit(1)
                        Image(systemName: "xmark.circle.fill")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 12).frame(minHeight: 36)
                    .background(Color.brand, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Shows photos of every device")
                Text("\(shown.count) photos").font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private var filters: some View {
        if !all.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Search captions, rooms, tags", text: $search)
                    if people.count > 1 {
                        Menu {
                            Button("Everyone") { person = nil }
                            ForEach(people, id: \.self) { n in Button(n) { person = n } }
                        } label: { Label(person ?? String(localized: "Everyone"), systemImage: "person.2").font(.subheadline) }
                    }
                }
                .padding(10)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(FieldDocs.tagOptions(all).prefix(16), id: \.self) { t in
                            let on = tags.contains(t)
                            Button { if on { tags.remove(t) } else { tags.insert(t) } } label: {
                                Text(t).font(.subheadline.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(on ? Color.accentColor : Color(.secondarySystemFill), in: Capsule())
                                    .foregroundStyle(on ? Color.white : Color.primary)
                                    // The chip stays small; the touch area is a full 44 pt tall.
                                    .frame(minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                }
            }
        }
    }

    private func tile(_ p: Photo) -> some View {
        let isSel = selected.contains(p.id)
        let comments = model.bundle.comments(for: p.id).count
        return Button {
            if selecting { if isSel { selected.remove(p.id) } else { selected.insert(p.id) } } else { viewer = PhotoViewerItem(ids: shown.map(\.id), start: p.id) }
        } label: {
            PhotoThumb(photo: p)
                .overlay(alignment: .bottomLeading) {
                    HStack(spacing: 4) {
                        if !(p.annotations ?? []).isEmpty { Image(systemName: "pencil.tip") }
                        if comments > 0 { Label("\(comments)", systemImage: "bubble.left.fill") }
                        if p.markerId != nil { Image(systemName: "mappin") }
                    }
                    .labelStyle(.titleAndIcon)
                    .font(.caption2.weight(.semibold)).foregroundStyle(.white).shadow(radius: 2).padding(5)
                }
                .overlay(alignment: .topTrailing) {
                    if selecting {
                        Image(systemName: isSel ? "checkmark.circle.fill" : "circle")
                            .font(.title3).foregroundStyle(isSel ? Color.accentColor : .white).shadow(radius: 2).padding(5)
                    }
                }
                .overlay { if selecting && isSel { RoundedRectangle(cornerRadius: 8).stroke(Color.accentColor, lineWidth: 3) } }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(p.caption ?? String(localized: "Photo"))
        // Long-press (or right-click): the same actions as Select, for one photo.
        .contextMenu {
            if !selecting {
                Button { viewer = PhotoViewerItem(ids: shown.map(\.id), start: p.id) } label: { Label("Open", systemImage: "photo") }
                Button { selecting = true; selected = [p.id] } label: { Label("Select", systemImage: "checkmark.circle") }
                Button { report = [p] } label: { Label("Report", systemImage: "doc.richtext") }
                Divider()
                Button(role: .destructive) { model.removeRows([p.id], in: \.photos); Haptics.remove() } label: { Label("Delete", systemImage: "trash") }
            }
        }
    }

    /// Words and icons when they fit; on a phone (or in a long language) icons only, each a full 44 pt target.
    private var selectionBar: some View {
        ViewThatFits(in: .horizontal) {
            selectionBarRow.labelStyle(.titleAndIcon)
            selectionBarRow.labelStyle(.iconOnly)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(.bar)
    }

    private var selectionBarRow: some View {
        HStack(spacing: 4) {
            Text("\(selected.count) selected").font(.subheadline.weight(.semibold)).lineLimit(1).fixedSize()
            Spacer(minLength: 8)
            Group {
                Button { tagging = true } label: { Label("Tag", systemImage: "tag") }.disabled(selected.isEmpty)
                editMenu.disabled(selected.isEmpty)
                Button { report = all.filter { selected.contains($0.id) } } label: { Label("Report", systemImage: "doc.richtext") }.disabled(selected.isEmpty)
                Button(role: .destructive) {
                    model.removeRows(selected, in: \.photos)
                    selected = []
                    Haptics.remove()
                } label: { Label("Delete", systemImage: "trash") }.disabled(selected.isEmpty)
            }
            .lineLimit(1)
            .fixedSize()
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
    }
}

extension PhotosView {
    /// Set room / link device / remove tag for every selected photo.
    private var editMenu: some View {
        let picked = all.filter { selected.contains($0.id) }
        let selTags = FieldDocs.tagsInUse(picked)
        let rooms = FieldDocs.roomOptions(all, markers: model.bundle.liveMarkers)
        let devices = model.bundle.liveMarkers.sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
        return Menu {
            Menu {
                ForEach(rooms, id: \.self) { r in Button(r) { bulk(.room(r), done: String(localized: "Room set to “\(r)”")) } }
                Button { roomDraft = ""; askRoom = true } label: { Label("New room…", systemImage: "plus") }
                Button(role: .destructive) { bulk(.room(nil), done: String(localized: "Room cleared")) } label: { Label("Clear room", systemImage: "xmark") }
            } label: { Label("Set room", systemImage: "door.left.hand.open") }
            if !devices.isEmpty {
                Menu {
                    ForEach(devices, id: \.id) { m in
                        Button(model.deviceName(m.id) ?? m.label) { bulk(.device(m), done: String(localized: "Linked to \(model.deviceName(m.id) ?? m.label)")) }
                    }
                    Button(role: .destructive) { bulk(.device(nil), done: String(localized: "Unlinked from devices")) } label: { Label("No device", systemImage: "xmark") }
                } label: { Label("Link to device", systemImage: "mappin") }
            }
            if !selTags.isEmpty {
                Menu {
                    ForEach(selTags, id: \.self) { t in Button(t) { bulk(.removeTag(t), done: String(localized: "Removed “\(t)”")) } }
                } label: { Label("Remove tag", systemImage: "tag.slash") }
            }
        } label: { Label("Edit", systemImage: "square.and.pencil") }
    }

    /// Saves only the photos that change, as one undo step.
    private func bulk(_ edit: FieldDocs.PhotoBulkEdit, done: String) {
        let changed = FieldDocs.bulkEdit(all, ids: selected, edit)
        guard !changed.isEmpty else { model.say(String(localized: "Nothing to change")); return }
        model.saveRows(changed, in: \.photos)
        model.say(String(localized: "\(done) · \(changed.count) photos"))
    }
}

struct PhotoViewerItem: Identifiable { let ids: [String]; let start: String; var id: String { start } }
private struct ReportItem: Identifiable { let photos: [Photo]; var id: String { photos.map(\.id).joined() } }

func dayTitle(_ day: String) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: day) else { return day }
    if Calendar.current.isDateInToday(d) { return String(localized: "Today") }
    if Calendar.current.isDateInYesterday(d) { return String(localized: "Yesterday") }
    return d.formatted(.dateTime.weekday(.wide).month(.abbreviated).day().year())
}

/// Pick a tag (suggested or a new one).
struct TagPicker: View {
    let options: [String]
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var custom = ""
    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("New tag", text: $custom).onSubmit(add)
                        Button("Add", action: add).disabled(custom.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                Section {
                    ForEach(options, id: \.self) { t in Button(t) { onPick(t); dismiss() } }
                }
            }
            .navigationTitle("Add tag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
    private func add() {
        let t = custom.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        onPick(t); dismiss()
    }
}
