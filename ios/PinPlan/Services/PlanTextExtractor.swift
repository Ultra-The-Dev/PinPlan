import UIKit
import PDFKit
import Vision
import PinPlanCore

/// Pulls every line of text off a sheet, with its position in the sheet's displayed orientation.
enum PlanTextExtractor {
    static func items(for sheet: Sheet, store: Store) -> [PlanTextItem] {
        if let pdfId = sheet.sourcePdfId, let page = sheet.sourcePage,
           let doc = PDFDocument(url: store.pdfURL(pdfId)), let p = doc.page(at: page) {
            let fromPDF = pdfItems(p, extraRotation: sheet.sourceRotation ?? 0)
            if !fromPDF.isEmpty { return fromPDF }
        }
        guard let image = store.image(sheet.imageId) else { return [] }
        return ocrItems(image)
    }

    /// Text layer of a vector PDF page (exact text, no recognition errors).
    /// Glyphs are grouped into segments by baseline and horizontal gaps, so separate labels that share a
    /// baseline (e.g. "LIVING" and "KITCHEN" across a wall) stay separate items.
    static func pdfItems(_ page: PDFPage, extraRotation: Int) -> [PlanTextItem] {
        let box = page.bounds(for: .cropBox)
        guard box.width > 0, box.height > 0, let string = page.string, !string.isEmpty else { return [] }
        let ns = string as NSString
        let turns = ((page.rotation % 360) + 360) % 360 / 90 + extraRotation

        var out: [PlanTextItem] = []
        var text = ""
        var rect = CGRect.null
        var last = CGRect.null
        func flush() {
            let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty, !rect.isNull {
                var x = Double((rect.midX - box.minX) / box.width)
                var y = Double(1 - (rect.midY - box.minY) / box.height)
                for _ in 0..<(turns % 4) { (x, y) = (1 - y, x) }   // quarter turns clockwise
                out.append(PlanTextItem(text: t, x: x, y: y))
            }
            text = ""; rect = .null; last = .null
        }
        for i in 0..<ns.length {
            let ch = ns.substring(with: NSRange(location: i, length: 1))
            if ch == "\n" || ch == "\r" { flush(); continue }
            let b = page.characterBounds(at: i)
            if ch.trimmingCharacters(in: .whitespaces).isEmpty || b.width <= 0 || b.height <= 0 {
                if !text.isEmpty { text += " " }
                continue
            }
            if !last.isNull {
                let h = max(b.height, last.height)
                let sameLine = abs(b.midY - last.midY) <= 0.6 * h
                let gap = b.minX - last.maxX
                // Vertical text (rotated labels) runs down/up a column instead.
                let w = max(b.width, last.width)
                let sameColumn = abs(b.midX - last.midX) <= 0.6 * w && abs(b.midY - last.midY) <= 2.4 * w
                if sameLine ? (gap > 1.8 * h || gap < -2 * h) : !sameColumn { flush() }
            }
            if text.hasSuffix("  ") { text.removeLast() }
            text += ch
            rect = rect.union(b)
            last = b
        }
        flush()
        // Collapse runs of spaces left by wide letter spacing.
        return out.map { PlanTextItem(text: $0.text.split(separator: " ", omittingEmptySubsequences: true).joined(separator: " "), x: $0.x, y: $0.y) }
    }

    /// On-device text recognition for scans and photos.
    static func ocrItems(_ image: UIImage) -> [PlanTextItem] {
        guard let cg = image.downscaled(maxSide: 3000).cgImage else { return [] }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.minimumTextHeight = 0.006
        try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
        return (request.results ?? []).compactMap { obs in
            guard let s = obs.topCandidates(1).first?.string else { return nil }
            return PlanTextItem(text: s, x: Double(obs.boundingBox.midX), y: Double(1 - obs.boundingBox.midY))
        }
    }
}
