import Foundation

/// Editing operations on a project. All mutate the bundle in place; the app snapshots the bundle for undo/redo.
public extension ProjectBundle {
    private mutating func touchProject() { project.updatedAt = isoNow() }

    /// Default home-run closet: an equipment closet (same floor first), else any closet.
    func defaultCloset(for sheetId: String) -> Closet? {
        let c = liveClosets
        return c.first { $0.kind == .equipment && $0.sheetId == sheetId } ?? c.first { $0.kind == .equipment }
            ?? c.first { $0.sheetId == sheetId } ?? c.first
    }

    @discardableResult
    mutating func addMarker(type: DeviceType, sheetId: String, x: Double, y: Double, room: String = "", tentative: Bool = false) -> Marker {
        let m = Marker(projectId: project.id, sheetId: sheetId, deviceTypeId: type.id, x: clamp01(x), y: clamp01(y),
                       label: Labels.next(abbrev: type.abbrev, sheetId: sheetId, sheets: liveSheets, markers: liveMarkers),
                       room: room.trimmingCharacters(in: .whitespaces), mount: type.defaultMount, wireType: type.defaultWire,
                       closetId: defaultCloset(for: sheetId)?.id, tentative: tentative)
        markers.append(m)
        touchProject()
        return m
    }

    mutating func updateMarker(_ id: String, pricing: PricingSettings, _ change: (inout Marker) -> Void) {
        guard let i = markers.firstIndex(where: { $0.id == id }) else { return }
        change(&markers[i])
        markers[i].x = clamp01(markers[i].x); markers[i].y = clamp01(markers[i].y)
        markers[i].updatedAt = isoNow()
        // Keep an attached home-run line in sync.
        if let ri = runs.firstIndex(where: { $0.kind == .wire && $0.markerId == id && $0.deleted != true }) {
            if let c = liveClosets.first(where: { $0.id == markers[i].closetId }) {
                runs[ri] = homeRun(for: markers[i], closet: c, existing: runs[ri], pricing: pricing)
            } else {
                runs[ri].deleted = true
            }
        }
        touchProject()
    }

    @discardableResult
    mutating func addRun(_ run: Run) -> Run {
        var r = run
        if r.kind != .stair, let s = sheets.first(where: { $0.id == r.sheetId }) { r.measuredFt = Geometry.polylineFt(r.points, sheet: s) }
        runs.append(r)
        touchProject()
        return r
    }

    mutating func updateRun(_ id: String, _ change: (inout Run) -> Void) {
        guard let i = runs.firstIndex(where: { $0.id == id }) else { return }
        let before = runs[i].points
        change(&runs[i])
        if runs[i].points != before, runs[i].kind != .stair, let s = sheets.first(where: { $0.id == runs[i].sheetId }) {
            runs[i].measuredFt = Geometry.polylineFt(runs[i].points, sheet: s)
        }
        runs[i].updatedAt = isoNow()
        touchProject()
    }

    @discardableResult
    mutating func addCloset(kind: ClosetKind, sheetId: String, x: Double, y: Double) -> Closet {
        let base = Catalog.closetInfo(kind).name
        let n = liveClosets.filter { $0.kind == kind }.count
        let c = Closet(projectId: project.id, sheetId: sheetId, kind: kind, x: clamp01(x), y: clamp01(y), name: n > 0 ? "\(base) \(n + 1)" : base)
        closets.append(c)
        touchProject()
        return c
    }

    mutating func updateCloset(_ id: String, pricing: PricingSettings, _ change: (inout Closet) -> Void) {
        guard let i = closets.firstIndex(where: { $0.id == id }) else { return }
        change(&closets[i])
        closets[i].updatedAt = isoNow()
        for ri in runs.indices where runs[ri].kind == .wire && runs[ri].closetId == id && runs[ri].deleted != true {
            if let m = liveMarkers.first(where: { $0.id == runs[ri].markerId }) { runs[ri] = homeRun(for: m, closet: closets[i], existing: runs[ri], pricing: pricing) }
        }
        touchProject()
    }

    /// Soft-delete a marker (and its home run), run, or closet (its runs are removed, devices unassigned).
    mutating func deleteMarker(_ id: String) {
        if let i = markers.firstIndex(where: { $0.id == id }) { markers[i].deleted = true }
        for i in runs.indices where runs[i].markerId == id { runs[i].deleted = true }
        touchProject()
    }
    mutating func deleteRun(_ id: String) {
        if let i = runs.firstIndex(where: { $0.id == id }) { runs[i].deleted = true }
        touchProject()
    }
    mutating func deleteCloset(_ id: String) {
        if let i = closets.firstIndex(where: { $0.id == id }) { closets[i].deleted = true }
        for i in runs.indices where runs[i].closetId == id { runs[i].deleted = true }
        for i in markers.indices where markers[i].closetId == id { markers[i].closetId = nil }
        touchProject()
    }

    /// Set a sheet's scale and re-measure its runs (and re-estimate its home runs).
    mutating func setScale(sheetId: String, pxPerFt: Double, label: String?, pricing: PricingSettings) {
        guard let si = sheets.firstIndex(where: { $0.id == sheetId }) else { return }
        sheets[si].pxPerFt = pxPerFt
        sheets[si].scaleLabel = label
        sheets[si].updatedAt = isoNow()
        for i in runs.indices where runs[i].sheetId == sheetId && runs[i].kind != .stair && runs[i].deleted != true {
            if runs[i].kind == .wire, let m = liveMarkers.first(where: { $0.id == runs[i].markerId }),
               let c = liveClosets.first(where: { $0.id == runs[i].closetId }) {
                runs[i].measuredFt = Geometry.estimateHomeRunFt(marker: m, closet: c, sheets: liveSheets, pricing: pricing)
            } else {
                runs[i].measuredFt = Geometry.polylineFt(runs[i].points, sheet: sheets[si])
            }
        }
        touchProject()
    }

    /// Draw (or redraw) home runs for every wired device (optionally one sheet / one device).
    /// Devices without a closet are assigned the default closet. Returns the number of runs drawn.
    @discardableResult
    mutating func autoHomeRuns(catalog: [DeviceType], pricing: PricingSettings, sheetId: String? = nil, markerId: String? = nil) -> Int {
        var n = 0
        for i in markers.indices where markers[i].deleted != true {
            let m = markers[i]
            if let sheetId, m.sheetId != sheetId { continue }
            if let markerId, m.id != markerId { continue }
            if m.wireType == "None" || catalog.first(where: { $0.id == m.deviceTypeId })?.kind == .led { continue }
            var closet = liveClosets.first { $0.id == m.closetId }
            if closet == nil {
                closet = defaultCloset(for: m.sheetId)
                guard let c = closet else { continue }
                markers[i].closetId = c.id
            }
            let existingIdx = runs.firstIndex { $0.kind == .wire && $0.markerId == m.id && $0.deleted != true }
            let run = homeRun(for: markers[i], closet: closet!, existing: existingIdx.map { runs[$0] }, pricing: pricing)
            if let existingIdx { runs[existingIdx] = run } else { runs.append(run) }
            n += 1
        }
        if n > 0 { touchProject() }
        return n
    }

    func homeRun(for m: Marker, closet: Closet, existing: Run?, pricing: PricingSettings) -> Run {
        var r = existing ?? Run(projectId: m.projectId, sheetId: m.sheetId, kind: .wire, points: [])
        r.sheetId = m.sheetId
        r.points = Geometry.homeRunPoints(marker: m, closet: closet)
        r.markerId = m.id
        r.closetId = closet.id
        r.wireType = m.wireType
        r.tentative = m.tentative
        r.measuredFt = Geometry.estimateHomeRunFt(marker: m, closet: closet, sheets: liveSheets, pricing: pricing)
        r.deleted = nil
        r.updatedAt = isoNow()
        return r
    }

    /// Swap in a 90°-clockwise-rotated image and rotate everything drawn on the sheet with it.
    mutating func rotateSheetClockwise(_ sheetId: String, newImageId: String, width: Double, height: Double) {
        guard let si = sheets.firstIndex(where: { $0.id == sheetId }) else { return }
        sheets[si].imageId = newImageId
        sheets[si].width = width
        sheets[si].height = height
        sheets[si].imageUrl = nil
        func rot(_ x: Double, _ y: Double) -> (Double, Double) { (1 - y, x) }
        for i in markers.indices where markers[i].sheetId == sheetId { (markers[i].x, markers[i].y) = rot(markers[i].x, markers[i].y) }
        for i in closets.indices where closets[i].sheetId == sheetId { (closets[i].x, closets[i].y) = rot(closets[i].x, closets[i].y) }
        for i in runs.indices where runs[i].sheetId == sheetId {
            var p: [Double] = []
            var k = 0
            while k + 1 < runs[i].points.count { let (x, y) = rot(runs[i].points[k], runs[i].points[k + 1]); p += [x, y]; k += 2 }
            runs[i].points = p
        }
        touchProject()
    }

    /// Estimate override helpers.
    mutating func upsertEstimateLine(key: String, _ change: (inout EstimateLine) -> Void) {
        if let i = estimateLines.firstIndex(where: { $0.key == key && $0.deleted != true }) {
            change(&estimateLines[i]); estimateLines[i].updatedAt = isoNow()
        } else {
            var l = EstimateLine(projectId: project.id, key: key)
            change(&l)
            estimateLines.append(l)
        }
        touchProject()
    }
    mutating func resetEstimateLine(key: String) {
        for i in estimateLines.indices where estimateLines[i].key == key { estimateLines[i].deleted = true }
        touchProject()
    }
}

@inline(__always) func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }
