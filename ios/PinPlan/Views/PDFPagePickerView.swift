import SwiftUI
import PDFKit
import PinPlanCore

/// The open PDF, shared with background work (PDFKit reads a document from one task at a time here).
private final class PDFBox: @unchecked Sendable {
    let doc: PDFDocument
    init(_ doc: PDFDocument) { self.doc = doc }
}

/// Right after choosing a plan PDF: every page with a large thumbnail, a tick to keep or skip it (covers, specs,
/// near-duplicates) and its name, filled in with the floor read from the page (its text layer, else on-device text
/// recognition). One button imports the kept pages. The same step as the web app's import page picker
/// (docs/sheet-index-links.md).
struct PDFPagePickerView: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL
    /// Kept pages: 1-based page number → name (empty: read from the page, else "Sheet n").
    let onImport: ([Int: String]) -> Void

    struct Row: Identifiable {
        let id: Int
        var keep = true
        var name = ""
        var thumb: UIImage?
        /// Still being read (no text layer: waiting for text recognition).
        var reading = false
        var fromPage = false
        var edited = false
    }

    struct Enlarged: Identifiable { let id: Int }

    @State private var rows: [Row] = []
    @State private var box: PDFBox?
    @State private var failed = false
    @State private var enlarged: Enlarged?

    private var kept: Int { rows.filter(\.keep).count }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Untick pages you don't need (cover, specs, duplicates). Names come from each page; tap a name to change it.")
                        .font(.callout).foregroundStyle(.secondary)
                    if failed { Text("That PDF couldn't be opened.").foregroundStyle(.red) }
                    if !rows.isEmpty {
                        Button(kept == rows.count ? LocalizedStringKey("Skip all") : LocalizedStringKey("Keep all")) {
                            let on = kept != rows.count
                            for i in rows.indices { rows[i].keep = on }
                        }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 16)], spacing: 16) {
                        ForEach($rows) { $row in
                            PickerPageCard(row: $row, onEnlarge: { enlarged = Enlarged(id: row.id) })
                        }
                    }
                }
                .padding()
            }
            .background(Color.paper)
            .navigationTitle("Choose and name pages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import \(kept) pages") { finish() }.disabled(kept == 0).bold()
                }
            }
            .sheet(item: $enlarged) { e in
                EnlargedPDFPage(box: box, page: e.id, name: rows.first { $0.id == e.id }?.name ?? "")
            }
            .task { await load() }
        }
    }

    private func finish() {
        var out: [Int: String] = [:]
        for r in rows where r.keep { out[r.id] = r.name.trimmingCharacters(in: .whitespacesAndNewlines) }
        onImport(out)
        dismiss()
    }

    private func load() async {
        let url = self.url
        let opened: (PDFBox, [String])? = await Task.detached(priority: .userInitiated) {
            guard let doc = PDFDocument(url: url), !doc.isLocked else { return nil }
            return (PDFBox(doc), (0..<doc.pageCount).map { doc.page(at: $0)?.string ?? "" })
        }.value
        guard let opened else { failed = true; return }
        let (b, texts) = opened
        box = b
        rows = texts.enumerated().map { i, text in
            let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            let name = hasText ? PlanReader.floorName(in: text) : nil
            return Row(id: i + 1, name: name ?? "", reading: !hasText, fromPage: name != nil)
        }
        // Thumbnails, and text recognition for pages without a text layer, one page at a time.
        for row in rows {
            if Task.isCancelled { return }
            let n = row.id
            let ocr = row.reading
            let result: (UIImage?, String?) = await Task.detached(priority: .utility) {
                guard let page = b.doc.page(at: n - 1) else { return (nil, nil) }
                let thumb = page.thumbnail(of: CGSize(width: 640, height: 640), for: .cropBox)
                let name = ocr ? ScanProcessing.floorName(in: page.thumbnail(of: CGSize(width: 2600, height: 2600), for: .cropBox)) : nil
                return (thumb, name)
            }.value
            guard let i = rows.firstIndex(where: { $0.id == n }) else { continue }
            rows[i].thumb = result.0
            if rows[i].reading {
                rows[i].reading = false
                if let name = result.1, !rows[i].edited {
                    rows[i].name = name
                    rows[i].fromPage = true
                }
            }
        }
    }
}

private struct PickerPageCard: View {
    @Binding var row: PDFPagePickerView.Row
    let onEnlarge: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                Button(action: onEnlarge) {
                    Group {
                        if let t = row.thumb { Image(uiImage: t).resizable().scaledToFit() } else { ProgressView() }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 210)
                    .padding(6)
                    .background(Color(.secondarySystemBackground))
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "arrow.up.left.and.arrow.down.right").font(.caption.weight(.semibold))
                            .padding(8).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8)).padding(8)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Enlarge page \(row.id)"))
                Button { row.keep.toggle() } label: {
                    Image(systemName: row.keep ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(row.keep ? Color.brand : Color.secondary)
                        .frame(width: 44, height: 44)
                        .background(.thinMaterial, in: Circle())
                }
                .buttonStyle(.plain)
                .padding(6)
                .accessibilityLabel(Text("Import page \(row.id)"))
                .accessibilityAddTraits(row.keep ? .isSelected : [])
                Text(verbatim: "\(row.id)").font(.caption.weight(.semibold)).monospacedDigit()
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 5)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .trailing).padding(10)
                    .accessibilityHidden(true)
            }
            TextField("Name this page", text: Binding(get: { row.name }, set: { row.name = $0; row.edited = true }))
                .textFieldStyle(.roundedBorder)
                .font(.headline)
                .frame(minHeight: 44)
                .disabled(!row.keep)
            Group {
                if row.reading {
                    Label("Reading the title block…", systemImage: "text.viewfinder")
                } else if row.fromPage && !row.edited {
                    Label("Read from the page", systemImage: "text.viewfinder").foregroundStyle(.green)
                } else if row.name.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text("Couldn't read a name — please name it").foregroundStyle(.orange)
                } else {
                    Text("Page \(row.id)")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(10)
        .opacity(row.keep ? 1 : 0.55)
        .paperCard()
    }
}

/// One page large, to tell similar pages apart.
private struct EnlargedPDFPage: View {
    @Environment(\.dismiss) private var dismiss
    fileprivate let box: PDFBox?
    let page: Int
    let name: String
    @State private var image: UIImage?

    var body: some View {
        NavigationStack {
            Group {
                if let image { Image(uiImage: image).resizable().scaledToFit().padding() } else { ProgressView() }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.paper)
            .navigationTitle(name.isEmpty ? String(localized: "Page \(page)") : name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task {
                guard let box else { return }
                let n = page
                image = await Task.detached(priority: .userInitiated) {
                    box.doc.page(at: n - 1)?.thumbnail(of: CGSize(width: 2000, height: 2000), for: .cropBox)
                }.value
            }
        }
    }
}
