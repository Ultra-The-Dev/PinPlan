import UIKit
import PDFKit

/// Vector PDF rendering that respects the page's crop box and /Rotate, at any resolution, for the whole page or a region.
enum PDFRender {
    /// Page size in points as displayed (crop box, rotated by the page's /Rotate).
    static func orientedSize(_ page: CGPDFPage) -> CGSize {
        let box = page.getBoxRect(.cropBox)
        let r = ((page.rotationAngle % 360) + 360) % 360
        return (r == 90 || r == 270) ? CGSize(width: box.height, height: box.width) : box.size
    }

    /// Render `region` (relative 0…1, top-left origin, in the page's displayed orientation) at `pixelSize`.
    static func render(_ page: CGPDFPage, region: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1), pixelSize: CGSize) -> UIImage {
        let o = orientedSize(page)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let size = CGSize(width: max(1, pixelSize.width.rounded()), height: max(1, pixelSize.height.rounded()))
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let c = ctx.cgContext
            UIColor.white.setFill()
            c.fill(CGRect(origin: .zero, size: size))
            c.interpolationQuality = .high
            c.setShouldAntialias(true)
            // Flip to PDF space (y up), then map the region to the output.
            c.translateBy(x: 0, y: size.height)
            c.scaleBy(x: 1, y: -1)
            let k = size.width / (region.width * o.width)
            c.scaleBy(x: k, y: k)
            c.translateBy(x: -region.minX * o.width, y: -(o.height * (1 - region.maxY)))
            // Maps the crop box (including the page's own rotation) onto (0,0,o.width,o.height).
            c.concatenate(page.getDrawingTransform(.cropBox, rect: CGRect(origin: .zero, size: o), rotate: 0, preserveAspectRatio: true))
            c.clip(to: page.getBoxRect(.cropBox))
            c.drawPDFPage(page)
        }
    }
}

/// Caches open PDF documents for the zoom detail renderer.
final class PDFCache: @unchecked Sendable {
    static let shared = PDFCache()
    private var docs: [String: CGPDFDocument] = [:]
    private let lock = NSLock()

    func page(pdfId: String, index: Int, url: URL) -> CGPDFPage? {
        lock.lock(); defer { lock.unlock() }
        if docs[pdfId] == nil { docs[pdfId] = CGPDFDocument(url as CFURL) }
        return docs[pdfId]?.page(at: index + 1)
    }
}
