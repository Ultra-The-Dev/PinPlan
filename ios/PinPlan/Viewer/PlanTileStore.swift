import UIKit
import ImageIO
import UniformTypeIdentifiers
import PinPlanCore

/// Plan tiles, previews and thumbnails, made once per sheet image and kept in Caches (the system may purge them;
/// they are rebuilt on demand from the stored sheet image):
///
///     Caches/PlanTiles/<imageId>/L<level>_<col>_<row>.jpg   tile pyramid (PlanTiles), plus manifest.json when complete
///     Caches/PlanTiles/previews/<imageId>-preview.jpg        ≤2048 px: what you see instantly and while tiles load
///     Caches/PlanTiles/previews/<imageId>-thumb.jpg          ≤480 px: sheet browser and minimap
///
/// Sheet images never change in place (a rotation saves a new image id), so the image id is the cache key.
/// Only the tiles on screen are decoded, so a 16 MP sheet costs a few MB of memory instead of 64 MB.
final class PlanTileStore: @unchecked Sendable {
    static let shared = PlanTileStore()

    let root: URL
    private let previewsDir: URL
    private let tiles = NSCache<NSString, UIImage>()
    private let small = NSCache<NSString, UIImage>()
    private let readyLock = NSLock()
    private var ready: Set<String> = []
    /// Pyramids being built, by image id (main actor only).
    private var building: [String: Task<Bool, Never>] = [:]

    /// Older iPads (2–3 GB) get smaller previews and a smaller decoded-tile budget.
    static let lowMemory = ProcessInfo.processInfo.physicalMemory < 3_500_000_000
    static var previewMaxSide: Int { lowMemory ? 1400 : 2048 }
    static let thumbMaxSide = 480

    init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        root = caches.appendingPathComponent("PlanTiles", isDirectory: true)
        previewsDir = root.appendingPathComponent("previews", isDirectory: true)
        try? FileManager.default.createDirectory(at: previewsDir, withIntermediateDirectories: true)
        tiles.totalCostLimit = (PlanTileStore.lowMemory ? 24 : 64) * 1024 * 1024
        small.totalCostLimit = 48 * 1024 * 1024
        NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in
            self?.tiles.removeAllObjects()
            self?.small.removeAllObjects()
        }
    }

    /// Where the app keeps a sheet image (Store: Documents/Northpin/images/<id>.jpg).
    static func sourceURL(imageId: String, store: Store) -> URL {
        store.root.appendingPathComponent("images", isDirectory: true).appendingPathComponent("\(imageId).jpg")
    }

    private func pyramidDir(_ imageId: String) -> URL { root.appendingPathComponent(imageId, isDirectory: true) }
    private func previewURL(_ imageId: String) -> URL { previewsDir.appendingPathComponent("\(imageId)-preview.jpg") }
    private func thumbURL(_ imageId: String) -> URL { previewsDir.appendingPathComponent("\(imageId)-thumb.jpg") }

    // MARK: pyramid

    /// Whether every tile of this image is on disk.
    func isReady(_ imageId: String) -> Bool {
        readyLock.lock()
        let known = ready.contains(imageId)
        readyLock.unlock()
        if known { return true }
        let ok = FileManager.default.fileExists(atPath: pyramidDir(imageId).appendingPathComponent("manifest.json").path)
        if ok { readyLock.lock(); ready.insert(imageId); readyLock.unlock() }
        return ok
    }

    /// Builds the tile pyramid once (in the background); concurrent callers share the work.
    @MainActor
    func ensurePyramid(imageId: String, source: URL) async -> Bool {
        if isReady(imageId) { return true }
        if let t = building[imageId] { return await t.value }
        let task = Task.detached(priority: .userInitiated) { [self] in self.buildPyramid(imageId: imageId, source: source) }
        building[imageId] = task
        let ok = await task.value
        building[imageId] = nil
        return ok
    }

    private func buildPyramid(imageId: String, source: URL) -> Bool {
        guard let src = CGImageSourceCreateWithURL(source as CFURL, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
              let pw = props[kCGImagePropertyPixelWidth] as? Int, let ph = props[kCGImagePropertyPixelHeight] as? Int, pw > 0, ph > 0
        else { return false }
        let sheet = PlanSize(width: Double(pw), height: Double(ph))
        let fm = FileManager.default
        let tmp = root.appendingPathComponent("\(imageId).building-\(UUID().uuidString)", isDirectory: true)
        do { try fm.createDirectory(at: tmp, withIntermediateDirectories: true) } catch { return false }
        let levels = PlanTiles.levelCount(sheet: sheet)
        // Coarse levels first (cheap); full resolution last, decoded once and released straight after.
        for level in (0..<levels).reversed() {
            let ok: Bool = autoreleasepool {
                guard let image = PlanTileStore.decode(src, level: level, sheet: sheet) else { return false }
                let expected = PlanTiles.levelSize(sheet: sheet, level: level)
                let kx = Double(image.width) / expected.width, ky = Double(image.height) / expected.height
                for t in PlanTiles.allTiles(sheet: sheet) where t.level == level {
                    let r = PlanTiles.levelRect(of: t, sheet: sheet)
                    let crop = CGRect(x: CGFloat(r.x * kx), y: CGFloat(r.y * ky), width: CGFloat(r.width * kx), height: CGFloat(r.height * ky)).integral
                    guard let tile = image.cropping(to: crop) else { continue }
                    PlanTileStore.writeJPEG(tile, to: tmp.appendingPathComponent(t.fileName), quality: 0.82)
                }
                return true
            }
            if !ok { try? fm.removeItem(at: tmp); return false }
        }
        let manifest = "{\"width\":\(pw),\"height\":\(ph),\"levels\":\(levels),\"tileSize\":\(PlanTiles.tileSize),\"version\":1}"
        try? Data(manifest.utf8).write(to: tmp.appendingPathComponent("manifest.json"))
        let final = pyramidDir(imageId)
        try? fm.removeItem(at: final)
        do { try fm.moveItem(at: tmp, to: final) } catch { try? fm.removeItem(at: tmp); return false }
        readyLock.lock(); ready.insert(imageId); readyLock.unlock()
        return true
    }

    /// The image at a pyramid level: full decode for level 0, a downsampled decode (cheap) above.
    private static func decode(_ src: CGImageSource, level: Int, sheet: PlanSize) -> CGImage? {
        if level == 0 { return CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) }
        let size = PlanTiles.levelSize(sheet: sheet, level: level)
        return thumbnail(src, maxSide: Int(max(size.width, size.height)))
    }

    private static func thumbnail(_ src: CGImageSource, maxSide: Int) -> CGImage? {
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSide,
            kCGImageSourceCreateThumbnailWithTransform: false,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
    }

    @discardableResult
    private static func writeJPEG(_ image: CGImage, to url: URL, quality: Double) -> Bool {
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { return false }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        return CGImageDestinationFinalize(dest)
    }

    /// A decoded tile (thread-safe; called from the tiled layer's background drawing).
    func tile(_ imageId: String, _ t: PlanTiles.TileID) -> UIImage? {
        let key = "\(imageId)/\(t.fileName)" as NSString
        if let img = tiles.object(forKey: key) { return img }
        let url = pyramidDir(imageId).appendingPathComponent(t.fileName)
        guard let raw = UIImage(contentsOfFile: url.path) else { return nil }
        let img = raw.preparingForDisplay() ?? raw
        let px = img.size.width * img.scale * img.size.height * img.scale * 4
        tiles.setObject(img, forKey: key, cost: Int(px))
        return img
    }

    // MARK: previews and thumbnails

    /// The instant whole-sheet preview, if it was made before (synchronous, for the first frame).
    func cachedPreview(_ imageId: String) -> UIImage? { cachedSmall(previewURL(imageId), key: "p/\(imageId)") }

    /// The whole-sheet preview, made from the sheet image if needed.
    func preview(imageId: String, source: URL) async -> UIImage? {
        await small(imageId: imageId, source: source, url: previewURL(imageId), key: "p/\(imageId)", maxSide: Self.previewMaxSide)
    }

    /// Small thumbnail for the sheet browser and minimap.
    func thumbnail(imageId: String, source: URL) async -> UIImage? {
        await small(imageId: imageId, source: source, url: thumbURL(imageId), key: "t/\(imageId)", maxSide: Self.thumbMaxSide)
    }

    private func cachedSmall(_ url: URL, key: String) -> UIImage? {
        if let img = small.object(forKey: key as NSString) { return img }
        guard let raw = UIImage(contentsOfFile: url.path) else { return nil }
        let img = raw.preparingForDisplay() ?? raw
        small.setObject(img, forKey: key as NSString, cost: Int(img.size.width * img.size.height * 4))
        return img
    }

    private func small(imageId: String, source: URL, url: URL, key: String, maxSide: Int) async -> UIImage? {
        if let img = cachedSmall(url, key: key) { return img }
        let made: UIImage? = await Task.detached(priority: .userInitiated) { () -> UIImage? in
            guard let src = CGImageSourceCreateWithURL(source as CFURL, nil), let cg = PlanTileStore.thumbnail(src, maxSide: maxSide) else { return nil }
            PlanTileStore.writeJPEG(cg, to: url, quality: 0.85)
            let img = UIImage(cgImage: cg)
            return img.preparingForDisplay() ?? img
        }.value
        if let made { small.setObject(made, forKey: key as NSString, cost: Int(made.size.width * made.size.height * 4)) }
        return made
    }
}
