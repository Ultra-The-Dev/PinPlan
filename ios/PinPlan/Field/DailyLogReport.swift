import SwiftUI
import UIKit
import PinPlanCore

/// Share daily logs as a branded PDF: one log, or every log in a date range, each with its photos (mark-up drawn in).
struct DailyLogExportSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    /// Set to export just this log; nil lets the user pick a date range.
    let single: JobLog?
    @State private var from = ""
    @State private var to = ""
    @State private var busy: String?
    @State private var share: SharedFile?

    private var picked: [JobLog] {
        if let single { return [single] }
        return DailyLogReport.logs(model.bundle.jobLogs, from: from, to: to)
    }

    private func dayBinding(_ s: Binding<String>) -> Binding<Date> {
        Binding(get: {
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
            return f.date(from: s.wrappedValue) ?? Date()
        }, set: { d in
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
            s.wrappedValue = f.string(from: d)
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                if single == nil {
                    Section {
                        DatePicker("From", selection: dayBinding($from), displayedComponents: .date)
                        DatePicker("To", selection: dayBinding($to), displayedComponents: .date)
                    } footer: {
                        Text("\(picked.count) log\(picked.count == 1 ? "" : "s") · with your branding, each day’s photos and mark-up.")
                    }
                } else if let l = single {
                    Section {
                        Text(DailyLogPDFBuilder.longDay(l.date)).font(.headline)
                        if let t = l.title, !t.isEmpty { Text(t) }
                    } footer: {
                        Text("With your branding, the day’s photos and mark-up.")
                    }
                }
                Section {
                    Button { Task { await pdf() } } label: { Label("Share PDF", systemImage: "doc.richtext") }
                    if let busy { HStack { ProgressView(); Text(busy).foregroundStyle(.secondary) } }
                }
                .disabled(busy != nil || picked.isEmpty)
            }
            .navigationTitle(single == nil ? "Export daily logs" : "Daily log PDF")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .onAppear {
                if from.isEmpty, let d = DailyLogReport.days(DailyLogReport.logs(model.bundle.jobLogs)) { from = d.first; to = d.last }
            }
            .shareSheet($share)
        }
    }

    private func meta(_ p: Photo) -> String {
        let time = FieldDocs.date(p.takenAt)?.formatted(date: .omitted, time: .shortened)
        return ([time, p.takenBy, p.room] + (p.tags ?? []).map { Optional($0) }).compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func pdf() async {
        defer { busy = nil }
        let logs = picked
        guard !logs.isEmpty else { return }
        let total = logs.reduce(0) { $0 + DailyLogReport.photos(for: $1, in: model.bundle.photos).count }
        var done = 0
        var entries: [DailyLogPDFBuilder.Entry] = []
        for l in logs {
            var items: [DailyLogPDFBuilder.PhotoItem] = []
            for p in DailyLogReport.photos(for: l, in: model.bundle.photos) {
                done += 1
                busy = "Preparing photo \(done) of \(total)…"
                guard let img = app.store.image(p.imageId) else { continue }
                let shapes = p.annotations
                let out = await Task.detached(priority: .userInitiated) { PhotoMarkup.render(img, shapes: shapes, maxSide: 1400) }.value
                items.append(DailyLogPDFBuilder.PhotoItem(image: out, caption: p.caption, meta: meta(p)))
            }
            entries.append(DailyLogPDFBuilder.Entry(day: DailyLogPDFBuilder.longDay(l.date), title: l.title, author: l.author, body: l.body, photos: items))
        }
        busy = "Building the PDF…"
        let logo = await PhotoReportBuilder.logo(app.settings)
        var range = ""
        if let d = DailyLogReport.days(logs) {
            range = d.first == d.last ? DailyLogPDFBuilder.shortDay(d.first) : "\(DailyLogPDFBuilder.shortDay(d.first)) – \(DailyLogPDFBuilder.shortDay(d.last))"
        }
        let data = DailyLogPDFBuilder.pdf(title: logs.count == 1 ? "Daily log" : "Daily logs", range: range, project: model.bundle.project,
                                          business: app.settings.business, logo: logo, entries: entries)
        let job = model.bundle.project.address.isEmpty ? model.bundle.project.clientName : model.bundle.project.address
        share = SharedFile(url: PDFExporter.write(data, name: DailyLogReport.fileName(jobSlug: slug(job.isEmpty ? "job" : job), logs: logs)))
    }
}

/// Lays the logs out top to bottom on Letter pages (same look as PhotoReportBuilder and the web DailyLogPdf).
enum DailyLogPDFBuilder {
    struct PhotoItem { let image: UIImage; let caption: String?; let meta: String }
    struct Entry { let day: String; let title: String?; let author: String?; let body: String; let photos: [PhotoItem] }

    private static func day(_ s: String) -> Date? {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.date(from: s)
    }

    /// "Monday, March 2, 2026"
    static func longDay(_ s: String) -> String { day(s)?.formatted(.dateTime.weekday(.wide).month(.wide).day().year()) ?? s }
    /// "Mar 2, 2026"
    static func shortDay(_ s: String) -> String { day(s)?.formatted(date: .abbreviated, time: .omitted) ?? s }

    private static func text(_ s: String, size: CGFloat, weight: UIFont.Weight = .regular, color: UIColor = .black, align: NSTextAlignment = .left, spacing: CGFloat = 0, kern: CGFloat = 0) -> NSAttributedString {
        let para = NSMutableParagraphStyle(); para.alignment = align; para.lineBreakMode = .byWordWrapping; para.lineSpacing = spacing
        return NSAttributedString(string: s, attributes: [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: para, .kern: kern])
    }

    private static func height(_ a: NSAttributedString, width: CGFloat) -> CGFloat {
        ceil(a.boundingRect(with: CGSize(width: width, height: CGFloat.greatestFiniteMagnitude), options: [.usesLineFragmentOrigin], context: nil).height)
    }

    static func pdf(title: String, range: String, project: Project, business: BusinessSettings, logo: UIImage?, entries: [Entry]) -> Data {
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        // First pass only measures, to know the page count for the footers.
        let pages = layout(nil, page: page, total: 0, title: title, range: range, project: project, business: business, logo: logo, entries: entries)
        return UIGraphicsPDFRenderer(bounds: page).pdfData { ctx in
            _ = layout(ctx, page: page, total: pages, title: title, range: range, project: project, business: business, logo: logo, entries: entries)
        }
    }

    /// Draws into `ctx` (or only measures when it's nil) and returns the number of pages.
    private static func layout(_ ctx: UIGraphicsPDFRendererContext?, page: CGRect, total: Int, title: String, range: String, project: Project,
                               business: BusinessSettings, logo: UIImage?, entries: [Entry]) -> Int {
        let brand = UIColor(hex: business.brandColor ?? "#0a1b54")
        let L: CGFloat = 36
        let R: CGFloat = page.width - 36
        let W: CGFloat = R - L
        let bottom: CGFloat = page.height - 42
        let cellW: CGFloat = (W - 12) / 2
        let imgH: CGFloat = 190
        var pageNo = 0
        var y: CGFloat = 28

        func put(_ a: NSAttributedString, _ r: CGRect) {
            guard ctx != nil else { return }
            a.draw(with: r, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
        }
        func newPage() {
            pageNo += 1
            y = 28
            guard let ctx else { return }
            ctx.beginPage()
            brand.setFill(); UIRectFill(CGRect(x: 0, y: 0, width: page.width, height: 6))
            put(text(business.name, size: 7.5, color: .gray), CGRect(x: L, y: page.height - 26, width: 300, height: 12))
            put(text("\(pageNo) / \(max(total, pageNo))", size: 7.5, color: .gray, align: .right), CGRect(x: R - 100, y: page.height - 26, width: 100, height: 12))
        }

        newPage()
        // Header: title, job, range on the left; logo / business and contact on the right.
        let headW: CGFloat = 330
        var hy: CGFloat = y
        let photoCount = entries.reduce(0) { $0 + $1.photos.count }
        let heading: [NSAttributedString] = [
            text(title, size: 18, weight: .bold, color: brand),
            text([project.clientName, project.address].filter { !$0.isEmpty }.joined(separator: " · "), size: 9, color: .gray),
            text([range, "\(entries.count) log\(entries.count == 1 ? "" : "s")", photoCount > 0 ? "\(photoCount) photo\(photoCount == 1 ? "" : "s")" : ""]
                .filter { !$0.isEmpty }.joined(separator: " · "), size: 9, color: .gray),
        ]
        for (i, a) in heading.enumerated() {
            let h = height(a, width: headW)
            put(a, CGRect(x: L, y: hy, width: headW, height: h))
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
        y = max(hy, ry) + 16

        for e in entries {
            // Day heading block, kept together with a little of what follows.
            var head: [(NSAttributedString, CGFloat)] = [(text(e.day.uppercased(), size: 8.5, weight: .bold, color: brand, kern: 0.6), 0)]
            if let t = e.title, !t.isEmpty { head.append((text(t, size: 12.5, weight: .bold), 3)) }
            if let a = e.author, !a.isEmpty { head.append((text("Logged by \(a)", size: 9, color: .gray), 2)) }
            let headH: CGFloat = 12 + head.reduce(CGFloat(0)) { $0 + $1.1 + height($1.0, width: W) }
            if y + headH + 60 > bottom { newPage() }
            if ctx != nil {
                UIColor(red: 0.886, green: 0.91, blue: 0.941, alpha: 1).setFill()
                UIRectFill(CGRect(x: L, y: y, width: W, height: 1))
            }
            y += 12
            for (a, gap) in head {
                y += gap
                let h = height(a, width: W)
                put(a, CGRect(x: L, y: y, width: W, height: h)); y += h
            }

            // Body, a paragraph at a time; a paragraph that doesn't fit is split at a word boundary onto the next page.
            if !e.body.isEmpty { y += 7 }
            for para in e.body.components(separatedBy: "\n") {
                let line = height(text("Ag", size: 9.5, spacing: 3), width: W)
                if para.trimmingCharacters(in: .whitespaces).isEmpty { y += line; continue }
                var words = para.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
                while !words.isEmpty {
                    let all = text(words.joined(separator: " "), size: 9.5, spacing: 3)
                    let h = height(all, width: W)
                    if y + h <= bottom {
                        put(all, CGRect(x: L, y: y, width: W, height: h)); y += h
                        break
                    }
                    // Largest prefix of words that fits the space left on this page.
                    var lo = 0, hi = words.count
                    while lo < hi {
                        let mid = (lo + hi + 1) / 2
                        if y + height(text(words[0..<mid].joined(separator: " "), size: 9.5, spacing: 3), width: W) <= bottom { lo = mid } else { hi = mid - 1 }
                    }
                    if lo == 0 {
                        if y <= 28 { lo = 1 } else { newPage(); continue }
                    }
                    let part = text(words[0..<lo].joined(separator: " "), size: 9.5, spacing: 3)
                    let ph = height(part, width: W)
                    put(part, CGRect(x: L, y: y, width: W, height: min(ph, bottom - y)))
                    words.removeFirst(lo)
                    newPage()
                }
            }

            // Photos, two per row.
            if !e.photos.isEmpty { y += 10 }
            for start in stride(from: 0, to: e.photos.count, by: 2) {
                let row = Array(e.photos[start..<min(start + 2, e.photos.count)])
                let labels: [(NSAttributedString?, NSAttributedString)] = row.map { (p: PhotoItem) -> (NSAttributedString?, NSAttributedString) in
                    let cap: NSAttributedString? = (p.caption?.isEmpty == false) ? text(p.caption ?? "", size: 9.5, weight: .semibold) : nil
                    return (cap, text(p.meta, size: 8, color: .gray))
                }
                let textH: CGFloat = labels.map { (l: (NSAttributedString?, NSAttributedString)) -> CGFloat in
                    let capH: CGFloat = l.0.map { (c: NSAttributedString) -> CGFloat in min(26, height(c, width: cellW)) + 1 } ?? 0
                    return capH + min(24, height(l.1, width: cellW))
                }.max() ?? 0
                let rowH: CGFloat = imgH + 5 + textH + 10
                if y + rowH > bottom { newPage() }
                for (k, it) in row.enumerated() {
                    let x: CGFloat = L + CGFloat(k) * (cellW + 12)
                    let box = CGRect(x: x, y: y, width: cellW, height: imgH)
                    if ctx != nil {
                        UIColor(red: 0.945, green: 0.96, blue: 0.976, alpha: 1).setFill()
                        UIBezierPath(roundedRect: box, cornerRadius: 4).fill()
                        let s: CGFloat = min(box.width / max(1, it.image.size.width), box.height / max(1, it.image.size.height))
                        let iw: CGFloat = it.image.size.width * s
                        let ih: CGFloat = it.image.size.height * s
                        it.image.draw(in: CGRect(x: box.midX - iw / 2, y: box.midY - ih / 2, width: iw, height: ih))
                    }
                    var ty: CGFloat = box.maxY + 5
                    if let cap = labels[k].0 {
                        let h = min(26, height(cap, width: cellW))
                        put(cap, CGRect(x: x, y: ty, width: cellW, height: h)); ty += h + 1
                    }
                    put(labels[k].1, CGRect(x: x, y: ty, width: cellW, height: min(24, height(labels[k].1, width: cellW))))
                }
                y += rowH
            }
            y += 14
        }
        return pageNo
    }
}
