import SwiftUI
import UIKit
import PinPlanCore

/// Photo report: the chosen photos (with mark-up) as a branded PDF, or a link the client opens in a browser.
struct PhotoReportSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: EditorModel
    let photos: [Photo]
    @State private var title = ""
    @State private var notes = ""
    @State private var perPage = 2
    @State private var groupBy: PhotoReportLayout.GroupBy = .none
    @State private var withComments = false
    @State private var pairs = false
    @State private var busy: String?
    @State private var error: String?
    @State private var link: URL?
    @State private var share: SharedFile?

    private var ordered: [Photo] { photos.sorted { $0.takenAt < $1.takenAt } }
    private var hasPairs: Bool { photos.contains { p in p.beforeId.map { b in photos.contains { $0.id == b } } ?? false } }
    private var commentCount: Int { photos.reduce(0) { $0 + PhotoReportLayout.comments(model.bundle.photoComments, photoId: $1.id).count } }
    private var sections: [PhotoReportLayout.Section<Photo>] { PhotoReportLayout.sections(photos, groupBy: groupBy, pairs: pairs && hasPairs) }
    private func comments(_ p: Photo) -> [PhotoReportLayout.Comment] { withComments ? PhotoReportLayout.comments(model.bundle.photoComments, photoId: p.id) : [] }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    TextField("Notes for the client (optional)", text: $notes, axis: .vertical).lineLimit(3...8)
                    Picker("Photos per page", selection: $perPage) { ForEach([1, 2, 4], id: \.self) { Text("\($0)").tag($0) } }.pickerStyle(.segmented)
                } footer: {
                    Text("\(photos.count) photo\(photos.count == 1 ? "" : "s") · \(PhotoReportBuilder.range(ordered)) · with your branding, captions and mark-up.")
                }
                Section {
                    Picker("Group photos", selection: $groupBy) { ForEach(PhotoReportLayout.GroupBy.allCases, id: \.self) { Text($0.name).tag($0) } }.pickerStyle(.segmented)
                    Toggle(isOn: $withComments) {
                        VStack(alignment: .leading) {
                            Text("Include comments")
                            Text(commentCount == 0 ? "None yet" : "\(commentCount) on these photos").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Toggle("Show before / after side by side", isOn: $pairs).disabled(!hasPairs)
                } header: {
                    Text("Layout")
                } footer: {
                    if !hasPairs { Text("None of these photos are linked as before / after.") }
                }
                Section {
                    Button { Task { await pdf() } } label: { Label("Share PDF", systemImage: "doc.richtext") }
                    if app.cloud.signedIn && !app.settings.serverURL.trimmingCharacters(in: .whitespaces).isEmpty {
                        Button { Task { await publish() } } label: { Label("Create client link", systemImage: "link") }
                    } else {
                        Text("Connect cloud sync and the PinPlan server in Settings to share a link.").font(.footnote).foregroundStyle(.secondary)
                    }
                    if let busy { HStack { ProgressView(); Text(busy).foregroundStyle(.secondary) } }
                    if let error { Text(error).foregroundStyle(.red) }
                }
                .disabled(busy != nil || photos.isEmpty)
                if let link {
                    Section("Client link") {
                        Text(link.absoluteString).font(.footnote).textSelection(.enabled)
                        HStack {
                            Button { UIPasteboard.general.url = link } label: { Label("Copy", systemImage: "doc.on.doc") }
                            Spacer()
                            ShareLink(item: link) { Label("Send", systemImage: "square.and.arrow.up") }
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
            .navigationTitle("Photo report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task {
                // Test hook: publish the client link straight away (screenshots workflow, against a stand-in server).
                if ProcessInfo.processInfo.arguments.contains("--auto-publish"), app.cloud.signedIn, link == nil, busy == nil {
                    try? await Task.sleep(for: .seconds(1))
                    await publish()
                }
            }
            .onAppear { if title.isEmpty { title = "Photo report — \(model.bundle.project.address.isEmpty ? model.bundle.project.clientName : model.bundle.project.address)" } }
            .shareSheet($share)
        }
    }

    private func meta(_ p: Photo) -> String {
        [longDate(p.takenAt), p.takenBy, p.room, model.deviceName(p.markerId), p.lat.flatMap { lat in p.lng.map { String(format: "GPS %.5f, %.5f", lat, $0) } }]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func label(_ p: Photo) -> String? {
        if let b = p.beforeId, photos.contains(where: { $0.id == b }) { return "After" }
        if photos.contains(where: { $0.beforeId == p.id }) { return "Before" }
        return nil
    }

    private func rendered(maxSide: CGFloat) async -> [(Photo, UIImage)] {
        var out: [(Photo, UIImage)] = []
        for (i, p) in ordered.enumerated() {
            busy = "Preparing photo \(i + 1) of \(ordered.count)…"
            guard let img = app.store.image(p.imageId) else { continue }
            let shapes = p.annotations
            out.append((p, await Task.detached(priority: .userInitiated) { PhotoMarkup.render(img, shapes: shapes, maxSide: maxSide) }.value))
        }
        return out
    }

    private func pdf() async {
        error = nil
        defer { busy = nil }
        let imgs = await rendered(maxSide: perPage == 1 ? 2000 : 1400)
        busy = "Building the PDF…"
        let logo = await PhotoReportBuilder.logo(app.settings)
        var byId: [String: PhotoReportBuilder.Item] = [:]
        for (p, img) in imgs {
            byId[p.id] = PhotoReportBuilder.Item(image: img, caption: p.caption, meta: meta(p), tags: p.tags ?? [], label: label(p), comments: comments(p))
        }
        let secs: [PhotoReportLayout.Section<PhotoReportBuilder.Item>] = sections.map { s in s.map { byId[$0.id] } }.filter { !$0.cells.isEmpty }
        let data = PhotoReportBuilder.pdf(title: title, notes: notes, project: model.bundle.project, business: app.settings.business, logo: logo,
                                          range: PhotoReportBuilder.range(ordered), perPage: perPage, sections: secs)
        share = SharedFile(url: PDFExporter.write(data, name: "\(slug(model.bundle.project.address.isEmpty ? "job" : model.bundle.project.address))-photo-report.pdf"))
    }

    private func publish() async {
        error = nil
        defer { busy = nil }
        let token = Proposals.newToken()
        do {
            var list: [[String: Any]] = []
            var indexOf: [String: Int] = [:]
            let imgs = await rendered(maxSide: 1600)
            for (i, (p, img)) in imgs.enumerated() {
                busy = "Uploading photo \(i + 1) of \(imgs.count)…"
                guard let data = img.jpegData(compressionQuality: 0.85) else { continue }
                let url = try await app.cloud.uploadPublic(path: "reports/\(token)/\(p.id).jpg", data: data, contentType: "image/jpeg")
                var entry: [String: Any] = ["url": url, "width": img.size.width, "height": img.size.height, "caption": p.caption ?? "", "meta": meta(p), "tags": p.tags ?? [], "label": label(p) ?? ""]
                let notesOn = comments(p)
                if !notesOn.isEmpty { entry["comments"] = notesOn.map { c -> [String: String] in ["author": c.author, "text": c.text, "at": c.at] } }
                indexOf[p.id] = list.count
                list.append(entry)
            }
            busy = "Publishing…"
            let b = app.settings.business
            var origin = app.settings.serverURL.trimmingCharacters(in: .whitespaces)
            if !origin.hasPrefix("http") { origin = "https://" + origin }
            while origin.hasSuffix("/") { origin.removeLast() }
            let logo = b.logo.map { $0.hasPrefix("/") ? origin + $0 : $0 } ?? ""
            let grouped = groupBy != .none || (pairs && hasPairs)
            var snapshot: [String: Any] = [
                "version": grouped ? 2 : 1, "title": title, "notes": notes, "dateRange": PhotoReportBuilder.range(ordered), "createdAt": isoNow(),
                "client": ["name": model.bundle.project.clientName, "address": model.bundle.project.address],
                "business": ["name": b.name, "phone": b.phone, "email": b.email, "website": b.website, "logo": logo,
                             "brandColor": b.brandColor ?? "", "accentColor": b.accentColor ?? "", "tagline": b.tagline ?? ""],
                "photos": list,
            ]
            if grouped { snapshot["sections"] = PhotoReportLayout.snapshotSections(sections, indexOf: indexOf) }
            try await app.cloud.publishPhotoReport(token: token, projectId: model.bundle.project.id, snapshot: snapshot)
            let url = URL(string: "\(origin)/r?t=\(token)")
            link = url
            if let url { UIPasteboard.general.url = url }
            model.say("Report link copied")
        } catch {
            self.error = error.localizedDescription
        }
    }
}

enum PhotoReportBuilder {
    struct Item { let image: UIImage; let caption: String?; let meta: String; let tags: [String]; let label: String?; var comments: [PhotoReportLayout.Comment] = [] }

    static func range(_ ordered: [Photo]) -> String {
        let days = [ordered.first, ordered.last].compactMap { $0.flatMap { FieldDocs.date($0.takenAt)?.formatted(date: .abbreviated, time: .omitted) } }
        return Array(NSOrderedSet(array: days)).compactMap { $0 as? String }.joined(separator: " – ")
    }

    /// The company logo from the PinPlan server (or a full URL); nil if it can't be loaded.
    static func logo(_ s: AppSettings) async -> UIImage? {
        guard var path = s.business.logo, !path.isEmpty else { return nil }
        if path.hasPrefix("/") {
            var origin = s.serverURL.trimmingCharacters(in: .whitespaces)
            guard !origin.isEmpty else { return nil }
            if !origin.hasPrefix("http") { origin = "https://" + origin }
            while origin.hasSuffix("/") { origin.removeLast() }
            path = origin + path
        }
        guard let url = URL(string: path), let res = try? await URLSession.shared.data(from: url) else { return nil }
        return UIImage(data: res.0)
    }

    /// `sections` come from `PhotoReportLayout.sections` (one untitled section of single photos = the original layout).
    static func pdf(title: String, notes: String, project: Project, business: BusinessSettings, logo: UIImage?, range: String, perPage: Int,
                    sections: [PhotoReportLayout.Section<Item>]) -> Data {
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let brand = UIColor(hex: business.brandColor ?? "#0a1b54")
        let L: CGFloat = 36, R = page.width - 36, W = R - L
        let halfW: CGFloat = (W - 12) / 2
        let cellW: CGFloat = perPage == 1 ? W : halfW
        let imgH: CGFloat = perPage == 1 ? 470 : perPage == 2 ? 300 : 200
        let pairH: CGFloat = perPage == 1 ? 340 : imgH
        let commentsH: CGFloat = perPage == 1 ? 60 : perPage == 2 ? 110 : 30
        let pages: [[PhotoReportLayout.Row<Item>]] = PhotoReportLayout.pages(sections, perPage: perPage)
        let count: Int = sections.reduce(0) { n, s in n + s.cells.reduce(0) { $0 + $1.count } }

        func draw(_ s: String, _ r: CGRect, size: CGFloat, weight: UIFont.Weight = .regular, color: UIColor = .black, align: NSTextAlignment = .left) -> CGFloat {
            let para = NSMutableParagraphStyle(); para.alignment = align; para.lineBreakMode = .byWordWrapping
            let str = NSAttributedString(string: s, attributes: [.font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: para])
            let h = ceil(str.boundingRect(with: CGSize(width: r.width, height: r.height), options: [.usesLineFragmentOrigin], context: nil).height)
            str.draw(with: CGRect(x: r.minX, y: r.minY, width: r.width, height: min(h, r.height)), options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
            return min(h, r.height)
        }

        /// One photo with its label, caption, details, tags and comments; returns the bottom of its text.
        func cell(_ it: Item, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) -> CGFloat {
            let box = CGRect(x: x, y: y, width: w, height: h)
            UIColor(red: 0.945, green: 0.96, blue: 0.976, alpha: 1).setFill()
            UIBezierPath(roundedRect: box, cornerRadius: 4).fill()
            let s: CGFloat = min(box.width / it.image.size.width, box.height / it.image.size.height)
            let iw: CGFloat = it.image.size.width * s, ih: CGFloat = it.image.size.height * s
            it.image.draw(in: CGRect(x: box.midX - iw / 2, y: box.midY - ih / 2, width: iw, height: ih))
            var ty: CGFloat = box.maxY + 5
            if let l = it.label { ty += draw(l.uppercased(), CGRect(x: x, y: ty, width: w, height: 12), size: 8, weight: .bold, color: brand) + 1 }
            if let c = it.caption, !c.isEmpty { ty += draw(c, CGRect(x: x, y: ty, width: w, height: 26), size: 10, weight: .semibold) + 1 }
            ty += draw(it.meta, CGRect(x: x, y: ty, width: w, height: 24), size: 8, color: .gray)
            if !it.tags.isEmpty { ty += draw(it.tags.joined(separator: " · "), CGRect(x: x, y: ty, width: w, height: 12), size: 8, color: .gray) }
            if !it.comments.isEmpty {
                let lines: [String] = it.comments.map { c in
                    let when: String = FieldDocs.date(c.at)?.formatted(date: .abbreviated, time: .omitted) ?? ""
                    let who: String = [c.author, when].filter { !$0.isEmpty }.joined(separator: " · ")
                    return "\(who.isEmpty ? "Comment" : who): \(c.text)"
                }
                ty += 3
                let ch: CGFloat = draw(lines.joined(separator: "\n"), CGRect(x: x + 6, y: ty, width: w - 6, height: commentsH), size: 8, color: .darkGray)
                UIColor(red: 0.8, green: 0.835, blue: 0.882, alpha: 1).setFill()
                UIRectFill(CGRect(x: x, y: ty, width: 1.5, height: ch))
                ty += ch
            }
            return ty
        }

        return UIGraphicsPDFRenderer(bounds: page).pdfData { ctx in
            for (pi, rows) in pages.enumerated() {
                ctx.beginPage()
                brand.setFill(); UIRectFill(CGRect(x: 0, y: 0, width: page.width, height: 6))
                var y: CGFloat = 28
                if pi == 0 {
                    let headW: CGFloat = 330
                    var hy = y
                    hy += draw(title, CGRect(x: L, y: hy, width: headW, height: 60), size: 18, weight: .bold, color: brand) + 4
                    hy += draw([project.clientName, project.address].filter { !$0.isEmpty }.joined(separator: " · "), CGRect(x: L, y: hy, width: headW, height: 30), size: 9, color: .gray)
                    hy += draw("\(range) · \(count) photo\(count == 1 ? "" : "s")",CGRect(x: L, y: hy, width: headW, height: 14), size: 9, color: .gray)
                    if !notes.isEmpty { hy += 8; hy += draw(notes, CGRect(x: L, y: hy, width: headW, height: 140), size: 9.5) }
                    var ry = y
                    if let logo {
                        let h: CGFloat = 38, w = min(170, logo.size.width * h / max(1, logo.size.height))
                        logo.draw(in: CGRect(x: R - w, y: ry, width: w, height: h)); ry += h + 4
                    } else {
                        ry += draw(business.name, CGRect(x: R - 190, y: ry, width: 190, height: 18), size: 12, weight: .bold, align: .right)
                    }
                    ry += draw([business.phone, business.email, business.website].filter { !$0.isEmpty }.joined(separator: "\n"), CGRect(x: R - 190, y: ry, width: 190, height: 50), size: 9, color: .gray, align: .right)
                    y = max(hy, ry) + 14
                }
                for row in rows {
                    switch row {
                    case .heading(let t):
                        let th: CGFloat = draw(t, CGRect(x: L, y: y + 2, width: W, height: 18), size: 12, weight: .bold, color: brand)
                        UIColor(red: 0.886, green: 0.91, blue: 0.941, alpha: 1).setFill()
                        UIRectFill(CGRect(x: L, y: y + th + 5, width: W, height: 1))
                        y += th + 14
                    case .photos(let items, let pair):
                        let w: CGFloat = pair ? halfW : cellW
                        let h: CGFloat = pair ? pairH : imgH
                        var bottom: CGFloat = y
                        for (k, it) in items.enumerated() {
                            bottom = max(bottom, cell(it, x: L + CGFloat(k) * (w + 12), y: y, w: w, h: h))
                        }
                        y = max(y + h + 52, bottom + 12)
                    }
                }
                _ = draw(business.name, CGRect(x: L, y: page.height - 26, width: 300, height: 12), size: 7.5, color: .gray)
                _ = draw("\(pi + 1) / \(pages.count)",CGRect(x: R - 100, y: page.height - 26, width: 100, height: 12), size: 7.5, color: .gray, align: .right)
            }
        }
    }
}
