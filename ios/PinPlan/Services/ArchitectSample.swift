import UIKit
import PDFKit
import PinPlanCore

/// A second sample that looks like a real architect's sheet rather than the demo: 36 × 24 in at 1/4" = 1'-0",
/// stored portrait with a 90° page rotation (as many CAD exports are), with a dimension string, room names with
/// sizes on the line below, wrapped general notes, a vertical dimension, a switch callout and a title block.
/// It goes through the normal PDF import, so it exercises the same path as a user's plan set.
enum ArchitectSample {
    static func make(store: Store) -> ProjectBundle {
        var b = ProjectBundle(project: Project(clientName: "Sample architect", address: "Sample — architect plan set"))
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("pinplan-architect-sample.pdf")
        guard writePDF(to: url),
              let r = try? PlanImporter.sheets(fromPDF: url, store: store, projectId: b.project.id, startOrder: 0, fallbackName: { "Sheet \($0 + 1)" })
        else { return b }
        b.sheets = r.sheets
        return b
    }

    /// Displayed sheet: 36 × 24 in. Drawing units: 100 per paper inch, so 1 ft = 25 units at 1/4" = 1'-0".
    static let design = CGSize(width: 3600, height: 2400)
    private static let ft: CGFloat = 25
    private static let origin = CGPoint(x: 300, y: 420)

    private static func writePDF(to url: URL) -> Bool {
        let pageW: CGFloat = 24 * 72, pageH: CGFloat = 36 * 72   // stored portrait
        let data = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: pageW, height: pageH)).pdfData { ctx in
            ctx.beginPage()
            let c = ctx.cgContext
            // Content is drawn rotated 90° counter-clockwise; the page's /Rotate 90 turns it back for display.
            c.translateBy(x: 0, y: pageH)
            c.rotate(by: -.pi / 2)
            let k = pageH / design.width
            c.scaleBy(x: k, y: k)
            draw(c)
        }
        guard let doc = PDFDocument(data: data), let page = doc.page(at: 0) else { return false }
        page.rotation = 90
        return doc.write(to: url)
    }

    private static func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: origin.x + x * ft, y: origin.y + y * ft) }

    private static func text(_ s: String, at pt: CGPoint, size: CGFloat, weight: UIFont.Weight = .regular, color: UIColor = .black, centered: Bool = false) {
        let a = NSAttributedString(string: s, attributes: [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color])
        let w = a.size().width
        a.draw(at: centered ? CGPoint(x: pt.x - w / 2, y: pt.y) : pt)
    }

    private static func draw(_ c: CGContext) {
        UIGraphicsPushContext(c)
        defer { UIGraphicsPopContext() }
        UIColor.white.setFill(); c.fill(CGRect(origin: .zero, size: design))
        UIColor.black.setStroke()

        // Walls (feet): building 64' × 42'.
        c.setLineWidth(10)
        c.stroke(CGRect(origin: p(0, 0), size: CGSize(width: 64 * ft, height: 42 * ft)))
        c.setLineWidth(6)
        let walls: [((CGFloat, CGFloat), (CGFloat, CGFloat))] = [
            ((18.5, 0), (18.5, 42)), ((36.5, 0), (36.5, 16)), ((48, 0), (48, 14)), ((18.5, 16), (64, 16)),
            ((0, 22), (18.5, 22)), ((48, 12), (64, 12)), ((40, 16), (40, 42)),
        ]
        for (a, z) in walls { c.move(to: p(a.0, a.1)); c.addLine(to: p(z.0, z.1)) }
        c.strokePath()

        // Rooms: name, size on the line below.
        let rooms: [(String, String?, CGFloat, CGFloat)] = [
            ("GREAT ROOM", "18'-6\" x 22'-0\"", 9.25, 10), ("KITCHEN", "18'-0\" x 16'-0\"", 27.5, 7),
            ("OFFICE", "11'-6\" x 14'-0\"", 42.25, 6), ("MUD ROOM", nil, 56, 5),
            ("PRIMARY BEDROOM", "18'-6\" x 20'-0\"", 9.25, 31), ("PRIMARY BATH", nil, 29, 28), ("MECH / AV", nil, 52, 28),
        ]
        for (name, size, x, y) in rooms {
            text(name, at: p(x, y), size: 26, weight: .semibold, centered: true)
            if let size { text(size, at: p(x, y + 1.35), size: 20, centered: true) }
        }

        // Dimension string along the top, plus overall.
        c.setLineWidth(2)
        let marks: [CGFloat] = [0, 18.5, 36.5, 48, 64]
        for (row, ticks) in [(-3.0 as CGFloat, marks), (-6.0, [0, 64])] {
            c.move(to: p(0, row)); c.addLine(to: p(64, row))
            for m in ticks { c.move(to: p(m, row - 0.6)); c.addLine(to: p(m, row + 0.6)) }
        }
        c.strokePath()
        for (i, label) in ["18'-6\"", "18'-0\"", "11'-6\"", "16'-0\""].enumerated() {
            text(label, at: p((marks[i] + marks[i + 1]) / 2, -4.6), size: 20, centered: true)
        }
        text("64'-0\"", at: p(32, -7.6), size: 20, centered: true)

        // Vertical overall dimension on the left, rotated text.
        c.move(to: p(-3, 0)); c.addLine(to: p(-3, 42)); c.strokePath()
        c.saveGState()
        c.translateBy(x: p(-4.4, 21).x, y: p(-4.4, 21).y)
        c.rotate(by: -.pi / 2)
        text("42'-0\"", at: CGPoint(x: 0, y: -12), size: 20, centered: true)
        c.restoreGState()

        // Low-voltage callout.
        text("S1,S2  14 LF", at: p(21, 13.6), size: 20, weight: .medium, color: .systemRed)

        // General notes, each wrapping inside a fixed column.
        text("GENERAL NOTES", at: CGPoint(x: 2150, y: 420), size: 28, weight: .bold)
        let notes = [
            "1. ALL LOW VOLTAGE CABLING TO HOME RUN TO THE AV RACK IN MECH / AV. PROVIDE 2\" CONDUIT FROM RACK TO ATTIC.",
            "2. PROVIDE BLOCKING FOR ALL WALL-MOUNTED TVS AND SPEAKER BRACKETS BEFORE DRYWALL.",
            "3. VERIFY ALL DIMENSIONS IN FIELD. DO NOT SCALE DRAWINGS WHERE A DIMENSION IS GIVEN.",
        ]
        var y: CGFloat = 480
        let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 20), .foregroundColor: UIColor.black]
        for n in notes {
            let a = NSAttributedString(string: n, attributes: attrs)
            let r = a.boundingRect(with: CGSize(width: 1150, height: 400), options: [.usesLineFragmentOrigin], context: nil)
            a.draw(with: CGRect(x: 2150, y: y, width: 1150, height: r.height + 4), options: [.usesLineFragmentOrigin], context: nil)
            y += r.height + 28
        }

        // Title block.
        c.setLineWidth(4)
        c.stroke(CGRect(x: 2600, y: 1900, width: 900, height: 420))
        text("SAMPLE RESIDENCE", at: CGPoint(x: 2630, y: 1925), size: 24)
        text("FIRST FLOOR PLAN", at: CGPoint(x: 2630, y: 1975), size: 40, weight: .bold)
        text("SCALE: 1/4\" = 1'-0\"", at: CGPoint(x: 2630, y: 2045), size: 24, weight: .semibold)
        text("A-101", at: CGPoint(x: 3250, y: 2200), size: 64, weight: .heavy)
    }
}
