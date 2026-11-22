import SwiftUI
import TipKit
import PinPlanCore

/// The plan: a full-bleed sheet with floating controls. View mode (default for technicians) is for reading the
/// plan — tap a device for its details; Edit mode adds the device palette, tools, dragging and the inspector.
struct PlanEditorView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @Bindable var model: EditorModel
    @State private var showPalette = true
    @State private var showCounts = false
    @State private var showScan = false
    @State private var scaleInput = false
    @State private var showReader = false
    @State private var showBrowser = false
    @State private var showLayers = false
    @State private var fullScreen = false
    @State private var viewport = PlanViewportController()
    @State private var showMinimap = false
    @State private var wantsManagePlans = false
    @State private var canvasHeight: CGFloat = 0
    @State private var overlayControlsHeight: CGFloat = 0
    @State private var viewerControlsHeight: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    @AppStorage("viewer.minimap") private var savedMinimap = false
    @AppStorage("viewer.pencilDraws") private var pencilDraws = false

    private var regular: Bool { hSize == .regular }
    private var editing: Bool { model.viewerMode == .edit }

    var body: some View {
        presentations(mainContent)
        .onAppear(perform: appeared)
        .onChange(of: model.activeSheet?.id) { _, id in if let id { model.noteSheetViewed(id) } }
        .onChange(of: model.viewerMode) { _, m in if m == .view { showPalette = false } else if regular { showPalette = true } }
        // A tour step shows the plan in View or Edit.
        .onChange(of: TutorialController.shared.pendingPlanMode) { _, _ in applyTutorialMode() }
        // Picking a device or drawing tool ends Find similar (its taps would otherwise compete with placing).
        .onChange(of: model.tool) { _, t in if t != .select { FindSimilarUI.shared.close() } }
        // Remembered on this device (a screenshot flag doesn't change the saved choice).
        .onChange(of: showMinimap) { _, on in if !ViewerPrefs.launchFlag("minimap") { savedMinimap = on } }
    }

    private var mainContent: some View {
        let bars: Visibility = fullScreen ? .hidden : .automatic
        return HStack(spacing: 0) {
            if regular && showPalette && editing && !fullScreen && paletteFits {
                PaletteView(model: model).frame(width: Self.paletteWidth)
                    .tutorialAnchor("plan-palette")
                Divider()
            }
            canvasArea
            if !fullScreen { sidePanel }
        }
        .measureWidth { containerWidth = $0 }
        .animation(.easeOut(duration: 0.22), value: model.selection)
        .animation(.easeOut(duration: 0.2), value: model.toast)
        .animation(.easeOut(duration: 0.2), value: model.viewerMode)
        .background { keyboardShortcuts }
        .toolbar { toolbar }
        .toolbar(bars, for: .navigationBar)
        .toolbar(bars, for: .tabBar)
        .statusBarHidden(fullScreen)
        .persistentSystemOverlays(bars)
    }

    private func appeared() {
        if !regular || !editing { showPalette = false }
        if ProcessInfo.processInfo.arguments.contains("--reader") { showReader = true; showPalette = regular && editing }
        // Screenshot / automation hooks.
        if ViewerPrefs.launchFlag("viewer-zoomed"),
           let busiest = model.sheets.max(by: { a, b in markerCount(a.id) < markerCount(b.id) }) {
            model.setActiveSheet(busiest.id)
        }
        showMinimap = savedMinimap || ViewerPrefs.launchFlag("minimap")
        FindSimilarUI.runLaunchDemo(model: model, viewport: viewport)
        applyTutorialMode()
        if ViewerPrefs.launchFlag("sheet-browser") || ViewerPrefs.launchFlag("layers") {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(800))
                if ViewerPrefs.launchFlag("sheet-browser") { showBrowser = true }
                if ViewerPrefs.launchFlag("layers") { showLayers = true }
            }
        }
    }

    /// The mode a tour step asks for. Not saved as the person's choice (setViewerMode would remember it).
    private func applyTutorialMode() {
        guard let m = TutorialController.shared.takePlanMode(), m != model.viewerMode else { return }
        if m == .view {
            model.use(.select)
            model.selection = nil
        }
        model.viewerMode = m
    }

    static let paletteWidth: CGFloat = 290
    /// The plan keeps at least this much width between the side panels.
    static let minCanvasWidth: CGFloat = 400

    /// The right-hand panel (inspector, plan reader or counts) is open on iPad.
    private var sidePanelOpen: Bool {
        regular && ((editing && model.selection != nil) || showReader || showCounts)
    }

    /// iPad mini in portrait, Split View and Stage Manager windows are regular width but too narrow for the device
    /// palette and a right-hand panel together: the right-hand panel then takes the palette's place while it is open
    /// (the palette comes back when it closes).
    private var paletteFits: Bool {
        guard containerWidth > 0, sidePanelOpen else { return true }
        return containerWidth - Self.paletteWidth - 360 >= Self.minCanvasWidth
    }

    private func markerCount(_ sheetId: String) -> Int { model.bundle.liveMarkers.filter { $0.sheetId == sheetId }.count }

    private func step(_ delta: Int) {
        if model.goToSheet(delta: delta) { Haptics.select() } else { Haptics.limit() }
    }

    // MARK: canvas and floating chrome

    private var canvasArea: some View {
        ZStack {
            if let sheet = model.activeSheet {
                PlanCanvasView(model: model, sheet: sheet, controller: viewport, pencilDraws: pencilDraws && regular) { side in step(side) }
                    .id(sheet.id)
                    .tutorialAnchor("plan-canvas")
            }
            if editing { EditModeFrame() }
            topChrome
            bottomChrome
            toastView
        }
        .measureHeight { canvasHeight = $0 }
        .overlay(alignment: .bottomTrailing) { trailingControls }
        .overlay(alignment: regular ? .bottomLeading : .topLeading) {
            VStack(alignment: .leading, spacing: 8) {
                if showMinimap, let sheet = model.activeSheet {
                    PlanMinimap(model: model, sheet: sheet, controller: viewport, maxSide: regular ? 220 : 140)
                        .transition(.opacity.combined(with: .scale(scale: 0.9, anchor: .bottomLeading)))
                }
                if editing && regular, let sheet = model.activeSheet { ScaleChip(controller: viewport, sheet: sheet) }
            }
            .padding(12)
            .padding(.top, regular ? 0 : (editing && !fullScreen ? 112 : 64))
            .animation(.easeOut(duration: 0.2), value: showMinimap)
        }
    }

    /// Room for the trailing controls: below the sheet pill (and the phone's action bar), above the bottom padding.
    private var controlsRoom: CGFloat {
        let top: CGFloat = regular || fullScreen ? 64 : 120
        let bottom: CGFloat = regular ? 12 : 68
        return max(0, canvasHeight - top - bottom)
    }

    /// Bottom-right controls: the plan overlays' buttons (tasks, install progress…) and the viewer controls. They
    /// stack in one column when there is room; on short screens (iPhone, landscape) the overlays' buttons sit beside
    /// the viewer controls instead, and scroll if even that is too tall, so nothing reaches the top bar.
    private var trailingControls: some View {
        let stacked = canvasHeight == 0 || overlayControlsHeight + 12 + viewerControlsHeight <= controlsRoom
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .trailing, spacing: 12)) : AnyLayout(HStackLayout(alignment: .bottom, spacing: 10))
        return layout {
            if let sheet = model.activeSheet {
                PlanOverlayControlsHost(model: model, sheet: sheet, controller: viewport)
                    .measureHeight { overlayControlsHeight = $0 }
                    .scrollable(if: !stacked && overlayControlsHeight > controlsRoom, maxHeight: controlsRoom)
            }
            ViewerControls(controller: viewport, filtering: model.filter.isFiltering, zoomButtons: regular || voiceOver,
                           showLayers: $showLayers, showMinimap: $showMinimap, fullScreen: $fullScreen)
                .measureHeight { viewerControlsHeight = $0 }
                .popover(isPresented: $showLayers) { layersPanel }
        }
        .padding(12)
        .padding(.bottom, regular ? 0 : 56)
    }

    @ViewBuilder
    private var layersPanel: some View {
        if let sheet = model.activeSheet {
            LayersPanel(model: model, sheet: sheet) { showLayers = false }
                .frame(minWidth: regular ? 360 : nil, minHeight: regular ? 560 : nil)
                .presentationDetents([.medium, .large])
        }
    }

    private var topChrome: some View {
        VStack(spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                SheetPill(model: model, onBrowse: { showBrowser = true }, onStep: step, onManage: { model.showManagePlans = true })
                    .tutorialAnchor("plan-sheets")
                Spacer(minLength: 4)
                ViewerModeSwitch(model: model, compact: !regular)
                    .tutorialAnchor("plan-mode")
            }
            .padding(.horizontal, 12)
            if !regular && !fullScreen { compactBar }
            if editing, let hint { HintCapsule(text: hint) }
            if editing && model.tool == .select && !fullScreen {
                if model.activeSheet?.pxPerFt == nil { TipView(ScaleTip()).frame(maxWidth: 420).padding(.horizontal) }
                else if !model.bundle.liveMarkers.isEmpty { TipView(LongPressTip()).frame(maxWidth: 420).padding(.horizontal) }
            }
            if editing && model.tool.isDrawing && model.tool != .measure { drawingBar }
            Spacer()
        }
        .padding(.top, 10)
    }

    private var bottomChrome: some View {
        VStack(spacing: 8) {
            Spacer()
            if !editing, let sel = model.selection {
                SelectionPeek(model: model, selection: sel)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if editing, case .place = model.tool {
                // Placing stays on so you can drop several; this is the obvious way back to select / move / delete.
                Button { model.use(.select) } label: { Label("Done placing", systemImage: "checkmark") }
                    .buttonStyle(.borderedProminent)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if editing && !model.tool.isDrawing { QuickDock(model: model).padding(.horizontal, regular ? 0 : 60) }
        }
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private var toastView: some View {
        if let toast = model.toast {
            VStack {
                Spacer()
                Text(toast).font(.subheadline.weight(.medium)).foregroundStyle(.white)
                    .multilineTextAlignment(.center).lineLimit(3)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Color.ink.opacity(0.92), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 70)
            }
            // Rises a little from the bottom as it appears; leaves a bit faster than it arrives.
            .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
            .allowsHitTesting(false)
        }
    }

    // MARK: side panels (iPad)

    @ViewBuilder
    private var sidePanel: some View {
        if regular && editing, let sel = model.selection {
            Divider()
            VStack(spacing: 0) {
                HStack {
                    Text(model.isBulk ? "\(model.multi.count) devices" : "Edit").font(.headline)
                    Spacer()
                    Button { model.clearSelection() } label: {
                        Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.secondary)
                            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close")
                }
                .padding(.horizontal).padding(.vertical, 10)
                if model.isBulk { BulkInspectorView(model: model) } else { InspectorView(model: model, selection: sel) }
            }
            .frame(width: 340)
            .background(Color.paper)
        } else if regular && showReader, let sheet = model.activeSheet {
            Divider()
            PlanInsightsView(model: model, sheet: sheet) { showReader = false }.frame(width: 360)
        } else if regular && showCounts {
            Divider()
            CountsPanel(model: model) { showCounts = false }.frame(width: 320)
        }
    }

    // MARK: sheets and dialogs

    private func presentations<Content: View>(_ content: Content) -> some View {
        content
            .sheet(isPresented: Binding(get: { !regular && editing && model.selection != nil }, set: { if !$0 { model.selection = nil } })) {
                if let sel = model.selection {
                    NavigationStack {
                        Group { if model.isBulk { BulkInspectorView(model: model) } else { InspectorView(model: model, selection: sel) } }
                            .navigationTitle(model.isBulk ? "\(model.multi.count) devices" : "Edit").navigationBarTitleDisplayMode(.inline)
                            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { model.clearSelection() } } }
                    }
                    .presentationDetents([.medium, .large])
                }
            }
            .sheet(isPresented: Binding(get: { !regular && showPalette && editing }, set: { showPalette = $0 })) {
                NavigationStack { PaletteView(model: model) { showPalette = false }.navigationTitle("Devices").navigationBarTitleDisplayMode(.inline) }
                    .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: Binding(get: { !regular && showCounts }, set: { showCounts = $0 })) {
                CountsPanel(model: model, inSheet: true) { showCounts = false }.presentationDetents([.medium, .large])
            }
            .sheet(isPresented: Binding(get: { !regular && showReader }, set: { showReader = $0 })) {
                if let sheet = model.activeSheet {
                    PlanInsightsView(model: model, sheet: sheet, inSheet: true) { showReader = false }
                        .presentationDetents([.medium, .large])
                        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                }
            }
            .sheet(isPresented: $showBrowser, onDismiss: {
                // "Add or manage plans" in the browser: open it once the browser has gone.
                if wantsManagePlans { wantsManagePlans = false; model.showManagePlans = true }
            }) {
                SheetBrowserView(model: model, onPick: { s in model.setActiveSheet(s.id) }, onManage: { wantsManagePlans = true })
            }
            .sheet(isPresented: $model.showManagePlans) { ManagePlansSheet(model: model) }
            .sheet(item: $model.pending) { p in PendingInputSheet(model: model, pending: p) }
            .sheet(isPresented: $scaleInput) { if let s = model.activeSheet { ScaleSheet(model: model, sheet: s) } }
            .sheet(isPresented: $showScan) { if let s = model.activeSheet { ScanSheet(model: model, sheet: s) } }
    }

    // Hardware keyboard (iPad, and iPhone with a keyboard): ⌘Z / ⇧⌘Z = undo / redo, Esc = select tool, Delete =
    // delete selection, arrows = move the selected device or closet (⇧ for a bigger step), M = measure, F = fit,
    // L = labels, E = View/Edit, B = sheet browser, [ and ] = previous / next sheet, ⌘+ and ⌘− zoom. Undo and redo
    // live here rather than on the toolbar buttons so they also work in full screen (no toolbar) and on iPhone.
    private var keyboardShortcuts: some View {
        let canNudge: Bool = {
            guard editing else { return false }
            switch model.selection {
            case .marker?, .closet?: return true
            default: return false
            }
        }()
        return Group {
            Group {
                Button("Undo") { model.undo() }.keyboardShortcut("z", modifiers: .command).disabled(!editing || !model.canUndo)
                Button("Redo") { model.redo() }.keyboardShortcut("z", modifiers: [.command, .shift]).disabled(!editing || !model.canRedo)
                Button("") { model.use(.select); model.selection = nil }.keyboardShortcut(.escape, modifiers: [])
                Button("Delete") { model.deleteSelection() }.keyboardShortcut(.delete, modifiers: []).disabled(!editing || model.selection == nil)
            }
            Group {
                Button("") { nudge(-1, 0, big: false) }.keyboardShortcut(.leftArrow, modifiers: [])
                Button("") { nudge(1, 0, big: false) }.keyboardShortcut(.rightArrow, modifiers: [])
                Button("") { nudge(0, -1, big: false) }.keyboardShortcut(.upArrow, modifiers: [])
                Button("") { nudge(0, 1, big: false) }.keyboardShortcut(.downArrow, modifiers: [])
                Button("") { nudge(-1, 0, big: true) }.keyboardShortcut(.leftArrow, modifiers: .shift)
                Button("") { nudge(1, 0, big: true) }.keyboardShortcut(.rightArrow, modifiers: .shift)
                Button("") { nudge(0, -1, big: true) }.keyboardShortcut(.upArrow, modifiers: .shift)
                Button("") { nudge(0, 1, big: true) }.keyboardShortcut(.downArrow, modifiers: .shift)
            }
            .disabled(!canNudge)
            Group {
                Button("") { model.use(.measure) }.keyboardShortcut("m", modifiers: [])
                Button("") { viewport.fit() }.keyboardShortcut("f", modifiers: [])
                Button("") { model.showLabels.toggle(); model.saveFilter() }.keyboardShortcut("l", modifiers: [])
                Button("") { model.setViewerMode(editing ? .view : .edit); Haptics.select() }.keyboardShortcut("e", modifiers: [])
                Button("") { showBrowser = true }.keyboardShortcut("b", modifiers: [])
                Button("") { step(-1) }.keyboardShortcut("[", modifiers: [])
                Button("") { step(1) }.keyboardShortcut("]", modifiers: [])
                Button("") { viewport.zoom(by: 1.6) }.keyboardShortcut("=", modifiers: .command)
                Button("") { viewport.zoom(by: 1 / 1.6) }.keyboardShortcut("-", modifiers: .command)
            }
        }
        .opacity(0).allowsHitTesting(false).accessibilityHidden(true)
    }

    private func nudge(_ dx: Double, _ dy: Double, big: Bool) {
        let d = big ? PlanNudge.bigStep : PlanNudge.step
        model.nudgeSelection(dx: dx * d, dy: dy * d, zoom: viewport.viewport.zoom)
    }

    private var hint: String? {
        switch model.tool {
        case .select: return nil
        case .place(let id):
            let name = app.type(id)?.name ?? String(localized: "device")
            return model.room.isEmpty ? String(localized: "Tap to place \(name)") : String(localized: "Tap to place \(name) · \(model.room)")
        case .closet(let k): return String(localized: "Tap to place the \(Catalog.closetInfo(k).name.lowercased())")
        case .led: return String(localized: "Tap along the LED run, then Finish")
        case .wire: return String(localized: "Tap a device, the path, then a closet")
        case .stair: return String(localized: "Tap the bottom and top of the stair")
        case .calibrate: return model.draft.isEmpty ? String(localized: "Press and drag to aim at one end of a known dimension") : String(localized: "Now aim at the other end · two fingers to pan and zoom")
        case .measure:
            if model.draft.count == 4, let s = model.activeSheet, let ft = Geometry.polylineFt(model.draft, sheet: s) {
                return String(localized: "\(Geometry.formatFeetInches(ft)) (\(ft.clean) ft) · tap to measure again")
            }
            return model.activeSheet?.pxPerFt == nil ? String(localized: "Set the scale first to measure") : String(localized: "Press and drag to aim · release to place")
        }
    }

    /// iPhone: the editor's actions as a floating bar (the navigation bar belongs to the tab view).
    private var compactBar: some View {
        HStack(spacing: 2) {
            if editing {
                Button { showPalette = true } label: {
                    // The word when it fits (long languages on an iPhone SE get the icon alone).
                    ViewThatFits(in: .horizontal) {
                        Label("Devices", systemImage: "plus.circle.fill").labelStyle(.titleAndIcon).lineLimit(1).fixedSize()
                        Label("Devices", systemImage: "plus.circle.fill").labelStyle(.iconOnly)
                    }
                    .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent).controlSize(.small).tint(Color.brand)
                .accessibilityIdentifier("plan-devices")
                .tutorialAnchor("plan-devices")
            }
            Spacer(minLength: 4)
            Group {
                if editing {
                    Button { model.undo() } label: { Image(systemName: "arrow.uturn.backward") }.disabled(!model.canUndo).accessibilityLabel("Undo")
                    Button { model.redo() } label: { Image(systemName: "arrow.uturn.forward") }.disabled(!model.canRedo).accessibilityLabel("Redo")
                    toolsMenu(anchored: true)
                }
                Button { showReader = true } label: { Image(systemName: "doc.text.magnifyingglass") }.accessibilityLabel("Read the plan")
                Button { showCounts = true } label: { Image(systemName: "list.number") }.accessibilityLabel("Floor counts")
                if Features.ai {
                    Button { showScan = true } label: { Image(systemName: "sparkles") }.accessibilityLabel("AI scan")
                }
            }
            // Full 44 pt touch targets: the bar is used with gloves on site.
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
            .hoverEffect(.highlight)
        }
        .padding(.horizontal, 6)
        .background(.regularMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.1), radius: 6, y: 2)
        .padding(.horizontal, 12)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    }

    /// `anchored`: the copy the tour points at (the floating bar on iPhone, the toolbar on iPad).
    private func toolsMenu(anchored: Bool) -> some View {
        Menu {
            Button { scaleInput = true } label: { Label(model.activeSheet?.pxPerFt == nil ? "Set scale…" : "Change scale…", systemImage: "ruler") }
            Button { model.use(.calibrate) } label: { Label("Draw a scale line", systemImage: "line.diagonal") }
            Button { model.use(.measure) } label: { Label("Measure distance", systemImage: "ruler.fill") }
            Button { FindSimilarUI.shared.show(model: model) } label: { Label("Find similar", systemImage: "square.on.square.dashed") }
                .accessibilityIdentifier("find-similar-menu")
            // Once the plan has doors or windows: alarm sensors on them (Find similar's Add sensors).
            if let sheet = model.activeSheet, !FindSimilarUI.shared.openings(model, sheet: sheet).isEmpty {
                Button { FindSimilarUI.shared.openSensors(model: model) } label: { Label("Add alarm sensors", systemImage: "checkmark.shield") }
                    .accessibilityIdentifier("alarm-sensors-menu")
            }
            Divider()
            Button { model.autoHomeRuns(sheetOnly: true) } label: { Label("Draw home runs (this floor)", systemImage: "cable.connector") }
            Button { model.showLabels.toggle(); model.saveFilter() } label: { Label(model.showLabels ? "Hide labels" : "Show labels", systemImage: "tag") }
            Button { showLayers = true } label: { Label("Layers and filters…", systemImage: "square.3.layers.3d") }
            Button { viewport.fit() } label: { Label("Fit sheet", systemImage: "viewfinder") }
            Button { model.showManagePlans = true } label: { Label("Add or manage plans…", systemImage: "doc.badge.plus") }
            if regular {
                Divider()
                Toggle(isOn: $pencilDraws) { Label("Apple Pencil draws, finger pans", systemImage: "applepencil") }
            }
        } label: { Image(systemName: "ellipsis.circle") }
        .accessibilityLabel("Tools")
        .accessibilityIdentifier("plan-tools")
        .tutorialAnchor("plan-tools", enabled: anchored)
    }

    private var drawingBar: some View {
        HStack(spacing: 8) {
            Button { if model.draft.count >= 2 { model.draft.removeLast(2) } } label: { Label("Point", systemImage: "arrow.uturn.backward") }
                .disabled(model.draft.isEmpty)
            if case .led = model.tool { Button("Finish") { model.finishDraft() }.buttonStyle(.borderedProminent).disabled(model.draft.count < 4) }
            if model.tool == .wire { Button("Finish") { model.finishDraft() }.buttonStyle(.borderedProminent).disabled(model.draft.count < 4) }
            Button(role: .cancel) { if model.draft.isEmpty { model.use(.select) } else { model.draft = [] } } label: { Label("Cancel", systemImage: "xmark") }
        }
        .buttonStyle(.bordered)
        // Regular size: these are tapped mid-drawing, often with a glove.
        .controlSize(.regular)
        .padding(6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarLeading) {
            if editing {
                Button { showPalette.toggle() } label: { Label("Devices", systemImage: regular ? "sidebar.left" : "plus.circle.fill") }
                    // iPhone: the floating bar's Devices is the one the tour points at (the bar copy may be hidden).
                    .tutorialAnchor("plan-devices", enabled: regular)
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if editing {
                Button { model.undo() } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                    .disabled(!model.canUndo)
                Button { model.redo() } label: { Label("Redo", systemImage: "arrow.uturn.forward") }
                    .disabled(!model.canRedo)
                toolsMenu(anchored: regular)
            }
            Button { showReader.toggle(); showCounts = false; model.selection = nil } label: { Label("Read plan", systemImage: "doc.text.magnifyingglass") }
            Button { showCounts.toggle(); showReader = false; model.selection = nil } label: { Label("Counts", systemImage: "list.number") }
            if Features.ai {
                Button { showScan = true } label: { Label("AI scan", systemImage: "sparkles") }
            }
        }
    }
}

/// One-tap access to recently used devices, right on the plan.
private struct QuickDock: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel

    var body: some View {
        let types = model.recentTypes.compactMap { app.type($0) }.filter { $0.archived != true }
        if !types.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(types) { t in
                        let active = model.tool == .place(t.id)
                        Button { model.use(active ? .select : .place(t.id)) } label: {
                            DeviceSymbol(type: t, size: 30)
                                .padding(7)
                                .background(active ? Color.brand.opacity(0.18) : .clear, in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(active ? Color.brand : .clear, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                        .hoverEffect(.highlight)
                        .accessibilityLabel("Place \(t.name)")
                    }
                }
                .padding(5)
            }
            .fixedSize(horizontal: true, vertical: false)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            .shadow(color: .black.opacity(0.12), radius: 8, y: 2)
        }
    }
}

private struct HintCapsule: View {
    let text: String
    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(Color.electric).frame(width: 6, height: 6)
            // Two lines before truncating: hints run long in Polish, Ukrainian or Vietnamese on a phone.
            Text(text).font(.subheadline).lineLimit(2).multilineTextAlignment(.leading)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Color.ink.opacity(0.88), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.horizontal)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }
}

/// Per-floor counts with a device finder (tap a label to jump to it).
struct CountsPanel: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    var inSheet = false
    let onClose: () -> Void
    @State private var find = ""

    var body: some View {
        let sheet = model.activeSheet
        let floor = model.takeoff.floors.first { $0.sheetId == sheet?.id }?.bucket ?? TakeoffBucket()
        PanelContainer(title: String(localized: "Floor count"), inSheet: inSheet, onClose: onClose) {
            SentenceList {
                Section {
                    TextField("Find device (label or room)", text: $find)
                    if !find.isEmpty {
                        ForEach(model.bundle.liveMarkers.filter { $0.label.localizedCaseInsensitiveContains(find) || $0.room.localizedCaseInsensitiveContains(find) }.prefix(40)) { m in
                            Button { model.focusOn(.marker(m.id)) } label: {
                                HStack {
                                    DeviceSymbol(type: app.type(m.deviceTypeId), size: 22)
                                    Text(m.label).bold()
                                    Text(m.room).foregroundStyle(.secondary)
                                    Spacer()
                                    Text(model.sheets.first { $0.id == m.sheetId }?.name ?? "").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                Section {
                    HStack {
                        StatTile(label: String(localized: "Devices"), value: "\(floor.counts.values.reduce(0, +))")
                        StatTile(label: "LED", value: "\(floor.ledTotalFt.clean) LF", sub: "\(floor.ledZones) zones")
                    }
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
                Section(sentence: sheet?.name ?? "") {
                    ForEach(app.liveCatalog.filter { (floor.counts[$0.id] ?? 0) > 0 }) { t in
                        DisclosureGroup {
                            let ms = model.bundle.liveMarkers.filter { $0.sheetId == sheet?.id && $0.deviceTypeId == t.id }.sorted { $0.label < $1.label }
                            ForEach(ms) { m in
                                Button { model.focusOn(.marker(m.id)) } label: { Text(m.label + (m.tentative ? " ?" : "") + (m.room.isEmpty ? "" : " · \(m.room)")) }
                            }
                        } label: {
                            HStack {
                                DeviceSymbol(type: t, size: 22)
                                Text(t.name)
                                Spacer()
                                if let tn = floor.tentative[t.id], tn > 0 { Chip(text: "\(tn)?", tint: .orange) }
                                Text("\(floor.counts[t.id] ?? 0)").bold().monospacedDigit()
                            }
                        }
                    }
                    ForEach(floor.wireFt.keys.sorted(), id: \.self) { w in
                        LabeledContent("\(w) cable", value: "\((floor.wireFt[w] ?? 0).clean) ft")
                    }
                    if floor.unmeasuredRuns > 0 { Text("\(floor.unmeasuredRuns) run(s) have no length yet — set the scale or type LF.").font(.caption).foregroundStyle(.orange) }
                }
            }
        }
    }
}

struct StatTile: View {
    let label: String
    let value: String
    var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.bold()).monospacedDigit()
            // Always reserve the subtitle line so tiles in a grid line up.
            Text(sub ?? " ").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
