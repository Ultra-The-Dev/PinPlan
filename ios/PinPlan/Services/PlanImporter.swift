import PDFKit
import UIKit
import PinPlanCore

/// Turns a PDF plan set or photos into sheets.
enum PlanImporter {
    /// Keep images under ~16 MP (iPad texture/memory limits) while staying sharp.
    static let maxSide: CGFloat = 4800
    static let maxPixels: CGFloat = 16_000_000

    struct RenderedPage {
        let image: UIImage
        let pageNumber: Int
        /// Image pixels per paper inch (PDF user space is 72 units per inch).
        let pxPerInch: Double
        let text: String
    }

    /// Render every page from its vector content (crop box + page rotation honoured) at up to ~16 MP.
    static func renderPDF(at url: URL, progress: @escaping (Int, Int) -> Void = { _, _ in }) throws -> [RenderedPage] {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        guard let doc = PDFDocument(url: url), let cg = doc.documentRef else { throw ImportError.unreadablePDF }
        if doc.isLocked { throw ImportError.locked }
        var pages: [RenderedPage] = []
        for i in 0..<doc.pageCount {
            guard let page = cg.page(at: i + 1) else { continue }
            let o = PDFRender.orientedSize(page)
            let scale = min(maxSide / max(o.width, o.height), sqrt(maxPixels / (o.width * o.height)), 8)
            let img = autoreleasepool { PDFRender.render(page, pixelSize: CGSize(width: floor(o.width * scale), height: floor(o.height * scale))) }
            pages.append(RenderedPage(image: img, pageNumber: i + 1, pxPerInch: 72 * Double(scale), text: doc.page(at: i)?.string ?? ""))
            progress(i + 1, doc.pageCount)
        }
        return pages
    }

    /// Guess the floor from the title block text, e.g. "ATTIC", "1ST. FL", "CELLAR".
    /// Imports every page of a PDF as sheets: keeps the vector original (for zoom detail and the text layer),
    /// renders each page, names the floor and reads the printed scale from the page text.
    static func sheets(fromPDF url: URL, store: Store, projectId: String, startOrder: Int,
                       fallbackName: (Int) -> String, progress: @escaping (Int, Int) -> Void = { _, _ in }) throws -> (sheets: [Sheet], scaled: Int) {
        let pdfId = store.savePDF(from: url)
        let source = pdfId.map { store.pdfURL($0) } ?? url
        let pages = try renderPDF(at: source, progress: progress)
        var out: [Sheet] = []
        var scaled = 0
        var order = startOrder
        for p in pages {
            guard let imageId = store.saveImage(p.image, quality: 0.92) else { continue }
            let px = p.image.pixelSize
            var sheet = Sheet(projectId: projectId, name: guessFloorName(p.text, fallback: fallbackName(order)),
                              pageNumber: p.pageNumber, order: order, imageId: imageId, width: px.width, height: px.height, pxPerInch: p.pxPerInch)
            sheet.sourcePdfId = pdfId
            sheet.sourcePage = p.pageNumber - 1
            // Printed scale on the sheet → exact scale (paper size is known for PDFs).
            if let found = Geometry.findScale(in: p.text) {
                sheet.pxPerFt = found.inchesPerFoot * p.pxPerInch
                sheet.scaleLabel = found.label
                scaled += 1
            }
            out.append(sheet)
            order += 1
        }
        return (out, scaled)
    }

    static func guessFloorName(_ text: String, fallback: String) -> String {
        PlanReader.floorName(in: text) ?? fallback
    }

    /// Downscale a photo/scan to the sheet size limits.
    static func normalized(_ image: UIImage) -> UIImage {
        let w = image.size.width * image.scale, h = image.size.height * image.scale
        let k = min(1, maxSide / max(w, h))
        let size = CGSize(width: floor(w * k), height: floor(h * k))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }

    static func rotatedClockwise(_ image: UIImage) -> UIImage {
        let w = image.size.width * image.scale, h = image.size.height * image.scale
        let size = CGSize(width: h, height: w)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            ctx.cgContext.translateBy(x: size.width, y: 0)
            ctx.cgContext.rotate(by: .pi / 2)
            image.draw(in: CGRect(x: 0, y: 0, width: w, height: h))
        }
    }

    enum ImportError: LocalizedError {
        case unreadablePDF, locked
        var errorDescription: String? {
            switch self {
            case .unreadablePDF: return "That PDF couldn't be opened."
            case .locked: return "That PDF is password-protected. Unlock it and try again."
            }
        }
    }
}

extension UIImage {
    var pixelSize: CGSize { CGSize(width: size.width * scale, height: size.height * scale) }
}
