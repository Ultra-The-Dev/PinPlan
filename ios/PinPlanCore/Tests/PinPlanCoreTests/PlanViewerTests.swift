import XCTest
@testable import PinPlanCore

final class PlanViewportTests: XCTestCase {
    private let sheet = PlanSize(width: 4000, height: 2000)
    private let view = PlanSize(width: 1032, height: 800)

    private func fitted() -> PlanViewport { PlanViewport(sheetSize: sheet, viewSize: view, zoom: 1, origin: .zero).fitted() }

    func testFitLeavesAGutterAndCentres() {
        let v = fitted()
        XCTAssertEqual(v.zoom, 0.25, accuracy: 1e-9)          // (1032 − 32) / 4000
        XCTAssertEqual(v.origin.x, 16, accuracy: 1e-9)
        XCTAssertEqual(v.origin.y, (800 - 500) / 2, accuracy: 1e-9)
        XCTAssertEqual(v.visibleSheetRect, .unit)
    }

    func testRoundTripBetweenSheetAndView() {
        var v = fitted()
        v = v.zoomed(by: 3.7, anchor: PlanPoint(x: 300, y: 222))
        for p in [PlanPoint(x: 0, y: 0), PlanPoint(x: 0.25, y: 0.75), PlanPoint(x: 1, y: 1)] {
            let back = v.toSheet(v.toView(p))
            XCTAssertEqual(back.x, p.x, accuracy: 1e-12)
            XCTAssertEqual(back.y, p.y, accuracy: 1e-12)
        }
        XCTAssertEqual(v.toSheetClamped(PlanPoint(x: -1e6, y: 1e6)), PlanPoint(x: 0, y: 1))
        XCTAssertFalse(v.isOnSheet(PlanPoint(x: -1e6, y: 0)))
    }

    func testPinchKeepsTheAnchorFixed() {
        let v = fitted()
        let anchor = PlanPoint(x: 400, y: 300)
        let before = v.toSheet(anchor)
        let z = v.zoomed(by: 2.5, anchor: anchor)
        XCTAssertEqual(z.zoom, v.zoom * 2.5, accuracy: 1e-12)
        let after = z.toSheet(anchor)
        XCTAssertEqual(after.x, before.x, accuracy: 1e-12)
        XCTAssertEqual(after.y, before.y, accuracy: 1e-12)
        // Limits clamp the zoom but still keep the anchor fixed.
        let clamped = v.zoomed(by: 1000, anchor: anchor, limits: 0.1...2)
        XCTAssertEqual(clamped.zoom, 2)
        XCTAssertEqual(clamped.toSheet(anchor).x, before.x, accuracy: 1e-12)
    }

    func testCentredAndShowing() {
        let v = fitted().centered(on: PlanPoint(x: 0.8, y: 0.1), zoom: 1)
        let c = v.toSheet(PlanPoint(x: view.width / 2, y: view.height / 2))
        XCTAssertEqual(c.x, 0.8, accuracy: 1e-12)
        XCTAssertEqual(c.y, 0.1, accuracy: 1e-12)
        let r = PlanRect(x: 0.4, y: 0.4, width: 0.1, height: 0.1)   // 400 × 200 px
        let s = fitted().showing(r)
        XCTAssertEqual(s.zoom, min(1032 / 400.0, 800 / 200.0), accuracy: 1e-9)
        let shown = s.visibleSheetRect
        XCTAssertTrue(shown.contains(PlanPoint(x: 0.4, y: 0.4)) && shown.contains(PlanPoint(x: 0.5, y: 0.5)))
        let cr = s.contentRect(centeredOn: r.center, zoom: s.zoom)
        XCTAssertEqual(cr.midX, 0.45 * 4000, accuracy: 1e-9)
        XCTAssertEqual(cr.width, 1032 / s.zoom, accuracy: 1e-9)
    }

    func testVisibleRectAndCulling() {
        let v = fitted().centered(on: PlanPoint(x: 0.5, y: 0.5), zoom: 1)   // 1032 × 800 px of a 4000 × 2000 sheet
        let vis = v.visibleSheetRect
        XCTAssertEqual(vis.width, 1032 / 4000, accuracy: 1e-9)
        XCTAssertEqual(vis.height, 800 / 2000, accuracy: 1e-9)
        XCTAssertTrue(v.isOnScreen(PlanPoint(x: 0.5, y: 0.5)))
        XCTAssertFalse(v.isOnScreen(PlanPoint(x: 0.05, y: 0.5)))
        // A symbol 20 pt off screen is still inside a 30 pt margin.
        let justOff = v.toSheet(PlanPoint(x: -20, y: 400))
        XCTAssertFalse(v.isOnScreen(justOff))
        XCTAssertTrue(v.isOnScreen(justOff, margin: 30))
        XCTAssertTrue(v.cullRect(margin: 30).contains(justOff))
    }

    func testZoomLimitsFromSheetSize() {
        let raster = PlanViewport.zoomLimits(sheet: sheet, view: view, displayScale: 2, hasVector: false)
        XCTAssertEqual(raster.lowerBound, 0.25, accuracy: 1e-9)
        XCTAssertEqual(raster.upperBound, 2, accuracy: 1e-9)    // 4 device px per sheet px on a 2× screen
        let vector = PlanViewport.zoomLimits(sheet: sheet, view: view, displayScale: 2, hasVector: true)
        XCTAssertEqual(vector.upperBound, 6, accuracy: 1e-9)
        // A tiny image can still be zoomed 8× past its fit.
        let tiny = PlanViewport.zoomLimits(sheet: PlanSize(width: 200, height: 100), view: view, displayScale: 3, hasVector: false)
        XCTAssertEqual(tiny.upperBound, tiny.lowerBound * 8, accuracy: 1e-9)
        XCTAssertEqual(PlanViewport.doubleTapZoom(current: 0.25, limits: raster), 0.625, accuracy: 1e-9)
        XCTAssertEqual(PlanViewport.doubleTapZoom(current: 1.95, limits: raster), 0.25)   // at the top: back out
    }

    func testViewStateSurvivesASizeChange() {
        let v = fitted().centered(on: PlanPoint(x: 0.3, y: 0.6), zoom: 1)
        let state = PlanViewState(v)
        XCTAssertEqual(state.zoomOverFit, 4, accuracy: 1e-9)
        XCTAssertFalse(state.isFit)
        var rotated = v
        rotated.viewSize = PlanSize(width: 800, height: 1032)
        let restored = state.apply(to: rotated)
        XCTAssertEqual(restored.zoom, rotated.fitZoom * 4, accuracy: 1e-9)
        let c = restored.toSheet(PlanPoint(x: 400, y: 516))
        XCTAssertEqual(c.x, 0.3, accuracy: 1e-9)
        XCTAssertEqual(c.y, 0.6, accuracy: 1e-9)
        let data = try! JSONEncoder().encode(state)
        XCTAssertEqual(try! JSONDecoder().decode(PlanViewState.self, from: data), state)
        XCTAssertTrue(PlanViewState(fitted()).isFit)
    }

    func testFeetToPoints() {
        let v = fitted()
        XCTAssertEqual(v.points(feet: 10, pxPerFt: 20)!, 50, accuracy: 1e-9)
        XCTAssertNil(v.points(feet: 10, pxPerFt: nil))
    }
}

final class PlanTilesTests: XCTestCase {
    private let sheet = PlanSize(width: 4800, height: 3100)

    func testLevels() {
        XCTAssertEqual(PlanTiles.levelCount(sheet: sheet), 5)       // 4800 → 2400 → 1200 → 600 → 300
        XCTAssertEqual(PlanTiles.levelCount(sheet: PlanSize(width: 400, height: 300)), 1)
        XCTAssertEqual(PlanTiles.levelSize(sheet: sheet, level: 2), PlanSize(width: 1200, height: 775))
        XCTAssertEqual(PlanTiles.levelSize(sheet: sheet, level: 3), PlanSize(width: 600, height: 388))
    }

    func testLevelSelection() {
        // At least one image pixel per screen pixel.
        XCTAssertEqual(PlanTiles.level(devicePixelsPerSheetPixel: 2, levelCount: 5), 0)
        XCTAssertEqual(PlanTiles.level(devicePixelsPerSheetPixel: 1, levelCount: 5), 0)
        XCTAssertEqual(PlanTiles.level(devicePixelsPerSheetPixel: 0.98, levelCount: 5), 0)
        XCTAssertEqual(PlanTiles.level(devicePixelsPerSheetPixel: 0.6, levelCount: 5), 0)
        XCTAssertEqual(PlanTiles.level(devicePixelsPerSheetPixel: 0.5, levelCount: 5), 1)
        XCTAssertEqual(PlanTiles.level(devicePixelsPerSheetPixel: 0.3, levelCount: 5), 1)
        XCTAssertEqual(PlanTiles.level(devicePixelsPerSheetPixel: 0.25, levelCount: 5), 2)
        XCTAssertEqual(PlanTiles.level(devicePixelsPerSheetPixel: 0.001, levelCount: 5), 4)   // clamped to the top
        XCTAssertTrue(PlanTiles.wantsVectorDetail(devicePixelsPerSheetPixel: 2))
        XCTAssertFalse(PlanTiles.wantsVectorDetail(devicePixelsPerSheetPixel: 1))
    }

    func testTilesCoveringARect() {
        // Level 0 tiles are 512 sheet px; level 1 tiles 1024.
        let t0 = PlanTiles.tiles(covering: PlanRect(x: 500, y: 0, width: 600, height: 10), level: 0, sheet: sheet)
        XCTAssertEqual(t0.map(\.col), [0, 1, 2])
        XCTAssertEqual(Set(t0.map(\.row)), [0])
        let t1 = PlanTiles.tiles(covering: PlanRect(x: 500, y: 0, width: 600, height: 10), level: 1, sheet: sheet)
        XCTAssertEqual(t1.map(\.col), [0, 1])
        XCTAssertTrue(PlanTiles.tiles(covering: PlanRect(x: -900, y: -900, width: 100, height: 100), level: 0, sheet: sheet).isEmpty)
        // Edge tiles are clipped to the sheet.
        let last = PlanTiles.TileID(level: 0, col: 9, row: 6)
        XCTAssertEqual(PlanTiles.sheetRect(of: last, sheet: sheet), PlanRect(x: 4608, y: 3072, width: 192, height: 28))
        XCTAssertEqual(PlanTiles.levelRect(of: PlanTiles.TileID(level: 2, col: 2, row: 1), sheet: sheet), PlanRect(x: 1024, y: 512, width: 176, height: 263))
        XCTAssertEqual(last.fileName, "L0_9_6.jpg")
    }

    func testEveryTileOfThePyramid() {
        let all = PlanTiles.allTiles(sheet: sheet)
        // L0 10×7, L1 5×4, L2 3×2, L3 2×1, L4 1×1
        XCTAssertEqual(all.count, 70 + 20 + 6 + 2 + 1)
        XCTAssertEqual(Set(all).count, all.count)
    }

    func testTiledLayerLevels() {
        let l = PlanTiles.tiledLayerLevels(minZoom: 0.2, maxZoom: 6)
        XCTAssertEqual(l.bias, 3)
        XCTAssertEqual(l.levels, 3 + 3 + 1)
    }

    func testMarkerMetrics() {
        XCTAssertEqual(PlanMarkerMetrics.symbolSize(zoom: 1, fitZoom: 0.2), 30)
        XCTAssertEqual(PlanMarkerMetrics.symbolSize(zoom: 0.2, fitZoom: 0.2), 24)   // 30 × √(1/1.6) ≈ 23.7
        XCTAssertEqual(PlanMarkerMetrics.symbolSize(zoom: 0.01, fitZoom: 0.2), 18)
        XCTAssertEqual(PlanMarkerMetrics.symbolSize(zoom: 0.26, fitZoom: 0.2).truncatingRemainder(dividingBy: 2), 0)
        XCTAssertEqual(PlanMarkerMetrics.hitRadius(symbolSize: 18), 22)
    }

    func testDensestCluster() {
        var pts = (0..<12).map { PlanPoint(x: 0.7 + Double($0 % 4) * 0.01, y: 0.3 + Double($0 / 4) * 0.01) }
        pts += [PlanPoint(x: 0.1, y: 0.1), PlanPoint(x: 0.9, y: 0.9), PlanPoint(x: 0.12, y: 0.11)]
        let d = PlanDensity.densest(pts)!
        XCTAssertEqual(d.count, 12)
        XCTAssertEqual(d.center.x, 0.715, accuracy: 1e-9)
        XCTAssertEqual(d.center.y, 0.31, accuracy: 1e-9)
        XCTAssertNil(PlanDensity.densest([]))
        let b = PlanDensity.bounds([PlanPoint(x: 0.2, y: 0.2), PlanPoint(x: 0.4, y: 0.5)], pad: 0.05)!
        XCTAssertEqual(b.minX, 0.15, accuracy: 1e-9)
        XCTAssertEqual(b.maxY, 0.55, accuracy: 1e-9)
    }
}

final class PlanFilterTests: XCTestCase {
    private func marker(_ type: String, room: String = "", tentative: Bool = false) -> Marker {
        Marker(projectId: "p", sheetId: "s", deviceTypeId: type, x: 0.5, y: 0.5, label: type, room: room, tentative: tentative)
    }
    private func cat(_ id: String) -> PinPlanCore.Category? { id.hasPrefix("cam") ? .security : id == "wap" ? .network : nil }

    func testLayersTypesTentativeAndRooms() {
        var f = PlanFilter()
        let cam = marker("cam-indoor", room: "Kitchen"), wap = marker("wap", room: "Hall", tentative: true)
        XCTAssertTrue(f.shows(cam, category: .security) && f.shows(wap, category: .network))
        XCTAssertFalse(f.isFiltering)

        f.setLayer(.security, visible: false)
        XCTAssertFalse(f.shows(cam, category: .security))
        XCTAssertTrue(f.isFiltering)
        f.setLayer(.security, visible: true)

        f.setType("wap", visible: false)
        XCTAssertFalse(f.shows(wap, category: .network))
        f.setType("wap", visible: true)

        f.tentative = .confirmed
        XCTAssertTrue(f.shows(cam, category: .security))
        XCTAssertFalse(f.shows(wap, category: .network))
        f.tentative = .tentative
        XCTAssertFalse(f.shows(cam, category: .security))
        f.tentative = .all

        f.toggleRoom("Kitchen")
        XCTAssertTrue(f.shows(cam, category: .security))
        XCTAssertFalse(f.shows(wap, category: .network))
        f.toggleRoom("Kitchen")
        XCTAssertTrue(f.rooms.isEmpty)

        f.showLabels = true
        f.hiddenTypes = ["x"]
        f.reset()
        XCTAssertFalse(f.isFiltering)
        XCTAssertTrue(f.showLabels)   // reset keeps the labels choice
    }

    func testRunsAndClosets() {
        var f = PlanFilter()
        let wire = Run(projectId: "p", sheetId: "s", kind: .wire, points: [0, 0, 1, 1])
        let led = Run(projectId: "p", sheetId: "s", kind: .led, deviceTypeId: "led-ceiling", points: [0, 0, 1, 1])
        f.setLayer(.wiring, visible: false)
        XCTAssertFalse(f.shows(wire))
        XCTAssertTrue(f.shows(led))
        f.setType("led-ceiling", visible: false)
        XCTAssertFalse(f.shows(led))
        XCTAssertTrue(f.shows(closetCategory: .infrastructure))
        f.setLayer(.infrastructure, visible: false)
        XCTAssertFalse(f.shows(closetCategory: .infrastructure))
        f.setLayer(.infrastructure, visible: true)
        f.showClosets = false
        XCTAssertFalse(f.shows(closetCategory: .infrastructure))
    }

    func testCountsAndRooms() {
        var f = PlanFilter()
        f.setLayer(.network, visible: false)
        let ms = [marker("cam-indoor", room: "Kitchen"), marker("cam-indoor", room: "Hall", tentative: true), marker("wap", room: "Kitchen")]
        let runs = [Run(projectId: "p", sheetId: "s", kind: .wire, points: [0, 0, 1, 1])]
        let c = f.counts(markers: ms, runs: runs, category: cat)
        XCTAssertEqual(c.total, 3)
        XCTAssertEqual(c.shown, 2)
        XCTAssertEqual(c.byLayer[.security], 2)
        XCTAssertEqual(c.byLayer[.network], 1)
        XCTAssertEqual(c.byLayer[.wiring], 1)
        XCTAssertEqual(c.byType["cam-indoor"], 2)
        XCTAssertEqual(c.byRoom["Kitchen"], 2)
        XCTAssertEqual(c.tentative, 1)
        XCTAssertEqual(PlanFilter.rooms(in: ms), ["Hall", "Kitchen"])
        let data = try! JSONEncoder().encode(f)
        XCTAssertEqual(try! JSONDecoder().decode(PlanFilter.self, from: data), f)
    }

    func testViewerModeDefaults() {
        XCTAssertEqual(PlanViewerMode.defaultMode(for: .tech), .view)
        XCTAssertEqual(PlanViewerMode.defaultMode(for: .owner), .edit)
        XCTAssertEqual(PlanViewerMode.defaultMode(for: nil), .edit)
    }
}

final class SheetNavTests: XCTestCase {
    private func sheet(_ id: String, _ name: String, order: Int) -> Sheet {
        Sheet(id: id, projectId: "p", name: name, pageNumber: order + 1, order: order, imageId: "i-\(id)", width: 100, height: 100)
    }

    func testOrderNeighboursAndSearch() {
        let sheets = [sheet("c", "Cellar", order: 2), sheet("a", "Attic", order: 0), sheet("b", "1st floor", order: 1)]
        XCTAssertEqual(SheetNav.ordered(sheets).map(\.id), ["a", "b", "c"])
        XCTAssertEqual(SheetNav.neighbor(of: "b", in: sheets, delta: 1)?.id, "c")
        XCTAssertEqual(SheetNav.neighbor(of: "b", in: sheets, delta: -1)?.id, "a")
        XCTAssertNil(SheetNav.neighbor(of: "c", in: sheets, delta: 1))
        XCTAssertNil(SheetNav.neighbor(of: "zzz", in: sheets, delta: 1))
        XCTAssertEqual(SheetNav.position(of: "c", in: sheets)?.index, 3)
        XCTAssertEqual(SheetNav.search(sheets, query: "floor").map(\.id), ["b"])
        XCTAssertEqual(SheetNav.search(sheets, query: "p3").map(\.id), ["c"])
        XCTAssertEqual(SheetNav.search(sheets, query: "  ").count, 3)
    }

    func testRecents() {
        var r: [String] = []
        r = SheetNav.touch("a", recents: r)
        r = SheetNav.touch("b", recents: r)
        r = SheetNav.touch("a", recents: r)
        XCTAssertEqual(r, ["a", "b"])
        XCTAssertEqual(SheetNav.touch("z", recents: (0..<10).map(String.init), limit: 3), ["z", "0", "1"])
        let sheets = [sheet("a", "A", order: 0)]
        XCTAssertEqual(SheetNav.recent(["gone", "a"], in: sheets).map(\.id), ["a"])
    }
}
