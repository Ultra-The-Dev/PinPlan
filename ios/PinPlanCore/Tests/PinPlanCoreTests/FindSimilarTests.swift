import XCTest
@testable import PinPlanCore

// Find similar (docs/find-similar.md): the same cases as the web's tests/findSimilar.test.ts for the shared helpers,
// plus the Swift template matcher on a synthetic plan (doors in every turn and swing, look-alikes that aren't).
final class FindSimilarTests: XCTestCase {
    typealias FS = FindSimilar

    // A 3 × 2 image:  1 2 3 / 4 5 6
    let img: [UInt8] = [1, 2, 3, 4, 5, 6]
    func rows(_ g: (data: [UInt8], w: Int, h: Int)) -> [[UInt8]] { (0..<g.h).map { Array(g.data[$0 * g.w..<($0 + 1) * g.w]) } }

    func testEightOrientations() {
        XCTAssertEqual(FS.orientations.count, 8)
        XCTAssertEqual(Set(FS.orientations).count, 8)
    }

    func testTurnsClockwiseAndSwapsSides() {
        XCTAssertEqual(rows(FS.orient(img, w: 3, h: 2, .init(rot: 0, flip: false))), [[1, 2, 3], [4, 5, 6]])
        XCTAssertEqual(rows(FS.orient(img, w: 3, h: 2, .init(rot: 90, flip: false))), [[4, 1], [5, 2], [6, 3]])
        XCTAssertEqual(rows(FS.orient(img, w: 3, h: 2, .init(rot: 180, flip: false))), [[6, 5, 4], [3, 2, 1]])
        XCTAssertEqual(rows(FS.orient(img, w: 3, h: 2, .init(rot: 270, flip: false))), [[3, 6], [2, 5], [1, 4]])
        XCTAssertTrue(FS.orientedSize(w: 3, h: 2, .init(rot: 90, flip: true)) == (2, 3))
    }

    func testMirrorsBeforeTurning() {
        XCTAssertEqual(rows(FS.orient(img, w: 3, h: 2, .init(rot: 0, flip: true))), [[3, 2, 1], [6, 5, 4]])
        XCTAssertEqual(rows(FS.orient(img, w: 3, h: 2, .init(rot: 90, flip: true))), [[6, 3], [5, 2], [4, 1]])
        var g = (data: img, w: 3, h: 2)
        for _ in 0..<4 { g = FS.orient(g.data, w: g.w, h: g.h, .init(rot: 90, flip: false)) }
        XCTAssertEqual(g.data, img)
    }

    func testDistinctOrientations() {
        XCTAssertEqual(FS.distinctOrientations([UInt8](repeating: 0, count: 4), w: 2, h: 2).count, 1)
        XCTAssertEqual(FS.distinctOrientations([0, 255, 255, 0, 255, 255, 0, 0, 9] as [UInt8], w: 3, h: 3).count, 8)
        XCTAssertEqual(FS.distinctOrientations([0, 0, 0, 255, 0, 255, 255, 0, 255] as [UInt8], w: 3, h: 3).count, 4)
    }

    func testPeaks() {
        let s: [Float] = [0.1, 0.2, 0.1, 0.0, 0.0,
                          0.2, 0.9, 0.3, 0.6, 0.7,
                          0.1, 0.2, 0.1, 0.5, 0.6]
        XCTAssertEqual(FS.scorePeaks(s, w: 5, h: 3, minScore: 0.5), [FS.Peak(x: 1, y: 1, score: 0.9), FS.Peak(x: 4, y: 1, score: 0.7)])
        XCTAssertEqual(FS.scorePeaks(s, w: 5, h: 3, minScore: 0.8), [FS.Peak(x: 1, y: 1, score: 0.9)])
        XCTAssertEqual(FS.scorePeaks([0.8, 0.8, 0.8, 0.8], w: 4, h: 1, minScore: 0.5).count, 1)
    }

    private func cand(_ x: Double, _ y: Double, _ s: Double) -> FS.Candidate {
        FS.Candidate(cx: x, cy: y, w: 10, h: 10, score: s, orientation: .init(rot: 0, flip: false))
    }

    func testNonMaxSuppression() {
        let c = [cand(100, 100, 0.8), cand(104, 102, 0.95), cand(300, 100, 0.6), cand(309, 100, 0.7), cand(500, 500, 0.5)]
        XCTAssertEqual(FS.nonMaxSuppress(c, minDist: 10).map(\.score), [0.95, 0.7, 0.5])
    }

    func testSliderFilteringEqualsNMSOnFiltered() {
        func rnd(_ i: Double) -> Double { let v = (sin(i * 12.9898) * 43758.5453).truncatingRemainder(dividingBy: 1); return (v + 1).truncatingRemainder(dividingBy: 1) }
        let c: [FS.Candidate] = (0..<300).map { (i: Int) -> FS.Candidate in
            let d = Double(i)
            let x: Double = rnd(d) * 400
            let y: Double = rnd(d + 999) * 400
            let s: Double = 0.45 + 0.5 * rnd(d + 5000)
            return cand(x, y, s)
        }
        for t in [0.5, 0.7, 0.85] {
            XCTAssertEqual(FS.nonMaxSuppress(c, minDist: 15).filter { $0.score >= t }, FS.nonMaxSuppress(c.filter { $0.score >= t }, minDist: 15))
        }
    }

    func testPeakToCandidate() {
        let c = FS.peakToCandidate(FS.Peak(x: 10, y: 20, score: 0.9), tplW: 30, tplH: 20, scale: 0.5, orientation: .init(rot: 90, flip: false))
        XCTAssertEqual(c.cx, 50); XCTAssertEqual(c.cy, 60); XCTAssertEqual(c.w, 60); XCTAssertEqual(c.h, 40)
        XCTAssertEqual(c.score, 0.9, accuracy: 1e-6)
    }

    func testSliderAndScale() {
        XCTAssertEqual(FS.thresholdFor(50), 0.7)
        XCTAssertEqual(FS.thresholdFor(0), 0.95)
        XCTAssertEqual(FS.thresholdFor(100), 0.45)
        XCTAssertLessThan(FS.thresholdFor(80), FS.thresholdFor(20))
        XCTAssertEqual(FS.chooseScale(box: .init(x: 0, y: 0, w: 128, h: 96), sheetWidth: 4000, sheetHeight: 3000)!, 32.0 / 96, accuracy: 1e-9)
        XCTAssertEqual(FS.chooseScale(box: .init(x: 0, y: 0, w: 20, h: 20), sheetWidth: 1000, sheetHeight: 800), 1)
        let s = FS.chooseScale(box: .init(x: 0, y: 0, w: 400, h: 400), sheetWidth: 40000, sheetHeight: 30000)!
        XCTAssertLessThanOrEqual(40000 * s, FS.maxWorkSide + 1)
        XCTAssertNil(FS.chooseScale(box: .init(x: 0, y: 0, w: 5, h: 50), sheetWidth: 1000, sheetHeight: 800))
        XCTAssertNil(FS.chooseScale(box: .init(x: 0, y: 0, w: 0, h: 50), sheetWidth: 1000, sheetHeight: 800))
        let t = FS.chooseScale(box: .init(x: 0, y: 0, w: 40, h: 40), sheetWidth: 20000, sheetHeight: 20000)!
        XCTAssertGreaterThanOrEqual(40 * t, FS.minTemplatePx - 0.01)
    }

    func testBoxes() {
        XCTAssertEqual(FS.tapBox(x: 500, y: 500, sheetWidth: 2000, sheetHeight: 1000, pxPerFt: 20), .init(x: 460, y: 460, w: 80, h: 80))
        XCTAssertEqual(FS.tapBox(x: 5, y: 5, sheetWidth: 2000, sheetHeight: 1000, pxPerFt: nil), .init(x: 0, y: 0, w: 30, h: 30))
        XCTAssertEqual(FS.clampBox(.init(x: 1990, y: 990, w: 30, h: 30), sheetWidth: 2000, sheetHeight: 1000), .init(x: 1970, y: 970, w: 30, h: 30))
        XCTAssertEqual(FS.boxFromCorners((5, 1), (2, 4)), .init(x: 2, y: 1, w: 3, h: 3))
    }

    func testInkBoundsAndBlank() {
        let w = 6, h = 5
        var g = [Float](repeating: 255, count: w * h)
        g[2 * w + 3] = 0
        g[3 * w + 4] = 0
        XCTAssertEqual(FS.inkBounds(g, w: w, h: h, ink: 160, margin: 0), .init(x: 3, y: 2, w: 2, h: 2))
        XCTAssertEqual(FS.inkBounds(g, w: w, h: h, ink: 160, margin: 1), .init(x: 2, y: 1, w: 4, h: 4))
        XCTAssertNil(FS.inkBounds([Float](repeating: 255, count: 9), w: 3, h: 3))
        XCTAssertEqual(FS.grayStd([Float](repeating: 255, count: 9)), 0)
        XCTAssertGreaterThan(FS.grayStd(g), 20)
    }

    func testWithoutExisting() {
        let finds = [(x: 0.1, y: 0.1), (x: 0.5, y: 0.5), (x: 0.9, y: 0.9)]
        let kept = FS.withoutExisting(finds, at: { $0 }, existing: [(0.105, 0.1)], width: 1000, height: 500, radiusPx: 20)
        XCTAssertEqual(kept.map(\.x), [0.5, 0.9])
        // Measured in sheet px: 0.03 across = 30 px > 20; 0.03 down = 15 px < 20.
        XCTAssertEqual(FS.withoutExisting([(x: 0.13, y: 0.1)], at: { $0 }, existing: [(0.1, 0.1)], width: 1000, height: 500, radiusPx: 20).count, 1)
        XCTAssertEqual(FS.withoutExisting([(x: 0.1, y: 0.13)], at: { $0 }, existing: [(0.1, 0.1)], width: 1000, height: 500, radiusPx: 20).count, 0)
    }

    func testShownFiltersBySliderNotTags() {
        let f = [FS.Found(id: "a", x: 0.1, y: 0.1, score: 0.9), FS.Found(id: "b", x: 0.5, y: 0.5, score: 0.6), FS.Found(id: "c", x: 0.9, y: 0.9, score: 0.5)]
        XCTAssertEqual(FS.shown(f, source: .match, sensitivity: 50, existing: [], width: 100, height: 100, nearPx: 5).map(\.id), ["a"])
        XCTAssertEqual(FS.shown(f, source: .match, sensitivity: 100, existing: [], width: 100, height: 100, nearPx: 5).map(\.id), ["a", "b", "c"])
        XCTAssertEqual(FS.shown(f, source: .tags, sensitivity: 0, existing: [(0.1, 0.1)], width: 100, height: 100, nearPx: 5).map(\.id), ["b", "c"])
    }

    func testDefaultTypeAndSummary() {
        let cat = Catalog.seed()
        let types = FS.countableTypes(cat)
        XCTAssertFalse(types.isEmpty)
        XCTAssertTrue(types.allSatisfy { $0.kind == .device && $0.archived != true })
        let remembered = types.last!
        XCTAssertEqual(FS.defaultType(types, remembered: remembered.id)?.id, remembered.id)
        if let door = types.first(where: { $0.name.range(of: #"\bdoors?\b"#, options: [.regularExpression, .caseInsensitive]) != nil }) {
            XCTAssertEqual(FS.defaultType(types, remembered: "gone")?.id, door.id)
        } else {
            XCTAssertEqual(FS.defaultType(types, remembered: nil)?.id, types.first?.id)
        }
        XCTAssertFalse(FS.isDoorOrWindow("Indoor camera"))
        XCTAssertTrue(FS.isDoorOrWindow("Window sensor"))
        XCTAssertTrue(FS.isDoorOrWindow("Door contact"))
    }

    // MARK: images

    func testAreaResizeAveragesBlocks() {
        let src = FS.GrayImage(w: 4, h: 2, px: [0, 100, 200, 200, 0, 100, 200, 200])
        let half = FS.areaResize(src, to: 2, 1)
        XCTAssertEqual(half.px, [50, 200])
        XCTAssertEqual(FS.halve(src).px, [50, 200])
        // 3 → 2: the middle pixel is split between both outputs.
        let r = FS.areaResize(FS.GrayImage(w: 3, h: 1, px: [0, 90, 180]), to: 2, 1)
        XCTAssertEqual(r.px[0], 30, accuracy: 1e-4)
        XCTAssertEqual(r.px[1], 150, accuracy: 1e-4)
        let ws = FS.workSize(sheetWidth: 4000, sheetHeight: 3000, scale: 0.25)
        XCTAssertTrue(ws == (1000, 750, 2000, 1500))
    }

    func testBlurKeepsFlatAndSpreadsALine() {
        let flat = FS.blur3(FS.GrayImage(w: 4, h: 4, px: [Float](repeating: 200, count: 16)))
        XCTAssertTrue(flat.px.allSatisfy { abs($0 - 200) < 1e-4 })
        var px = [Float](repeating: 255, count: 25)
        for y in 0..<5 { px[y * 5 + 2] = 0 }
        let b = FS.blur3(FS.GrayImage(w: 5, h: 5, px: px))
        XCTAssertEqual(b[2, 2], 127.5, accuracy: 1e-3)
        XCTAssertEqual(b[1, 2], 191.25, accuracy: 1e-3)
        XCTAssertEqual(b[0, 2], 255, accuracy: 1e-3)
    }

    func testScoreMapMatchesDirectNCC() {
        // A small random image: the row-by-row map equals the direct formula everywhere.
        var seed: UInt64 = 42
        func next() -> Float { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Float((seed >> 33) % 256) }
        let im = FS.GrayImage(w: 23, h: 17, px: (0..<(23 * 17)).map { _ in next() })
        let tpl = im.crop(.init(x: 5, y: 4, w: 7, h: 6))
        let t = FS.Template(tpl, w: 7, h: 6)
        let map = FS.scoreMap(im, t)
        XCTAssertEqual(map.w, 17); XCTAssertEqual(map.h, 12)
        for y in 0..<map.h { for x in 0..<map.w { XCTAssertEqual(map.scores[y * map.w + x], FS.score(im, t, x: x, y: y), accuracy: 1e-3) } }
        XCTAssertEqual(map.scores[4 * map.w + 5], 1, accuracy: 1e-4)
        // NCC ignores brightness and contrast.
        let brighter = FS.GrayImage(w: im.w, h: im.h, px: im.px.map { $0 * 0.5 + 60 })
        XCTAssertEqual(FS.score(brighter, t, x: 5, y: 4), 1, accuracy: 1e-4)
    }

    // MARK: the matcher on a synthetic plan

    /// A door symbol (leaf + quarter swing), s × s, ink 0 on 255.
    static func door(_ s: Int) -> [UInt8] {
        var g = [UInt8](repeating: 255, count: s * s)
        func dot(_ x: Int, _ y: Int) { if x >= 0, y >= 0, x < s, y < s { g[y * s + x] = 0 } }
        let r = Double(s - 6)
        for y in 2..<(s - 3) { dot(2, y); dot(3, y) }   // leaf
        for i in 0...200 {                               // swing
            let a = Double(i) / 200 * Double.pi / 2
            let x = 3 + r * sin(a), y = Double(s - 4) - r * cos(a)
            dot(Int(x.rounded()), Int(y.rounded()))
        }
        for x in 2..<(s - 2) { dot(x, s - 4) }           // wall break
        return g
    }

    /// A square outline (a look-alike that isn't a door).
    static func square(_ s: Int) -> [UInt8] {
        var g = [UInt8](repeating: 255, count: s * s)
        for i in 2..<(s - 2) { g[2 * s + i] = 0; g[(s - 3) * s + i] = 0; g[i * s + 2] = 0; g[i * s + s - 3] = 0 }
        return g
    }

    static func stamp(_ canvas: inout [UInt8], _ cw: Int, _ g: [UInt8], _ gw: Int, _ gh: Int, at x0: Int, _ y0: Int) {
        for y in 0..<gh { for x in 0..<gw { canvas[(y0 + y) * cw + x0 + x] = min(canvas[(y0 + y) * cw + x0 + x], g[y * gw + x]) } }
    }

    func testFindsEveryDoorTurnedAndMirroredAndNothingElse() throws {
        let s = 34, W = 520, H = 300
        var canvas = [UInt8](repeating: 255, count: W * H)
        let door = Self.door(s)
        var spots: [(Double, Double)] = []
        for (i, o) in FS.orientations.enumerated() {
            let g = FS.orient(door, w: s, h: s, o)
            let x = 20 + (i % 4) * 120, y = 20 + (i / 4) * 130
            Self.stamp(&canvas, W, g.data, g.w, g.h, at: x, y)
            spots.append((Double(x) + Double(s) / 2, Double(y) + Double(s) / 2))
        }
        // Look-alikes: squares and a long wall line.
        Self.stamp(&canvas, W, Self.square(s), s, s, at: 80, 85)
        Self.stamp(&canvas, W, Self.square(s), s, s, at: 330, 220)
        for x in 10..<(W - 10) { canvas[260 * W + x] = 0 }

        let sheet = FS.GrayImage(w: W, h: H, bytes: canvas)
        let box = FS.Box(x: 20, y: 20, w: Double(s), h: Double(s))
        let scale = try XCTUnwrap(FS.chooseScale(box: box, sheetWidth: Double(W), sheetHeight: Double(H)))
        XCTAssertEqual(scale, 32.0 / 34, accuracy: 1e-9)
        let size = FS.workSize(sheetWidth: Double(W), sheetHeight: Double(H), scale: scale)
        let work = FS.prepare(decoded: FS.areaResize(sheet, to: size.decodeW, size.decodeH), workW: size.w, workH: size.h)
        var progressed = 0
        let r = try FS.search(in: work, scale: scale, box: box, trim: false, progress: { _, _ in progressed += 1 })
        XCTAssertGreaterThan(progressed, 1)
        let shown = r.candidates.filter { $0.score >= FS.thresholdFor(50) }
        XCTAssertEqual(shown.count, 8, "\(shown.map { ($0.cx, $0.cy, $0.score) })")
        for (x, y) in spots {
            XCTAssertTrue(shown.contains { abs($0.cx - x) <= 3 && abs($0.cy - y) <= 3 }, "missed the door at \(x), \(y)")
        }
        XCTAssertTrue(shown.allSatisfy { $0.score > 0.85 })
        // The picked one is a perfect match.
        XCTAssertEqual(shown.max(by: { $0.score < $1.score })!.score, 1, accuracy: 0.01)
    }

    /// Timing on a full-size work image (3200 × 2070, walls, text-like clutter, 40 doors). Off by default; run with
    /// FIND_SIMILAR_BENCH=1 swift test -c release --filter testBenchmarkFullSheet.
    func testBenchmarkFullSheet() throws {
        guard ProcessInfo.processInfo.environment["FIND_SIMILAR_BENCH"] != nil else { throw XCTSkip("benchmark") }
        let W = 3200, H = 2070, s = 34
        var canvas = [UInt8](repeating: 255, count: W * H)
        var seed: UInt64 = 7
        func next(_ n: Int) -> Int { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Int((seed >> 33) % UInt64(n)) }
        for _ in 0..<120 {   // walls
            let x = next(W - 400), y = next(H - 400), len = 100 + next(300)
            if next(2) == 0 { for i in 0..<len { canvas[y * W + x + i] = 0; canvas[(y + 1) * W + x + i] = 0 } }
            else { for i in 0..<len { canvas[(y + i) * W + x] = 0; canvas[(y + i) * W + x + 1] = 0 } }
        }
        for _ in 0..<3000 {  // "text": short dashes
            let x = next(W - 10), y = next(H - 10)
            for i in 0..<(2 + next(6)) { canvas[y * W + x + i] = 0 }
        }
        let door = Self.door(s)
        for i in 0..<40 {
            let g = FS.orient(door, w: s, h: s, FS.orientations[i % 8])
            Self.stamp(&canvas, W, g.data, g.w, g.h, at: 50 + (i % 10) * 300, 100 + (i / 10) * 450)
        }
        let t0 = Date()
        let work = FS.prepare(decoded: FS.GrayImage(w: W, h: H, bytes: canvas), workW: W, workH: H)
        let t1 = Date()
        let r = try FS.search(in: work, scale: 1, box: .init(x: 50, y: 100, w: Double(s), h: Double(s)), trim: false)
        let t2 = Date()
        let found = r.candidates.filter { $0.score >= 0.7 }.count
        print("FindSimilar bench: prepare \(Int(t1.timeIntervalSince(t0) * 1000)) ms, search \(Int(t2.timeIntervalSince(t1) * 1000)) ms, found \(found) of 40")
        XCTAssertGreaterThanOrEqual(found, 40)
    }

    func testTapTrimsToTheSymbol() throws {
        let s = 30, W = 300, H = 200
        var canvas = [UInt8](repeating: 255, count: W * H)
        Self.stamp(&canvas, W, Self.door(s), s, s, at: 40, 40)
        Self.stamp(&canvas, W, FS.orient(Self.door(s), w: s, h: s, .init(rot: 180, flip: false)).data, s, s, at: 200, 120)
        let work = FS.prepare(decoded: FS.GrayImage(w: W, h: H, bytes: canvas), workW: W, workH: H)
        // A generous square around the first door, as a tap gives.
        let r = try FS.search(in: work, scale: 1, box: .init(x: 25, y: 25, w: 60, h: 60), trim: true)
        XCTAssertLessThan(r.template.w, 40)
        XCTAssertEqual(r.candidates.filter { $0.score >= 0.7 }.count, 2)
    }

    func testRefusesBlankAndTinyBoxes() {
        let work = FS.GrayImage(w: 100, h: 100, px: [Float](repeating: 255, count: 10000))
        XCTAssertThrowsError(try FS.search(in: work, scale: 1, box: .init(x: 10, y: 10, w: 30, h: 30), trim: false)) { XCTAssertEqual($0 as? FS.SearchError, .blank) }
        XCTAssertThrowsError(try FS.search(in: work, scale: 1, box: .init(x: 10, y: 10, w: 4, h: 30), trim: false)) { XCTAssertEqual($0 as? FS.SearchError, .tooSmall) }
        XCTAssertThrowsError(try FS.search(in: work, scale: 1, box: .init(x: 10, y: 10, w: 30, h: 30), trim: false, cancelled: { true })) { XCTAssertEqual($0 as? FS.SearchError, .blank) }
    }

    func testCancelledBetweenOrientations() {
        let s = 30
        var canvas = [UInt8](repeating: 255, count: 200 * 120)
        Self.stamp(&canvas, 200, Self.door(s), s, s, at: 20, 20)
        let work = FS.prepare(decoded: FS.GrayImage(w: 200, h: 120, bytes: canvas), workW: 200, workH: 120)
        XCTAssertThrowsError(try FS.search(in: work, scale: 1, box: .init(x: 20, y: 20, w: 30, h: 30), trim: false, cancelled: { true })) {
            XCTAssertEqual($0 as? FS.SearchError, .cancelled)
        }
    }

    // MARK: Read tags

    func testTagPrefixes() {
        XCTAssertEqual(FindTags.defaultPrefixes(typeName: "Door contact"), "D, DR")
        XCTAssertEqual(FindTags.defaultPrefixes(typeName: "Window sensor"), "W, WD, WIN")
        XCTAssertEqual(FindTags.defaultPrefixes(typeName: "Smoke detector"), "")
        XCTAssertEqual(FindTags.defaultPrefixes(typeName: "Indoor camera"), "")
        XCTAssertEqual(FindTags.defaultPrefixes(typeName: "Doors"), "D, DR")
        XCTAssertEqual(FindTags.parsePrefixes(" d, dr;W  wd "), ["DR", "WD", "D", "W"])
        XCTAssertEqual(FindTags.parsePrefixes(""), [])
    }

    func testTagPattern() {
        let d = FindTags.parsePrefixes("D, DR")
        for ok in ["D1", "D-12", "D.3", "DR4", "D101A"] { XCTAssertTrue(FindTags.isTag(ok, prefixes: d), ok) }
        for no in ["D", "DOOR", "D1234", "AD1", "D1-2", "W3", "DD1"] { XCTAssertFalse(FindTags.isTag(no, prefixes: d), no) }
        let w = FindTags.parsePrefixes("W, WD")
        XCTAssertTrue(["W3", "WD2", "W-14B"].allSatisfy { FindTags.isTag($0, prefixes: w) })
        XCTAssertFalse(FindTags.isTag("D1", prefixes: []))
        XCTAssertEqual(FindTags.cleanWord("(d-12),"), "D-12")
    }

    func testFindsTagsOnceAndSkipsSchedules() {
        let items = [PlanTextItem(text: "D1", x: 0.1, y: 0.2), PlanTextItem(text: "(D-12)", x: 0.5, y: 0.5),
                     PlanTextItem(text: "KITCHEN", x: 0.3, y: 0.3), PlanTextItem(text: "D1", x: 0.1005, y: 0.2), PlanTextItem(text: "W4", x: 0.6, y: 0.7)]
        XCTAssertEqual(FindTags.find(in: items, prefixes: ["D"]).map(\.tag), ["D1", "D-12"])
        XCTAssertEqual(FindTags.find(in: items, prefixes: ["W"]).map(\.tag), ["W4"])
        let sched = (0..<5).map { PlanTextItem(text: "D\($0 + 1)", x: 0.85, y: 0.1 + Double($0) * 0.015) }
        let plan = [PlanTextItem(text: "D1", x: 0.2, y: 0.3), PlanTextItem(text: "D2", x: 0.4, y: 0.6), PlanTextItem(text: "D3", x: 0.2, y: 0.51)]
        let tags = FindTags.find(in: sched + plan, prefixes: ["D"])
        XCTAssertEqual(tags.count, 3)
        XCTAssertTrue(tags.allSatisfy { $0.x < 0.5 })
        XCTAssertEqual(FindTags.find(in: sched + plan, prefixes: ["D"], skipSchedules: false).count, 8)
        XCTAssertEqual(FindTags.scheduleTags((0..<3).map { .init(tag: "D\($0)", x: 0.5, y: 0.1 + Double($0) * 0.01) }).count, 0)
        XCTAssertEqual(FindTags.scheduleTags((0..<4).map { .init(tag: "D\($0)", x: 0.5, y: 0.1 + Double($0) * 0.2) }).count, 0)
    }

    func testTagNearDistance() {
        XCTAssertEqual(FS.tagNearPx(sheetWidth: 4800, sheetHeight: 3105, pxPerFt: 25), 100)
        XCTAssertEqual(FS.tagNearPx(sheetWidth: 4800, sheetHeight: 3105, pxPerFt: nil), 96)
        XCTAssertEqual(FS.nearPx(template: .init(x: 0, y: 0, w: 40, h: 50)), 30)
    }
}
