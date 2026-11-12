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
    static func pdfItems(_ page: PDFPage, extraRotation: Int) -> [PlanTextItem] {
        let box = page.bounds(for: .cropBox)
        guard box.width > 0, box.height > 0, let selection = page.selection(for: box) else { return [] }
        let pageRotation = ((page.rotation % 360) + 360) % 360 / 90
        var out: [PlanTextItem] = []
        for line in selection.selectionsByLine() {
            guard let text = line.string?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { continue }
            let b = line.bounds(for: page)
            var x = Double((b.midX - box.minX) / box.width)
            var y = Double(1 - (b.midY - box.minY) / box.height)
            for _ in 0..<(pageRotation + extraRotation) { (x, y) = (1 - y, x) }   // quarter turns clockwise
            out.append(PlanTextItem(text: text, x: x, y: y))
        }
        return out
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
