import UIKit
import PinPlanCore

/// Builds a ready-to-explore demo job (4 floors with simple drawn plans and some placed devices),
/// so a new user can try every feature before importing their own plans.
enum DemoProject {
    static func make(store: Store, catalog: [DeviceType], pricing: PricingSettings) -> ProjectBundle {
        var b = ProjectBundle(project: Project(clientName: "Demo client", address: "Demo — 20 Hilltop Dr E"))
        let floors = ["Attic", "1st Fl", "2nd Fl", "Cellar"]
        let size = CGSize(width: 3200, height: 2200)
        for (i, name) in floors.enumerated() {
            let img = drawPlan(name: name, size: size, cellar: name == "Cellar")
            guard let id = store.saveImage(img, quality: 0.85) else { continue }
            // 1/8" = 1'-0" drawn at 100 px per paper inch → 12.5 px per foot.
            b.sheets.append(Sheet(projectId: b.project.id, name: name, pageNumber: i + 1, order: i, imageId: id,
                                  width: size.width, height: size.height, pxPerInch: 100, pxPerFt: 12.5))
            b.sheets[b.sheets.count - 1].scaleLabel = "1/8\" = 1'-0\""
        }
        func t(_ id: String) -> DeviceType? { catalog.first { $0.id == id } }
        let cellar = b.sheets[3].id, first = b.sheets[1].id
        b.addCloset(kind: .equipment, sheetId: cellar, x: 0.3, y: 0.72)
        let placements: [(String, String, Double, Double, String)] = [
            (first, "cam-indoor", 0.22, 0.25, "Living"), (first, "cam-indoor", 0.62, 0.25, "Kitchen"),
            (first, "cam-outdoor", 0.06, 0.08, "Exterior"), (first, "cam-outdoor", 0.94, 0.08, "Exterior"),
            (first, "wap", 0.45, 0.45, "Hall"), (first, "speaker", 0.2, 0.4, "Living"), (first, "speaker", 0.33, 0.4, "Living"),
            (first, "tv", 0.15, 0.3, "Living"), (first, "sh", 0.5, 0.65, "Hall"),
        ]
        for (sheet, type, x, y, room) in placements {
            if let dt = t(type) { b.addMarker(type: dt, sheetId: sheet, x: x, y: y, room: room) }
        }
        b.addRun(Run(projectId: b.project.id, sheetId: first, kind: .led, deviceTypeId: "led-ceiling",
                     points: [0.1, 0.12, 0.42, 0.12, 0.42, 0.5], zone: "1", switchLabel: "S21"))
        b.addRun(Run(projectId: b.project.id, sheetId: first, kind: .stair, deviceTypeId: "led-stair",
                     points: [0.8, 0.55, 0.8, 0.85], zone: "2", switchLabel: "S5", steps: 14, lfPerStep: 3.5))
        b.autoHomeRuns(catalog: catalog, pricing: pricing)
        return b
    }

    private static func drawPlan(name: String, size: CGSize, cellar: Bool) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let c = ctx.cgContext
            UIColor.white.setFill(); c.fill(CGRect(origin: .zero, size: size))
            UIColor.black.setStroke()
            c.setLineWidth(14)
            c.stroke(CGRect(x: 160, y: 140, width: 2600, height: 1700))
            c.setLineWidth(8)
            for (a, b) in [((1100.0, 140.0), (1100.0, 1000.0)), ((160.0, 1000.0), (2000.0, 1000.0)), ((2000.0, 600.0), (2000.0, 1840.0))] {
                c.move(to: CGPoint(x: a.0, y: a.1)); c.addLine(to: CGPoint(x: b.0, y: b.1))
            }
            c.strokePath()
            // Stair treads
            c.setLineWidth(3)
            for i in 0..<14 { let y = 1200.0 + Double(i) * 40; c.move(to: CGPoint(x: 2400, y: y)); c.addLine(to: CGPoint(x: 2700, y: y)) }
            c.strokePath()
            let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 52, weight: .medium), .foregroundColor: UIColor.darkGray]
            for (text, p) in [("LIVING", CGPoint(x: 520, y: 520)), ("KITCHEN", CGPoint(x: 1400, y: 520)),
                              (cellar ? "AV EQUIPMENT" : "BEDROOM", CGPoint(x: 820, y: 1380)), ("STAIR", CGPoint(x: 2440, y: 1100))] {
                NSAttributedString(string: text, attributes: attrs).draw(at: p)
            }
            NSAttributedString(string: "S21,22,23  24 LF", attributes: [.font: UIFont.systemFont(ofSize: 40), .foregroundColor: UIColor.systemRed])
                .draw(at: CGPoint(x: 1200, y: 220))
            // Title block
            c.setLineWidth(5)
            c.stroke(CGRect(x: 2800, y: 1880, width: 380, height: 300))
            NSAttributedString(string: "PINPLAN DEMO\nLED BACKLIT STRIPS", attributes: [.font: UIFont.systemFont(ofSize: 26), .foregroundColor: UIColor.black])
                .draw(in: CGRect(x: 2820, y: 1900, width: 340, height: 80))
            NSAttributedString(string: name.uppercased(), attributes: [.font: UIFont.systemFont(ofSize: 64, weight: .bold), .foregroundColor: UIColor.black])
                .draw(at: CGPoint(x: 2820, y: 1990))
            NSAttributedString(string: "SCALE 1/8\" = 1'-0\"", attributes: [.font: UIFont.systemFont(ofSize: 26), .foregroundColor: UIColor.black])
                .draw(at: CGPoint(x: 2820, y: 2100))
            // Scale bar: 20 ft at 12.5 px/ft = 250 px
            c.setLineWidth(6)
            c.move(to: CGPoint(x: 160, y: 1960)); c.addLine(to: CGPoint(x: 410, y: 1960)); c.strokePath()
            NSAttributedString(string: "20'-0\"", attributes: [.font: UIFont.systemFont(ofSize: 34), .foregroundColor: UIColor.black]).draw(at: CGPoint(x: 430, y: 1938))
        }
    }
}
