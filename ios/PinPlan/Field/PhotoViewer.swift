import SwiftUI
import PinPlanCore

/// Full-screen photo viewer: swipe between photos, mark up, caption/tags/device/room, before & after, comments, AI caption.
struct PhotoViewer: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var hSize
    let model: EditorModel
    let ids: [String]
    @State var current: String
    @State private var annotating = ProcessInfo.processInfo.arguments.contains("--markup")
    @State private var compare = false
    @State private var share: SharedFile?

    var body: some View {
        let live = ids.filter { model.photo($0) != nil }
        NavigationStack {
            Group {
                if let p = model.photo(current) {
                    if hSize == .compact {
                        VStack(spacing: 0) {
                            pager(live).frame(maxHeight: .infinity)
                            ScrollView { PhotoDetails(model: model, photo: p).padding() }
                                .frame(maxHeight: 300)
                                .background(Color(.systemBackground))
                        }
                    } else {
                        HStack(spacing: 0) {
                            pager(live)
                            ScrollView { PhotoDetails(model: model, photo: p).padding() }
                                .frame(width: 380)
                                .background(Color(.systemBackground))
                        }
                    }
                } else {
                    ContentUnavailableView("Photo deleted", systemImage: "photo")
                        .task { if let first = live.first { current = first } }
                }
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle(live.count > 1 ? "\((live.firstIndex(of: current) ?? 0) + 1) of \(live.count)" : "Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItemGroup(placement: .primaryAction) {
                    if let p = model.photo(current) {
                        if p.beforeId != nil, model.photo(p.beforeId!) != nil {
                            Toggle(isOn: $compare) { Label("Before & after", systemImage: "rectangle.split.2x1") }
                        }
                        Button { annotating = true } label: { Label("Mark up", systemImage: "pencil.tip.crop.circle") }
                        Button { exportJPEG(p) } label: { Label("Share", systemImage: "square.and.arrow.up") }
                        Button(role: .destructive) {
                            let next = live.firstIndex(of: p.id).flatMap { i in live.indices.contains(i + 1) ? live[i + 1] : (i > 0 ? live[i - 1] : nil) }
                            model.removeRows([p.id], in: \.photos)
                            if let next { current = next } else { dismiss() }
                        } label: { Label("Delete", systemImage: "trash") }
                    }
                }
            }
            .fullScreenCover(isPresented: $annotating) {
                if let p = model.photo(current), let img = app.store.image(p.imageId) {
                    PhotoAnnotator(image: img, shapes: p.annotations ?? []) { shapes in
                        model.updateRows([p.id], in: \.photos) { $0.annotations = shapes }
                    }
                } else {
                    // Not downloaded yet (or just deleted): never leave an empty full-screen cover with no way out.
                    NavigationStack {
                        ContentUnavailableView("Photo not on this device yet", systemImage: "icloud.and.arrow.down",
                                               description: Text("It arrives with the next sync — then you can mark it up."))
                            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { annotating = false } } }
                    }
                }
            }
            .shareSheet($share)
        }
    }

    private func pager(_ live: [String]) -> some View {
        TabView(selection: $current) {
            ForEach(live, id: \.self) { id in
                if let p = model.photo(id) {
                    Group {
                        if compare, id == current, let b = p.beforeId.flatMap(model.photo) {
                            HStack(spacing: 4) { labeled(b, String(localized: "Before")); labeled(p, String(localized: "After")) }
                        } else {
                            ZoomablePhoto(photo: p)
                        }
                    }
                    .tag(id)
                }
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(Color.black)
    }

    private func labeled(_ p: Photo, _ title: String) -> some View {
        ZoomablePhoto(photo: p).overlay(alignment: .topLeading) {
            Text(title.uppercased()).font(.caption.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 4)
                .background(.black.opacity(0.6), in: Capsule()).foregroundStyle(.white).padding(8)
        }
    }

    private func exportJPEG(_ p: Photo) {
        guard let img = app.store.image(p.imageId), let data = PhotoMarkup.render(img, shapes: p.annotations, maxSide: 2560).jpegData(compressionQuality: 0.88) else { return }
        let name = "\(slug(model.bundle.project.address.isEmpty ? "job" : model.bundle.project.address))-\(p.id.prefix(6)).jpg"
        share = SharedFile(url: PDFExporter.write(data, name: name))
    }
}

/// One photo, fitted, with its mark-up; pinch to zoom, double-tap to reset.
struct ZoomablePhoto: View {
    @Environment(AppModel.self) private var app
    let photo: Photo
    @State private var image: UIImage?
    @State private var scale: CGFloat = 1
    @State private var base: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var baseOffset: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if let image {
                    Image(uiImage: image).resizable().scaledToFit()
                        .overlay { MarkupOverlay(shapes: photo.annotations ?? []) }
                        .scaleEffect(scale)
                        .offset(offset)
                        .frame(width: geo.size.width, height: geo.size.height)
                } else {
                    ProgressView().tint(.white)
                }
            }
            .contentShape(Rectangle())
            .gesture(MagnifyGesture().onChanged { v in scale = max(1, min(6, base * v.magnification)) }.onEnded { _ in base = scale; if scale == 1 { offset = .zero; baseOffset = .zero } })
            .simultaneousGesture(scale > 1 ? DragGesture().onChanged { v in offset = CGSize(width: baseOffset.width + v.translation.width, height: baseOffset.height + v.translation.height) }.onEnded { _ in baseOffset = offset } : nil)
            .onTapGesture(count: 2) { withAnimation(.snappy) { scale = scale > 1 ? 1 : 2.5; base = scale; offset = .zero; baseOffset = .zero } }
        }
        .task(id: photo.imageId) {
            // Show this photo (never the previous one's image), then, if it's still downloading from another device,
            // look again for a while.
            image = app.store.image(photo.imageId)
            if image != nil { return }
            for _ in 0..<60 {
                try? await Task.sleep(for: .seconds(2))
                if Task.isCancelled { return }
                if let img = app.store.image(photo.imageId) { image = img; return }
            }
        }
    }
}

/// Caption, tags, device, room, before/after link, info and comments for one photo.
struct PhotoDetails: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let photo: Photo
    @State private var comment = ""
    @State private var addingTag = false
    @State private var pickingBefore = false
    @State private var aiBusy = false
    @State private var aiError: String?
    @State private var tasking: PhotoComment?

    var body: some View {
        let p = photo
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Caption").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Spacer()
                    if Features.ai, APIClient(settings: app.settings) != nil {
                        Button { Task { await describe(p) } } label: {
                            if aiBusy { ProgressView().controlSize(.small) } else { Label("AI caption", systemImage: "sparkles") }
                        }
                        .font(.caption.weight(.semibold))
                        .disabled(aiBusy)
                    }
                }
                CommitField(title: String(localized: "Caption"), value: p.caption ?? "", prompt: String(localized: "What does this show?")) { v in
                    model.updateRows([p.id], in: \.photos) { $0.caption = v.isEmpty ? nil : v }
                }
                .textFieldStyle(.roundedBorder)
                if let aiError { Text(aiError).font(.caption).foregroundStyle(.red) }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Tags").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                FlowTags(tags: p.tags ?? [], onRemove: { t in model.updateRows([p.id], in: \.photos) { $0.tags = ($0.tags ?? []).filter { $0 != t } } }) {
                    Button { addingTag = true } label: { Label("Tag", systemImage: "plus") }.font(.subheadline).buttonStyle(.bordered).controlSize(.small)
                }
            }

            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
                GridRow {
                    Text("Device").foregroundStyle(.secondary)
                    Menu {
                        Button("None") { model.updateRows([p.id], in: \.photos) { $0.markerId = nil } }
                        ForEach(model.bundle.liveMarkers.sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }, id: \.id) { m in
                            Button(model.deviceName(m.id) ?? m.label) {
                                model.updateRows([p.id], in: \.photos) { $0.markerId = m.id; $0.sheetId = m.sheetId; if !m.room.isEmpty { $0.room = m.room } }
                            }
                        }
                    } label: { Text(model.deviceName(p.markerId) ?? String(localized: "Link to a device")).lineLimit(1) }
                }
                GridRow {
                    Text("Room").foregroundStyle(.secondary)
                    CommitField(title: String(localized: "Room"), value: p.room ?? "", prompt: String(localized: "e.g. Kitchen")) { v in model.updateRows([p.id], in: \.photos) { $0.room = v.isEmpty ? nil : v } }
                }
                GridRow {
                    Text("Before").foregroundStyle(.secondary)
                    HStack {
                        Button(p.beforeId.flatMap(model.photo).map { String(localized: "Linked (\(shortDate($0.takenAt)))") } ?? String(localized: "This is an after photo of…")) { pickingBefore = true }
                        if p.beforeId != nil { Button { model.updateRows([p.id], in: \.photos) { $0.beforeId = nil } } label: { Image(systemName: "xmark.circle.fill") }.foregroundStyle(.secondary) }
                    }
                }
            }
            .font(.subheadline)

            VStack(alignment: .leading, spacing: 3) {
                Label("\(longDate(p.takenAt))\(p.takenBy.map { " · \($0)" } ?? "")", systemImage: "clock")
                if let lat = p.lat, let lng = p.lng, let url = URL(string: "https://maps.apple.com/?ll=\(lat),\(lng)&q=Photo") {
                    Link(destination: url) { Label(String(format: "%.5f, %.5f", lat, lng), systemImage: "location") }
                }
            }
            .font(.caption).foregroundStyle(.secondary)

            Divider()
            Text("Comments").font(.headline)
            ForEach(model.bundle.comments(for: p.id)) { c in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(c.author ?? "—").font(.caption.weight(.semibold))
                        Text(shortDate(c.createdAt)).font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        if let t = FieldDocs.commentTask(model.bundle.checklists, comment: c) {
                            Label(t.item.done == true ? "Task done" : "Task", systemImage: "checklist")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(t.item.done == true ? Color.green : Color.accentColor)
                        } else {
                            Button { tasking = c } label: { Label("Make task", systemImage: "plus.square.on.square") }
                                .font(.caption.weight(.semibold))
                        }
                        Button { model.removeRows([c.id], in: \.photoComments) } label: { Image(systemName: "trash") }.font(.caption).foregroundStyle(.secondary)
                    }
                    Text(c.text).font(.subheadline)
                }
            }
            HStack {
                TextField("Add a comment", text: $comment, axis: .vertical).textFieldStyle(.roundedBorder).onSubmit(send)
                Button("Send", action: send).disabled(comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .sheet(isPresented: $addingTag) {
            TagPicker(options: FieldDocs.tagOptions(model.bundle.livePhotos).filter { !(p.tags ?? []).contains($0) }) { t in
                model.updateRows([p.id], in: \.photos) { $0.tags = ($0.tags ?? []) + [t] }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $pickingBefore) {
            BeforePicker(model: model, photo: p) { id in model.updateRows([p.id], in: \.photos) { $0.beforeId = id } }
        }
        .sheet(item: $tasking) { c in
            // Comment → task on the job's punch list (started from the template if the job has none), linked to this photo.
            TaskEditor(item: FieldDocs.taskItem(from: c), names: FieldAuthor.teamNames(app), title: String(localized: "Make task")) { who, due in
                let r = FieldDocs.addTask(fromComment: c, checklists: model.bundle.checklists, assignee: who, due: due)
                model.saveRow(r.checklist, in: \.checklists)
                model.say(r.created ? String(localized: "Punch list started with this task") : String(localized: "Added to the punch list"))
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func send() {
        let t = comment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        model.saveRow(PhotoComment(projectId: photo.projectId, photoId: photo.id, author: FieldAuthor.name(app), text: t), in: \.photoComments)
        comment = ""
    }

    private func describe(_ p: Photo) async {
        guard let api = APIClient(settings: app.settings), let img = app.store.image(p.imageId) else { return }
        aiBusy = true; aiError = nil
        defer { aiBusy = false }
        do {
            let r = try await api.describePhoto(PhotoMarkup.render(img, shapes: p.annotations, maxSide: 1280), room: p.room, device: model.deviceName(p.markerId), existingTags: FieldDocs.tagOptions(model.bundle.livePhotos))
            model.updateRows([p.id], in: \.photos) { x in
                // Keep a caption the installer wrote; only fill an empty one.
                if !r.caption.isEmpty, (x.caption ?? "").trimmingCharacters(in: .whitespaces).isEmpty { x.caption = r.caption }
                var tags = x.tags ?? []
                for t in r.tags where !tags.contains(t) { tags.append(t) }
                x.tags = tags
            }
            if !r.issues.isEmpty {
                model.saveRow(PhotoComment(projectId: p.projectId, photoId: p.id, author: "AI check", text: "Possible issues: " + r.issues.joined(separator: "; ")), in: \.photoComments)
            }
        } catch {
            aiError = error.localizedDescription
        }
    }
}

/// Tags as removable capsules that wrap, plus a trailing control.
struct FlowTags<Trailing: View>: View {
    let tags: [String]
    let onRemove: (String) -> Void
    @ViewBuilder var trailing: Trailing
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(tags, id: \.self) { t in
                    Button { onRemove(t) } label: {
                        HStack(spacing: 4) { Text(t); Image(systemName: "xmark").font(.caption2) }
                            .font(.subheadline.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Color.accentColor.opacity(0.15), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove tag \(t)")
                }
                trailing
            }
        }
    }
}

/// Choose the "before" photo for an "after" photo.
struct BeforePicker: View {
    let model: EditorModel
    let photo: Photo
    let onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 6)], spacing: 6) {
                    ForEach(model.bundle.livePhotos.filter { $0.id != photo.id && $0.takenAt <= photo.takenAt }) { p in
                        Button { onPick(p.id); dismiss() } label: { PhotoThumb(photo: p) }.buttonStyle(.plain)
                    }
                }
                .padding()
            }
            .navigationTitle("Before photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

func shortDate(_ iso: String) -> String {
    FieldDocs.date(iso)?.formatted(.dateTime.month(.abbreviated).day().hour().minute()) ?? iso
}
func longDate(_ iso: String) -> String {
    FieldDocs.date(iso)?.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().year().hour().minute()) ?? iso
}
