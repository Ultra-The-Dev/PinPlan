import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins
import Vision

/// How a scanned/photographed plan page is cleaned up.
enum EnhanceMode: String, CaseIterable, Identifiable, Sendable {
    case original, clean, blackWhite
    var id: String { rawValue }
    var title: String {
        switch self {
        case .original: return "Original"
        case .clean: return "Clean"
        case .blackWhite: return "B&W"
        }
    }
}

/// Image pipeline for paper plans: perspective correction, lighting flattening, contrast and sharpening (Core Image),
/// page-edge detection and text recognition (Vision). Everything runs on device, offline.
enum ScanProcessing {
    static let context = CIContext(options: [.useSoftwareRenderer: false, .cacheIntermediates: false])

    /// Quad corners, normalized 0…1 with a top-left origin: TL, TR, BR, BL.
    typealias Quad = [CGPoint]

    // MARK: page detection

    /// Find the paper sheet in a photo. nil when no confident page outline is found.
    static func detectPage(in image: UIImage) -> Quad? {
        guard let cg = image.normalizedOrientation().downscaled(maxSide: 1600).cgImage else { return nil }
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        // 1) Document segmentation (neural, best for paper on busy backgrounds).
        let doc = VNDetectDocumentSegmentationRequest()
        // 2) Classic rectangle detector as a fallback.
        let rect = VNDetectRectanglesRequest()
        rect.maximumObservations = 1
        rect.minimumSize = 0.3
        rect.minimumAspectRatio = 0.3
        rect.quadratureTolerance = 30
        rect.minimumConfidence = 0.5
        try? handler.perform([doc, rect])
        let found = (doc.results?.first.flatMap { $0.confidence > 0.5 ? $0 : nil }) ?? rect.results?.first
        guard let r = found else { return nil }
        // Vision uses a bottom-left origin.
        return [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft].map { CGPoint(x: $0.x, y: 1 - $0.y) }
    }

    // MARK: text

    /// Recognise text (title blocks, room names, scale notes) — used to name floors.
    static func recognizeText(in image: UIImage) -> String {
        let small = image.normalizedOrientation().downscaled(maxSide: 2400)
        guard let cg = small.cgImage else { return "" }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.minimumTextHeight = 0.008
        try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
    }

    // MARK: processing

    /// Full pipeline: orientation → optional perspective crop → quarter turns → enhancement → size limit.
    static func process(_ image: UIImage, quad: Quad?, rotation: Int, mode: EnhanceMode, maxSide: CGFloat = PlanImporter.maxSide) -> UIImage {
        let upright = image.normalizedOrientation()
        guard var ci = CIImage(image: upright) else { return upright }
        let extent = ci.extent
        if let q = quad, q.count == 4 {
            // CI uses a bottom-left origin in pixels.
            func p(_ v: CGPoint) -> CIVector { CIVector(x: v.x * extent.width, y: (1 - v.y) * extent.height) }
            let f = CIFilter.perspectiveCorrection()
            f.inputImage = ci
            f.topLeft = p(q[0]).cgPointValue
            f.topRight = p(q[1]).cgPointValue
            f.bottomRight = p(q[2]).cgPointValue
            f.bottomLeft = p(q[3]).cgPointValue
            if let out = f.outputImage { ci = out }
        }
        for _ in 0..<((rotation % 4 + 4) % 4) { ci = ci.oriented(.right) }
        ci = ci.transformed(by: CGAffineTransform(translationX: -ci.extent.minX, y: -ci.extent.minY))
        // Limit size before the heavier filters.
        let longest = max(ci.extent.width, ci.extent.height)
        if longest > maxSide { ci = ci.transformed(by: CGAffineTransform(scaleX: maxSide / longest, y: maxSide / longest)) }
        ci = enhance(ci, mode: mode)
        guard let cg = context.createCGImage(ci, from: ci.extent.integral) else { return upright }
        return UIImage(cgImage: cg)
    }

    static func enhance(_ input: CIImage, mode: EnhanceMode) -> CIImage {
        guard mode != .original else { return input }
        let extent = input.extent
        // 1) Flatten lighting: estimate the paper (remove ink with a max filter, then blur) and divide it out,
        //    so shadows and uneven light become white paper while lines and coloured ink are kept.
        let maxF = CIFilter.morphologyMaximum()
        maxF.inputImage = input
        maxF.radius = Float(max(4, extent.width / 300))
        let blur = CIFilter.gaussianBlur()
        blur.inputImage = (maxF.outputImage ?? input).clampedToExtent()
        blur.radius = Float(max(12, extent.width / 80))
        let background = (blur.outputImage ?? input).cropped(to: extent)
        let divide = CIFilter.divideBlendMode()
        // CIDivideBlendMode computes backgroundImage ÷ inputImage (verified on device screenshots).
        divide.inputImage = background
        divide.backgroundImage = input
        var out = (divide.outputImage ?? input).cropped(to: extent)
        // 2) Contrast + sharpen lines.
        let controls = CIFilter.colorControls()
        controls.inputImage = out
        controls.contrast = mode == .blackWhite ? 1.9 : 1.35
        controls.saturation = mode == .blackWhite ? 0 : 1.15
        controls.brightness = mode == .blackWhite ? 0.05 : 0.02
        out = controls.outputImage ?? out
        let sharpen = CIFilter.sharpenLuminance()
        sharpen.inputImage = out
        sharpen.sharpness = 0.7
        sharpen.radius = 1.6
        out = (sharpen.outputImage ?? out).cropped(to: extent)
        return out
    }
}

extension UIImage {
    /// Pixel data rotated to `.up` so Core Image / Vision see what the user sees.
    func normalizedOrientation() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in draw(in: CGRect(origin: .zero, size: size)) }
    }

    func downscaled(maxSide: CGFloat) -> UIImage {
        let px = pixelSize
        let k = min(1, maxSide / max(px.width, px.height))
        guard k < 1 else { return self }
        let size = CGSize(width: floor(px.width * k), height: floor(px.height * k))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in draw(in: CGRect(origin: .zero, size: size)) }
    }
}
