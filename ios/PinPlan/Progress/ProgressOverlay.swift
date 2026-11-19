import SwiftUI
import PinPlanCore

// Install progress on the plan, through the plan overlay registry (Viewer/PlanOverlay.swift): status rings around
// devices and status lines over runs, the Progress / Walk controls, and walk-mode taps (one tap marks a device).
// Registered once from PinPlanApp.
//
// The Progress / Walk controls live in the viewer's controls slot (bottom right, beside or above the zoom and layers
// buttons), never at the top: on iPhone the top of the plan belongs to the sheet pill and the action bar, and the
// navigation bar sits right above them. The undo snackbar is drawn on the plan, bottom left, clear of the controls.

enum ProgressOverlays {
    @MainActor static func register() {
        PlanOverlayRegistry.shared.register(PlanOverlay(id: "install-progress", zIndex: 20, content: { ctx in
            AnyView(ProgressRingsLayer(ctx: ctx))
        }, onTap: { tap in
            walkTap(tap)
        }, controls: { ctx in
            AnyView(ProgressControls(model: ctx.model, sheet: ctx.sheet))
        }))
        PlanOverlayRegistry.shared.register(PlanOverlay(id: "install-progress-snack", zIndex: 21, allowsHitTesting: true, content: { ctx in
            AnyView(ProgressSnackLayer(model: ctx.model))
        }))
    }

    /// Walk mode: the nearest device within 28 pt (else a run within 16 pt) gets the chosen status. Consumes the tap.
    @MainActor static func walkTap(_ tap: PlanTap) -> Bool {
        let ui = ProgressUI.shared
        guard ui.on, ui.walk else { return false }
        let ctx = tap.context
        let model = ctx.model
        let types = model.typesById
        // LED fixtures are tracked as runs (same as the web app and InstallProgress.trackedMarkers).
        let markers = model.visibleMarkers(on: ctx.sheet.id, types: types).filter { types[$0.deviceTypeId]?.kind != .led }
        let loc: (x: Double, y: Double) = (Double(tap.location.x), Double(tap.location.y))
        let pts: [(x: Double, y: Double)] = markers.map { m in
            let p = ctx.point(m.x, m.y)
            return (Double(p.x), Double(p.y))
        }
        if let i = InstallProgress.nearest(pts, to: loc, within: 28) {
            let m = markers[i]
            if m.tentative {
                model.say("Optional (?) devices aren't tracked — confirm it first")
                return true
            }
            walk(.marker(m.id), model: model)
            return true
        }
        for r in model.visibleRuns(on: ctx.sheet.id) where InstallProgress.markable(tentative: r.tentative, deleted: r.deleted) {
            var flat: [Double] = []
            var i = 0
            while i + 1 < r.points.count {
                let p = ctx.point(r.points[i], r.points[i + 1])
                flat.append(Double(p.x))
                flat.append(Double(p.y))
                i += 2
            }
            if InstallProgress.distance(to: flat, from: loc) <= 16 {
                walk(.run(r.id), model: model)
                return true
            }
        }
        return false
    }

    @MainActor static func walk(_ ref: InstallRef, model: EditorModel) {
        let ui = ProgressUI.shared
        let current = model.installStatus(ref)
        let wf = model.installWorkflow(ref)
        var to: InstallStatus?
        switch ui.target {
        case .details:
            ui.sheet = ref
            return
        case .next:
            to = InstallProgress.next(current, wf)
        case .status(let s):
            to = current == s ? nil : s
        }
        guard let to else {
            model.say("\(model.installLabel(ref)) is already \(wf.label(current).lowercased())")
            return
        }
        if let why = model.installBlocked(ref, to: to) {
            model.say(why)
            return
        }
        if InstallProgress.requiresPhoto(InstallSettings.photoRequired, to) && CameraPicker.isAvailable {
            ui.pendingPhoto = ProgressUI.PendingPhoto(ref: ref, to: to)
            return
        }
        if model.setInstall(ref, to: to) {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            ui.show(ref, "\(model.installLabel(ref)) → \(wf.label(to))")
        }
    }
}

/// Status rings (constant on-screen size) and translucent status lines over runs, in one Canvas. Screen positions
/// are worked out before drawing, so the Canvas only strokes paths.
struct ProgressRingsLayer: View {
    let ctx: PlanOverlayContext

    private struct Ring { let center: CGPoint; let status: InstallStatus }
    private struct Line { let points: [CGPoint]; let status: InstallStatus }

    var body: some View {
        if ProgressUI.shared.on {
            let model = ctx.model
            let types = model.typesById
            let rings: [Ring] = model.visibleMarkers(on: ctx.sheet.id, types: types)
                .filter { !$0.tentative && types[$0.deviceTypeId]?.kind != .led && ctx.isOnScreen($0.x, $0.y) }
                .map { Ring(center: ctx.point($0.x, $0.y), status: InstallProgress.status($0)) }
            let lines: [Line] = model.visibleRuns(on: ctx.sheet.id).filter { $0.tentative != true && $0.points.count >= 4 }.map { r in
                var pts: [CGPoint] = []
                var i = 0
                while i + 1 < r.points.count {
                    pts.append(ctx.point(r.points[i], r.points[i + 1]))
                    i += 2
                }
                return Line(points: pts, status: InstallProgress.status(r))
            }
            let size = CGFloat(PlanMarkerMetrics.symbolSize(zoom: ctx.viewport.zoom, fitZoom: ctx.controller.limits.lowerBound))
            let radius: CGFloat = size * 0.5 + 6
            Canvas { g, _ in
                for l in lines {
                    var path = Path()
                    path.addLines(l.points)
                    let c = Color(hex: InstallProgress.color(l.status)).opacity(0.45)
                    g.stroke(path, with: .color(c), style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
                }
                for r in rings {
                    let rect = CGRect(x: r.center.x - radius, y: r.center.y - radius, width: radius * 2, height: radius * 2)
                    let ring = Path(ellipseIn: rect)
                    let color = Color(hex: InstallProgress.color(r.status))
                    g.stroke(ring, with: .color(.white), lineWidth: 5)
                    let dash: [CGFloat] = r.status == .planned ? [4, 3] : []
                    g.stroke(ring, with: .color(color), style: StrokeStyle(lineWidth: 3, dash: dash))
                    if r.status == .tested || r.status == .verified || r.status == .issue {
                        let offset: CGFloat = radius * 0.72
                        let b = CGRect(x: r.center.x + offset - 6, y: r.center.y + offset - 6, width: 12, height: 12)
                        g.fill(Path(ellipseIn: b), with: .color(color))
                        g.stroke(Path(ellipseIn: b), with: .color(.white), lineWidth: 1.5)
                    }
                }
            }
            .allowsHitTesting(false)
        }
    }
}

/// The Progress / Walk controls for the viewer's controls slot: a "Progress" button that opens a small card with
/// the counter ("3/40 tested"), Walk and, while walking, what a tap marks. Also presents the device sheet and the
/// camera for photo-required statuses (this view stays put while the plan moves).
struct ProgressControls: View {
    @Environment(\.horizontalSizeClass) private var hSize
    let model: EditorModel
    let sheet: Sheet

    var body: some View {
        @Bindable var ui = ProgressUI.shared
        controls
            .sheet(item: $ui.sheet) { ref in
                DeviceInstallSheet(model: model, ref: ref)
            }
            .fullScreenCover(item: $ui.pendingPhoto) { pending in
                CameraPicker { img in
                    Task { @MainActor in
                        guard let p = model.makeInstallPhoto(img, for: pending.ref) else { return }
                        if model.setInstall(pending.ref, to: pending.to, photo: p) {
                            ProgressUI.shared.show(pending.ref, "\(model.installLabel(pending.ref)) → \(model.installWorkflow(pending.ref).label(pending.to)) (photo)")
                        }
                    }
                }
                .ignoresSafeArea()
            }
    }

    private var counted: InstallStatus {
        let ui = ProgressUI.shared
        if ui.walk, case .status(let s) = ui.target { return s }
        return .tested
    }

    /// Card width: fits beside the viewer controls on the narrowest phone.
    private var cardWidth: CGFloat { hSize == .compact ? 260 : 340 }

    @ViewBuilder private var controls: some View {
        let ui = ProgressUI.shared
        if !ui.on {
            Button { ui.on = true } label: {
                Label("Progress", systemImage: "circle.dashed").font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14).frame(height: 44)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: Color.black.opacity(0.12), radius: 8, y: 2)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows install progress on the plan")
        } else {
            VStack(alignment: .leading, spacing: 8) {
                header
                walkRow
                if ui.walk { targetChips }
            }
            .padding(10)
            .frame(width: cardWidth, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: Color.black.opacity(0.12), radius: 8, y: 2)
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        }
    }

    /// "Progress" title, the counter and a close button.
    private var header: some View {
        let ui = ProgressUI.shared
        let c = InstallProgress.countAtLeast(model.bundle.liveMarkers.filter { $0.sheetId == sheet.id }, catalog: model.app.catalog, counted)
        return HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(c.n)/\(c.total) \(InstallProgress.label(counted).lowercased())").font(.subheadline.weight(.semibold)).monospacedDigit()
                ProgressView(value: Double(c.n), total: Double(max(1, c.total)))
                    .tint(Color(hex: InstallProgress.color(counted)))
            }
            Spacer(minLength: 4)
            Button { ui.on = false; ui.walk = false } label: {
                Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(Color.secondary)
                    .frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Hide progress")
        }
    }

    /// Walk: one tap on a device marks it. The card's one action-blue element while walking.
    private var walkRow: some View {
        let ui = ProgressUI.shared
        return Button { ui.walk.toggle() } label: {
            Label(ui.walk ? "Walking — tap devices" : "Walk the job", systemImage: "figure.walk")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.borderedProminent)
        .tint(ui.walk ? Color.brand : Color.ink)
        .accessibilityValue(ui.walk ? "On" : "Off")
    }

    private struct TargetOption: Identifiable {
        let target: WalkTarget
        let title: String
        let status: InstallStatus?
        var id: String { title }
    }

    private var targets: [TargetOption] {
        var out = [TargetOption(target: .next, title: "Next step", status: nil)]
        for s in [InstallStatus.roughed, .installed, .tested, .issue] { out.append(TargetOption(target: .status(s), title: InstallProgress.label(s), status: s)) }
        if InstallProgress.canSet(model.app.cloud.role, .verified) { out.append(TargetOption(target: .status(.verified), title: "Verified", status: .verified)) }
        out.append(TargetOption(target: .details, title: "Details", status: nil))
        return out
    }

    private var targetChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(targets) { t in
                    TargetChip(title: t.title, status: t.status, on: ProgressUI.shared.target == t.target) { ProgressUI.shared.target = t.target }
                }
            }
        }
    }
}

/// "Fixture 3 → Installed · Undo" after a walk tap. Bottom left of the plan, leaving the trailing controls clear.
struct ProgressSnackLayer: View {
    @Environment(\.horizontalSizeClass) private var hSize
    let model: EditorModel

    var body: some View {
        if let s = ProgressUI.shared.snack {
            snackbar(s)
                .padding(.leading, 12)
                .padding(.trailing, 84)   // the controls column (46 pt) and its margins
                .padding(.bottom, hSize == .compact ? 120 : 24)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        }
    }

    private func snackbar(_ s: ProgressUI.Snack) -> some View {
        HStack(spacing: 10) {
            Text(s.text).font(.subheadline.weight(.semibold)).lineLimit(1).truncationMode(.middle)
            Button("Undo") {
                ProgressUI.shared.snack = nil
                if model.canUndo { model.undo() }
            }
            .font(.subheadline.weight(.bold))
            Button { ProgressUI.shared.sheet = s.ref; ProgressUI.shared.snack = nil } label: { Image(systemName: "info.circle") }
                .accessibilityLabel("Details")
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16).frame(height: 48)
        .background(Color.ink.opacity(0.94), in: Capsule())
    }
}

private struct TargetChip: View {
    let title: String
    let status: InstallStatus?
    let on: Bool
    let action: () -> Void

    var body: some View {
        let color = status.map { Color(hex: InstallProgress.color($0)) } ?? Color.ink
        Button(action: action) {
            HStack(spacing: 6) {
                if let status { Circle().fill(Color(hex: InstallProgress.color(status))).frame(width: 9, height: 9) }
                Text(status == nil ? title : "Mark \(title)").font(.footnote.weight(.semibold))
            }
            .padding(.horizontal, 12).frame(height: 40)
            .foregroundStyle(on ? Color.white : Color.primary)
            .background(on ? color : Color(.systemBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color(.separator), lineWidth: on ? 0 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
