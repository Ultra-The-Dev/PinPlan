import SwiftUI
import PinPlanCore

/// One incoming page awaiting review.
struct ReviewPage: Identifiable {
    let id = UUID()
    let original: UIImage
    var quad: ScanProcessing.Quad?
    var rotation = 0
    var mode: EnhanceMode
    var name: String
    var preview: UIImage?
    var recognizing = true
}

enum ReviewSource { case scanner, photos, files }

/// Review scanned / photographed / imported pages before they become sheets:
/// clean-up mode, rotation, page corners, and a floor name read from the page by on-device text recognition.
struct ScanReviewView: View {
    @Environment(\.dismiss) private var dismiss
    let source: ReviewSource
    let onImport: ([(image: UIImage, name: String)]) -> Void
    @State var pages: [ReviewPage]
    @State private var editingCorners: ReviewPage.ID?
    @State private var importing = false

    init(images: [UIImage], source: ReviewSource, startIndex: Int, onImport: @escaping ([(image: UIImage, name: String)]) -> Void) {
        self.source = source
        self.onImport = onImport
        let mode: EnhanceMode = source == .files ? .original : .clean
        _pages = State(initialValue: images.enumerated().map { i, img in
            ReviewPage(original: img, mode: mode, name: "Sheet \(startIndex + i + 1)")
        })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(intro).font(.callout).foregroundStyle(.secondary)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 16)], spacing: 16) {
                        ForEach($pages) { $page in
                            PageCard(page: $page,
                                     onCorners: { editingCorners = page.id },
                                     onRemove: { pages.removeAll { $0.id == page.id } },
                                     reprocess: { reprocess(page.id) })
                        }
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Review \(pages.count) page\(pages.count == 1 ? "" : "s")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(importing ? "Adding…" : "Add \(pages.count) sheet\(pages.count == 1 ? "" : "s")") { finish() }
                        .disabled(pages.isEmpty || importing).bold()
                }
            }
            .sheet(item: Binding(get: { editingCorners.flatMap { id in pages.first { $0.id == id } } }, set: { editingCorners = $0?.id })) { p in
                CornerEditor(image: p.original.normalizedOrientation(), quad: p.quad ?? [CGPoint].fullQuad) { q in
                    if let i = pages.firstIndex(where: { $0.id == p.id }) { pages[i].quad = q; reprocess(p.id) }
                }
            }
            .task { await prepare() }
        }
    }

    private var intro: String {
        switch source {
        case .scanner: return "Pages were straightened by the scanner. “Clean” evens out lighting and sharpens lines; “B&W” gives maximum contrast. Floor names are read from each page."
        case .photos: return "Page edges were detected automatically — tap Corners to adjust. “Clean” evens out shadows and sharpens lines."
        case .files: return "Check the orientation and floor names. Use Clean for photos or poor scans."
        }
    }

    private func prepare() async {
        for page in pages {
            let id = page.id
            let img = page.original
            let detectCorners = source == .photos
            let result = await Task.detached(priority: .userInitiated) { () -> (ScanProcessing.Quad?, String) in
                let quad = detectCorners ? ScanProcessing.detectPage(in: img) : nil
                let text = ScanProcessing.recognizeText(in: img)
                return (quad, text)
            }.value
            guard let i = pages.firstIndex(where: { $0.id == id }) else { continue }
            if let q = result.0 { pages[i].quad = q }
            let guess = PlanImporter.guessFloorName(result.1, fallback: "")
            if !guess.isEmpty { pages[i].name = guess }
            pages[i].recognizing = false
            reprocess(id)
        }
    }

    private func reprocess(_ id: ReviewPage.ID) {
        guard let p = pages.first(where: { $0.id == id }) else { return }
        let (img, quad, rot, mode) = (p.original, p.quad, p.rotation, p.mode)
        Task {
            let out = await Task.detached(priority: .userInitiated) { ScanProcessing.process(img, quad: quad, rotation: rot, mode: mode, maxSide: 1400) }.value
            if let i = pages.firstIndex(where: { $0.id == id }) { pages[i].preview = out }
        }
    }

    private func finish() {
        importing = true
        let jobs = pages.map { ($0.original, $0.quad, $0.rotation, $0.mode, $0.name.trimmingCharacters(in: .whitespaces)) }
        Task {
            let out = await Task.detached(priority: .userInitiated) {
                jobs.map { j in (image: ScanProcessing.process(j.0, quad: j.1, rotation: j.2, mode: j.3), name: j.4) }
            }.value
            onImport(out)
            dismiss()
        }
    }
}

private struct PageCard: View {
    @Binding var page: ReviewPage
    let onCorners: () -> Void
    let onRemove: () -> Void
    let reprocess: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                Color(.secondarySystemBackground)
                if let p = page.preview { Image(uiImage: p).resizable().scaledToFit().padding(6) } else { ProgressView() }
            }
            .frame(height: 230)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            HStack {
                TextField("Floor name", text: $page.name).font(.headline).textFieldStyle(.roundedBorder)
                if page.recognizing { ProgressView().controlSize(.small) }
            }
            Picker("Clean-up", selection: $page.mode) {
                ForEach(EnhanceMode.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .onChange(of: page.mode) { _, _ in reprocess() }
            HStack {
                Button { page.rotation = (page.rotation + 3) % 4; reprocess() } label: { Image(systemName: "rotate.left") }
                Button { page.rotation = (page.rotation + 1) % 4; reprocess() } label: { Image(systemName: "rotate.right") }
                Button(action: onCorners) { Label("Corners", systemImage: "crop") }
                Spacer()
                Button(role: .destructive, action: onRemove) { Image(systemName: "trash") }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(12)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

extension Array where Element == CGPoint {
    /// The whole image as a quad (TL, TR, BR, BL).
    static var fullQuad: [CGPoint] { [CGPoint(x: 0, y: 0), CGPoint(x: 1, y: 0), CGPoint(x: 1, y: 1), CGPoint(x: 0, y: 1)] }
}

/// Drag the four page corners (with a magnifier-style precision offset) to set the perspective crop.
struct CornerEditor: View {
    @Environment(\.dismiss) private var dismiss
    let image: UIImage
    @State var quad: ScanProcessing.Quad
    let onDone: (ScanProcessing.Quad?) -> Void
    @State private var active: Int?

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                let fit = fitRect(in: geo.size)
                ZStack(alignment: .topLeading) {
                    Color.black
                    Image(uiImage: image).resizable().frame(width: fit.width, height: fit.height).offset(x: fit.minX, y: fit.minY)
                    Path { p in
                        let pts = quad.map { CGPoint(x: fit.minX + $0.x * fit.width, y: fit.minY + $0.y * fit.height) }
                        p.addLines(pts); p.closeSubpath()
                    }
                    .fill(Color.brand.opacity(0.15))
                    .overlay(Path { p in
                        let pts = quad.map { CGPoint(x: fit.minX + $0.x * fit.width, y: fit.minY + $0.y * fit.height) }
                        p.addLines(pts); p.closeSubpath()
                    }.stroke(Color.brand, lineWidth: 2))
                    ForEach(0..<4, id: \.self) { i in
                        let pt = CGPoint(x: fit.minX + quad[i].x * fit.width, y: fit.minY + quad[i].y * fit.height)
                        Circle().fill(Color.white).frame(width: 26, height: 26)
                            .overlay(Circle().stroke(Color.brand, lineWidth: 3))
                            .scaleEffect(active == i ? 1.3 : 1)
                            .position(pt)
                            .gesture(DragGesture(coordinateSpace: .named("corners"))
                                .onChanged { v in
                                    active = i
                                    quad[i] = CGPoint(x: min(1, max(0, (v.location.x - fit.minX) / fit.width)),
                                                      y: min(1, max(0, (v.location.y - fit.minY) / fit.height)))
                                }
                                .onEnded { _ in active = nil })
                    }
                }
                .coordinateSpace(.named("corners"))
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("Drag the corners onto the page")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .principal) {
                    Button("Use whole photo") { onDone(nil); dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) { Button("Apply") { onDone(quad); dismiss() }.bold() }
            }
        }
    }

    private func fitRect(in size: CGSize) -> CGRect {
        let px = image.size
        let k = min(size.width / px.width, size.height / px.height) * 0.94
        let w = px.width * k, h = px.height * k
        return CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h)
    }
}
