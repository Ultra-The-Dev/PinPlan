import SwiftUI
import UIKit
import PinPlanCore

// What the office drew on the web, shown read-only on the plan through the overlay registry (Viewer/PlanOverlay.swift,
// docs/plan-viewer-ios.md):
//   • "office-markups": redlines, clouds, arrows and notes (PlanMarkup). Private ones only for their author.
//   • "office-measurements": saved measurements, with the value worked out from the plan's scale (Measure/).
//   • "office-links": plan links (SheetLink) as red boxes; a tap opens the other plan, a document, a photo or a web
//     page (Markups/OfficeLinks.swift).
// Nothing here counts: the takeoff only ever counts devices and wire runs. Each one has a switch in Layers.
// Registered once from TaskOverlays.register() (PinPlanApp).

enum OfficeOverlays {
    @MainActor static func register() {
        let registry = PlanOverlayRegistry.shared
        registry.register(PlanOverlay(id: "office-markups", zIndex: 10, content: { ctx in
            AnyView(OfficeMarkupsLayer(ctx: ctx))
        }))
        registry.register(PlanOverlay(id: "office-measurements", zIndex: 12, content: { ctx in
            AnyView(OfficeMeasurementsLayer(ctx: ctx))
        }))
        registry.register(PlanOverlay(id: "office-links", zIndex: 14, content: { ctx in
            AnyView(OfficeLinksLayer(ctx: ctx))
        }, onTap: { tap in
            OfficeLinks.handleTap(tap)
        }, controls: { ctx in
            AnyView(OfficeLinkPresenter(model: ctx.model))
        }))
    }
}

/// Which of the office's drawings show on the plan (this device; Layers › Drawn on the web). Hiding never changes
/// anything saved.
@MainActor
@Observable
final class OfficeOverlayPrefs {
    static let shared = OfficeOverlayPrefs()
    private static let key = "pinplan.officeOverlays"

    var markups: Bool { didSet { save() } }
    var measurements: Bool { didSet { save() } }
    var links: Bool { didSet { save() } }

    private init() {
        let d = UserDefaults.standard.dictionary(forKey: Self.key) as? [String: Bool] ?? [:]
        markups = d["markups"] ?? true
        measurements = d["measurements"] ?? true
        links = d["links"] ?? true
    }

    private func save() {
        UserDefaults.standard.set(["markups": markups, "measurements": measurements, "links": links], forKey: Self.key)
    }
}

/// One shape ready to draw (view points), worked out outside the Canvas.
struct OverlayStroke {
    var path: Path
    var color: Color
    var lineWidth: CGFloat
    var opacity: Double = 1
    var fill: Bool = false
    var dash: [CGFloat] = []
}

/// A text note ready to draw (view points).
struct OverlayNote {
    var box: CGRect
    var lines: [String]
    var color: Color
    var fontSize: CGFloat
    var pad: CGFloat
}

// MARK: - markups

/// Shapes for the sheet's markups on screen, same drawing as the web export (drawMarkupsOnCanvas in markups.ts).
enum OfficeMarkupDrawing {
    /// Live markups on a sheet that this person may see, oldest first (later ones draw on top).
    @MainActor static func markups(_ model: EditorModel, sheetId: String, userId: String?) -> [PlanMarkup] {
        model.bundle.livePlanMarkups
            .filter { $0.sheetId == sheetId && FieldParity.Markup.canSee(isPrivate: $0.private, authorId: $0.authorId, userId: userId) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    @MainActor static func shapes(_ list: [PlanMarkup], ctx: PlanOverlayContext) -> (strokes: [OverlayStroke], notes: [OverlayNote]) {
        let size = ctx.viewport.displayedSize
        let sw = CGFloat(size.width), sh = CGFloat(size.height)
        guard sw > 0, sh > 0 else { return ([], []) }
        let view = CGRect(x: 0, y: 0, width: ctx.viewport.viewSize.width, height: ctx.viewport.viewSize.height).insetBy(dx: -40, dy: -40)
        var strokes: [OverlayStroke] = []
        var notes: [OverlayNote] = []
        for m in list {
            let pts = stride(from: 0, to: m.points.count - 1, by: 2).map { ctx.point(m.points[$0], m.points[$0 + 1]) }
            guard let first = pts.first else { continue }
            let color = Color(hex: m.private == true ? FieldParity.Markup.privateColor : m.color)
            let lw = max(1, CGFloat(m.width > 0 ? m.width : FieldParity.Markup.defaultWidth) * sw)
            if m.kind == .text {
                let fs = CGFloat(m.fontSize ?? FieldParity.Markup.defaultFontSize) * sw
                guard fs >= 4 else { continue } // too small to read at this zoom
                let lines = FieldParity.Markup.textLines(m.text)
                let longest = CGFloat(max(1, lines.map(\.count).max() ?? 1))
                let pad = CGFloat(FieldParity.Markup.textPad) * fs
                let box = CGRect(x: first.x, y: first.y, width: longest * fs * 0.6 + 2 * pad, height: CGFloat(lines.count) * fs * 1.25 + 2 * pad)
                if box.intersects(view) { notes.append(OverlayNote(box: box, lines: lines, color: color, fontSize: fs, pad: pad)) }
                continue
            }
            guard pts.count >= 2 else { continue }
            let bounds = pts.reduce(CGRect(origin: first, size: .zero)) { $0.union(CGRect(origin: $1, size: .zero)) }
            guard bounds.insetBy(dx: -lw * 6, dy: -lw * 6).intersects(view) else { continue }
            switch m.kind {
            case .highlight:
                strokes.append(OverlayStroke(path: polyline(pts), color: color, lineWidth: lw * CGFloat(FieldParity.Markup.highlightFactor),
                                             opacity: FieldParity.Markup.highlightOpacity))
            case .pen, .line, .text:
                strokes.append(OverlayStroke(path: polyline(pts), color: color, lineWidth: lw))
            case .arrow:
                strokes.append(OverlayStroke(path: polyline(pts), color: color, lineWidth: lw))
                let flat = pts.flatMap { [Double($0.x), Double($0.y)] }
                let head = FieldParity.Markup.arrowHead(flat, size: Double(max(lw * 5, sw * 0.008)))
                if head.count == 6 {
                    var p = polyline(stride(from: 0, to: 6, by: 2).map { CGPoint(x: head[$0], y: head[$0 + 1]) })
                    p.closeSubpath()
                    strokes.append(OverlayStroke(path: p, color: color, lineWidth: 0, fill: true))
                }
            case .rect:
                strokes.append(OverlayStroke(path: Path(box(pts[0], pts[1])), color: color, lineWidth: lw))
            case .ellipse:
                strokes.append(OverlayStroke(path: Path(ellipseIn: box(pts[0], pts[1])), color: color, lineWidth: lw))
            case .cloud:
                let arc = Double(max(sw, sh)) * 0.014
                let c = FieldParity.Markup.cloudPath(Double(pts[0].x), Double(pts[0].y), Double(pts[1].x), Double(pts[1].y), arcSize: arc)
                var p = polyline(stride(from: 0, to: c.count - 1, by: 2).map { CGPoint(x: c[$0], y: c[$0 + 1]) })
                p.closeSubpath()
                strokes.append(OverlayStroke(path: p, color: color, lineWidth: lw))
            }
        }
        return (strokes, notes)
    }

    static func polyline(_ pts: [CGPoint]) -> Path {
        var p = Path()
        guard let first = pts.first else { return p }
        p.move(to: first)
        for q in pts.dropFirst() { p.addLine(to: q) }
        return p
    }

    static func box(_ a: CGPoint, _ b: CGPoint) -> CGRect {
        CGRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(b.x - a.x), height: abs(b.y - a.y))
    }

    static func draw(_ s: OverlayStroke, in g: inout GraphicsContext) {
        if s.fill {
            g.drawLayer { l in
                l.opacity = s.opacity
                l.fill(s.path, with: .color(s.color))
            }
            return
        }
        g.drawLayer { l in
            l.opacity = s.opacity
            l.stroke(s.path, with: .color(s.color), style: StrokeStyle(lineWidth: s.lineWidth, lineCap: .round, lineJoin: .round, dash: s.dash))
        }
    }

    static func draw(_ n: OverlayNote, in g: inout GraphicsContext) {
        let shape = Path(n.box)
        g.fill(shape, with: .color(Color.white.opacity(0.9)))
        g.stroke(shape, with: .color(n.color), lineWidth: max(1, n.fontSize * 0.08))
        for (i, line) in n.lines.enumerated() {
            let t = g.resolve(Text(line).font(.system(size: n.fontSize, weight: .bold)).foregroundColor(n.color))
            g.draw(t, at: CGPoint(x: n.box.minX + n.pad, y: n.box.minY + n.pad + CGFloat(i) * n.fontSize * 1.25), anchor: .topLeading)
        }
    }
}

/// The office's redlines on this sheet, one Canvas, culled to the screen. Read-only: touches go to the plan.
struct OfficeMarkupsLayer: View {
    @Environment(AppModel.self) private var app
    let ctx: PlanOverlayContext

    var body: some View {
        if OfficeOverlayPrefs.shared.markups {
            let list = OfficeMarkupDrawing.markups(ctx.model, sheetId: ctx.sheet.id, userId: app.cloud.session?.userId)
            if !list.isEmpty {
                let shapes = OfficeMarkupDrawing.shapes(list, ctx: ctx)
                Canvas { g, _ in
                    for s in shapes.strokes { OfficeMarkupDrawing.draw(s, in: &g) }
                    for n in shapes.notes { OfficeMarkupDrawing.draw(n, in: &g) }
                }
                .accessibilityElement()
                .accessibilityLabel("\(list.count) markup\(list.count == 1 ? "" : "s") from the office on this plan")
            }
        }
    }
}
