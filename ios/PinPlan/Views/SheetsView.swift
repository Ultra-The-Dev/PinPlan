import SwiftUI
import PhotosUI
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("One sheet per floor. PDFs are split into pages, the scanner straightens paper plans, and floor names are read from the title block.")
                    .font(.subheadline).foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    Button { showPDF = true } label: { Label("Import PDF", systemImage: "doc.richtext") }
                        .buttonStyle(.borderedProminent)
                    if DocumentScanner.isAvailable {
                        Button { showScanner = true } label: { Label("Scan paper plans", systemImage: "doc.viewfinder") }.buttonStyle(.bordered)
                    }
                    PhotosPicker(selection: $photoItems, maxSelectionCount: 20, matching: .images) {
                        Label("Photos", systemImage: "photo.on.rectangle")
                    }
                    .buttonStyle(.bordered)
                }
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
        .fileImporter(isPresented: $showPDF, allowedContentTypes: [.pdf], allowsMultipleSelection: true) { result in
            guard let urls = try? result.get() else { return }
            importPDFs(urls)
        }
        .fullScreenCover(isPresented: $showScanner) {
            DocumentScanner(onFinish: { pages in showScanner = false; addImages(pages, baseName: "Scan") }, onCancel: { showScanner = false })
                .ignoresSafeArea()
        }
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                busy = "Loading photos…"
                var imgs: [UIImage] = []
                for item in items { if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) { imgs.append(img) } }
                photoItems = []
                busy = nil
                addImages(imgs, baseName: "Photo")
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
                for url in urls {
                    let pages = try PlanImporter.renderPDF(at: url)
                    for p in pages {
                        guard let imageId = store.saveImage(p.image) else { continue }
                        let px = p.image.pixelSize
                        newSheets.append(Sheet(projectId: projectId, name: PlanImporter.guessFloorName(p.text, fallback: "Sheet \(order + 1)"),
                                               pageNumber: p.pageNumber, order: order, imageId: imageId, width: px.width, height: px.height, pxPerInch: p.pxPerInch))
                        order += 1
                    }
                }
                let added = newSheets
                await MainActor.run {
                    model.edit { $0.sheets += added }
                    if model.activeSheetId == nil { model.activeSheetId = added.first?.id }
                    busy = nil
                    model.say("Added \(added.count) sheet\(added.count == 1 ? "" : "s")")
                }
            } catch {
                await MainActor.run { busy = nil; self.error = error.localizedDescription }
            }
        }
    }

    private func addImages(_ images: [UIImage], baseName: String) {
        guard !images.isEmpty else { return }
        var order = nextOrder
        var added: [Sheet] = []
        for (i, raw) in images.enumerated() {
            let img = PlanImporter.normalized(raw)
            guard let id = app.store.saveImage(img) else { continue }
            let px = img.pixelSize
            added.append(Sheet(projectId: model.bundle.project.id, name: "\(baseName) \(i + 1)", pageNumber: i + 1, order: order, imageId: id, width: px.width, height: px.height))
            order += 1
        }
        model.edit { $0.sheets += added }
        if model.activeSheetId == nil { model.activeSheetId = added.first?.id }
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
