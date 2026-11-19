import SwiftUI
import PinPlanCore

/// Every plan (sheet) of the job as thumbnails: search, recently viewed, device counts. Tap one to open it.
/// "Add or manage" opens the plans screen (import, rename, reorder, rotate, delete); it used to be its own tab.
struct SheetBrowserView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var hSize
    let model: EditorModel
    let onPick: (Sheet) -> Void
    /// "Add or manage": the caller opens the plans screen once this browser has closed.
    var onManage: (() -> Void)? = nil
    @State private var query = ""

    var body: some View {
        let results = SheetNav.search(model.sheets, query: query)
        let recents = SheetNav.recent(model.recentSheetIds, in: model.sheets)
        let counts = deviceCounts()
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if query.isEmpty && recents.count > 1 {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Recently viewed").font(.headline)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 14) {
                                    ForEach(recents) { s in
                                        card(s, count: counts[s.id] ?? 0).frame(width: hSize == .compact ? 140 : 180)
                                    }
                                }
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Text(query.isEmpty ? "All plans" : "\(results.count) matching").font(.headline)
                        if results.isEmpty {
                            ContentUnavailableView.search(text: query)
                        } else {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: hSize == .compact ? 150 : 190, maximum: 280), spacing: 14)], spacing: 18) {
                                ForEach(results) { s in card(s, count: counts[s.id] ?? 0) }
                            }
                        }
                    }
                }
                .padding()
            }
            .background(Color.paper)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search plans")
            .navigationTitle("Plans")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let onManage {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { onManage(); dismiss() } label: { Label("Add or manage", systemImage: "doc.badge.plus").labelStyle(.titleAndIcon) }
                    }
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private func deviceCounts() -> [String: Int] {
        var c: [String: Int] = [:]
        for m in model.bundle.liveMarkers { c[m.sheetId, default: 0] += 1 }
        return c
    }

    private func card(_ s: Sheet, count: Int) -> some View {
        let current = s.id == model.activeSheet?.id
        return Button {
            onPick(s)
            Haptics.select()
            dismiss()
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                SheetThumbnail(sheet: s)
                    .aspectRatio(CGFloat(4.0 / 3.0), contentMode: .fit)
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(current ? Color.brand : Color.black.opacity(0.08), lineWidth: current ? 2.5 : 1))
                VStack(alignment: .leading, spacing: 1) {
                    Text(s.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary).lineLimit(1)
                    Text(subtitle(s, count: count, current: current)).font(.caption).foregroundStyle(current ? Color.brand : Color.secondary).lineLimit(1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(s.name), page \(s.pageNumber), \(count) devices\(current ? ", open now" : "")")
    }

    private func subtitle(_ s: Sheet, count: Int, current: Bool) -> String {
        let devices = count == 1 ? "1 device" : "\(count) devices"
        return current ? "Open now, \(devices)" : "Page \(s.pageNumber), \(devices)"
    }
}

/// A sheet's thumbnail (made once, cached on disk).
struct SheetThumbnail: View {
    @Environment(AppModel.self) private var app
    let sheet: Sheet
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Color.white
            if let image {
                Image(uiImage: image).resizable().interpolation(.medium).scaledToFit().padding(4)
            } else {
                Image(systemName: "doc").font(.title).foregroundStyle(Color.secondary.opacity(0.5))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .task(id: sheet.imageId) {
            guard app.store.hasImage(sheet.imageId) else { return }
            image = await PlanTileStore.shared.thumbnail(imageId: sheet.imageId, source: PlanTileStore.sourceURL(imageId: sheet.imageId, store: app.store))
        }
    }
}
