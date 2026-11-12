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

        var text = ""
        var rect = CGRect.null
        var last = CGRect.null
        var segments: [TextSegment] = []
        func flush() {
            let t = text.split(separator: " ", omittingEmptySubsequences: true).joined(separator: " ")
            if !t.isEmpty, !rect.isNull {
                // Page space has y up; segments use y down so "below" reads naturally.
                segments.append(TextSegment(text: t, minX: rect.minX, minY: box.maxY - rect.maxY,
                                            maxX: rect.maxX, maxY: box.maxY - rect.minY))
            }
            text = ""; rect = .null; last = .null
        }
        for i in 0..<ns.length {
            let ch = ns.substring(with: NSRange(location: i, length: 1))
            if ch == "\n" || ch == "\r" { flush(); continue }
            if ch.trimmingCharacters(in: .whitespaces).isEmpty {
                if !text.isEmpty { text += " " }
                continue
            }
            // A one-character selection shares page.string's indexing (characterBounds(at:) can drift on
            // synthesized spaces and return empty boxes for some glyphs).
            let b = page.selection(for: NSRange(location: i, length: 1))?.bounds(for: page) ?? .null
            if b.isNull || b.width <= 0 || b.height <= 0 {
                text += ch   // keep the letter; position comes from its neighbours
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
        return PlanReader.joinWrappedLines(segments).map { seg in
            var x = ((seg.minX + seg.maxX) / 2 - Double(box.minX)) / Double(box.width)
            var y = ((seg.minY + seg.maxY) / 2) / Double(box.height)   // segment y is already measured down from the top
            for _ in 0..<(turns % 4) { (x, y) = (1 - y, x) }   // quarter turns clockwise
            return PlanTextItem(text: seg.text, x: x, y: y)
        }
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
