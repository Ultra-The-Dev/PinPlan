import SwiftUI
import UIKit
import PinPlanCore

// Plan links from the web ("office-links" in Markups/OfficeOverlays.swift): red see-through boxes on callouts
// (the Fieldwire convention) with a small chip naming where they go. A tap opens the other plan (centred on the spot
// when the link has one), a job document, a photo or a web page. Links to something deleted show grey and dashed.
// Links are made on the web; here they are read-only.

/// What a link tap asked to open (shown by OfficeLinkPresenter in the viewer's controls column).
@MainActor
@Observable
final class OfficeLinkState {
    static let shared = OfficeLinkState()
    var photo: PhotoViewerItem?
    var document: URL?
}

struct PlacedLink: Identifiable {
    let link: SheetLink
    let rect: CGRect
    let chip: String
    let broken: Bool
    var id: String { link.id }
}

enum OfficeLinks {
    /// "E-201", "Panel schedule.pdf", "Photo", the web page's host, or why it can't open.
    @MainActor static func describe(_ l: SheetLink, model: EditorModel) -> (text: String, broken: Bool) {
        let t = l.target
        switch t.kind {
        case "sheet":
            guard let s = model.bundle.liveSheets.first(where: { $0.id == t.sheetId }) else { return ("Plan deleted", true) }
            return (s.name, false)
        case "document":
            guard let d = model.bundle.liveDocuments.first(where: { $0.id == t.documentId }) else { return ("File deleted", true) }
            return (d.name, false)
        case "photo":
            return model.photo(t.photoId ?? "") == nil ? ("Photo deleted", true) : ("Photo", false)
        case "url":
            return (URL(string: t.url ?? "")?.host ?? "Web page", webURL(t.url) == nil)
        default:
            return ("", true)
        }
    }

    /// Only http(s) addresses open (never a scheme that could launch something else).
    static func webURL(_ raw: String?) -> URL? {
        guard let raw, let u = URL(string: raw.trimmingCharacters(in: .whitespaces)), let s = u.scheme?.lowercased(), s == "http" || s == "https" else { return nil }
        return u
    }

    @MainActor static func placed(_ ctx: PlanOverlayContext) -> [PlacedLink] {
        let view = CGRect(x: 0, y: 0, width: ctx.viewport.viewSize.width, height: ctx.viewport.viewSize.height).insetBy(dx: -40, dy: -40)
        return ctx.model.bundle.liveSheetLinks.compactMap { (l: SheetLink) -> PlacedLink? in
            guard l.sheetId == ctx.sheet.id, l.w > 0, l.h > 0 else { return nil }
            let a = ctx.point(l.x, l.y), b = ctx.point(l.x + l.w, l.y + l.h)
            let r = CGRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(b.x - a.x), height: abs(b.y - a.y))
            guard r.intersects(view) else { return nil }
            let d = describe(l, model: ctx.model)
            let label = (l.label ?? "").trimmingCharacters(in: .whitespaces)
            return PlacedLink(link: l, rect: r, chip: label.isEmpty ? d.text : label, broken: d.broken)
        }
    }

    /// A tap inside a link box (with some slack for small boxes) follows it. In Edit mode only with the Select tool,
    /// so placing devices over a callout still works.
    @MainActor static func handleTap(_ tap: PlanTap) -> Bool {
        let ctx = tap.context
        guard OfficeOverlayPrefs.shared.links else { return false }
        if ctx.mode == .edit && ctx.model.tool != .select { return false }
        let hit = placed(ctx).last { l in
            let slack = max(0, (44 - min(l.rect.width, l.rect.height)) / 2)
            return l.rect.insetBy(dx: -slack, dy: -slack).contains(tap.location)
        }
        guard let hit else { return false }
        follow(hit.link, model: ctx.model, controller: ctx.controller)
        return true
    }

    @MainActor static func follow(_ l: SheetLink, model: EditorModel, controller: PlanViewportController) {
        let t = l.target
        switch t.kind {
        case "sheet":
            guard let id = t.sheetId, let s = model.bundle.liveSheets.first(where: { $0.id == id }) else {
                model.say("That plan was deleted")
                return
            }
            Haptics.select()
            if model.activeSheetId != id { model.setActiveSheet(id) }
            model.noteSheetViewed(id)
            guard let x = t.x, let y = t.y else { return }
            // The new plan publishes its viewport a moment after it appears; centre on the spot once it has.
            Task { @MainActor in
                for _ in 0..<20 {
                    if controller.sheetId == s.id && controller.viewport.isReady { break }
                    try? await Task.sleep(nanoseconds: 50_000_000)
                }
                guard controller.sheetId == s.id else { return }
                controller.center(on: PlanPoint(x: x, y: y), zoom: max(controller.viewport.zoom, controller.limits.lowerBound * 3))
            }
        case "document":
            guard let d = model.bundle.liveDocuments.first(where: { $0.id == t.documentId }) else { model.say("That file was deleted"); return }
            guard let data = model.app.store.fileData(d.fileId) else { model.say("This file hasn't downloaded yet — it arrives with the next sync"); return }
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("docs-\(d.id)", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let safe = d.name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-").trimmingCharacters(in: .whitespaces)
            let url = dir.appendingPathComponent(safe.isEmpty || safe.hasPrefix(".") ? "document" + safe : safe)
            do { try data.write(to: url, options: .atomic) } catch { model.say("Couldn't open \(d.name)"); return }
            OfficeLinkState.shared.document = url
        case "photo":
            guard let id = t.photoId, model.photo(id) != nil else { model.say("That photo was deleted"); return }
            OfficeLinkState.shared.photo = PhotoViewerItem(ids: [id], start: id)
        case "url":
            guard let u = webURL(t.url) else { model.say("That link can't be opened"); return }
            UIApplication.shared.open(u)
        default:
            break
        }
    }
}

/// The sheet's plan links: boxes and chips in one Canvas. Taps arrive through OfficeLinks.handleTap so the plan
/// keeps panning under them; VoiceOver gets one button per link on screen.
struct OfficeLinksLayer: View {
    let ctx: PlanOverlayContext
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    var body: some View {
        if OfficeOverlayPrefs.shared.links {
            let items = OfficeLinks.placed(ctx)
            if !items.isEmpty {
                let model = ctx.model, controller = ctx.controller
                ZStack(alignment: .topLeading) {
                    Canvas { g, _ in
                        for l in items { Self.draw(l, in: &g) }
                    }
                    if voiceOver {
                        ForEach(items) { l in
                            Color.clear
                                .frame(width: max(44, l.rect.width), height: max(44, l.rect.height))
                                .position(x: l.rect.midX, y: l.rect.midY)
                                .accessibilityElement()
                                .accessibilityLabel(l.broken ? "Plan link, \(l.chip)" : "Open \(l.chip)")
                                .accessibilityAddTraits(.isButton)
                                .accessibilityAction { OfficeLinks.follow(l.link, model: model, controller: controller) }
                        }
                    }
                }
            }
        }
    }

    static func draw(_ l: PlacedLink, in g: inout GraphicsContext) {
        let red = Color(hex: "#ef4444"), grey = Color(hex: "#94a3b8")
        let box = Path(roundedRect: l.rect, cornerRadius: min(l.rect.width, l.rect.height) * 0.22)
        g.fill(box, with: .color((l.broken ? grey : red).opacity(l.broken ? 0.22 : 0.16)))
        g.stroke(box, with: .color(l.broken ? grey : red), style: StrokeStyle(lineWidth: 1.75, dash: l.broken ? [4, 3] : []))
        // The chip only once the box is big enough on screen to tell which callout it belongs to.
        guard !l.chip.isEmpty, l.rect.width >= 14 else { return }
        let t = g.resolve(Text(l.broken ? l.chip : "→ \(l.chip)").font(.caption2.weight(.semibold)).foregroundColor(.white))
        let size = t.measure(in: CGSize(width: 200, height: 30))
        let chip = CGRect(x: l.rect.minX, y: l.rect.minY - size.height - 6, width: size.width + 10, height: size.height + 4)
        g.fill(Path(roundedRect: chip, cornerRadius: 4), with: .color(l.broken ? grey : red))
        g.draw(t, at: CGPoint(x: chip.midX, y: chip.midY))
    }
}

/// Shows what a link tap opened (a photo or a document). Lives in the viewer's controls column, which stays put
/// while the plan moves; it takes no space.
struct OfficeLinkPresenter: View {
    let model: EditorModel
    @State private var state = OfficeLinkState.shared

    var body: some View {
        @Bindable var st = state
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .fullScreenCover(item: $st.photo) { v in PhotoViewer(model: model, ids: v.ids, current: v.start) }
            .quickLookPreview($st.document)
            .onChange(of: st.document) { old, new in
                if new == nil, let old { try? FileManager.default.removeItem(at: old.deletingLastPathComponent()) }
            }
    }
}
