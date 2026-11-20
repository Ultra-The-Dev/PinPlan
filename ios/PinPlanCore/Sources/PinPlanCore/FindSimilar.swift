import Foundation
#if canImport(Accelerate)
import Accelerate
#endif

// Find similar (docs/find-similar.md): count doors, windows and any repeated symbol on a plan, on the device, no AI.
// A port of the web's pure helpers (src/lib/findSimilar/match.ts) plus the template matcher itself, which the web runs
// with OpenCV.js in a worker (match.worker.ts). Here it is plain Swift (Accelerate's vDSP for the inner loop on Apple
// platforms), so the same code runs and is tested on Linux:
//
//   • the sheet is shrunk so the picked symbol's shorter side is ~32 px (`chooseScale`), area-averaged and blurred 3×3
//     (`prepare`, like the worker's INTER_AREA + GaussianBlur);
//   • normalised cross-correlation (OpenCV's TM_CCOEFF_NORMED) for every distinct 90° turn and mirror of the symbol;
//   • to keep an iPad responsive without OpenCV's FFT, each orientation is first searched at half size, and every
//     promising spot is then scored exactly at full size in a ±2 px neighbourhood (coarse to fine). Blank paper
//     (windows with no ink) is skipped. Scores are the full-size NCC, so the sensitivity slider means the same as on
//     the web (`thresholdFor`: 0 → 0.95, 50 → 0.70, 100 → 0.45);
//   • greedy non-maximum suppression across orientations, half the symbol's shorter side.
//
// Coordinates: "sheet px" are the sheet image's own pixels (Sheet.width/height); "work px" are the shrunk image the
// matcher runs on (sheet px × scale); results go to the plan sheet-relative (0–1) like markers.
public enum FindSimilar {
    // MARK: geometry

    public struct Box: Equatable, Sendable {
        public var x: Double, y: Double, w: Double, h: Double
        public init(x: Double, y: Double, w: Double, h: Double) { self.x = x; self.y = y; self.w = w; self.h = h }
    }

    /// A symbol turned by a multiple of 90° (clockwise), optionally mirrored left↔right first.
    public struct Orientation: Hashable, Sendable {
        public var rot: Int
        public var flip: Bool
        public init(rot: Int, flip: Bool) { self.rot = rot; self.flip = flip }
    }

    /// All eight: four turns, each plain and mirrored (door swings go either way).
    public static let orientations: [Orientation] = [0, 90, 180, 270].flatMap { r in [false, true].map { Orientation(rot: r, flip: $0) } }

    /// Size of a w × h box after the orientation (90° and 270° swap the sides).
    public static func orientedSize(w: Int, h: Int, _ o: Orientation) -> (w: Int, h: Int) {
        o.rot == 90 || o.rot == 270 ? (h, w) : (w, h)
    }

    /// A grey image (row-major) mirrored (if o.flip) and then turned o.rot degrees clockwise. Exact pixel moves.
    public static func orient<T>(_ data: [T], w: Int, h: Int, _ o: Orientation) -> (data: [T], w: Int, h: Int) {
        let (ow, oh) = orientedSize(w: w, h: h, o)
        guard let first = data.first else { return ([], ow, oh) }
        var out = [T](repeating: first, count: ow * oh)
        for y in 0..<h {
            for x in 0..<w {
                let sx = o.flip ? w - 1 - x : x
                let dx: Int, dy: Int
                switch o.rot {
                case 0: dx = x; dy = y
                case 90: dx = h - 1 - y; dy = x
                case 180: dx = w - 1 - x; dy = h - 1 - y
                default: dx = y; dy = w - 1 - x
                }
                out[dy * ow + dx] = data[y * w + sx]
            }
        }
        return (out, ow, oh)
    }

    /// The orientations worth searching: a symmetric symbol looks the same in several, and searching each twice only
    /// costs time. Keeps the first of every group of identical images.
    public static func distinctOrientations<T: Equatable>(_ data: [T], w: Int, h: Int) -> [Orientation] {
        var seen: [(w: Int, data: [T])] = []
        var out: [Orientation] = []
        for o in orientations {
            let g = orient(data, w: w, h: h, o)
            if seen.contains(where: { $0.w == g.w && $0.data == g.data }) { continue }
            seen.append((g.w, g.data))
            out.append(o)
        }
        return out
    }

    public struct Peak: Equatable, Sendable {
        public var x: Int, y: Int
        public var score: Float
        public init(x: Int, y: Int, score: Float) { self.x = x; self.y = y; self.score = score }
    }

    /// Local maxima of a score map (row-major, w × h) at or above minScore, best first. A peak is at least as high as
    /// every neighbour within `radius` px (ties: the first in reading order wins). At most `limit` (the best ones).
    public static func scorePeaks(_ scores: [Float], w: Int, h: Int, minScore: Float, radius: Double = 1, limit: Int = 4000) -> [Peak] {
        var out: [Peak] = []
        let r = max(1, Int(radius.rounded()))
        scores.withUnsafeBufferPointer { s in
            for y in 0..<h {
                let row = y * w
                for x in 0..<w {
                    let v = s[row + x]
                    guard v >= minScore else { continue }
                    var peak = true
                    var yy = max(0, y - r)
                    while yy <= min(h - 1, y + r) && peak {
                        let rr = yy * w
                        for xx in max(0, x - r)...min(w - 1, x + r) {
                            let u = s[rr + xx]
                            if u > v || (u == v && (yy < y || (yy == y && xx < x))) { peak = false; break }
                        }
                        yy += 1
                    }
                    if peak { out.append(Peak(x: x, y: y, score: v)) }
                }
            }
        }
        out.sort { $0.score > $1.score }
        return out.count > limit ? Array(out.prefix(limit)) : out
    }

    public struct Candidate: Equatable, Sendable {
        /// Centre, sheet px.
        public var cx: Double, cy: Double
        /// Box size in sheet px (oriented).
        public var w: Double, h: Double
        /// Normalised correlation, 0–1 (1 = identical).
        public var score: Double
        public var orientation: Orientation
        public init(cx: Double, cy: Double, w: Double, h: Double, score: Double, orientation: Orientation) {
            self.cx = cx; self.cy = cy; self.w = w; self.h = h; self.score = score; self.orientation = orientation
        }
    }

    /// Greedy non-maximum suppression: best first; a candidate is dropped when its centre is closer than `minDist`
    /// to one already kept. Only better candidates drop a candidate, so filtering the result by a higher threshold
    /// later equals running NMS on the filtered list (the sensitivity slider relies on this).
    public static func nonMaxSuppress(_ cands: [Candidate], minDist: Double) -> [Candidate] {
        let sorted = cands.enumerated().sorted { a, b in a.element.score != b.element.score ? a.element.score > b.element.score : a.offset < b.offset }.map(\.element)
        var kept: [Candidate] = []
        let d2 = minDist * minDist
        let cell = max(1, minDist)
        struct Key: Hashable { let x: Int, y: Int }
        var grid: [Key: [Candidate]] = [:]
        for c in sorted {
            let gx = Int((c.cx / cell).rounded(.down)), gy = Int((c.cy / cell).rounded(.down))
            var clash = false
            outer: for i in -1...1 {
                for j in -1...1 {
                    for k in grid[Key(x: gx + i, y: gy + j)] ?? [] {
                        let dx = k.cx - c.cx, dy = k.cy - c.cy
                        if dx * dx + dy * dy < d2 { clash = true; break outer }
                    }
                }
            }
            if clash { continue }
            kept.append(c)
            grid[Key(x: gx, y: gy), default: []].append(c)
        }
        return kept
    }

    /// Slider (0–100, higher finds more) → the lowest score shown. 50 → 0.7.
    public static func thresholdFor(_ sensitivity: Double) -> Double {
        let s = min(100, max(0, sensitivity))
        return ((0.95 - 0.5 * s / 100) * 1000).rounded() / 1000
    }

    /// The lowest threshold the slider can reach: the search keeps everything above it, so the slider is instant.
    public static let minThreshold = thresholdFor(100)
    /// Template side (shorter one) the matcher works at, work px; the most work px on the sheet's long side; the
    /// smallest template worth matching.
    public static let targetTemplatePx = 32.0
    public static let maxWorkSide = 3200.0
    public static let minTemplatePx = 10.0

    /// How much to shrink the sheet for matching: the template's shorter side becomes ~targetTemplatePx, never
    /// enlarged, and the sheet's long side stays within maxWorkSide. Nil when the box would be too small to match.
    public static func chooseScale(box: Box, sheetWidth: Double, sheetHeight: Double) -> Double? {
        let short = min(box.w, box.h)
        guard short > 0 else { return nil }
        var s = min(1, targetTemplatePx / short, maxWorkSide / max(sheetWidth, sheetHeight))
        if short * s < minTemplatePx { s = min(1, minTemplatePx / short) }
        if short * s < minTemplatePx - 0.5 { return nil }
        return s
    }

    /// The box one tap picks, sheet px: about one door wide plus its swing (4 ft) when the sheet has a scale, else
    /// 1.5% of the sheet's long side; centred on the tap and kept on the sheet.
    public static func tapBox(x: Double, y: Double, sheetWidth: Double, sheetHeight: Double, pxPerFt: Double?) -> Box {
        let side = max(16, pxPerFt.map { 4 * $0 } ?? 0.015 * max(sheetWidth, sheetHeight))
        return clampBox(Box(x: x - side / 2, y: y - side / 2, w: side, h: side), sheetWidth: sheetWidth, sheetHeight: sheetHeight)
    }

    /// A box (sheet px) moved and cut to lie on the sheet.
    public static func clampBox(_ b: Box, sheetWidth: Double, sheetHeight: Double) -> Box {
        let w = min(b.w, sheetWidth), h = min(b.h, sheetHeight)
        return Box(x: min(max(0, b.x), sheetWidth - w), y: min(max(0, b.y), sheetHeight - h), w: w, h: h)
    }

    /// A box from two drag corners (any order).
    public static func boxFromCorners(_ a: (x: Double, y: Double), _ b: (x: Double, y: Double)) -> Box {
        Box(x: min(a.x, b.x), y: min(a.y, b.y), w: abs(a.x - b.x), h: abs(a.y - b.y))
    }

    public struct PixelBox: Equatable, Sendable {
        public var x: Int, y: Int, w: Int, h: Int
        public init(x: Int, y: Int, w: Int, h: Int) { self.x = x; self.y = y; self.w = w; self.h = h }
    }

    /// The tight box around the ink (pixels darker than `ink`) of a grey crop, plus a margin; nil when blank. Trims
    /// the white edges of a tapped square so the template is the symbol, not paper.
    public static func inkBounds(_ data: [Float], w: Int, h: Int, ink: Float = 160, margin: Int = 2) -> PixelBox? {
        var x0 = w, y0 = h, x1 = -1, y1 = -1
        for y in 0..<h {
            for x in 0..<w where data[y * w + x] < ink {
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
            }
        }
        guard x1 >= 0 else { return nil }
        x0 = max(0, x0 - margin); y0 = max(0, y0 - margin)
        x1 = min(w - 1, x1 + margin); y1 = min(h - 1, y1 + margin)
        return PixelBox(x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1)
    }

    /// Standard deviation of a grey crop: near 0 for blank paper.
    public static func grayStd(_ data: [Float]) -> Double {
        guard !data.isEmpty else { return 0 }
        var s = 0.0, s2 = 0.0
        for v in data { s += Double(v); s2 += Double(v) * Double(v) }
        let n = Double(data.count), m = s / n
        return (max(0, s2 / n - m * m)).squareRoot()
    }

    /// The ink level of a grey crop: halfway between its darkest pixel and white, at most 200 (the tap trim uses it too).
    public static func inkLevel(_ data: [Float]) -> Float {
        min(200, ((data.min() ?? 255) + 255) / 2)
    }

    /// Thresholds of `onlyStraightLines`, the same as the web's `LINES_ONLY` (src/lib/findSimilar/match.ts):
    /// a straight run is long at 70% of the template across (`span`; width for horizontal runs, height for vertical,
    /// the shorter side for 45° diagonals), or 35% when it runs off the template's edge (`edgeSpan`: a wall carrying on
    /// past the box); it bridges gaps up to 2 px; a pixel counts only where the line is at most 25% of the shorter side
    /// (≥ 4 px) thick, so filled shapes aren't a stack of lines; 90% of the ink on long runs is "only lines" (`share`);
    /// paper enclosed by the lines of 4 px or more (`minHole`) means a drawn symbol (a window's frame, a box, a circle).
    public enum LinesOnly {
        public static let span = 0.7, edgeSpan = 0.35, gap = 2, thick = 0.25, minThick = 4, share = 0.9, minHole = 4
    }

    /// True when a picked template (grey, row-major, w × h; `ink` from `inkLevel`) is only straight lines, like a wall,
    /// a corner of walls, a T-junction, a crossing, a wire or a grid line, and no real symbol: matching it would find
    /// every wall junction on the sheet. The rule: (1) at least 90% of the ink lies on long straight horizontal,
    /// vertical or 45° runs, and (2) the lines enclose no paper (every blank region of 4 px or more reaches the edge).
    /// A door swing, a circle with a letter, a receptacle fail (1); a window symbol and any boxed symbol fail (2).
    public static func onlyStraightLines(_ data: [Float], w: Int, h: Int, ink: Float) -> Bool {
        let n = w * h
        guard w >= 1, h >= 1, data.count >= n else { return false }
        var isInk = [Bool](repeating: false, count: n)
        var inkCount = 0
        for i in 0..<n where data[i] < ink { isInk[i] = true; inkCount += 1 }
        guard inkCount > 0 else { return false }
        let maxThick = max(LinesOnly.minThick, Int((LinesOnly.thick * Double(min(w, h))).rounded()))
        var onLine = [Bool](repeating: false, count: n)
        var thick = [Int](repeating: 0, count: n)
        func inside(_ x: Int, _ y: Int) -> Bool { x >= 0 && y >= 0 && x < w && y < h }
        // Every straight line of pixels across the template in direction (dx, dy), from the pixels whose previous
        // step would leave the template.
        func walk(_ dx: Int, _ dy: Int, _ visit: ([Int]) -> Void) {
            for y in 0..<h {
                for x in 0..<w where !inside(x - dx, y - dy) {
                    var line: [Int] = []
                    var cx = x, cy = y
                    while inside(cx, cy) { line.append(cy * w + cx); cx += dx; cy += dy }
                    visit(line)
                }
            }
        }
        // Directions (dx, dy) with the one across them (px, py) for the line thickness.
        for (dx, dy, px, py) in [(1, 0, 0, 1), (0, 1, 1, 0), (1, 1, 1, -1), (1, -1, 1, 1)] {
            let span = Double(dx != 0 && dy != 0 ? min(w, h) : (dx != 0 ? w : h))
            let minLen = LinesOnly.span * span, edgeLen = LinesOnly.edgeSpan * span
            walk(px, py) { line in
                var i = 0
                while i < line.count {
                    guard isInk[line[i]] else { i += 1; continue }
                    var j = i
                    while j < line.count, isInk[line[j]] { j += 1 }
                    for k in i..<j { thick[line[k]] = j - i }
                    i = j
                }
            }
            walk(dx, dy) { line in
                var first = -1, last = -1
                func close() {
                    guard first >= 0 else { return }
                    let len = Double(last - first + 1)
                    let touches = first <= 1 || last >= line.count - 2
                    if len >= minLen || (touches && len >= edgeLen) {
                        for k in first...last where isInk[line[k]] && thick[line[k]] <= maxThick { onLine[line[k]] = true }
                    }
                    first = -1
                }
                for i in 0..<line.count where isInk[line[i]] {
                    if first >= 0, i - last - 1 > LinesOnly.gap { close() }
                    if first < 0 { first = i }
                    last = i
                }
                close()
            }
        }
        let lineCount = onLine.reduce(0) { $0 + ($1 ? 1 : 0) }
        if Double(lineCount) < LinesOnly.share * Double(inkCount) { return false }

        // Paper regions (4-connected): one that doesn't reach the edge and is big enough is enclosed by the lines.
        var seen = [Bool](repeating: false, count: n)
        var stack: [Int] = []
        for start in 0..<n where !isInk[start] && !seen[start] {
            var size = 0
            var open = false
            seen[start] = true
            stack.append(start)
            while let p = stack.popLast() {
                size += 1
                let x = p % w, y = p / w
                if x == 0 || y == 0 || x == w - 1 || y == h - 1 { open = true }
                for q in [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
                where q >= 0 && !isInk[q] && !seen[q] {
                    seen[q] = true
                    stack.append(q)
                }
            }
            if !open && size >= LinesOnly.minHole { return false }
        }
        return true
    }

    /// A peak (top-left of the match, work px) → a candidate centred in sheet px.
    public static func peakToCandidate(_ p: Peak, tplW: Int, tplH: Int, scale: Double, orientation: Orientation) -> Candidate {
        Candidate(cx: (Double(p.x) + Double(tplW) / 2) / scale, cy: (Double(p.y) + Double(tplH) / 2) / scale,
                  w: Double(tplW) / scale, h: Double(tplH) / scale, score: min(1, Double(p.score)), orientation: orientation)
    }

    /// Spots (0–1) without a device of the chosen type within `radiusPx` sheet px, so running Find similar again (or
    /// after placing some by hand) doesn't suggest them twice. `existing`: that type's devices on this sheet (0–1).
    public static func withoutExisting<T>(_ items: [T], at pos: (T) -> (x: Double, y: Double), existing: [(x: Double, y: Double)],
                                          width: Double, height: Double, radiusPx: Double) -> [T] {
        guard !existing.isEmpty else { return items }
        let r2 = radiusPx * radiusPx
        return items.filter { it in
            let p = pos(it)
            return !existing.contains { m in
                let dx = (m.x - p.x) * width, dy = (m.y - p.y) * height
                return dx * dx + dy * dy < r2
            }
        }
    }

    // MARK: images

    /// A grey image, 0 (black) … 255 (white), row-major.
    public struct GrayImage: Sendable, Equatable {
        public let w: Int, h: Int
        public var px: [Float]
        public init(w: Int, h: Int, px: [Float]) { precondition(px.count == w * h); self.w = w; self.h = h; self.px = px }
        public init(w: Int, h: Int, bytes: [UInt8]) { self.init(w: w, h: h, px: bytes.map(Float.init)) }
        public subscript(x: Int, y: Int) -> Float { px[y * w + x] }

        public func crop(_ b: PixelBox) -> [Float] {
            var out = [Float](repeating: 0, count: b.w * b.h)
            for y in 0..<b.h {
                let src = (b.y + y) * w + b.x
                for x in 0..<b.w { out[y * b.w + x] = px[src + x] }
            }
            return out
        }
    }

    /// Area-averaging resize (OpenCV's INTER_AREA for shrinking): each output pixel is the mean of the source area it
    /// covers, partial pixels weighted. Keeps thin lines as grey instead of dropping them.
    public static func areaResize(_ src: GrayImage, to dw: Int, _ dh: Int) -> GrayImage {
        if dw == src.w && dh == src.h { return src }
        func weights(_ s: Int, _ d: Int) -> [[(Int, Float)]] {
            let f = Double(s) / Double(d)
            return (0..<d).map { i in
                let a = Double(i) * f, b = min(Double(s), Double(i + 1) * f)
                var out: [(Int, Float)] = []
                var k = Int(a.rounded(.down))
                while Double(k) < b && k < s {
                    let lo = max(a, Double(k)), hi = min(b, Double(k + 1))
                    if hi > lo { out.append((k, Float((hi - lo) / (b - a)))) }
                    k += 1
                }
                return out
            }
        }
        let wx = weights(src.w, dw), wy = weights(src.h, dh)
        // Rows first (src.h × dw), then columns.
        var tmp = [Float](repeating: 0, count: src.h * dw)
        for y in 0..<src.h {
            let row = y * src.w
            for x in 0..<dw {
                var v: Float = 0
                for (k, wt) in wx[x] { v += src.px[row + k] * wt }
                tmp[y * dw + x] = v
            }
        }
        var out = [Float](repeating: 0, count: dw * dh)
        for y in 0..<dh {
            for (k, wt) in wy[y] {
                let r = k * dw, o = y * dw
                for x in 0..<dw { out[o + x] += tmp[r + x] * wt }
            }
        }
        return GrayImage(w: dw, h: dh, px: out)
    }

    /// 3×3 Gaussian blur (OpenCV GaussianBlur ksize 3, sigma 0: [¼ ½ ¼] each way, mirrored edges).
    public static func blur3(_ img: GrayImage) -> GrayImage {
        let w = img.w, h = img.h
        guard w > 1, h > 1 else { return img }
        func m(_ i: Int, _ n: Int) -> Int { i < 0 ? 1 : (i >= n ? n - 2 : i) }   // BORDER_REFLECT_101
        var tmp = [Float](repeating: 0, count: w * h)
        for y in 0..<h {
            let r = y * w
            for x in 0..<w { tmp[r + x] = 0.25 * img.px[r + m(x - 1, w)] + 0.5 * img.px[r + x] + 0.25 * img.px[r + m(x + 1, w)] }
        }
        var out = [Float](repeating: 0, count: w * h)
        for y in 0..<h {
            let a = m(y - 1, h) * w, b = y * w, c = m(y + 1, h) * w
            for x in 0..<w { out[b + x] = 0.25 * tmp[a + x] + 0.5 * tmp[b + x] + 0.25 * tmp[c + x] }
        }
        return GrayImage(w: w, h: h, px: out)
    }

    /// The image the matcher works on: the decoded sheet (decoded at up to twice the work size) area-averaged down to
    /// workW × workH, then blurred 3×3. The template is cut from this same image.
    public static func prepare(decoded: GrayImage, workW: Int, workH: Int) -> GrayImage {
        blur3(areaResize(decoded, to: workW, workH))
    }

    /// Work size of the sheet for a scale, and the size to decode it at (twice that, never more than the sheet).
    public static func workSize(sheetWidth: Double, sheetHeight: Double, scale: Double) -> (w: Int, h: Int, decodeW: Int, decodeH: Int) {
        let w = max(1, Int((sheetWidth * scale).rounded())), h = max(1, Int((sheetHeight * scale).rounded()))
        let s2 = min(1, scale * 2)
        return (w, h, max(w, Int((sheetWidth * s2).rounded())), max(h, Int((sheetHeight * s2).rounded())))
    }

    /// Half size, each pixel the mean of a 2×2 block (odd last row / column dropped).
    public static func halve(_ img: GrayImage) -> GrayImage {
        let w = img.w / 2, h = img.h / 2
        var out = [Float](repeating: 0, count: max(0, w * h))
        for y in 0..<h {
            let a = 2 * y * img.w, b = a + img.w
            for x in 0..<w { out[y * w + x] = 0.25 * (img.px[a + 2 * x] + img.px[a + 2 * x + 1] + img.px[b + 2 * x] + img.px[b + 2 * x + 1]) }
        }
        return GrayImage(w: w, h: h, px: out)
    }

    // MARK: normalised cross-correlation (TM_CCOEFF_NORMED)

    /// A template ready to correlate: mean removed, and its sum of squares.
    struct Template {
        let w: Int, h: Int
        let z: [Float]
        let sumSq: Double
        init(_ data: [Float], w: Int, h: Int) {
            self.w = w; self.h = h
            let mean = data.reduce(0.0) { $0 + Double($1) } / Double(max(1, data.count))
            z = data.map { Float(Double($0) - mean) }
            sumSq = z.reduce(0.0) { $0 + Double($1) * Double($1) }
        }
    }

    /// A window counts as blank paper (score 0, not computed) below this variance per pixel (σ ≈ 1 grey level).
    static let blankVariance = 1.0

    /// The full score map, (img.w − t.w + 1) × (img.h − t.h + 1): for each top-left spot,
    /// Σ T'·I / √(Σ T'² · Σ (I − Ī)²). Row by row, so memory stays one row of sums.
    static func scoreMap(_ img: GrayImage, _ t: Template) -> (scores: [Float], w: Int, h: Int) {
        let W = img.w, ow = img.w - t.w + 1, oh = img.h - t.h + 1
        guard ow > 0, oh > 0 else { return ([], 0, 0) }
        var out = [Float](repeating: 0, count: ow * oh)
        guard t.sumSq > 1e-6 else { return (out, ow, oh) }
        let n = Double(t.w * t.h)
        var colSum = [Double](repeating: 0, count: W), colSq = [Double](repeating: 0, count: W)
        var acc = [Float](repeating: 0, count: ow)
        var variance = [Double](repeating: 0, count: ow)
        img.px.withUnsafeBufferPointer { p in
            for y in 0..<t.h { for x in 0..<W { let v = Double(p[y * W + x]); colSum[x] += v; colSq[x] += v * v } }
            for oy in 0..<oh {
                if oy > 0 {
                    let gone = (oy - 1) * W, come = (oy + t.h - 1) * W
                    for x in 0..<W {
                        let a = Double(p[gone + x]), b = Double(p[come + x])
                        colSum[x] += b - a; colSq[x] += b * b - a * a
                    }
                }
                var s = 0.0, q = 0.0
                for x in 0..<t.w { s += colSum[x]; q += colSq[x] }
                var any = false
                for x in 0..<ow {
                    if x > 0 { s += colSum[x + t.w - 1] - colSum[x - 1]; q += colSq[x + t.w - 1] - colSq[x - 1] }
                    let v = q - s * s / n
                    variance[x] = v
                    if v > blankVariance * n { any = true }
                }
                guard any else { continue }
                for i in 0..<ow { acc[i] = 0 }
                acc.withUnsafeMutableBufferPointer { a in
                    t.z.withUnsafeBufferPointer { tz in
                        for ty in 0..<t.h {
                            for tx in 0..<t.w {
                                let c = tz[ty * t.w + tx]
                                if c == 0 { continue }
                                axpy(a.baseAddress!, c, p.baseAddress! + (oy + ty) * W + tx, ow)
                            }
                        }
                    }
                }
                let o = oy * ow
                for x in 0..<ow {
                    let v = variance[x]
                    guard v > blankVariance * n else { continue }
                    out[o + x] = min(1, Float(Double(acc[x]) / (t.sumSq * v).squareRoot()))
                }
            }
        }
        return (out, ow, oh)
    }

    /// a[i] += c · b[i] for i < n.
    @inline(__always)
    static func axpy(_ a: UnsafeMutablePointer<Float>, _ c: Float, _ b: UnsafePointer<Float>, _ n: Int) {
        #if canImport(Accelerate)
        var c = c
        vDSP_vsma(b, 1, &c, a, 1, a, 1, vDSP_Length(n))
        #else
        for i in 0..<n { a[i] += c * b[i] }
        #endif
    }

    /// The score at one top-left spot (x, y), computed directly. 0 off the image or on blank paper.
    static func score(_ img: GrayImage, _ t: Template, x: Int, y: Int) -> Float {
        guard x >= 0, y >= 0, x + t.w <= img.w, y + t.h <= img.h, t.sumSq > 1e-6 else { return 0 }
        var s = 0.0, q = 0.0, c = 0.0
        for ty in 0..<t.h {
            let r = (y + ty) * img.w + x, tr = ty * t.w
            for tx in 0..<t.w {
                let v = Double(img.px[r + tx])
                s += v; q += v * v; c += Double(t.z[tr + tx]) * v
            }
        }
        let n = Double(t.w * t.h)
        let v = q - s * s / n
        guard v > blankVariance * n else { return 0 }
        return min(1, Float(c / (t.sumSq * v).squareRoot()))
    }

    // MARK: the search

    public enum SearchError: Error, Equatable {
        /// The box is too small to match on: zoom in and drag a box around one symbol.
        case tooSmall
        /// Nothing drawn there.
        case blank
        /// Only straight lines (a wall, a corner, a wire), no symbol: it would match every wall junction.
        case onlyLines
        /// A newer search replaced this one.
        case cancelled
    }

    public struct SearchResult: Sendable {
        /// Found spots, best first, after NMS; sheet px. Every score ≥ the minScore asked for.
        public var candidates: [Candidate]
        /// The symbol searched for, sheet px (trimmed to its ink after a tap).
        public var template: Box
    }

    /// Search a prepared work image (`prepare`, at `scale`) for symbols like the one in `box` (sheet px). `trim`: a
    /// tap's square, cut down to its ink first. `progress(done, total)` per orientation; `cancelled` is checked
    /// between orientations.
    public static func search(in img: GrayImage, scale: Double, box: Box, trim: Bool, minScore: Double = minThreshold,
                              progress: (Int, Int) -> Void = { _, _ in }, cancelled: () -> Bool = { false }) throws -> SearchResult {
        let x0 = max(0, Int((box.x * scale).rounded())), y0 = max(0, Int((box.y * scale).rounded()))
        var tb = PixelBox(x: x0, y: y0, w: min(img.w - x0, Int((box.w * scale).rounded())), h: min(img.h - y0, Int((box.h * scale).rounded())))
        guard tb.w > 0, tb.h > 0 else { throw SearchError.tooSmall }
        var tpl = img.crop(tb)
        if trim {
            if let ink = inkBounds(tpl, w: tb.w, h: tb.h, ink: inkLevel(tpl), margin: 2), Double(min(ink.w, ink.h)) >= minTemplatePx {
                tb = PixelBox(x: tb.x + ink.x, y: tb.y + ink.y, w: ink.w, h: ink.h)
                tpl = img.crop(tb)
            }
        }
        if Double(min(tb.w, tb.h)) < minTemplatePx - 1 { throw SearchError.tooSmall }
        if grayStd(tpl) < 6 { throw SearchError.blank }
        if onlyStraightLines(tpl, w: tb.w, h: tb.h, ink: inkLevel(tpl)) { throw SearchError.onlyLines }

        let orients = distinctOrientations(tpl, w: tb.w, h: tb.h)
        // Coarse to fine when the symbol is big enough to survive halving.
        let coarse = min(tb.w, tb.h) >= 16 ? halve(img) : nil
        let fineMin = Float(minScore)
        let coarseMin = max(0.1, fineMin - 0.2)
        if cancelled() { throw SearchError.cancelled }
        progress(0, orients.count)
        let symbol = tpl, sb = tb
        func searchOne(_ o: Orientation) -> [Candidate] {
            let g = orient(symbol, w: sb.w, h: sb.h, o)
            let t = Template(g.data, w: g.w, h: g.h)
            var peaks: [Peak] = []
            if let coarse {
                let half = halve(GrayImage(w: g.w, h: g.h, px: g.data))
                let ct = Template(half.px, w: half.w, h: half.h)
                let map = scoreMap(coarse, ct)
                let rough = scorePeaks(map.scores, w: map.w, h: map.h, minScore: coarseMin, radius: Double(min(ct.w, ct.h)) / 4)
                var best: [Int: Peak] = [:]
                for p in rough {
                    var top = Peak(x: 0, y: 0, score: -2)
                    for dy in -2...2 {
                        for dx in -2...2 {
                            let x = 2 * p.x + dx, y = 2 * p.y + dy
                            let s = score(img, t, x: x, y: y)
                            if s > top.score { top = Peak(x: x, y: y, score: s) }
                        }
                    }
                    guard top.score >= fineMin else { continue }
                    let key = top.y * img.w + top.x
                    if best[key] == nil { best[key] = top }
                }
                peaks = best.values.sorted { $0.score != $1.score ? $0.score > $1.score : ($0.y, $0.x) < ($1.y, $1.x) }
            } else {
                let map = scoreMap(img, t)
                peaks = scorePeaks(map.scores, w: map.w, h: map.h, minScore: fineMin, radius: Double(min(t.w, t.h)) / 4)
            }
            return peaks.map { peakToCandidate($0, tplW: g.w, tplH: g.h, scale: scale, orientation: o) }
        }

        // Orientations are independent: search them side by side (one per core). `progress` and `cancelled` may be
        // called from any of those threads.
        let lock = NSLock()
        var perOrientation = [[Candidate]](repeating: [], count: orients.count)
        var done = 0, stop = false
        DispatchQueue.concurrentPerform(iterations: orients.count) { i in
            lock.lock(); let skip = stop; lock.unlock()
            if skip { return }
            if cancelled() { lock.lock(); stop = true; lock.unlock(); return }
            let found = searchOne(orients[i])
            lock.lock()
            perOrientation[i] = found
            done += 1
            let n = done
            lock.unlock()
            if n < orients.count { progress(n, orients.count) }
        }
        if stop { throw SearchError.cancelled }
        let cands = perOrientation.flatMap { $0 }
        progress(orients.count, orients.count)
        let template = Box(x: Double(tb.x) / scale, y: Double(tb.y) / scale, w: Double(tb.w) / scale, h: Double(tb.h) / scale)
        return SearchResult(candidates: nonMaxSuppress(cands, minDist: 0.5 * min(template.w, template.h)), template: template)
    }

    // MARK: suggestions (the tool's state, pure)

    public enum Source: String, Sendable { case match, tags }

    /// A suggestion: a ghost pin on the plan, never counted until accepted.
    public struct Found: Identifiable, Equatable, Sendable {
        public var id: String
        /// Sheet-relative centre.
        public var x: Double, y: Double
        /// Likeness 0–1 (tags: 1).
        public var score: Double
        /// Read tags: the tag text.
        public var tag: String?
        /// Tapped off (or rejected in review): not added by Accept all.
        public var rejected: Bool
        public init(id: String, x: Double, y: Double, score: Double, tag: String? = nil, rejected: Bool = false) {
            self.id = id; self.x = x; self.y = y; self.score = score; self.tag = tag; self.rejected = rejected
        }
    }

    /// The finds shown now: above the sensitivity threshold (tags always) and not on a device of the type already.
    public static func shown(_ found: [Found], source: Source, sensitivity: Double, existing: [(x: Double, y: Double)],
                             width: Double, height: Double, nearPx: Double) -> [Found] {
        let t = thresholdFor(sensitivity)
        let above = source == .tags ? found : found.filter { $0.score >= t }
        return withoutExisting(above, at: { ($0.x, $0.y) }, existing: existing, width: width, height: height, radiusPx: nearPx)
    }

    /// Where an existing device hides a match: 0.6 × the symbol's longer side (sheet px).
    public static func nearPx(template: Box) -> Double { 0.6 * max(template.w, template.h) }
    /// Where an existing device hides a tag (a tag sits beside its door or window): 4 ft, or 2% of the sheet.
    public static func tagNearPx(sheetWidth: Double, sheetHeight: Double, pxPerFt: Double?) -> Double {
        pxPerFt.map { 4 * $0 } ?? 0.02 * max(sheetWidth, sheetHeight)
    }

    /// Whether a device type's name is a door or a window (the floor summary and the default type).
    public static func isDoorOrWindow(_ name: String) -> Bool {
        name.range(of: #"\b(doors?|windows?)\b"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Type to count as when the tool opens: the one remembered on this device, else the first "Door", else the first.
    public static func defaultType(_ types: [DeviceType], remembered: String?) -> DeviceType? {
        types.first { $0.id == remembered }
            ?? types.first { $0.name.range(of: #"\bdoors?\b"#, options: [.regularExpression, .caseInsensitive]) != nil }
            ?? types.first
    }

    /// Device types Find similar can count as: devices (not runs or LED strips), not archived, in catalog order.
    public static func countableTypes(_ catalog: [DeviceType]) -> [DeviceType] {
        catalog.filter { $0.archived != true && $0.kind == .device }.sorted { $0.sort < $1.sort }
    }

    /// "On this floor: Door: 9 · Window: 10": placed devices on a sheet for door / window types and the type being
    /// counted (shown even at 0), in catalog order.
    public static func floorSummary(types: [DeviceType], markers: [Marker], sheetId: String, countingTypeId: String?) -> [(type: DeviceType, count: Int)] {
        let ids = Set(types.filter { isDoorOrWindow($0.name) || $0.id == countingTypeId }.map(\.id))
        var n: [String: Int] = [:]
        for m in markers where m.deleted != true && m.sheetId == sheetId && ids.contains(m.deviceTypeId) { n[m.deviceTypeId, default: 0] += 1 }
        return types.filter { ids.contains($0.id) && ((n[$0.id] ?? 0) > 0 || $0.id == countingTypeId) }.map { ($0, n[$0.id] ?? 0) }
    }
}
