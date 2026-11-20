import SwiftUI
import UIKit
import ImageIO
import CoreLocation
import PinPlanCore

// Shared pieces for job photos: who took it, where, importing with EXIF time/GPS, and drawing mark-up.
// Mirrors src/lib/photos.ts so photos look the same on the web and on iPad.

enum FieldAuthor {
    private static let key = "pinplan.author"
    /// The name stamped on photos, comments and logs: on a company team, my name there (so everyone sees the same
    /// name); else the one set in Photos › ⋯, else the cloud email's name, else "Me".
    @MainActor static func name(_ app: AppModel) -> String {
        if let me = app.cloud.teamMe { return me.label }
        if let n = UserDefaults.standard.string(forKey: key), !n.trimmingCharacters(in: .whitespaces).isEmpty { return n }
        if let e = app.cloud.session?.email, let first = e.split(separator: "@").first, !first.isEmpty { return String(first) }
        return "Me"
    }
    static var stored: String { UserDefaults.standard.string(forKey: key) ?? "" }
    static func set(_ name: String) { UserDefaults.standard.set(name.trimmingCharacters(in: .whitespaces), forKey: key) }

    /// Change my name: on a team it's my name there (everyone sees it); this device remembers it too.
    @MainActor static func set(_ name: String, app: AppModel) {
        set(name)
        guard app.cloud.onTeam, !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        Task { try? await app.cloud.setMyName(name) }
    }

    /// People to suggest for tasks: names on the jobs plus everyone on the company team.
    @MainActor static func teamNames(_ app: AppModel) -> [String] {
        FieldDocs.teamNames(app.projects, me: name(app), members: app.cloud.teamMembers.map(\.label))
    }
}

/// One-shot location for stamping photos (only when the user has turned it on).
@MainActor
final class LocationOnce: NSObject, CLLocationManagerDelegate {
    static let shared = LocationOnce()
    static let enabledKey = "pinplan.photoLocation"
    static var enabled: Bool {
        get { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }
    private let manager = CLLocationManager()
    private var waiting: [CheckedContinuation<CLLocation?, Never>] = []
    private var last: CLLocation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    /// The current position, or nil if it's off, denied or takes too long (8 s).
    func current() async -> CLLocation? {
        guard Self.enabled else { return nil }
        if let last, -last.timestamp.timeIntervalSinceNow < 120 { return last }
        switch manager.authorizationStatus {
        case .denied, .restricted: return nil
        case .notDetermined: manager.requestWhenInUseAuthorization()
        default: break
        }
        return await withCheckedContinuation { c in
            waiting.append(c)
            manager.requestLocation()
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(8))
                self.finish(nil)
            }
        }
    }

    private func finish(_ loc: CLLocation?) {
        if let loc { last = loc }
        let w = waiting
        waiting = []
        for c in w { c.resume(returning: loc ?? last) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let loc = locations.last
        Task { @MainActor in self.finish(loc) }
    }
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish(nil) }
    }
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            if !self.waiting.isEmpty, manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways { manager.requestLocation() }
        }
    }
}

enum PhotoImport {
    struct Exif { var takenAt: String?; var lat: Double?; var lng: Double? }

    /// Capture time and GPS from the original file (photos picked from the library keep where/when they were taken).
    static func exif(_ data: Data) -> Exif {
        var out = Exif()
        guard let src = CGImageSourceCreateWithData(data as CFData, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] else { return out }
        if let ex = props[kCGImagePropertyExifDictionary] as? [CFString: Any], let s = ex[kCGImagePropertyExifDateTimeOriginal] as? String {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "yyyy:MM:dd HH:mm:ss"
            if let offset = ex[kCGImagePropertyExifOffsetTimeOriginal] as? String, let tz = TimeZone(iso8601Offset: offset) { f.timeZone = tz }
            if let d = f.date(from: s) { out.takenAt = isoString(d) }
        }
        if let gps = props[kCGImagePropertyGPSDictionary] as? [CFString: Any],
           var lat = gps[kCGImagePropertyGPSLatitude] as? Double, var lng = gps[kCGImagePropertyGPSLongitude] as? Double {
            if (gps[kCGImagePropertyGPSLatitudeRef] as? String) == "S" { lat = -lat }
            if (gps[kCGImagePropertyGPSLongitudeRef] as? String) == "W" { lng = -lng }
            if lat != 0 || lng != 0 { out.lat = lat; out.lng = lng }
        }
        return out
    }

    static func isoString(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }

    /// Resize (longest side 2560), save as JPEG and build the Photo row. EXIF time/GPS win over "now"/the device's position.
    @MainActor
    static func make(data: Data, projectId: String, author: String, location: CLLocation?, store: Store) -> Photo? {
        guard let img = UIImage(data: data) else { return nil }
        let ex = exif(data)
        // A library photo gets the device's position only if it was just taken (same rule as the web app);
        // otherwise an old picture would be stamped — and could place the job on the map — wherever the device is now.
        let recent = ex.takenAt.flatMap(FieldDocs.date).map { abs($0.timeIntervalSinceNow) < 300 } ?? false
        return make(image: img, exif: ex, projectId: projectId, author: author, location: recent ? location : nil, store: store)
    }

    @MainActor
    static func make(image img: UIImage, exif: Exif = Exif(), projectId: String, author: String, location: CLLocation?, store: Store) -> Photo? {
        let k = min(1, 2560 / max(img.size.width, img.size.height))
        let size = CGSize(width: (img.size.width * k).rounded(), height: (img.size.height * k).rounded())
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        let upright = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = upright.jpegData(compressionQuality: 0.85), let imageId = store.saveImageData(jpeg, image: upright) else { return nil }
        return Photo(projectId: projectId, imageId: imageId, width: size.width, height: size.height, takenAt: exif.takenAt ?? isoNow(), takenBy: author,
                     lat: exif.lat ?? location?.coordinate.latitude, lng: exif.lng ?? location?.coordinate.longitude)
    }
}

private extension TimeZone {
    init?(iso8601Offset s: String) {
        let sign: Int = s.hasPrefix("-") ? -1 : 1
        let parts = s.dropFirst().split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        self.init(secondsFromGMT: sign * (parts[0] * 3600 + parts[1] * 60))
    }
}

/// Mark-up drawing shared by the viewer, the editor and the exported JPEG/PDF (same look as the web).
enum PhotoMarkup {
    static let colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff", "#111827"]
    static let widths: [Double] = [0.004, 0.007, 0.012]

    /// Draw shapes into a rect (the photo's frame in the context).
    static func draw(_ shapes: [PhotoShape], in ctx: CGContext, rect: CGRect) {
        let w = rect.width, h = rect.height, side = max(w, h)
        for s in shapes {
            let lw: CGFloat = max(1, CGFloat(s.width) * side)
            func P(_ i: Int) -> CGPoint { CGPoint(x: rect.minX + CGFloat(s.points[i]) * w, y: rect.minY + CGFloat(s.points[i + 1]) * h) }
            let color = UIColor(hex: s.color)
            ctx.saveGState()
            ctx.setStrokeColor(color.cgColor)
            ctx.setFillColor(color.cgColor)
            ctx.setLineWidth(lw)
            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)
            ctx.setShadow(offset: .zero, blur: lw * 0.8, color: UIColor.black.withAlphaComponent(0.45).cgColor)
            switch s.kind {
            case .pen where s.points.count >= 4:
                ctx.beginPath()
                ctx.move(to: P(0))
                var i = 2
                while i + 1 < s.points.count { ctx.addLine(to: P(i)); i += 2 }
                ctx.strokePath()
            case .arrow where s.points.count >= 4:
                let a = P(0), b = P(2)
                let ang: CGFloat = atan2(b.y - a.y, b.x - a.x)
                let head: CGFloat = lw * 4.5
                ctx.beginPath()
                ctx.move(to: a)
                ctx.addLine(to: CGPoint(x: b.x - cos(ang) * head * 0.6, y: b.y - sin(ang) * head * 0.6))
                ctx.strokePath()
                ctx.beginPath()
                ctx.move(to: b)
                ctx.addLine(to: CGPoint(x: b.x - head * cos(ang - 0.45), y: b.y - head * sin(ang - 0.45)))
                ctx.addLine(to: CGPoint(x: b.x - head * cos(ang + 0.45), y: b.y - head * sin(ang + 0.45)))
                ctx.closePath()
                ctx.fillPath()
            case .rect where s.points.count >= 4:
                let a = P(0), b = P(2)
                ctx.stroke(CGRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(b.x - a.x), height: abs(b.y - a.y)))
            case .circle where s.points.count >= 4:
                let a = P(0), b = P(2)
                ctx.strokeEllipse(in: CGRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(b.x - a.x), height: abs(b.y - a.y)))
            case .text where s.points.count >= 2 && !(s.text ?? "").isEmpty:
                let p = P(0)
                let size: CGFloat = max(12, lw * 6)
                ctx.setShadow(offset: .zero, blur: 0, color: nil)
                let str = NSAttributedString(string: s.text!, attributes: [.font: UIFont.systemFont(ofSize: size, weight: .bold), .foregroundColor: color])
                let tw = str.size().width
                ctx.setFillColor(UIColor.black.withAlphaComponent(0.55).cgColor)
                ctx.fill(CGRect(x: p.x - size * 0.25, y: p.y - size * 0.15, width: tw + size * 0.5, height: size * 1.3))
                UIGraphicsPushContext(ctx)
                str.draw(at: p)
                UIGraphicsPopContext()
            default: break
            }
            ctx.restoreGState()
        }
    }

    /// The photo with its mark-up burned in, longest side at most `maxSide`.
    static func render(_ image: UIImage, shapes: [PhotoShape]?, maxSide: CGFloat = 1600) -> UIImage {
        let k = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * k).rounded(), height: (image.size.height * k).rounded())
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: size, format: fmt).image { r in
            image.draw(in: CGRect(origin: .zero, size: size))
            if let shapes, !shapes.isEmpty { draw(shapes, in: r.cgContext, rect: CGRect(origin: .zero, size: size)) }
        }
    }
}

/// Mark-up drawn over a photo shown on screen (the photo fills `size`).
struct MarkupOverlay: View {
    let shapes: [PhotoShape]
    var body: some View {
        Canvas { ctx, size in
            ctx.withCGContext { cg in PhotoMarkup.draw(shapes, in: cg, rect: CGRect(origin: .zero, size: size)) }
        }
        .allowsHitTesting(false)
    }
}

/// A photo thumbnail from the local image store (square, cropped).
struct PhotoThumb: View {
    @Environment(AppModel.self) private var app
    let photo: Photo
    var size: CGFloat? = nil
    @State private var image: UIImage?
    var body: some View {
        Color(.secondarySystemFill)
            .overlay {
                if let image { Image(uiImage: image).resizable().scaledToFill() } else { Image(systemName: "photo").foregroundStyle(.tertiary) }
            }
            .frame(width: size, height: size)
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .task(id: photo.imageId) {
                let id = photo.imageId, store = app.store
                image = await Task.detached(priority: .userInitiated) { () -> UIImage? in
                    guard let img = store.image(id) else { return nil }
                    return img.preparingThumbnail(of: CGSize(width: 360, height: 360)) ?? img
                }.value
            }
    }
}

// MARK: AI (through the Northpin server, like the web app)

extension APIClient {
    struct PhotoDescription: Decodable { let caption: String; let tags: [String]; let issues: [String] }
    struct LogDraft: Decodable { let title: String; let body: String }

    private func base64JPEG(_ image: UIImage, maxSide: CGFloat) -> String {
        let small = PhotoMarkup.render(image, shapes: nil, maxSide: maxSide)
        return small.jpegData(compressionQuality: 0.75)?.base64EncodedString() ?? ""
    }

    func describePhoto(_ image: UIImage, room: String?, device: String?, existingTags: [String]) async throws -> PhotoDescription {
        try await postJSON("api/photos/describe", body: ["imageBase64": base64JPEG(image, maxSide: 1280), "mediaType": "image/jpeg", "room": room ?? "", "device": device ?? "", "existingTags": existingTags], as: PhotoDescription.self)
    }

    func draftLog(date: String, address: String, notes: String, photos: [(UIImage, String)]) async throws -> LogDraft {
        let list = photos.prefix(8).map { ["data": base64JPEG($0.0, maxSide: 768), "caption": $0.1] }
        return try await postJSON("api/photos/summary", body: ["date": date, "address": address, "notes": notes, "photos": list], as: LogDraft.self)
    }
}
