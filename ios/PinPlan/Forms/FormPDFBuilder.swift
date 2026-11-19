import UIKit
import PinPlanCore

/// A form as a branded Letter PDF (same look as the web FormPdf and the daily log PDF): every field, tables with totals,
/// calcs, photos, signatures with times and "signed on behalf", and the template version in the footer.
enum FormPDFBuilder {
    struct PhotoItem { let image: UIImage?; let caption: String? }

    private static func text(_ s: String, size: CGFloat, weight: UIFont.Weight = .regular, color: UIColor = .black, align: NSTextAlignment = .left) -> NSAttributedString {
        let para = NSMutableParagraphStyle(); para.alignment = align; para.lineBreakMode = .byWordWrapping
        return NSAttributedString(string: s, attributes: [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: para])
    }

    private static func height(_ a: NSAttributedString, width: CGFloat) -> CGFloat {
        ceil(a.boundingRect(with: CGSize(width: width, height: CGFloat.greatestFiniteMagnitude), options: [.usesLineFragmentOrigin], context: nil).height)
    }

    static func pdf(form: JobForm, project: Project, business: BusinessSettings, logo: UIImage?, photos: [String: [PhotoItem]], signatures: [String: UIImage], place: String?) -> Data {
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let pages = layout(nil, page: page, total: 0, form: form, project: project, business: business, logo: logo, photos: photos, signatures: signatures, place: place)
        return UIGraphicsPDFRenderer(bounds: page).pdfData { ctx in
            _ = layout(ctx, page: page, total: pages, form: form, project: project, business: business, logo: logo, photos: photos, signatures: signatures, place: place)
        }
    }

    private static func layout(_ ctx: UIGraphicsPDFRendererContext?, page: CGRect, total: Int, form: JobForm, project: Project, business: BusinessSettings,
                               logo: UIImage?, photos: [String: [PhotoItem]], signatures: [String: UIImage], place: String?) -> Int {
        let brand = UIColor(hex: business.brandColor ?? (BusinessSettings.neutral.brandColor ?? "#c2410c"))
        let line = UIColor(red: 0.886, green: 0.91, blue: 0.941, alpha: 1)
        let green = UIColor(red: 0.016, green: 0.47, blue: 0.34, alpha: 1)
        let red = UIColor(red: 0.73, green: 0.11, blue: 0.11, alpha: 1)
        let L: CGFloat = 36
        let R: CGFloat = page.width - 36
        let W: CGFloat = R - L
        let bottom: CGFloat = page.height - 46
        var pageNo = 0
        var y: CGFloat = 28

        func put(_ a: NSAttributedString, _ r: CGRect) {
            guard ctx != nil else { return }
            a.draw(with: r, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
        }
        func rule(_ at: CGFloat) {
            guard ctx != nil else { return }
            line.setFill(); UIRectFill(CGRect(x: L, y: at, width: W, height: 1))
        }
        func newPage() {
            pageNo += 1
            y = 28
            guard let ctx else { return }
            ctx.beginPage()
            brand.setFill(); UIRectFill(CGRect(x: 0, y: 0, width: page.width, height: 6))
            put(text("\(form.template.name) · template v\(form.template.version)", size: 7.5, color: .gray), CGRect(x: L, y: page.height - 26, width: 260, height: 12))
            put(text(business.name, size: 7.5, color: .gray, align: .center), CGRect(x: L + 260, y: page.height - 26, width: W - 360, height: 12))
            put(text("\(pageNo) / \(max(total, pageNo))", size: 7.5, color: .gray, align: .right), CGRect(x: R - 100, y: page.height - 26, width: 100, height: 12))
        }
        func need(_ h: CGFloat) { if y + h > bottom { newPage() } }

        newPage()
        // Header
        var status = "Draft — not submitted"
        if form.isSubmitted {
            status = "Submitted" + (form.submittedAt.map { " \(FormDates.full($0))" } ?? "") + (form.submittedBy.map { " by \($0)" } ?? "")
        }
        var head: [NSAttributedString] = [
            text(form.name, size: 18, weight: .bold, color: brand),
            text([project.clientName, project.address].filter { !$0.isEmpty }.joined(separator: " · "), size: 9, color: .gray),
            text(status, size: 9, color: .gray),
        ]
        if let place { head.append(text("Plan location: \(place)", size: 9, color: .gray)) }
        var hy: CGFloat = y
        for (i, a) in head.enumerated() {
            let h = height(a, width: 330)
            put(a, CGRect(x: L, y: hy, width: 330, height: h))
            hy += h + (i == 0 ? 4 : 0)
        }
        var ry: CGFloat = y
        if let logo {
            let h: CGFloat = 38
            let w: CGFloat = min(170, logo.size.width * h / max(1, logo.size.height))
            if ctx != nil { logo.draw(in: CGRect(x: R - w, y: ry, width: w, height: h)) }
            ry += h + 4
        } else {
            let a = text(business.name, size: 12, weight: .bold, align: .right)
            let h = height(a, width: 190)
            put(a, CGRect(x: R - 190, y: ry, width: 190, height: h)); ry += h
        }
        let contact = text([business.phone, business.email, business.website].filter { !$0.isEmpty }.joined(separator: "\n"), size: 9, color: .gray, align: .right)
        let ch = height(contact, width: 190)
        put(contact, CGRect(x: R - 190, y: ry, width: 190, height: ch)); ry += ch
        y = max(hy, ry) + 14

        let labelW: CGFloat = 200
        for f in form.template.fields {
            let v: JSONValue? = form.values[f.id]
            switch f.kind {
            case .heading?:
                need(40)
                y += 8
                let a = text(f.label.uppercased(), size: 8.5, weight: .bold, color: brand)
                put(a, CGRect(x: L, y: y, width: W, height: 12)); y += 16
            case .table?:
                let cols: [FormField] = f.columns ?? []
                let rows = Forms.tableRows(v)
                need(50)
                y += 6
                put(text(f.label, size: 9.5, weight: .bold), CGRect(x: L, y: y, width: W, height: 14)); y += 16
                let numW: CGFloat = 22
                let colW: CGFloat = (W - numW) / CGFloat(max(1, cols.count))
                put(text("#", size: 8, weight: .semibold, color: .gray), CGRect(x: L + 4, y: y, width: numW, height: 12))
                for (k, c) in cols.enumerated() {
                    let title = c.label + (c.unit.map { " (\($0))" } ?? "")
                    put(text(title, size: 8, weight: .semibold, color: .gray), CGRect(x: L + numW + CGFloat(k) * colW, y: y, width: colW - 4, height: 12))
                }
                y += 14; rule(y); y += 3
                if rows.isEmpty { put(text("No rows", size: 8.5, color: .gray), CGRect(x: L + 4, y: y, width: W, height: 12)); y += 15 }
                for (i, r) in rows.enumerated() {
                    need(16)
                    put(text("\(i + 1)", size: 8.5, color: .gray), CGRect(x: L + 4, y: y, width: numW, height: 12))
                    for (k, c) in cols.enumerated() {
                        var plain = c
                        plain.unit = nil
                        let s = Forms.answerText(plain, r[c.id])
                        let color: UIColor = c.kind == .yesno ? (r[c.id]?.stringValue == "no" ? red : (r[c.id]?.stringValue == "yes" ? green : UIColor.black)) : UIColor.black
                        put(text(s.isEmpty ? "—" : s, size: 8.5, color: color), CGRect(x: L + numW + CGFloat(k) * colW, y: y, width: colW - 4, height: 12))
                    }
                    y += 14; rule(y); y += 2
                }
                let totals = Forms.columnTotals(f, rows)
                if !rows.isEmpty && !totals.isEmpty {
                    for (k, c) in cols.enumerated() {
                        if let t = totals[c.id] { put(text("Total \(Forms.formatNumber(t))", size: 8.5, weight: .bold), CGRect(x: L + numW + CGFloat(k) * colW, y: y, width: colW - 4, height: 12)) }
                    }
                    y += 16
                }
            case .photo?:
                let items: [PhotoItem] = photos[f.id] ?? []
                need(30)
                y += 6
                put(text(f.label, size: 9.5, weight: .bold), CGRect(x: L, y: y, width: W, height: 14)); y += 16
                if items.isEmpty { put(text("No photos", size: 9, color: .gray), CGRect(x: L, y: y, width: W, height: 12)); y += 16 }
                let cellW: CGFloat = (W - 12) / 2
                let imgH: CGFloat = 170
                for start in stride(from: 0, to: items.count, by: 2) {
                    need(imgH + 24)
                    for k in 0..<min(2, items.count - start) {
                        let it = items[start + k]
                        let x: CGFloat = L + CGFloat(k) * (cellW + 12)
                        let box = CGRect(x: x, y: y, width: cellW, height: imgH)
                        if ctx != nil {
                            UIColor(red: 0.945, green: 0.96, blue: 0.976, alpha: 1).setFill(); UIRectFill(box)
                            if let img = it.image {
                                let s: CGFloat = min(cellW / max(1, img.size.width), imgH / max(1, img.size.height))
                                let w: CGFloat = img.size.width * s
                                let h: CGFloat = img.size.height * s
                                img.draw(in: CGRect(x: x + (cellW - w) / 2, y: y + (imgH - h) / 2, width: w, height: h))
                            } else {
                                put(text("Photo missing (deleted or not on this device)", size: 8.5, color: .gray, align: .center), CGRect(x: x, y: y + imgH / 2 - 6, width: cellW, height: 14))
                            }
                        }
                        if let c = it.caption, !c.isEmpty { put(text(c, size: 8, color: .gray), CGRect(x: x, y: y + imgH + 3, width: cellW, height: 12)) }
                    }
                    y += imgH + 20
                }
            case .signature?:
                need(92)
                y += 8
                let box = CGRect(x: L, y: y, width: W, height: 82)
                if ctx != nil {
                    line.setStroke()
                    UIBezierPath(roundedRect: box, cornerRadius: 4).stroke()
                }
                let sig: FormSignature? = form.signature(f.id)
                if let s = sig, let img = signatures[s.imageId], ctx != nil {
                    let sc: CGFloat = min(196 / max(1, img.size.width), 62 / max(1, img.size.height))
                    img.draw(in: CGRect(x: L + 8, y: y + 8, width: img.size.width * sc, height: img.size.height * sc))
                } else {
                    put(text(sig == nil ? "Not signed" : "Signature image missing", size: 9, color: .gray), CGRect(x: L + 8, y: y + 32, width: 196, height: 14))
                }
                if ctx != nil { UIColor.gray.setFill(); UIRectFill(CGRect(x: L + 8, y: y + 72, width: 196, height: 0.75)) }
                var ty: CGFloat = y + 8
                put(text(f.label, size: 9.5, weight: .bold), CGRect(x: L + 220, y: ty, width: W - 228, height: 14)); ty += 15
                if let s = sig {
                    var lines: [String] = [s.name + (s.role.map { " (\($0))" } ?? ""), "Signed \(FormDates.full(s.signedAt))"]
                    if Forms.signedOnBehalf(s) { lines.append("Signed on behalf · collected by \(s.signedBy ?? "")") }
                    for (k, l) in lines.enumerated() {
                        put(text(l, size: k == 0 ? 10 : 8.5, color: k == 0 ? UIColor.black : UIColor.gray), CGRect(x: L + 220, y: ty, width: W - 228, height: 14)); ty += 13
                    }
                }
                y += 90
            case .calc?:
                need(22)
                let n: Double? = f.calc.flatMap { Forms.computeCalc(form.template, form.values, $0) }
                let val = n == nil ? "—" : Forms.formatNumber(n) + (f.unit.map { " \($0)" } ?? "")
                if ctx != nil { UIColor(red: 0.973, green: 0.98, blue: 0.988, alpha: 1).setFill(); UIRectFill(CGRect(x: L, y: y, width: W, height: 20)) }
                put(text(f.label, size: 9.5, weight: .bold), CGRect(x: L + 2, y: y + 4, width: labelW, height: 14))
                put(text(val, size: 11, weight: .bold), CGRect(x: L + labelW, y: y + 3, width: W - labelW, height: 16))
                y += 20; rule(y); y += 1
            case .longtext?:
                let body = text(v?.stringValue ?? "—", size: 9.5)
                let h = min(height(body, width: W), bottom - 60)
                need(h + 24)
                put(text(f.label, size: 9.5, color: .darkGray), CGRect(x: L, y: y + 4, width: W, height: 13)); y += 18
                put(body, CGRect(x: L, y: y, width: W, height: h)); y += h + 5
                rule(y); y += 1
            default:
                let s = Forms.answerText(f, v)
                let a = text(s.isEmpty ? "—" : s, size: 9.5, weight: .semibold, color: f.kind == .yesno ? (v?.stringValue == "no" ? red : (v?.stringValue == "yes" ? green : UIColor.black)) : UIColor.black)
                let lab = text(f.label, size: 9.5, color: .darkGray)
                let h = max(height(a, width: W - labelW), height(lab, width: labelW - 10))
                need(h + 10)
                put(lab, CGRect(x: L, y: y + 5, width: labelW - 10, height: h))
                put(a, CGRect(x: L + labelW, y: y + 5, width: W - labelW, height: h))
                y += h + 10; rule(y); y += 1
            }
        }

        let notes = Forms.history(form)
        if !notes.isEmpty {
            need(30 + CGFloat(notes.count) * 13)
            y += 12
            put(text("HISTORY", size: 8.5, weight: .bold, color: brand), CGRect(x: L, y: y, width: W, height: 12)); y += 15
            for h in notes {
                put(text("\(FormDates.full(h.at)) — \(h.text)\(h.by.map { " (\($0))" } ?? "")", size: 8.5, color: .gray), CGRect(x: L, y: y, width: W, height: 12)); y += 13
            }
        }
        return pageNo
    }
}
