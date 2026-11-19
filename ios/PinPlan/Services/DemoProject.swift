import UIKit
import CoreImage
import PinPlanCore

/// Builds a ready-to-explore demo job (4 floors with simple drawn plans and some placed devices),
/// so a new user can try every feature before importing their own plans.
enum DemoProject {
    static func make(store: Store, catalog: [DeviceType], pricing: PricingSettings) -> ProjectBundle {
        var b = ProjectBundle(project: Project(clientName: "Demo client", address: "Demo — 12 Maple Ridge Rd"))
        let floors = ["Attic", "1st Fl", "2nd Fl", "Cellar"]
        // A real vector PDF (17 × 11 in sheets), imported exactly like an architect's plan set:
        // pages rendered from vector, floor names and the printed scale read from each page's text.
        let pdf = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 17 * 72, height: 11 * 72)).pdfData { ctx in
            for name in floors {
                ctx.beginPage()
                let k = (17 * 72) / designSize.width
                ctx.cgContext.scaleBy(x: k, y: k)
                drawPlanContent(ctx.cgContext, name: name, cellar: name == "Cellar")
            }
        }
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("pinplan-demo.pdf")
        try? pdf.write(to: tmp)
        if let r = try? PlanImporter.sheets(fromPDF: tmp, store: store, projectId: b.project.id, startOrder: 0,
                                            fallbackName: { floors[min($0, floors.count - 1)] }) {
            b.sheets = r.sheets
        }
        guard b.sheets.count == 4 else { return b }
        func t(_ id: String) -> DeviceType? { catalog.first { $0.id == id } }
        let attic = b.sheets[0].id, cellar = b.sheets[3].id, first = b.sheets[1].id, second = b.sheets[2].id
        b.addCloset(kind: .equipment, sheetId: cellar, x: 0.3, y: 0.72)
        let placements: [(String, String, Double, Double, String)] = [
            (first, "cam-indoor", 0.22, 0.25, "Living"), (first, "cam-indoor", 0.62, 0.25, "Kitchen"),
            (first, "cam-outdoor", 0.06, 0.08, "Exterior"), (first, "cam-outdoor", 0.94, 0.08, "Exterior"),
            (first, "wap", 0.45, 0.45, "Hall"), (first, "speaker", 0.2, 0.4, "Living"), (first, "speaker", 0.33, 0.4, "Living"),
            (first, "tv", 0.15, 0.3, "Living"), (first, "sh", 0.5, 0.65, "Hall"),
            (attic, "cam-indoor", 0.3, 0.3, "Storage"), (attic, "wap", 0.5, 0.45, "Attic"), (attic, "tv", 0.25, 0.6, "Gym"),
            (second, "cam-indoor", 0.2, 0.3, "Primary"), (second, "speaker", 0.4, 0.3, "Primary"), (second, "shade", 0.1, 0.2, "Primary"),
            (second, "vs", 0.55, 0.65, "Hall"), (cellar, "cam-indoor", 0.6, 0.3, "Wine room"), (cellar, "tv", 0.7, 0.5, "Theater"),
            (cellar, "net-switch", 0.32, 0.65, "AV Equipment"),
        ]
        for (sheet, type, x, y, room) in placements {
            if let dt = t(type) { b.addMarker(type: dt, sheetId: sheet, x: x, y: y, room: room) }
        }
        b.addRun(Run(projectId: b.project.id, sheetId: first, kind: .led, deviceTypeId: "led-ceiling",
                     points: [0.1, 0.12, 0.42, 0.12, 0.42, 0.5], zone: "1", switchLabel: "S21"))
        b.addRun(Run(projectId: b.project.id, sheetId: first, kind: .stair, deviceTypeId: "led-stair",
                     points: [0.8, 0.55, 0.8, 0.85], zone: "2", switchLabel: "S5", steps: 14, lfPerStep: 3.5))
        b.addRun(Run(projectId: b.project.id, sheetId: attic, kind: .led, deviceTypeId: "led-ceiling",
                     points: [0.08, 0.1, 0.62, 0.1], typedFt: 24, zone: "1", switchLabel: "S21"))
        // Two marked "?" on the plan: kept optional on the estimate.
        if let spk = t("speaker") { b.addMarker(type: spk, sheetId: first, x: 0.62, y: 0.4, room: "Kitchen", tentative: true) }
        // TVs get a bundle: one HDMI and two Cat6 along the same home run.
        for m in b.liveMarkers where m.deviceTypeId == "tv" {
            b.updateMarker(m.id, pricing: pricing) { $0.setCables(["HDMI", "Cat6", "Cat6"]) }
        }
        b.autoHomeRuns(catalog: catalog, pricing: pricing)
        // Sample installed prices on this demo job only (your catalog stays unpriced until you set real prices),
        // so the estimate, PDF and Billdu flow show real numbers.
        let samplePrices: [String: Double] = [
            "cam-indoor": 325, "cam-outdoor": 450, "vs": 600, "wap": 395, "net-switch": 850, "data-drop": 145, "speaker": 285,
            "tv": 225, "sh": 180, "keypad": 260, "led-ceiling": 28, "led-furniture": 32, "led-cabinet": 30, "led-bench": 30,
            "led-bed": 34, "led-stair": 32, "led-spot-ceiling": 95, "led-driver": 240, "shade": 1150,
        ]
        let estimate = EstimateBuilder.build(takeoff: TakeoffCalculator.compute(b), catalog: catalog, pricing: pricing)
        for line in estimate.lines where line.unitPrice == 0 {
            let price: Double?
            if let id = line.deviceTypeId { price = samplePrices[id] }
            else if line.key.hasPrefix("wire:") { price = 0.65 }
            else if line.key.hasPrefix("closet:") { price = 1200 }
            else { price = nil }
            if let price { b.upsertEstimateLine(key: line.key) { $0.unitPrice = price } }
        }
        addFieldSamples(&b, store: store)
        return b
    }

    /// Sample site photos (with mark-up, tags, comments, a device link and a before/after pair), a pre-wire checklist
    /// and a daily log, so the Photos and Field tabs have something to explore.
    static func addFieldSamples(_ b: inout ProjectBundle, store: Store) {
        let pid = b.project.id
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let day = 86400.0
        let now = Date()
        let shots: [(String, [String], String, Double, Int)] = [
            ("Living room camera bracket and Cat6 in place", ["Pre-wire", "Camera"], "Living", 2 * day, 0),
            ("Speaker back boxes, living room ceiling", ["Pre-wire", "Audio"], "Living", 2 * day - 1800, 1),
            ("TV wall: HDMI + 2× Cat6 bundle at 60\"", ["Pre-wire", "TV"], "Living", 2 * day - 3600, 2),
            ("Cables labeled and home-run to the closet", ["Pre-wire", "Rack"], "AV Equipment", day, 3),
            ("Rack dressed and patched", ["Rack", "Completed"], "AV Equipment", 3600, 4),
            ("Living room camera mounted", ["Trim-out", "Camera", "After"], "Living", 1800, 5),
        ]
        var photos: [Photo] = []
        for (i, s) in shots.enumerated() {
            let img = sitePhoto(s.4)
            guard let data = img.jpegData(compressionQuality: 0.8), let imageId = store.saveImageData(data, image: img) else { continue }
            var p = Photo(projectId: pid, imageId: imageId, width: img.size.width, height: img.size.height,
                          takenAt: iso.string(from: now.addingTimeInterval(-s.3)), takenBy: i % 2 == 0 ? "Alex" : "Sam", lat: 40.7486, lng: -73.9857)
            p.caption = s.0; p.tags = s.1; p.room = s.2
            p.createdAt = p.takenAt   // as if uploaded on site, so the timeline reads in order
            photos.append(p)
        }
        guard photos.count == 6 else { return }
        if let cam = b.liveMarkers.first(where: { $0.deviceTypeId == "cam-indoor" && $0.room == "Living" }) {
            for i in [0, 5] { photos[i].markerId = cam.id; photos[i].sheetId = cam.sheetId }
        }
        photos[5].beforeId = photos[0].id
        photos[0].annotations = [
            PhotoShape(kind: .arrow, color: "#ef4444", width: 0.007, points: [0.18, 0.2, 0.42, 0.42]),
            PhotoShape(kind: .text, color: "#ffffff", width: 0.007, points: [0.08, 0.1], text: "Camera here, 7 ft"),
            PhotoShape(kind: .circle, color: "#f59e0b", width: 0.006, points: [0.4, 0.38, 0.62, 0.66]),
        ]
        for p in photos { b.save(p, in: \.photos) }
        b.project.lat = 40.7486; b.project.lng = -73.9857
        func comment(_ photo: Photo, _ who: String, _ text: String, after: Double) {
            var c = PhotoComment(projectId: pid, photoId: photo.id, author: who, text: text)
            c.createdAt = iso.string(from: (FieldDocs.date(photo.takenAt) ?? now).addingTimeInterval(after))
            b.save(c, in: \.photoComments)
        }
        comment(photos[0], "Sam", "Client asked to move this 6 in. to the left — done.", after: 900)
        comment(photos[3], "Alex", "All 24 runs tested and labeled.", after: 600)
        if let t = FieldDocs.templates.first(where: { $0.id == "prewire" }) {
            var c = FieldDocs.checklist(from: t, projectId: pid)
            c.createdAt = iso.string(from: now.addingTimeInterval(-2 * day - 7200))
            for i in 0..<3 { c.items[i].done = true; c.items[i].doneBy = "Alex"; c.items[i].doneAt = iso.string(from: now.addingTimeInterval(-day)) }
            b.save(c, in: \.checklists)
            for (k, item) in [(0, 0), (1, 1)] {
                b.update([photos[k].id], in: \.photos) { $0.checklistId = c.id; $0.checklistItemId = c.items[item].id }
            }
        }
        var log = JobLog(projectId: pid, date: FieldDocs.localDay(iso.string(from: now.addingTimeInterval(-2 * day))), title: "Pre-wire, 1st floor",
                         body: "Crew: Alex, Sam.\n- Camera, speaker and TV boxes set in the living room\n- TV wall bundle pulled (HDMI + 2× Cat6)\n- Next: 2nd floor and the cellar closet", author: "Alex")
        log.photoIds = Array(photos.prefix(3).map(\.id))
        log.createdAt = iso.string(from: now.addingTimeInterval(-2 * day + 3 * 3600))
        b.save(log, in: \.jobLogs)
        b.project.labels = ["Pre-wire"]
    }

    /// A simple drawn "site photo": an open stud wall with a box, cables and a bracket (no real photos in the repo).
    static func sitePhoto(_ n: Int) -> UIImage {
        let size = CGSize(width: 1600, height: 1200)
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: size, format: fmt).image { r in
            let c = r.cgContext
            let tones: [UIColor] = [UIColor(red: 0.82, green: 0.76, blue: 0.66, alpha: 1), UIColor(red: 0.74, green: 0.72, blue: 0.70, alpha: 1)]
            c.setFillColor(tones[n % 2].cgColor); c.fill(CGRect(origin: .zero, size: size))
            if n == 4 || n == 5 {
                // Finished: a rack or a mounted camera on a white wall.
                c.setFillColor(UIColor(white: n == 4 ? 0.2 : 0.95, alpha: 1).cgColor); c.fill(CGRect(origin: .zero, size: size))
                if n == 4 {
                    for i in 0..<9 {
                        c.setFillColor(UIColor(white: 0.1 + Double(i % 3) * 0.05, alpha: 1).cgColor)
                        c.fill(CGRect(x: 420, y: 140 + i * 105, width: 760, height: 90))
                        for j in 0..<16 { c.setFillColor([UIColor.systemBlue, .systemGreen, .systemYellow][j % 3].cgColor); c.fill(CGRect(x: 450 + j * 44, y: 175 + i * 105, width: 24, height: 20)) }
                    }
                } else {
                    c.setFillColor(UIColor.white.cgColor); c.fillEllipse(in: CGRect(x: 560, y: 420, width: 300, height: 300))
                    c.setStrokeColor(UIColor(white: 0.75, alpha: 1).cgColor); c.setLineWidth(6); c.strokeEllipse(in: CGRect(x: 560, y: 420, width: 300, height: 300))
                    c.setFillColor(UIColor(white: 0.1, alpha: 1).cgColor); c.fillEllipse(in: CGRect(x: 650, y: 510, width: 120, height: 120))
                }
                return
            }
            // Studs, a low-voltage bracket and cables.
            for x in stride(from: 80, to: 1600, by: 360) {
                c.setFillColor(UIColor(red: 0.72, green: 0.55, blue: 0.36, alpha: 1).cgColor); c.fill(CGRect(x: x, y: 0, width: 70, height: 1200))
            }
            c.setFillColor(UIColor(red: 0.12, green: 0.35, blue: 0.85, alpha: 1).cgColor); c.fill(CGRect(x: 600 + n * 40, y: 480, width: 170, height: 240))
            let colors: [UIColor] = [.systemBlue, .systemPurple, .black, .systemOrange]
            for (i, col) in colors.prefix(2 + n % 3).enumerated() {
                c.setStrokeColor(col.cgColor); c.setLineWidth(18)
                c.move(to: CGPoint(x: 680 + n * 40 + i * 20, y: 480)); c.addCurve(to: CGPoint(x: 700 + i * 60, y: 0), control1: CGPoint(x: 600, y: 300), control2: CGPoint(x: 900, y: 150))
                c.strokePath()
            }
        }
    }

    /// A realistic test "photo": the demo plan lying tilted on a darker table with uneven lighting.
    static func samplePhoto() -> UIImage {
        let plan = drawPlan(name: "1st Fl", size: CGSize(width: 1600, height: 1100), cellar: false)
        guard let ci = CIImage(image: plan) else { return plan }
        let W: CGFloat = 2000, H: CGFloat = 1500
        let warp = CIFilter(name: "CIPerspectiveTransform", parameters: [
            kCIInputImageKey: ci,
            "inputTopLeft": CIVector(x: 260, y: 1330), "inputTopRight": CIVector(x: 1760, y: 1260),
            "inputBottomRight": CIVector(x: 1850, y: 180), "inputBottomLeft": CIVector(x: 150, y: 260),
        ])!.outputImage!
        let table = CIImage(color: CIColor(red: 0.33, green: 0.29, blue: 0.25)).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))
        let composed = warp.composited(over: table)
        // Shadow falling across the page from one side.
        let gradient = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: 0), "inputPoint1": CIVector(x: W, y: H),
            "inputColor0": CIColor(red: 0.55, green: 0.55, blue: 0.58), "inputColor1": CIColor(red: 1, green: 1, blue: 0.97),
        ])!.outputImage!.cropped(to: composed.extent)
        let shaded = CIFilter(name: "CIMultiplyCompositing", parameters: [kCIInputImageKey: gradient, kCIInputBackgroundImageKey: composed])!.outputImage!
        guard let cg = ScanProcessing.context.createCGImage(shaded, from: CGRect(x: 0, y: 0, width: W, height: H)) else { return plan }
        return UIImage(cgImage: cg)
    }

    /// Drawing units: 3200 × 2072 for a 17 × 11 in sheet (≈188 units per paper inch). At 1/8" = 1'-0", 1 ft = 23.5 units.
    static let designSize = CGSize(width: 3200, height: 2071)

    private static func drawPlan(name: String, size: CGSize, cellar: Bool) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.white.setFill()
            ctx.cgContext.fill(CGRect(origin: .zero, size: size))
            ctx.cgContext.scaleBy(x: size.width / designSize.width, y: size.width / designSize.width)
            drawPlanContent(ctx.cgContext, name: name, cellar: cellar)
        }
    }

    /// Vector plan drawing (walls, doors, stair, room names, LED callout, title block with scale, scale bar).
    static func drawPlanContent(_ c: CGContext, name: String, cellar: Bool) {
        UIGraphicsPushContext(c)
        defer { UIGraphicsPopContext() }
        UIColor.black.setStroke()
        c.setLineWidth(12)
        c.stroke(CGRect(x: 160, y: 140, width: 2560, height: 1640))
        c.setLineWidth(7)
        for (a, b) in [((1100.0, 140.0), (1100.0, 980.0)), ((160.0, 980.0), (2000.0, 980.0)), ((2000.0, 600.0), (2000.0, 1780.0))] {
            c.move(to: CGPoint(x: a.0, y: a.1)); c.addLine(to: CGPoint(x: b.0, y: b.1))
        }
        c.strokePath()
        // Door swings
        c.setLineWidth(2.5)
        for (x, y) in [(1100.0, 760.0), (700.0, 980.0), (2000.0, 1300.0)] {
            c.addArc(center: CGPoint(x: x, y: y), radius: 90, startAngle: 0, endAngle: .pi / 2, clockwise: false)
            c.strokePath()
        }
        // Stair treads
        c.setLineWidth(2.5)
        for i in 0..<14 { let y = 1180.0 + Double(i) * 38; c.move(to: CGPoint(x: 2380, y: y)); c.addLine(to: CGPoint(x: 2680, y: y)) }
        c.strokePath()
        let room: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 46, weight: .medium), .foregroundColor: UIColor.darkGray]
        for (text, p) in [("LIVING", CGPoint(x: 520, y: 520)), ("KITCHEN", CGPoint(x: 1400, y: 520)),
                          (cellar ? "AV EQUIPMENT" : "BEDROOM", CGPoint(x: 820, y: 1360)), ("STAIR", CGPoint(x: 2440, y: 1090))] {
            NSAttributedString(string: text, attributes: room).draw(at: p)
        }
        // Fine print that only reads when zoomed in (shows off the vector detail).
        NSAttributedString(string: "Cabinet LED under uppers — driver in pantry, 24V, 3.2 W/ft. Verify run with millwork shop drawings.",
                           attributes: [.font: UIFont.systemFont(ofSize: 11), .foregroundColor: UIColor.darkGray])
            .draw(at: CGPoint(x: 1180, y: 900))
        NSAttributedString(string: "S21,22,23  24 LF", attributes: [.font: UIFont.systemFont(ofSize: 36), .foregroundColor: UIColor.systemRed])
            .draw(at: CGPoint(x: 1200, y: 200))
        // Title block
        c.setLineWidth(4)
        c.stroke(CGRect(x: 2760, y: 1700, width: 400, height: 330))
        NSAttributedString(string: "PINPLAN DEMO\nLED BACKLIT STRIPS (AMBIENT LIGHT)", attributes: [.font: UIFont.systemFont(ofSize: 22), .foregroundColor: UIColor.black])
            .draw(in: CGRect(x: 2780, y: 1715, width: 370, height: 80))
        NSAttributedString(string: name.uppercased(), attributes: [.font: UIFont.systemFont(ofSize: 60, weight: .bold), .foregroundColor: UIColor.black])
            .draw(at: CGPoint(x: 2780, y: 1810))
        NSAttributedString(string: "SCALE: 1/8\" = 1'-0\"", attributes: [.font: UIFont.systemFont(ofSize: 26, weight: .semibold), .foregroundColor: UIColor.black])
            .draw(at: CGPoint(x: 2780, y: 1960))
        // Scale bar: 20 ft at 1/8" = 1'-0" → 2.5 in → 470 units.
        c.setLineWidth(5)
        c.move(to: CGPoint(x: 160, y: 1880)); c.addLine(to: CGPoint(x: 630, y: 1880)); c.strokePath()
        for x in [160.0, 395.0, 630.0] { c.move(to: CGPoint(x: x, y: 1865)); c.addLine(to: CGPoint(x: x, y: 1895)) }
        c.strokePath()
        NSAttributedString(string: "0      10'      20'", attributes: [.font: UIFont.systemFont(ofSize: 26), .foregroundColor: UIColor.black]).draw(at: CGPoint(x: 150, y: 1900))
    }
}
