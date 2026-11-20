import SwiftUI
import UIKit
import PinPlanCore

// The plan's zoom container. Why UIScrollView rather than SwiftUI gestures: it gives the system's own physics for
// free and exactly as people know them from Photos/Files/Fieldwire — pinch anchored under the fingers, momentum
// and deceleration, rubber-banding at the edges and on zoom limits, scroll-to-pan and pinch on trackpads and mice,
// and zooming that animates with UIKit's curves. SwiftUI's DragGesture/MagnifyGesture would need all of that
// re-implemented (and re-tuned) by hand. The sheet inside is a CATiledLayer (TiledSheetView) over an instant
// low-res preview. Markers, runs and overlays are NOT inside the scroll view: they are drawn by SwiftUI on top,
// from the published `PlanViewport`, so they stay a constant size on screen.

/// What the zoom container should allow right now.
struct PlanZoomConfig: Equatable {
    /// Double-tap zooms (off while placing, so taps place instantly).
    var doubleTapZooms = true
    /// Scale line / measure: one finger aims (loupe), two fingers pan and zoom.
    var precision = false
    /// Apple Pencil places and draws; fingers only pan (Pencil drags don't scroll).
    var pencilDraws = false
    /// Long-press can pick up items (Edit mode, select tool).
    var liftEnabled = false
}

/// Callbacks from the zoom container, all in view coordinates (points, top-left of the canvas).
struct PlanGestureHandlers {
    /// A tap; the Bool says it came from Apple Pencil.
    var tap: (CGPoint, Bool) -> Void = { _, _ in }
    /// Whether a long-press here picks something up (asked as the press is recognised).
    var canLift: (CGPoint) -> Bool = { _ in false }
    var liftBegan: (CGPoint) -> Void = { _ in }
    var liftMoved: (CGPoint) -> Void = { _ in }
    /// Released; the Bool says whether it moved (false = a press-and-hold without dragging).
    var liftEnded: (CGPoint, Bool) -> Void = { _, _ in }
    /// Precision aiming: the point under the finger, nil when cancelled.
    var aim: (CGPoint?) -> Void = { _ in }
    var aimEnded: (CGPoint) -> Void = { _ in }
    /// Swipe in from a side edge while the sheet is already at that edge: −1 previous sheet, +1 next.
    var edgeSwipe: (Int) -> Void = { _ in }
    /// Live progress of that swipe (direction, 0…1), nil when it ends.
    var edgeProgress: ((Int, Double)?) -> Void = { _ in }
    /// The canvas got its size for the first time (restore a remembered view, apply a focus request…).
    var firstLayout: () -> Void = {}
    /// Panning / zooming came to rest.
    var settled: (PlanViewport) -> Void = { _ in }
}

/// UIScrollView hosting one sheet. Content coordinates are sheet pixels; `zoomScale` is points per sheet pixel.
final class PlanScrollView: UIScrollView {
    let source: PlanTileSource
    let contentView = UIView()
    let previewView = UIImageView()
    private(set) var tiledView: TiledSheetView?
    private(set) var limits: ClosedRange<Double> = 0.05...4
    private var lastSize: CGSize = .zero
    private(set) var didFirstLayout = false
    var onFirstLayout: (() -> Void)?
    var onResize: (() -> Void)?

    init(source: PlanTileSource) {
        self.source = source
        super.init(frame: .zero)
        let size = source.sheetSize.cg
        contentView.frame = CGRect(origin: .zero, size: size)
        contentView.backgroundColor = .white
        contentView.layer.shadowColor = UIColor.black.cgColor
        contentView.layer.shadowOpacity = 0.14
        contentView.layer.shadowPath = UIBezierPath(rect: CGRect(origin: .zero, size: size)).cgPath
        previewView.frame = contentView.bounds
        previewView.contentMode = .scaleToFill
        previewView.image = PlanTileStore.shared.cachedPreview(source.imageId)
        contentView.addSubview(previewView)
        addSubview(contentView)
        contentSize = size
        backgroundColor = .clear
        contentInsetAdjustmentBehavior = .never
        showsVerticalScrollIndicator = false
        showsHorizontalScrollIndicator = false
        bouncesZoom = true
        alwaysBounceVertical = true
        alwaysBounceHorizontal = true
        decelerationRate = .normal
        delaysContentTouches = false
        // Trackpad and mouse: two-finger scroll and the wheel pan the plan; trackpad pinch zooms (built in).
        panGestureRecognizer.allowedScrollTypesMask = .all
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func installTiles() {
        guard tiledView == nil else { return }
        let t = TiledSheetView(source: source, zoomRange: limits)
        t.frame = contentView.bounds
        contentView.addSubview(t)
        tiledView = t
    }

    /// The transform SwiftUI draws markers and overlays with.
    var viewport: PlanViewport {
        PlanViewport(sheetSize: source.sheetSize, viewSize: PlanSize(bounds.size), zoom: Double(zoomScale),
                     origin: PlanPoint(x: Double(contentView.frame.minX - bounds.minX), y: Double(contentView.frame.minY - bounds.minY)))
    }

    /// A point in the scroll view's own (scrolling) coordinates → canvas view coordinates.
    func viewPoint(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x - bounds.minX, y: p.y - bounds.minY) }

    /// A content offset kept inside the scrollable range.
    func clampedOffset(_ p: CGPoint) -> CGPoint {
        let minX = -contentInset.left, minY = -contentInset.top
        let maxX = max(minX, contentSize.width + contentInset.right - bounds.width)
        let maxY = max(minY, contentSize.height + contentInset.bottom - bounds.height)
        return CGPoint(x: min(maxX, max(minX, p.x)), y: min(maxY, max(minY, p.y)))
    }

    /// At the left (−1) or right (+1) end of the horizontal scroll range.
    func isAtHorizontalEdge(_ side: Int) -> Bool {
        let minX = -contentInset.left
        let maxX = max(minX, contentSize.width + contentInset.right - bounds.width)
        return side < 0 ? contentOffset.x <= minX + 1 : contentOffset.x >= maxX - 1
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.width > 0, bounds.height > 0, bounds.size != lastSize {
            let old = lastSize
            lastSize = bounds.size
            resized(from: old)
        }
        centerContent()
        // A soft shadow under the paper that stays the same size on screen whatever the zoom.
        let z = max(zoomScale, 0.0001)
        contentView.layer.shadowRadius = 8 / z
        contentView.layer.shadowOffset = CGSize(width: 0, height: 2 / z)
    }

    /// Keeps the sheet centred (with a gutter) when it is smaller than the view.
    func centerContent() {
        let pad = CGFloat(PlanViewport.fitPadding)
        let ix = max(pad, (bounds.width - contentSize.width) / 2)
        let iy = max(pad, (bounds.height - contentSize.height) / 2)
        let inset = UIEdgeInsets(top: iy, left: ix, bottom: iy, right: ix)
        if contentInset != inset { contentInset = inset }
    }

    private func resized(from old: CGSize) {
        let scale = Double(traitCollection.displayScale)
        let newLimits = PlanViewport.zoomLimits(sheet: source.sheetSize, view: PlanSize(bounds.size), displayScale: max(1, scale), hasVector: source.hasVector)
        let wasFit = !didFirstLayout || Double(zoomScale) <= limits.lowerBound * 1.01
        // The sheet point in the middle, to keep it there when panels open or the device rotates.
        var oldCenter: PlanPoint?
        if didFirstLayout && old.width > 0 {
            var v = viewport
            v.viewSize = PlanSize(old)
            oldCenter = v.toSheet(PlanPoint(x: Double(old.width) / 2, y: Double(old.height) / 2))
        }
        limits = newLimits
        minimumZoomScale = CGFloat(newLimits.lowerBound)
        maximumZoomScale = CGFloat(newLimits.upperBound)
        tiledView?.configure(zoomRange: newLimits)
        if wasFit {
            zoomScale = minimumZoomScale
            centerContent()
            contentOffset = CGPoint(x: -contentInset.left, y: -contentInset.top)
        } else if let c = oldCenter {
            zoomScale = min(maximumZoomScale, max(minimumZoomScale, zoomScale))
            centerContent()
            let z = zoomScale
            let want = CGPoint(x: CGFloat(c.x * source.sheetSize.width) * z - bounds.width / 2,
                               y: CGFloat(c.y * source.sheetSize.height) * z - bounds.height / 2)
            contentOffset = clampedOffset(want)
        }
        if !didFirstLayout {
            didFirstLayout = true
            onFirstLayout?()
        }
        onResize?()
    }
}

/// SwiftUI wrapper around `PlanScrollView`.
struct PlanZoomView: UIViewRepresentable {
    let source: PlanTileSource
    let sheetId: String
    let controller: PlanViewportController
    var config: PlanZoomConfig
    var handlers: PlanGestureHandlers
    var accessibilityName: String

    func makeCoordinator() -> PlanZoomCoordinator { PlanZoomCoordinator() }

    func makeUIView(context: Context) -> PlanScrollView {
        let sv = PlanScrollView(source: source)
        let c = context.coordinator
        c.handlers = handlers
        c.controller = controller
        c.sheetId = sheetId
        c.install(on: sv)
        controller.attach(sv)
        sv.isAccessibilityElement = true
        sv.accessibilityLabel = accessibilityName
        sv.accessibilityHint = String(localized: "Pinch or use the zoom buttons to zoom.")
        c.apply(config)
        c.loadImagery()
        return sv
    }

    func updateUIView(_ sv: PlanScrollView, context: Context) {
        context.coordinator.handlers = handlers
        context.coordinator.controller = controller
        context.coordinator.apply(config)
        if controller.scrollView !== sv { controller.attach(sv) }
        sv.accessibilityLabel = accessibilityName
    }

    static func dismantleUIView(_ sv: PlanScrollView, coordinator: PlanZoomCoordinator) {
        coordinator.loadTask?.cancel()
        sv.delegate = nil
    }
}

/// Scroll view delegate and the plan's gestures (tap, double-tap, two-finger tap, long-press lift, precision aim,
/// edge swipe, Pencil detection).
@MainActor
final class PlanZoomCoordinator: NSObject, UIScrollViewDelegate, UIGestureRecognizerDelegate {
    var handlers = PlanGestureHandlers()
    weak var controller: PlanViewportController?
    weak var scrollView: PlanScrollView?
    var sheetId = ""
    var loadTask: Task<Void, Never>?

    private let tap = UITapGestureRecognizer()
    private let doubleTap = UITapGestureRecognizer()
    private let twoFingerTap = UITapGestureRecognizer()
    private let lift = UILongPressGestureRecognizer()
    private let aimPress = UILongPressGestureRecognizer()
    private let edgePan = UIPanGestureRecognizer()
    private var config = PlanZoomConfig()
    private var configured = false
    private var lastTouchWasPencil = false
    private var liftStart: CGPoint = .zero
    private var liftMovedFar = false
    private var edgeSide = 0
    private var wasAtMax = false

    func install(on sv: PlanScrollView) {
        scrollView = sv
        sv.delegate = self
        sv.onFirstLayout = { [weak self] in
            guard let self else { return }
            self.publish()
            self.handlers.firstLayout()
        }
        sv.onResize = { [weak self] in self?.publish() }

        tap.addTarget(self, action: #selector(onTap(_:)))
        tap.delegate = self
        doubleTap.numberOfTapsRequired = 2
        doubleTap.addTarget(self, action: #selector(onDoubleTap(_:)))
        doubleTap.delegate = self
        // Single taps wait for a possible double-tap only while double-tap zooms (see shouldRequireFailureOf).
        twoFingerTap.numberOfTouchesRequired = 2
        twoFingerTap.addTarget(self, action: #selector(onTwoFingerTap(_:)))

        lift.minimumPressDuration = 0.35
        lift.allowableMovement = 12
        lift.addTarget(self, action: #selector(onLift(_:)))
        lift.delegate = self

        aimPress.minimumPressDuration = 0
        aimPress.allowableMovement = .greatestFiniteMagnitude
        aimPress.addTarget(self, action: #selector(onAim(_:)))
        aimPress.delegate = self
        aimPress.isEnabled = false

        edgePan.maximumNumberOfTouches = 1
        edgePan.addTarget(self, action: #selector(onEdgePan(_:)))
        edgePan.delegate = self

        let all: [UIGestureRecognizer] = [tap, doubleTap, twoFingerTap, lift, aimPress, edgePan]
        for g in all { sv.addGestureRecognizer(g) }
    }

    func apply(_ c: PlanZoomConfig) {
        guard c != config || !configured else { return }
        config = c
        configured = true
        guard let sv = scrollView else { return }
        doubleTap.isEnabled = c.doubleTapZooms && !c.precision
        twoFingerTap.isEnabled = !c.precision
        lift.isEnabled = c.liftEnabled && !c.precision
        tap.isEnabled = !c.precision
        aimPress.isEnabled = c.precision
        edgePan.isEnabled = !c.precision
        // Precision: one finger aims, so panning takes two.
        sv.panGestureRecognizer.minimumNumberOfTouches = c.precision ? 2 : 1
        // Pencil draws: only fingers (and trackpads/mice) scroll.
        var types: [NSNumber] = [NSNumber(value: UITouch.TouchType.direct.rawValue), NSNumber(value: UITouch.TouchType.indirectPointer.rawValue),
                                 NSNumber(value: UITouch.TouchType.indirect.rawValue)]
        if !c.pencilDraws { types.append(NSNumber(value: UITouch.TouchType.pencil.rawValue)) }
        sv.panGestureRecognizer.allowedTouchTypes = types
    }

    /// Instant preview first, then the tile pyramid (built once per sheet image, in the background).
    func loadImagery() {
        guard let sv = scrollView else { return }
        let source = sv.source
        loadTask = Task { [weak sv] in
            let store = PlanTileStore.shared
            if sv?.previewView.image == nil, let p = await store.preview(imageId: source.imageId, source: source.imageURL) {
                sv?.previewView.image = p
            }
            if Task.isCancelled { return }
            sv?.installTiles()
            let ok = await store.ensurePyramid(imageId: source.imageId, source: source.imageURL)
            if ok, !Task.isCancelled { sv?.tiledView?.reload() }
        }
    }

    private func publish() {
        guard let sv = scrollView else { return }
        controller?.publish(sv.viewport, limits: sv.limits, sheetId: sheetId)
    }

    // MARK: UIScrollViewDelegate

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { (scrollView as? PlanScrollView)?.contentView }

    func scrollViewDidScroll(_ scrollView: UIScrollView) { publish() }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        (scrollView as? PlanScrollView)?.centerContent()
        publish()
        // A soft bump when a pinch reaches the closest zoom.
        let atMax = scrollView.zoomScale >= scrollView.maximumZoomScale * 0.999
        if atMax && !wasAtMax && scrollView.isZooming { Haptics.limit() }
        wasAtMax = atMax
    }

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) { controller?.setInteracting(true) }
    func scrollViewWillBeginZooming(_ scrollView: UIScrollView, with view: UIView?) { controller?.setInteracting(true) }
    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) { if !decelerate { settle() } }
    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { settle() }
    func scrollViewDidEndZooming(_ scrollView: UIScrollView, with view: UIView?, atScale scale: CGFloat) { settle() }
    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) { settle() }

    private func settle() {
        guard let sv = scrollView, !sv.isDragging, !sv.isDecelerating, !sv.isZooming else { return }
        controller?.setInteracting(false)
        publish()
        handlers.settled(sv.viewport)
    }

    // MARK: gestures

    @objc private func onTap(_ g: UITapGestureRecognizer) {
        guard let sv = scrollView, g.state == .ended else { return }
        handlers.tap(sv.viewPoint(g.location(in: sv)), lastTouchWasPencil)
    }

    @objc private func onDoubleTap(_ g: UITapGestureRecognizer) {
        guard let sv = scrollView, let c = controller, g.state == .ended else { return }
        let v = sv.viewport
        let target = PlanViewport.doubleTapZoom(current: v.zoom, limits: sv.limits)
        if target <= sv.limits.lowerBound * 1.001 {
            sv.setZoomScale(sv.minimumZoomScale, animated: true)
        } else {
            let rel = v.toSheet(PlanPoint(sv.viewPoint(g.location(in: sv))))
            c.center(on: rel, zoom: target)
        }
        Haptics.select()
    }

    @objc private func onTwoFingerTap(_ g: UITapGestureRecognizer) {
        guard g.state == .ended, let c = controller else { return }
        c.zoom(by: 1 / 2.5)
    }

    @objc private func onLift(_ g: UILongPressGestureRecognizer) {
        guard let sv = scrollView else { return }
        let p = sv.viewPoint(g.location(in: sv))
        switch g.state {
        case .began:
            liftStart = p
            liftMovedFar = false
            // While an item is held, the plan stays put.
            sv.panGestureRecognizer.isEnabled = false
            sv.pinchGestureRecognizer?.isEnabled = false
            handlers.liftBegan(p)
        case .changed:
            if hypot(p.x - liftStart.x, p.y - liftStart.y) > 6 { liftMovedFar = true }
            handlers.liftMoved(p)
        case .ended:
            restoreScrolling(sv)
            handlers.liftEnded(p, liftMovedFar)
        case .cancelled, .failed:
            restoreScrolling(sv)
            handlers.liftEnded(liftStart, false)
        default: break
        }
    }

    private func restoreScrolling(_ sv: PlanScrollView) {
        sv.panGestureRecognizer.isEnabled = true
        sv.pinchGestureRecognizer?.isEnabled = true
    }

    @objc private func onAim(_ g: UILongPressGestureRecognizer) {
        guard let sv = scrollView else { return }
        // A second finger means pan/zoom, not aim.
        if g.numberOfTouches > 1 {
            handlers.aim(nil)
            g.isEnabled = false
            g.isEnabled = config.precision
            return
        }
        let p = sv.viewPoint(g.location(in: sv))
        switch g.state {
        case .began, .changed: handlers.aim(p)
        case .ended: handlers.aimEnded(p)
        default: handlers.aim(nil)
        }
    }

    @objc private func onEdgePan(_ g: UIPanGestureRecognizer) {
        guard let sv = scrollView else { return }
        let dx = Double(g.translation(in: sv).x) * Double(-edgeSide)   // inward travel
        switch g.state {
        case .changed:
            handlers.edgeProgress((edgeSide, min(1, max(0, dx / 110))))
        case .ended:
            handlers.edgeProgress(nil)
            if dx > 110 || (dx > 50 && abs(Double(g.velocity(in: sv).x)) > 600) { handlers.edgeSwipe(edgeSide) }
        default:
            handlers.edgeProgress(nil)
        }
    }

    // MARK: UIGestureRecognizerDelegate

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if g === tap || g === doubleTap { lastTouchWasPencil = touch.type == .pencil }
        return true
    }

    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard let sv = scrollView else { return true }
        if g === lift { return handlers.canLift(sv.viewPoint(g.location(in: sv))) }
        if g === edgePan {
            if lift.state == .began || lift.state == .changed { return false }
            // Starts within 32 pt of a side, moves mostly sideways, inwards, and the sheet is already at that edge.
            let v = edgePan.velocity(in: sv)
            let start = sv.viewPoint(CGPoint(x: g.location(in: sv).x - edgePan.translation(in: sv).x, y: g.location(in: sv).y))
            guard abs(v.x) > abs(v.y) * 1.5 else { return false }
            if start.x < 32 && v.x > 0 && sv.isAtHorizontalEdge(-1) { edgeSide = -1; return true }
            if start.x > sv.bounds.width - 32 && v.x < 0 && sv.isAtHorizontalEdge(1) { edgeSide = 1; return true }
            return false
        }
        return true
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        // The edge swipe rides along with the scroll view's own pan (which just rubber-bands at the edge);
        // aiming lets a pinch take over.
        let pan = scrollView?.panGestureRecognizer
        if (g === edgePan && other === pan) || (other === edgePan && g === pan) { return true }
        if g === aimPress || other === aimPress {
            let o = g === aimPress ? other : g
            return o === pan || o === scrollView?.pinchGestureRecognizer
        }
        return false
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRequireFailureOf other: UIGestureRecognizer) -> Bool {
        // Taps wait to see if a double-tap follows only while double-tap zooms; while placing, taps are instant.
        g === tap && other === doubleTap && doubleTap.isEnabled
    }
}
