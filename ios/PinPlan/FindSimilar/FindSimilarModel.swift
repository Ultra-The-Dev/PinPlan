import SwiftUI
import ImageIO
import PinPlanCore

// Find similar (docs/find-similar.md): count doors, windows and any repeated symbol on the plan, on this device and
// offline (no AI). The maths is PinPlanCore's FindSimilar / FindTags (same as the web, tested with `swift test`);
// this file holds the tool's state on this device and runs the searches off the main thread.
//
// What it finds are suggestions only — ghost pins, never counted — until accepted; Accept all adds them as ordinary
// devices of the chosen type in one undo step (EditorModel.addMarkers). Suggestions live in memory, belong to one
// plan, and are never saved or synced.

@MainActor
@Observable
final class FindSimilarUI {
    static let shared = FindSimilarUI()

    enum Mode: String, CaseIterable, Identifiable {
        case match, tags
        var id: String { rawValue }
    }

    struct DragBox: Equatable {
        var a: PlanPoint
        var b: PlanPoint
    }

    var open = false
    var mode: Mode = .match
    /// Device type the finds are counted as.
    var typeId: String?
    /// Waiting for a tap (or a box) on the plan, match mode.
    var picking = true
    /// One finger draws a box on the plan instead of moving it.
    var boxMode = false
    var drag: DragBox?
    /// Results belong to this sheet.
    var sheetId: String?
    var source: FindSimilar.Source?
    /// The symbol searched for, sheet px.
    var template: FindSimilar.Box?
    var found: [FindSimilar.Found] = []
    /// A device of the type within this distance (sheet px) hides a find.
    var nearPx = 0.0
    var sensitivity = 50.0
    var prefixes = ""
    /// What's happening while a search runs ("Reading the plan…"), and how far along (0–1) when known.
    var busy: String?
    var progress: Double?
    /// A plain-words note: nothing found, no text, box too small…
    var note: String?
    /// Review one by one: position in the shown list.
    var review: Int?

    /// The search running now (a newer one, or Clear, cancels it).
    @ObservationIgnored private var token: SearchToken?
    /// The last sheet image prepared for matching (grey, shrunk, blurred), reused while the user tries again.
    @ObservationIgnored private var prepared: (key: String, image: FindSimilar.GrayImage)?
    @ObservationIgnored private var seq = 0

    private static let typeKey = "findSimilar.type"

    // MARK: open, close, type

    /// Opens the card (Edit mode, select tool) with a type to count as.
    func show(model: EditorModel) {
        if model.viewerMode != .edit { model.setViewerMode(.edit) }
        model.use(.select)
        model.clearSelection()
        ProgressUI.shared.walk = false
        sheetChanged(to: model.activeSheet?.id)
        open = true
        drag = nil
        review = nil
        picking = found.isEmpty
        let types = FindSimilar.countableTypes(model.app.catalog)
        if typeId == nil || !types.contains(where: { $0.id == typeId }),
           let t = FindSimilar.defaultType(types, remembered: UserDefaults.standard.string(forKey: Self.typeKey)) {
            setType(t)
        }
    }

    /// Closes the card; suggestions stay (hidden) until it opens again or Clear.
    func close() {
        open = false
        boxMode = false
        drag = nil
        review = nil
    }

    func setType(_ t: DeviceType) {
        UserDefaults.standard.set(t.id, forKey: Self.typeKey)
        typeId = t.id
        prefixes = FindTags.defaultPrefixes(typeName: t.name)
        // Read tags: other prefixes, so the tags found for the last type no longer apply. (Matches stay: a symbol
        // found as one type can be counted as another.)
        if mode == .tags && !found.isEmpty { clear() }
    }

    func setMode(_ m: Mode) {
        guard m != mode else { return }
        mode = m
        clear()
    }

    func clear() {
        token?.cancel()
        token = nil
        sheetId = nil; source = nil; template = nil; found = []; note = nil; review = nil; busy = nil; progress = nil; drag = nil
        picking = mode == .match
    }

    /// Moving to another plan starts over.
    func sheetChanged(to id: String?) {
        if sheetId != nil && sheetId != id { clear() }
    }

    // MARK: what shows

    private func existing(_ model: EditorModel, sheetId: String) -> [(x: Double, y: Double)] {
        guard let typeId else { return [] }
        return model.bundle.liveMarkers.filter { $0.sheetId == sheetId && $0.deviceTypeId == typeId }.map { ($0.x, $0.y) }
    }

    /// The finds shown now: above the sensitivity (tags always) and not on a device of the type already.
    func shown(_ model: EditorModel, sheet: Sheet) -> [FindSimilar.Found] {
        guard sheetId == sheet.id, typeId != nil, let source else { return [] }
        return FindSimilar.shown(found, source: source, sensitivity: sensitivity, existing: existing(model, sheetId: sheet.id),
                                 width: sheet.width, height: sheet.height, nearPx: nearPx)
    }

    func toggle(_ id: String) {
        guard let i = found.firstIndex(where: { $0.id == id }) else { return }
        found[i].rejected.toggle()
        Haptics.select()
    }

    private func nextId() -> String { seq += 1; return "f\(seq)" }

    // MARK: Match a symbol

    /// Search the sheet for symbols like the one in `box` (sheet px). `trim`: a tap's square, cut down to its ink.
    func runMatch(model: EditorModel, sheet: Sheet, box: FindSimilar.Box, trim: Bool) {
        guard typeId != nil else { note = String(localized: "Choose what to count first."); return }
        clear()
        let job = SearchToken()
        token = job
        picking = false
        boxMode = false
        sheetId = sheet.id
        source = .match
        template = box
        busy = String(localized: "Reading the sheet…")
        guard let scale = FindSimilar.chooseScale(box: box, sheetWidth: sheet.width, sheetHeight: sheet.height) else {
            fail(String(localized: "That box is too small. Zoom in and draw a box around one symbol."))
            return
        }
        let size = FindSimilar.workSize(sheetWidth: sheet.width, sheetHeight: sheet.height, scale: scale)
        let key = "\(sheet.imageId)@\(size.w)x\(size.h)"
        let cached = prepared?.key == key ? prepared?.image : nil
        let url = PlanTileStore.sourceURL(imageId: sheet.imageId, store: model.app.store)
        Task {
            let outcome: Result<(FindSimilar.SearchResult, FindSimilar.GrayImage), Error> = await Task.detached(priority: .userInitiated) {
                do {
                    let work: FindSimilar.GrayImage
                    if let cached { work = cached } else {
                        guard let decoded = SheetPixels.gray(url: url, width: size.decodeW, height: size.decodeH) else {
                            throw SheetPixels.Failure.unreadable
                        }
                        work = FindSimilar.prepare(decoded: decoded, workW: size.w, workH: size.h)
                    }
                    let r = try FindSimilar.search(in: work, scale: scale, box: box, trim: trim, progress: { done, total in
                        let p = Double(done) / Double(max(1, total))
                        Task { @MainActor in FindSimilarUI.shared.reportProgress(p, job: job) }
                    }, cancelled: { job.isCancelled })
                    return .success((r, work))
                } catch {
                    return .failure(error)
                }
            }.value
            guard token === job, !job.isCancelled else { return }
            token = nil
            switch outcome {
            case .success(let (r, work)):
                prepared = (key, work)
                busy = nil; progress = nil
                template = r.template
                nearPx = FindSimilar.nearPx(template: r.template)
                found = r.candidates.map { FindSimilar.Found(id: nextId(), x: $0.cx / sheet.width, y: $0.cy / sheet.height, score: $0.score) }
                if found.isEmpty {
                    note = String(localized: "Nothing similar found. Try a tighter box around one symbol.")
                    picking = true
                }
            case .failure(let e):
                switch e as? FindSimilar.SearchError {
                case .cancelled?: return
                case .tooSmall?: fail(String(localized: "That box is too small. Zoom in and draw a box around one symbol."))
                case .blank?: fail(String(localized: "There’s nothing drawn there. Tap right on a symbol, or draw a box around one."))
                case .onlyLines?: fail(String(localized: "That’s only straight lines, like a wall. Tap right on a symbol, or draw the box tightly around one."))
                case nil: fail(String(localized: "Couldn’t read this plan’s picture."))
                }
            }
        }
    }

    func reportProgress(_ p: Double, job: SearchToken) {
        guard token === job, busy != nil else { return }
        busy = String(localized: "Searching…")
        progress = p
    }

    private func fail(_ message: String) {
        busy = nil; progress = nil; template = nil; sheetId = nil; source = nil
        note = message
        picking = true
    }

    /// A tap on the plan while picking: search for the symbol under it.
    func tapPick(model: EditorModel, sheet: Sheet, at p: PlanPoint) {
        let box = FindSimilar.tapBox(x: p.x * sheet.width, y: p.y * sheet.height, sheetWidth: sheet.width, sheetHeight: sheet.height, pxPerFt: sheet.pxPerFt)
        runMatch(model: model, sheet: sheet, box: box, trim: true)
    }

    /// The box drawn on the plan (sheet-relative corners).
    func boxPick(model: EditorModel, sheet: Sheet, _ d: DragBox) {
        let r = FindSimilar.boxFromCorners((d.a.x * sheet.width, d.a.y * sheet.height), (d.b.x * sheet.width, d.b.y * sheet.height))
        let box = FindSimilar.clampBox(r, sheetWidth: sheet.width, sheetHeight: sheet.height)
        guard min(box.w, box.h) >= 6 else {
            note = String(localized: "That box is too small. Zoom in and draw a box around one symbol.")
            return
        }
        runMatch(model: model, sheet: sheet, box: box, trim: false)
    }

    // MARK: Read tags

    /// Door / window tags printed on the plan: the original PDF's text, else text recognition on the picture.
    func runTags(model: EditorModel, sheet: Sheet) {
        let list = FindTags.parsePrefixes(prefixes)
        clear()
        picking = false
        guard !list.isEmpty else {
            note = String(localized: "Type what the tags start with, e.g. D for doors or W for windows.")
            return
        }
        let job = SearchToken()
        token = job
        busy = String(localized: "Reading the plan’s text…")
        let store = model.app.store
        Task {
            let words = await Task.detached(priority: .userInitiated) { PlanTextExtractor.words(for: sheet, store: store) }.value
            guard token === job, !job.isCancelled else { return }
            token = nil
            busy = nil
            guard !words.isEmpty else {
                note = String(localized: "This plan has no text to read. Use Match a symbol instead.")
                return
            }
            let tags = FindTags.find(in: words, prefixes: list)
            sheetId = sheet.id
            source = .tags
            nearPx = FindSimilar.tagNearPx(sheetWidth: sheet.width, sheetHeight: sheet.height, pxPerFt: sheet.pxPerFt)
            found = tags.map { FindSimilar.Found(id: nextId(), x: $0.x, y: $0.y, score: 1, tag: $0.tag) }
            if found.isEmpty { note = String(localized: "No tags starting with \(list.joined(separator: ", ")) on this plan.") }
        }
    }

    // MARK: accept

    /// Turns the shown, not rejected finds into devices of the chosen type, one undo step. Returns how many.
    @discardableResult
    func acceptAll(model: EditorModel, sheet: Sheet) -> Int {
        guard let typeId, let type = model.app.type(typeId) else { return 0 }
        let keep = shown(model, sheet: sheet).filter { !$0.rejected }
        guard !keep.isEmpty else { return 0 }
        let n = model.addMarkers(type: type, sheetId: sheet.id, at: keep.map { PlanPoint(x: $0.x, y: $0.y) })
        guard n > 0 else { return 0 }
        model.say(String(localized: "Added \(n) × \(type.name). Undo puts them all back."))
        Haptics.tap()
        let ids = Set(keep.map(\.id))
        found.removeAll { ids.contains($0.id) }
        review = nil
        // Nothing left worth showing (only rejected or below the slider): start over, ready for the next symbol.
        if !shown(model, sheet: sheet).contains(where: { !$0.rejected }) { clear() }
        return n
    }
}

/// One search: the background work polls `isCancelled` between orientations; a newer search or Clear cancels it.
final class SearchToken: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false
    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
    func cancel() { lock.lock(); cancelled = true; lock.unlock() }
}

// MARK: - screenshots and UI tests

extension FindSimilarUI {
    /// `--find-similar open | match | tags | review` (Debug builds; ios-sim-screens.yml): opens the tool on the
    /// demo job's first floor and, for match / tags / review, runs a search on one of its doors.
    static func runLaunchDemo(model: EditorModel, viewport: PlanViewportController) {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "--find-similar") else { return }
        let what = i + 1 < args.count ? args[i + 1] : "open"
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1200))
            // The demo's "1st Fl" (every demo floor has the same doors and door tags).
            if let first = model.sheets.first(where: { $0.name.contains("1st") }) ?? model.sheets.first { model.setActiveSheet(first.id) }
            guard let sheet = model.activeSheet else { return }
            let ui = FindSimilarUI.shared
            ui.show(model: model)
            switch what {
            case "match", "review":
                ui.setMode(.match)
                // The swing of the demo's first door (DemoProject.drawPlanContent: centre 1100, 760 of 3200 × 2071).
                // Demo sheets are drawn scaled by width (DemoProject.drawPlan), so map design units through the sheet's own
                // pixel size: a sheet whose aspect differs from the design's would otherwise put the box on a wall corner.
                let d = DemoProject.designSize
                let dw = Double(d.width), dh = Double(d.height)
                let w: Double = sheet.width > 0 ? sheet.width : dw, h: Double = sheet.height > 0 ? sheet.height : dh
                let k = w / dw
                let a = PlanPoint(x: 1088 * k / w, y: 748 * k / h), b = PlanPoint(x: 1204 * k / w, y: 864 * k / h)
                ui.boxPick(model: model, sheet: sheet, DragBox(a: a, b: b))
            case "tags":
                ui.setMode(.tags)
                ui.prefixes = "D, DR"
                ui.runTags(model: model, sheet: sheet)
            default:
                return
            }
            for _ in 0..<100 where ui.busy != nil { try? await Task.sleep(for: .milliseconds(200)) }
            let shown = ui.shown(model, sheet: sheet)
            if what == "review", let f = shown.first {
                ui.review = 0
                viewport.show(PlanRect(x: f.x - 0.06, y: f.y - 0.06, width: 0.12, height: 0.12))
            }
        }
        #endif
    }
}

/// Decoding a sheet picture into grey pixels for matching (ImageIO + CoreGraphics).
enum SheetPixels {
    enum Failure: Error { case unreadable }

    /// The image at `url` drawn into a width × height grey bitmap (white behind transparency), 0 = black.
    static func gray(url: URL, width: Int, height: Int) -> FindSimilar.GrayImage? {
        guard width > 0, height > 0, let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        // Decode no bigger than needed (a 7000 px sheet shrunk for a 32 px symbol).
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: max(width, height),
            kCGImageSourceCreateThumbnailWithTransform: false,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) ?? CGImageSourceCreateImageAtIndex(src, 0, nil),
              let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
                                  space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        let rect = CGRect(x: 0, y: 0, width: width, height: height)
        ctx.setFillColor(gray: 1, alpha: 1)
        ctx.fill(rect)
        ctx.interpolationQuality = .high
        ctx.draw(cg, in: rect)
        guard let data = ctx.data else { return nil }
        let bytes = Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: width * height))
        return FindSimilar.GrayImage(w: width, h: height, bytes: bytes)
    }
}
