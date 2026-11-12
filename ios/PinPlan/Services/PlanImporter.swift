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

    static func renderPDF(at url: URL, progress: @escaping (Int, Int) -> Void = { _, _ in }) throws -> [RenderedPage] {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        guard let doc = PDFDocument(url: url) else { throw ImportError.unreadablePDF }
        var pages: [RenderedPage] = []
        for i in 0..<doc.pageCount {
            guard let page = doc.page(at: i) else { continue }
            let box = page.bounds(for: .mediaBox)
            let scale = min(maxSide / max(box.width, box.height), sqrt(maxPixels / (box.width * box.height)), 6)
            let size = CGSize(width: floor(box.width * scale), height: floor(box.height * scale))
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            format.opaque = true
            let img = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
                UIColor.white.setFill()
                ctx.fill(CGRect(origin: .zero, size: size))
                ctx.cgContext.translateBy(x: 0, y: size.height)
                ctx.cgContext.scaleBy(x: scale, y: -scale)
                page.draw(with: .mediaBox, to: ctx.cgContext)
            }
            pages.append(RenderedPage(image: img, pageNumber: i + 1, pxPerInch: 72 * Double(scale), text: page.string ?? ""))
            progress(i + 1, doc.pageCount)
        }
        return pages
    }

    /// Guess the floor from the title block text, e.g. "ATTIC", "1ST. FL", "CELLAR".
    static func guessFloorName(_ text: String, fallback: String) -> String {
        let t = text.uppercased()
        let patterns: [(String, String)] = [
            (#"\bATTIC\b"#, "Attic"), (#"\bCELLAR\b"#, "Cellar"), (#"\bBASEMENT\b"#, "Basement"),
            (#"\b(1ST|FIRST)\.?\s*(FL|FLOOR)\b"#, "1st Fl"), (#"\b(2ND|SECOND)\.?\s*(FL|FLOOR)\b"#, "2nd Fl"),
            (#"\b(3RD|THIRD)\.?\s*(FL|FLOOR)\b"#, "3rd Fl"), (#"\bGROUND\s*(FL|FLOOR)\b"#, "Ground Fl"), (#"\bROOF\b"#, "Roof"),
        ]
        for (re, name) in patterns where t.range(of: re, options: .regularExpression) != nil { return name }
        return fallback
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
        case unreadablePDF
        var errorDescription: String? { "That PDF couldn't be opened." }
    }
}

extension UIImage {
    var pixelSize: CGSize { CGSize(width: size.width * scale, height: size.height * scale) }
}
