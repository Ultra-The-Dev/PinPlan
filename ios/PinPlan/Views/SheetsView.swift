import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import PinPlanCore

struct SheetsView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let openPlan: () -> Void

    @State private var showPDF = false
    @State private var showScanner = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var busy: String?
    @State private var error: String?
    @State private var toDelete: Sheet?
    @State private var review: ReviewBatch?
    @State private var dropTargeted = false

    struct ReviewBatch: Identifiable {
        let id = UUID()
        let images: [UIImage]
        let source: ReviewSource
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ImportPanel(
                    scannerAvailable: DocumentScanner.isAvailable,
                    targeted: dropTargeted,
                    onFiles: { showPDF = true },
                    onScan: { showScanner = true },
                    photos: $photoItems
                )
                .disabled(busy != nil)
                if let busy { HStack { ProgressView(); Text(busy).foregroundStyle(.secondary) } }
                if let error { Text(error).foregroundStyle(.red).font(.callout) }

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 250), spacing: 16)], spacing: 16) {
                    ForEach(Array(model.sheets.enumerated()), id: \.element.id) { i, s in
                        SheetCard(model: model, sheet: s, index: i, count: model.bundle.liveMarkers.filter { $0.sheetId == s.id }.count,
                                  onOpen: { model.setActiveSheet(s.id); openPlan() },
                                  onMove: { move(s, by: $0) },
                                  onRotate: { rotate(s) },
                                  onDelete: { toDelete = s })
                    }
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .fileImporter(isPresented: $showPDF, allowedContentTypes: [.pdf, .image], allowsMultipleSelection: true) { result in
            guard let urls = try? result.get() else { return }
            importFiles(urls)
        }
        .fullScreenCover(isPresented: $showScanner) {
            DocumentScanner(onFinish: { pages in
                showScanner = false
                if !pages.isEmpty { review = ReviewBatch(images: pages, source: .scanner) }
            }, onCancel: { showScanner = false })
                .ignoresSafeArea()
        }
        .sheet(item: $review) { batch in
            ScanReviewView(images: batch.images, source: batch.source, startIndex: model.sheets.count) { pages in
                addImages(pages.map(\.image), names: pages.map(\.name))
            }
            .interactiveDismissDisabled()
        }
        .onDrop(of: [.pdf, .image], isTargeted: $dropTargeted) { providers in
            handleDrop(providers)
            return true
        }
        .onAppear {
            consumePendingImport()
            // Screenshot hook: review a synthetic phone photo of a plan.
            if ProcessInfo.processInfo.arguments.contains("--scan-sample"), review == nil {
                review = ReviewBatch(images: [DemoProject.samplePhoto()], source: .photos)
            }
            // Automation: review a real photo/scan from the app's Documents folder.
            if let url = FileProject.launchFile("scan-file"), review == nil, let img = UIImage(contentsOfFile: url.path) {
                review = ReviewBatch(images: [img], source: .photos)
            }
        }
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                busy = "Loading photos…"
                var imgs: [UIImage] = []
                for item in items { if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) { imgs.append(img) } }
                photoItems = []
                busy = nil
                if !imgs.isEmpty { review = ReviewBatch(images: imgs, source: .photos) }
            }
        }
        .confirmationDialog("Delete this sheet and its devices?", isPresented: Binding(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), titleVisibility: .visible) {
            Button("Delete sheet", role: .destructive) {
                if let s = toDelete { model.edit { b in if let i = b.sheets.firstIndex(where: { $0.id == s.id }) { b.sheets[i].deleted = true } } }
                toDelete = nil
            }
        }
    }

    private var nextOrder: Int { (model.sheets.map(\.order).max() ?? -1) + 1 }

    private func importPDFs(_ urls: [URL]) {
        busy = "Rendering PDF…"
        error = nil
        let projectId = model.bundle.project.id
        let store = app.store
        var order = nextOrder
        Task.detached(priority: .userInitiated) {
            do {
                var newSheets: [Sheet] = []
                var scaled = 0
                for url in urls {
                    let r = try PlanImporter.sheets(fromPDF: url, store: store, projectId: projectId, startOrder: order,
                                                    fallbackName: { "Sheet \($0 + 1)" }) { done, total in
                        Task { @MainActor in busy = "Rendering page \(done) of \(total)…" }
                    }
                    newSheets += r.sheets
                    scaled += r.scaled
                    order += r.sheets.count
                }
                let added = newSheets
                let scaledCount = scaled
                await MainActor.run {
                    model.edit { $0.sheets += added }
                    if model.activeSheetId == nil { model.activeSheetId = added.first?.id }
                    busy = nil
                    model.say("Added \(added.count) sheet\(added.count == 1 ? "" : "s")" + (scaledCount > 0 ? " · scale read from \(scaledCount)" : ""))
                }
            } catch {
                await MainActor.run { busy = nil; self.error = error.localizedDescription }
            }
        }
    }

    /// PDFs are rendered directly; image files go through review.
    private func importFiles(_ urls: [URL]) {
        let pdfs = urls.filter { $0.pathExtension.lowercased() == "pdf" }
        let images: [UIImage] = urls.filter { $0.pathExtension.lowercased() != "pdf" }.compactMap { url in
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            return (try? Data(contentsOf: url)).flatMap(UIImage.init(data:))
        }
        if !pdfs.isEmpty { importPDFs(pdfs) }
        if !images.isEmpty { review = ReviewBatch(images: images, source: .files) }
        if pdfs.isEmpty && images.isEmpty { error = "Those files couldn't be read as plans (use PDF, JPG, PNG, HEIC or TIFF)." }
    }

    private func handleDrop(_ providers: [NSItemProvider]) {
        var urls: [URL] = []
        var images: [UIImage] = []
        let group = DispatchGroup()
        let lock = NSLock()
        for p in providers {
            if p.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
                group.enter()
                p.loadFileRepresentation(forTypeIdentifier: UTType.pdf.identifier) { url, _ in
                    if let url {
                        let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pdf")
                        if (try? FileManager.default.copyItem(at: url, to: copy)) != nil { lock.lock(); urls.append(copy); lock.unlock() }
                    }
                    group.leave()
                }
            } else if p.canLoadObject(ofClass: UIImage.self) {
                group.enter()
                _ = p.loadObject(ofClass: UIImage.self) { obj, _ in
                    if let img = obj as? UIImage { lock.lock(); images.append(img); lock.unlock() }
                    group.leave()
                }
            }
        }
        group.notify(queue: .main) {
            if !urls.isEmpty { importPDFs(urls) }
            if !images.isEmpty { review = ReviewBatch(images: images, source: .files) }
        }
    }

    /// Files opened in PinPlan from another app (Mail, Files, AirDrop…) for this project.
    private func consumePendingImport() {
        guard let pending = app.pendingImport, pending.projectId == model.bundle.project.id else { return }
        app.pendingImport = nil
        importFiles(pending.urls)
    }

    private func addImages(_ images: [UIImage], names: [String]) {
        guard !images.isEmpty else { return }
        var order = nextOrder
        var added: [Sheet] = []
        for (i, raw) in images.enumerated() {
            let img = PlanImporter.normalized(raw)
            guard let id = app.store.saveImage(img, quality: 0.92) else { continue }
            let px = img.pixelSize
            let name = names.indices.contains(i) && !names[i].isEmpty ? names[i] : "Sheet \(order + 1)"
            added.append(Sheet(projectId: model.bundle.project.id, name: name, pageNumber: i + 1, order: order, imageId: id, width: px.width, height: px.height))
            order += 1
        }
        model.edit { $0.sheets += added }
        if model.activeSheetId == nil { model.activeSheetId = added.first?.id }
        model.say("Added \(added.count) sheet\(added.count == 1 ? "" : "s") — set the scale on each by drawing a line over a known dimension")
    }

    private func move(_ s: Sheet, by d: Int) {
        let list = model.sheets
        guard let i = list.firstIndex(where: { $0.id == s.id }), list.indices.contains(i + d) else { return }
        let other = list[i + d]
        model.edit { b in
            if let a = b.sheets.firstIndex(where: { $0.id == s.id }), let c = b.sheets.firstIndex(where: { $0.id == other.id }) {
                let tmp = b.sheets[a].order
                b.sheets[a].order = b.sheets[c].order
                b.sheets[c].order = tmp
            }
        }
    }

    private func rotate(_ s: Sheet) {
        guard let img = app.store.image(s.imageId) else { return }
        busy = "Rotating…"
        let store = app.store
        Task.detached(priority: .userInitiated) {
            let r = PlanImporter.rotatedClockwise(img)
            let id = store.saveImage(r)
            let px = r.pixelSize
            await MainActor.run {
                if let id { model.edit { $0.rotateSheetClockwise(s.id, newImageId: id, width: px.width, height: px.height) } }
                busy = nil
            }
        }
    }
}

private struct SheetCard: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let sheet: Sheet
    let index: Int
    let count: Int
    let onOpen: () -> Void
    let onMove: (Int) -> Void
    let onRotate: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onOpen) {
                ZStack(alignment: .topLeading) {
                    Group {
                        if let img = app.store.image(sheet.imageId) { Image(uiImage: img).resizable().scaledToFit() } else { Color(.secondarySystemBackground) }
                    }
                    .frame(height: 170).frame(maxWidth: .infinity).padding(8).background(Color(.secondarySystemBackground))
                    Chip(text: "Floor \(index + 1)", tint: .secondary).background(.thinMaterial, in: Capsule()).padding(10)
                }
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 10) {
                CommitField(title: "Sheet name", value: sheet.name) { name in
                    let n = name.trimmingCharacters(in: .whitespaces)
                    guard !n.isEmpty else { return }
                    model.edit { b in if let i = b.sheets.firstIndex(where: { $0.id == sheet.id }) { b.sheets[i].name = n } }
                }
                .font(.headline)
                .textFieldStyle(.roundedBorder)
                HStack(spacing: 6) {
                    Chip(text: "\(count) devices")
                    Chip(text: sheet.pxPerFt != nil ? (sheet.scaleLabel ?? "Scale set") : "No scale", tint: sheet.pxPerFt != nil ? .green : .secondary)
                }
                HStack {
                    Button { onMove(-1) } label: { Image(systemName: "arrow.up") }.disabled(index == 0)
                    Button { onMove(1) } label: { Image(systemName: "arrow.down") }.disabled(index == model.sheets.count - 1)
                    Button(action: onRotate) { Label("Rotate", systemImage: "rotate.right") }
                    Spacer()
                    Button(role: .destructive, action: onDelete) { Image(systemName: "trash") }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding(12)
        }
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(.separator).opacity(0.4)))
    }
}

/// The import options, explained.
private struct ImportPanel: View {
    let scannerAvailable: Bool
    let targeted: Bool
    let onFiles: () -> Void
    let onScan: () -> Void
    @Binding var photos: [PhotosPickerItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add plans").font(.title3.bold())
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { options }
                VStack(spacing: 10) { options }
            }
            Text(targeted ? "Drop to import" : "Tip: drag PDFs or images here, or open a plan in PinPlan from Mail, Files or AirDrop.")
                .font(.caption).foregroundStyle(targeted ? Color.brand : .secondary)
        }
        .padding(16)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(targeted ? Color.brand : Color(.separator).opacity(0.4), style: StrokeStyle(lineWidth: targeted ? 2 : 1, dash: targeted ? [6, 4] : [])))
    }

    @ViewBuilder
    private var options: some View {
        OptionButton(icon: "doc.richtext", title: "Digital plans", subtitle: "PDF from the architect — sharpest, scale read automatically", prominent: true, action: onFiles)
        if scannerAvailable {
            OptionButton(icon: "doc.viewfinder", title: "Scan paper plans", subtitle: "Camera finds the edges, straightens and cleans each page", prominent: false, action: onScan)
        }
        PhotosPicker(selection: $photos, maxSelectionCount: 30, matching: .images) {
            OptionLabel(icon: "photo.on.rectangle.angled", title: "Photos", subtitle: "Plan photos — edges detected, shadows removed", prominent: false)
        }
        .buttonStyle(.plain)
    }

    private struct OptionButton: View {
        let icon: String, title: String, subtitle: String, prominent: Bool
        let action: () -> Void
        var body: some View { Button(action: action) { OptionLabel(icon: icon, title: title, subtitle: subtitle, prominent: prominent) }.buttonStyle(.plain) }
    }

    private struct OptionLabel: View {
        let icon: String, title: String, subtitle: String, prominent: Bool
        var body: some View {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon).font(.title2).frame(width: 40, height: 40)
                    .foregroundStyle(prominent ? .white : Color.brand)
                    .background(prominent ? Color.brand : Color.brand.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
    }
}
