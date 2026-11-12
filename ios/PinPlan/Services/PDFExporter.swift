import UIKit
import SwiftUI
import PinPlanCore

/// PDF output: marked-up plan sheets (takeoff or crew wiring) and the client estimate.
enum PDFExporter {
    // MARK: drawing helpers

    private static func text(_ s: String, at p: CGPoint, size: CGFloat, weight: UIFont.Weight = .regular, color: UIColor = .black, align: NSTextAlignment = .left, width: CGFloat? = nil) {
        let para = NSMutableParagraphStyle()
        para.alignment = align
        let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: para]
        let str = NSAttributedString(string: s, attributes: attrs)
        if let width {
            let h = str.boundingRect(with: CGSize(width: width, height: 2000), options: [.usesLineFragmentOrigin], context: nil).height
            str.draw(in: CGRect(x: p.x, y: p.y, width: width, height: ceil(h)))
        } else {
            str.draw(at: p)
        }
    }

    private static func textHeight(_ s: String, size: CGFloat, width: CGFloat) -> CGFloat {
        NSAttributedString(string: s, attributes: [.font: UIFont.systemFont(ofSize: size)])
            .boundingRect(with: CGSize(width: width, height: 2000), options: [.usesLineFragmentOrigin], context: nil).height
    }

    static func drawSymbol(_ ctx: CGContext, type: DeviceType, at c: CGPoint, r: CGFloat, tentative: Bool, label: String?) {
        let color = UIColor(hex: type.color)
        let path = SymbolGeometry.cgPath(type.shape, center: c, radius: r)
        ctx.saveGState()
        ctx.addPath(path); ctx.setFillColor(UIColor.white.cgColor); ctx.fillPath()
        ctx.addPath(path); ctx.setStrokeColor(color.cgColor); ctx.setLineWidth(r * 0.22)
        if tentative { ctx.setLineDash(phase: 0, lengths: [r * 0.4, r * 0.3]) }
        ctx.strokePath()
        ctx.restoreGState()
        let fs = r * (type.symbol.count > 2 ? 0.62 : type.symbol.count > 1 ? 0.8 : 1.0)
        let font = UIFont.systemFont(ofSize: fs, weight: .bold)
        let str = NSAttributedString(string: type.symbol, attributes: [.font: font, .foregroundColor: color])
        let sz = str.size()
        str.draw(at: CGPoint(x: c.x - sz.width / 2, y: c.y - sz.height / 2 + (type.shape == .triangle ? r * 0.2 : 0)))
        if tentative {
            NSAttributedString(string: "?", attributes: [.font: UIFont.systemFont(ofSize: r * 0.9, weight: .heavy), .foregroundColor: UIColor.systemRed])
                .draw(at: CGPoint(x: c.x + r * 0.9, y: c.y - r * 1.5))
        }
        if let label {
            let l = NSAttributedString(string: label, attributes: [.font: UIFont.systemFont(ofSize: r * 0.55), .foregroundColor: UIColor.darkText])
            l.draw(at: CGPoint(x: c.x - l.size().width / 2, y: c.y + r * 1.3))
        }
    }

    /// Render one sheet with its markup into `rect`.
    static func drawSheet(_ ctx: CGContext, sheet: Sheet, image: UIImage?, bundle: ProjectBundle, catalog: [DeviceType], layers: Set<Layer>?, labels: Bool, in rect: CGRect) {
        let k = min(rect.width / sheet.width, rect.height / sheet.height)
        let W = sheet.width * k, H = sheet.height * k
        let o = CGPoint(x: rect.minX + (rect.width - W) / 2, y: rect.minY + (rect.height - H) / 2)
        func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: o.x + x * W, y: o.y + y * H) }
        let show: (Layer) -> Bool = { layers == nil || layers!.contains($0) }
        image?.draw(in: CGRect(x: o.x, y: o.y, width: W, height: H), blendMode: .normal, alpha: 0.85)
        ctx.setStrokeColor(UIColor.lightGray.cgColor); ctx.setLineWidth(0.5); ctx.stroke(CGRect(x: o.x, y: o.y, width: W, height: H))
        let r = max(W, H) / 140

        for run in bundle.liveRuns where run.sheetId == sheet.id && show(run.kind == .wire ? .wiring : .lighting) && run.points.count >= 4 {
            let color: UIColor = run.kind == .wire ? UIColor(wireColor(run.wireType)) : UIColor(hex: catalog.first { $0.id == run.deviceTypeId }?.color ?? "#d97706")
            ctx.saveGState()
            ctx.setStrokeColor(color.withAlphaComponent(run.tentative == true ? 0.5 : 1).cgColor)
            ctx.setLineWidth(run.kind == .wire ? r * 0.18 : r * 0.4)
            ctx.setLineCap(.round); ctx.setLineJoin(.round)
            if run.kind == .wire { ctx.setLineDash(phase: 0, lengths: [r * 0.6, r * 0.4]) }
            if run.kind == .stair { ctx.setLineDash(phase: 0, lengths: [r * 0.3, r * 0.3]) }
            ctx.move(to: pt(run.points[0], run.points[1]))
            var i = 2
            while i + 1 < run.points.count { ctx.addLine(to: pt(run.points[i], run.points[i + 1])); i += 2 }
            ctx.strokePath()
            ctx.restoreGState()
            if run.kind != .wire {
                let len = Geometry.runLengthFt(run)
                let label = [run.zone.map { "Z\($0)" } ?? "", len.map { "\($0.clean) LF" } ?? "", run.switchLabel ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
                let n = run.points.count
                let m = pt((run.points[0] + run.points[n - 2]) / 2, (run.points[1] + run.points[n - 1]) / 2)
                text(label, at: CGPoint(x: m.x - 40, y: m.y - r * 1.6), size: r * 0.75, weight: .bold, color: color, align: .center, width: 80)
            }
        }
        if show(.infrastructure) {
            for c in bundle.liveClosets where c.sheetId == sheet.id {
                let info = Catalog.closetInfo(c.kind)
                let p = pt(c.x, c.y), s = r * 1.3
                ctx.setFillColor(UIColor(hex: info.color).cgColor)
                ctx.fill(CGRect(x: p.x - s, y: p.y - s, width: 2 * s, height: 2 * s))
                text(info.abbrev, at: CGPoint(x: p.x - s, y: p.y - r * 0.5), size: r * 0.8, weight: .bold, color: .white, align: .center, width: 2 * s)
                text(c.name, at: CGPoint(x: p.x - 60, y: p.y + s + 2), size: r * 0.7, weight: .bold, color: UIColor(hex: info.color), align: .center, width: 120)
            }
        }
        for m in bundle.liveMarkers where m.sheetId == sheet.id {
            guard let t = catalog.first(where: { $0.id == m.deviceTypeId }), show(Layer(rawValue: t.category.rawValue) ?? .security) else { continue }
            drawSymbol(ctx, type: t, at: pt(m.x, m.y), r: r, tentative: m.tentative, label: labels ? m.label : nil)
        }
    }

    // MARK: plan sheets

    /// One tabloid landscape page per sheet with the plan, a legend and a per-floor count box
    /// (crew mode adds a home-run schedule page per floor and labels; never prices).
    static func planSheets(bundle: ProjectBundle, catalog: [DeviceType], crew: Bool, layers: Set<Layer>? = nil, image: (String) -> UIImage?) -> Data {
        let page = CGRect(x: 0, y: 0, width: 17 * 72, height: 11 * 72)
        let takeoff = TakeoffCalculator.compute(bundle)
        let title = bundle.project.address + (bundle.project.clientName.isEmpty ? "" : " — \(bundle.project.clientName)")
        let show: (Layer) -> Bool = { layers == nil || layers!.contains($0) }
        return UIGraphicsPDFRenderer(bounds: page).pdfData { pdf in
            for sheet in bundle.liveSheets {
                pdf.beginPage()
                let ctx = pdf.cgContext
                let side: CGFloat = 230
                drawSheet(ctx, sheet: sheet, image: image(sheet.imageId), bundle: bundle, catalog: catalog, layers: layers, labels: crew,
                          in: CGRect(x: 20, y: 20, width: page.width - side - 50, height: page.height - 40))
                var y: CGFloat = 24
                let x = page.width - side - 16
                text(sheet.name, at: CGPoint(x: x, y: y), size: 18, weight: .bold); y += 26
                text(title, at: CGPoint(x: x, y: y), size: 8, color: .gray, width: side); y += textHeight(title, size: 8, width: side) + 2
                text(crew ? "Crew wiring sheet" : "Marked-up plan", at: CGPoint(x: x, y: y), size: 8, color: .gray); y += 18

                let f = takeoff.floors.first { $0.sheetId == sheet.id }?.bucket ?? TakeoffBucket()
                text("COUNT", at: CGPoint(x: x, y: y), size: 8, weight: .bold, color: .gray); y += 14
                let boxTop = y
                y += 6
                for t in catalog.sorted(by: { $0.sort < $1.sort }) {
                    guard let n = f.counts[t.id], n > 0, show(Layer(rawValue: t.category.rawValue) ?? .security) else { continue }
                    text(t.name, at: CGPoint(x: x + 8, y: y), size: 8, width: side - 60)
                    let tent = f.tentative[t.id] ?? 0
                    text("\(n)\(tent > 0 ? " (\(tent)?)" : "")", at: CGPoint(x: x + side - 58, y: y), size: 8, weight: .bold, color: .systemBlue, align: .right, width: 50)
                    y += 13
                }
                if show(.lighting) && (f.ledZones > 0 || f.ledTotalFt > 0) {
                    text("LED zones", at: CGPoint(x: x + 8, y: y), size: 8); text("\(f.ledZones)", at: CGPoint(x: x + side - 58, y: y), size: 8, weight: .bold, color: .systemBlue, align: .right, width: 50); y += 13
                    text("LED total", at: CGPoint(x: x + 8, y: y), size: 8); text("\(f.ledTotalFt.clean) LF", at: CGPoint(x: x + side - 58, y: y), size: 8, weight: .bold, color: .systemBlue, align: .right, width: 50); y += 13
                }
                if show(.wiring) {
                    for (w, ft) in f.wireFt.sorted(by: { $0.key < $1.key }) {
                        text("\(w) cable", at: CGPoint(x: x + 8, y: y), size: 8); text("\(ft.clean) ft", at: CGPoint(x: x + side - 58, y: y), size: 8, weight: .bold, color: .systemBlue, align: .right, width: 50); y += 13
                    }
                }
                y += 4
                ctx.setStrokeColor(UIColor.systemBlue.cgColor); ctx.setLineWidth(1)
                ctx.stroke(CGRect(x: x, y: boxTop, width: side, height: y - boxTop))
                y += 16
                text("LEGEND", at: CGPoint(x: x, y: y), size: 8, weight: .bold, color: .gray); y += 14
                let used = Set(bundle.liveMarkers.filter { $0.sheetId == sheet.id }.map(\.deviceTypeId))
                for t in catalog where used.contains(t.id) && show(Layer(rawValue: t.category.rawValue) ?? .security) {
                    drawSymbol(ctx, type: t, at: CGPoint(x: x + 7, y: y + 6), r: 5.5, tentative: false, label: nil)
                    text(t.name, at: CGPoint(x: x + 18, y: y), size: 8, width: side - 18); y += 14
                }
                text("? = tentative / to confirm", at: CGPoint(x: x, y: y + 4), size: 7, color: .gray)

                if crew {
                    let rows = bundle.liveMarkers.filter { $0.sheetId == sheet.id }.sorted { $0.label < $1.label }
                    guard !rows.isEmpty else { continue }
                    pdf.beginPage()
                    text("\(sheet.name) — home-run schedule", at: CGPoint(x: 36, y: 30), size: 16, weight: .bold)
                    text(title, at: CGPoint(x: 36, y: 52), size: 9, color: .gray)
                    let cols: [(String, CGFloat)] = [("Label", 90), ("Device", 220), ("Room", 140), ("Mount", 80), ("Wire", 120), ("Home run to", 200), ("Cable", 70), ("Notes", 260)]
                    var cy: CGFloat = 80
                    var cx: CGFloat = 36
                    for (h, w) in cols { text(h, at: CGPoint(x: cx, y: cy), size: 9, weight: .bold); cx += w }
                    cy += 16
                    for m in rows {
                        if cy > page.height - 40 { pdf.beginPage(); cy = 36 }
                        let run = bundle.liveRuns.first { $0.kind == .wire && $0.markerId == m.id }
                        let len = run.flatMap(Geometry.runLengthFt)
                        let vals = [m.label + (m.tentative ? " ?" : ""), catalog.first { $0.id == m.deviceTypeId }?.name ?? "", m.room, m.mount.rawValue, m.wireType,
                                    bundle.liveClosets.first { $0.id == m.closetId }?.name ?? "—", len.map { "\($0.clean) ft" } ?? "", m.notes]
                        cx = 36
                        for (i, v) in vals.enumerated() { text(v, at: CGPoint(x: cx, y: cy), size: 8.5, width: cols[i].1 - 6); cx += cols[i].1 }
                        cy += 15
                    }
                }
            }
        }
    }

    // MARK: client estimate

    static func estimate(bundle: ProjectBundle, estimate: Estimate, business: BusinessSettings, pricing: PricingSettings) -> Data {
        let page = CGRect(x: 0, y: 0, width: 8.5 * 72, height: 11 * 72)
        let brand = UIColor(red: 0.31, green: 0.275, blue: 0.898, alpha: 1)
        let p = bundle.project
        let df = DateFormatter(); df.dateStyle = .medium
        let now = Date()
        let number = "EST-\(DateFormatter.yyMMdd.string(from: now))-\(p.id.prefix(4).uppercased())"
        let money = { (v: Double) in Money.format(v, currency: pricing.currency) }
        let lines = estimate.lines.filter { $0.total != 0 }
        return UIGraphicsPDFRenderer(bounds: page).pdfData { pdf in
            pdf.beginPage()
            let ctx = pdf.cgContext
            ctx.setFillColor(brand.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: page.width, height: 6))
            let L: CGFloat = 44, R = page.width - 44
            text(business.name.isEmpty ? "Estimate" : business.name, at: CGPoint(x: L, y: 36), size: 17, weight: .bold)
            var by: CGFloat = 60
            for s in [business.address, business.phone, business.email, business.website] where !s.isEmpty { text(s, at: CGPoint(x: L, y: by), size: 9, color: .gray); by += 12 }
            text("ESTIMATE", at: CGPoint(x: R - 200, y: 34), size: 22, weight: .bold, color: brand, align: .right, width: 200)
            for (i, (k, v)) in [("Number", number), ("Date", df.string(from: now)), ("Valid until", df.string(from: now.addingTimeInterval(30 * 86400)))].enumerated() {
                text(k, at: CGPoint(x: R - 200, y: 64 + CGFloat(i) * 13), size: 9, color: .gray, align: .right, width: 100)
                text(v, at: CGPoint(x: R - 95, y: 64 + CGFloat(i) * 13), size: 9, weight: .bold, align: .right, width: 95)
            }
            var y = max(by, 110) + 12
            let half = (R - L - 10) / 2
            for (i, (label, main, sub)) in [("PREPARED FOR", p.clientName, [p.clientEmail, p.clientPhone].compactMap { $0 }.joined(separator: "  ")),
                                             ("JOB SITE", p.address, "Floors: \(bundle.liveSheets.count)   Devices: \(bundle.liveMarkers.filter { !$0.tentative }.count)")].enumerated() {
                let bx = L + CGFloat(i) * (half + 10)
                ctx.setFillColor(UIColor(white: 0.97, alpha: 1).cgColor)
                ctx.addPath(UIBezierPath(roundedRect: CGRect(x: bx, y: y, width: half, height: 58), cornerRadius: 6).cgPath); ctx.fillPath()
                text(label, at: CGPoint(x: bx + 12, y: y + 10), size: 7, weight: .semibold, color: .gray)
                text(main.isEmpty ? "—" : main, at: CGPoint(x: bx + 12, y: y + 22), size: 10, weight: .bold, width: half - 24)
                text(sub, at: CGPoint(x: bx + 12, y: y + 38), size: 8.5, color: .gray, width: half - 24)
            }
            y += 78
            let cols: [(String, CGFloat, NSTextAlignment)] = [("DESCRIPTION", 260, .left), ("QTY", 50, .right), ("UNIT", 40, .right), ("UNIT PRICE", 78, .right), ("AMOUNT", R - L - 428, .right)]
            func header() {
                var cx = L
                for (h, w, a) in cols { text(h, at: CGPoint(x: cx, y: y), size: 7.5, weight: .bold, align: a, width: w); cx += w }
                y += 13
                ctx.setFillColor(UIColor.black.cgColor); ctx.fill(CGRect(x: L, y: y, width: R - L, height: 1.2)); y += 6
            }
            header()
            func row(_ l: ComputedLine) {
                if y > page.height - 120 { pdf.beginPage(); y = 44; header() }
                let desc = l.description.replacingOccurrences(of: " — installed", with: "").replacingOccurrences(of: " (optional — marked ?)", with: "")
                let vals = [desc, l.qty.clean, l.unit, money(l.unitPrice), money(l.total)]
                var cx = L
                for (i, v) in vals.enumerated() { text(v, at: CGPoint(x: cx, y: y), size: 9, align: cols[i].2, width: cols[i].1); cx += cols[i].1 }
                y += 15
                ctx.setFillColor(UIColor(white: 0.9, alpha: 1).cgColor); ctx.fill(CGRect(x: L, y: y - 3, width: R - L, height: 0.5))
            }
            for g in LineGroup.allCases {
                let ls = lines.filter { $0.included && $0.group == g }
                guard !ls.isEmpty else { continue }
                text(g.title.uppercased(), at: CGPoint(x: L, y: y + 4), size: 7.5, weight: .bold, color: brand); y += 18
                ls.forEach(row)
            }
            y += 8
            for (k, v, bold) in [("Subtotal", money(estimate.subtotal), false), ("Tax (\(pricing.taxPct.clean)%)", money(estimate.tax), false), ("Total", money(estimate.total), true)] {
                if bold { ctx.setFillColor(UIColor.black.cgColor); ctx.fill(CGRect(x: R - 240, y: y, width: 240, height: 1.2)); y += 6 }
                text(k, at: CGPoint(x: R - 240, y: y), size: bold ? 13 : 9.5, weight: bold ? .bold : .regular, color: bold ? .black : .gray)
                text(v, at: CGPoint(x: R - 140, y: y), size: bold ? 13 : 9.5, weight: bold ? .bold : .regular, align: .right, width: 140)
                y += bold ? 22 : 15
            }
            let optional = lines.filter { !$0.included }
            if !optional.isEmpty {
                y += 10
                text("Optional items — to be confirmed on site, not included above", at: CGPoint(x: L, y: y), size: 10, weight: .bold); y += 18
                optional.forEach(row)
            }
            if !business.estimateTerms.isEmpty {
                y += 16
                let h = textHeight(business.estimateTerms, size: 8.5, width: R - L - 24) + 30
                if y + h > page.height - 90 { pdf.beginPage(); y = 44 }
                ctx.setFillColor(UIColor(white: 0.97, alpha: 1).cgColor); ctx.fill(CGRect(x: L, y: y, width: R - L, height: h))
                ctx.setFillColor(brand.cgColor); ctx.fill(CGRect(x: L, y: y, width: 3, height: h))
                text("TERMS", at: CGPoint(x: L + 12, y: y + 8), size: 7.5, weight: .bold, color: brand)
                text(business.estimateTerms, at: CGPoint(x: L + 12, y: y + 20), size: 8.5, color: .darkGray, width: R - L - 24)
                y += h
            }
            y = max(y + 40, page.height - 90)
            ctx.setFillColor(UIColor.black.cgColor)
            ctx.fill(CGRect(x: L, y: y, width: 240, height: 0.7)); ctx.fill(CGRect(x: R - 150, y: y, width: 150, height: 0.7))
            text("Client approval (signature)", at: CGPoint(x: L, y: y + 5), size: 8, color: .gray)
            text("Date", at: CGPoint(x: R - 150, y: y + 5), size: 8, color: .gray)
        }
    }

    static func write(_ data: Data, name: String) -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try? data.write(to: url, options: .atomic)
        return url
    }
}

extension DateFormatter {
    static let yyMMdd: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyMMdd"; return f }()
}
