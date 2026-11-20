import SwiftUI
import PinPlanCore

// Floating controls over the plan. The plan gets the whole screen; controls float in materials at the edges.
// The one loud element is the mode: Edit puts an action-blue frame around the plan and fills its segment blue,
// so nobody moves a device thinking they were only looking.

/// Current sheet: previous / name (opens the sheet browser) / next. A long press on the name offers Rename, Move up /
/// down, Delete (one undo step) and "Add or manage plans" (`onManage`).
struct SheetPill: View {
    let model: EditorModel
    let onBrowse: () -> Void
    let onStep: (Int) -> Void
    var onManage: (() -> Void)? = nil
    @State private var renaming = false
    @State private var newName = ""
    @State private var confirmDelete = false

    var body: some View {
        let sheet = model.activeSheet
        let pos = SheetNav.position(of: sheet?.id, in: model.sheets)
        HStack(spacing: 0) {
            stepButton(-1, icon: "chevron.left", label: String(localized: "Previous plan"))
            Button(action: onBrowse) {
                HStack(spacing: 6) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(sheet?.name ?? String(localized: "Sheet")).font(.subheadline.weight(.semibold)).lineLimit(1)
                        if let pos, pos.count > 1 {
                            Text("Plan \(pos.index) of \(pos.count)").font(.caption2).foregroundStyle(.secondary).monospacedDigit()
                        }
                    }
                    Image(systemName: "square.grid.2x2").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 8)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .hoverEffect(.highlight)
            .accessibilityLabel(a11yName(sheet, pos))
            .accessibilityHint("Shows all plans")
            .contextMenu { if let sheet { menu(sheet) } }
            stepButton(1, icon: "chevron.right", label: String(localized: "Next plan"))
        }
        .padding(.horizontal, 2)
        .background(.regularMaterial, in: Capsule())
        .shadow(color: Color.black.opacity(0.12), radius: 8, y: 2)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .alert("Rename plan", isPresented: $renaming) {
            TextField("Plan name", text: $newName)
            Button("Save") { if let id = model.activeSheet?.id { SheetActions.rename(model, id, to: newName) } }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Delete this sheet and its devices?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete sheet", role: .destructive) { if let id = model.activeSheet?.id { SheetActions.delete(model, ids: [id]) } }
        } message: {
            Text("Undo brings it back.")
        }
    }

    @ViewBuilder
    private func menu(_ sheet: Sheet) -> some View {
        Button { newName = sheet.name; renaming = true } label: { Label("Rename", systemImage: "pencil") }
        Button { SheetActions.move(model, sheet.id, by: -1) } label: { Label("Move up", systemImage: "arrow.up") }
            .disabled(model.neighborSheet(-1) == nil)
        Button { SheetActions.move(model, sheet.id, by: 1) } label: { Label("Move down", systemImage: "arrow.down") }
            .disabled(model.neighborSheet(1) == nil)
        if let onManage {
            Button(action: onManage) { Label("Add or manage plans…", systemImage: "doc.badge.plus") }
        }
        Divider()
        Button(role: .destructive) { confirmDelete = true } label: { Label("Delete sheet", systemImage: "trash") }
    }

    private func a11yName(_ sheet: Sheet?, _ pos: (index: Int, count: Int)?) -> String {
        let name = sheet?.name ?? String(localized: "Sheet")
        guard let pos else { return name }
        return String(localized: "\(name), plan \(pos.index) of \(pos.count)")
    }

    private func stepButton(_ delta: Int, icon: String, label: String) -> some View {
        let enabled = model.neighborSheet(delta) != nil
        return Button { onStep(delta) } label: {
            Image(systemName: icon).font(.body.weight(.semibold)).frame(width: 40, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .foregroundStyle(enabled ? Color.primary : Color.secondary.opacity(0.4))
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

/// View | Edit.
struct ViewerModeSwitch: View {
    let model: EditorModel
    var compact = false

    var body: some View {
        HStack(spacing: 2) {
            segment(.view, title: String(localized: "View"), icon: "eye")
            segment(.edit, title: String(localized: "Edit"), icon: "pencil")
        }
        .padding(3)
        .background(.regularMaterial, in: Capsule())
        .shadow(color: Color.black.opacity(0.12), radius: 8, y: 2)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Plan mode")
    }

    private func segment(_ m: PlanViewerMode, title: String, icon: String) -> some View {
        let on = model.viewerMode == m
        let fill: Color = m == .edit ? Color.brand : Color.ink
        return Button {
            model.setViewerMode(m)
            Haptics.select()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.footnote.weight(.bold))
                if !compact || on { Text(title).font(.subheadline.weight(.semibold)) }
            }
            .padding(.horizontal, 12)
            // 38 + the switch's 3 pt padding = a 44 pt target.
            .frame(minHeight: 38)
            .foregroundStyle(on ? Color.white : Color.primary)
            .background(on ? fill : Color.clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .hoverEffect(.lift)
        .accessibilityLabel(title)
        .accessibilityValue(on ? "Selected" : "")
        .accessibilityHint(m == .view ? "Read the plan; nothing moves" : "Place, draw and move devices")
    }
}

/// Edit mode's frame around the plan.
struct EditModeFrame: View {
    var body: some View {
        Rectangle()
            .strokeBorder(Color.brand.opacity(0.9), lineWidth: 3)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Floating column of view controls (bottom right).
struct ViewerControls: View {
    let controller: PlanViewportController
    let filtering: Bool
    var zoomButtons = true
    @Binding var showLayers: Bool
    @Binding var showMinimap: Bool
    @Binding var fullScreen: Bool

    var body: some View {
        VStack(spacing: 0) {
            control(icon: "square.3.layers.3d", label: String(localized: "Layers and filters"), on: filtering) { showLayers = true }
            Divider().frame(width: 44)
            control(icon: showMinimap ? "map.fill" : "map", label: showMinimap ? String(localized: "Hide minimap") : String(localized: "Show minimap"), on: showMinimap) { showMinimap.toggle() }
            Divider().frame(width: 44)
            if zoomButtons {
                control(icon: "plus.magnifyingglass", label: String(localized: "Zoom in")) { controller.zoom(by: 1.6) }
                control(icon: "minus.magnifyingglass", label: String(localized: "Zoom out")) { controller.zoom(by: 1 / 1.6) }
                Divider().frame(width: 44)
            }
            control(icon: "viewfinder", label: String(localized: "Whole sheet")) { controller.fit() }
            control(icon: fullScreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right",
                    label: fullScreen ? String(localized: "Exit full screen") : String(localized: "Full screen"), on: fullScreen) {
                withAnimation(.easeInOut(duration: 0.25)) { fullScreen.toggle() }
                Haptics.select()
            }
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: Color.black.opacity(0.12), radius: 8, y: 2)
    }

    private func control(icon: String, label: String, on: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.body.weight(.medium))
                .frame(width: 46, height: 44)
                .foregroundStyle(on ? Color.brand : Color.primary)
                .overlay(alignment: .topTrailing) {
                    if on && icon.hasPrefix("square.3.layers") {
                        Circle().fill(Color.brand).frame(width: 7, height: 7).padding(8)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
        .accessibilityLabel(label)
    }
}

/// Zoom and sheet scale (Edit mode, bottom left).
struct ScaleChip: View {
    let controller: PlanViewportController
    let sheet: Sheet

    var body: some View {
        HStack(spacing: 6) {
            Text("\(Int((controller.viewport.zoom * 100).rounded()))%").bold().monospacedDigit()
            Divider().frame(height: 12)
            if sheet.pxPerFt != nil { Text("Scale \(sheet.scaleLabel ?? String(localized: "set"))") } else { Text("No scale set").foregroundStyle(Color.orange) }
        }
        .font(.caption)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(.regularMaterial, in: Capsule())
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
    }
}

/// "N photos" and "N tasks" on a device's card (only when it has any): one tap opens the Photos section filtered to the
/// device, or the task (the Tasks section filtered to the device when there are several). The plan shows where; the
/// sections hold the rest (docs/navigation.md).
struct DeviceLinkChips: View {
    let model: EditorModel
    let markerId: String

    var body: some View {
        let photos = model.bundle.livePhotos.filter { $0.markerId == markerId }.count
        let tasks = model.bundle.liveTasks.filter { $0.markerId == markerId }.map(\.id)
        if photos > 0 {
            chip(String(localized: "\(photos) photos"), icon: "photo.on.rectangle") {
                model.selection = nil
                JobNav.shared.photos(device: markerId)
            }
            .accessibilityHint("Opens this device's photos")
        }
        if !tasks.isEmpty {
            chip(String(localized: "\(tasks.count) tasks"), icon: "checklist") {
                model.selection = nil
                JobNav.shared.tasks(device: markerId, ids: tasks)
            }
            .accessibilityHint("Opens this device's tasks")
        }
    }

    private func chip(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .padding(.horizontal, 12).frame(minHeight: 44)
                .foregroundStyle(Color.brand)
                .background(Color.brand.opacity(0.12), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// View mode: what's under your finger, read-only, with a way into editing.
struct SelectionPeek: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    let selection: Selection

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                content
                Spacer(minLength: 0)
                Button { model.selection = nil } label: {
                    Image(systemName: "xmark.circle.fill").font(.title2).foregroundStyle(Color.secondary)
                        .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            HStack(spacing: 8) {
                Button { model.setViewerMode(.edit) } label: { Label("Edit", systemImage: "pencil") }
                    .buttonStyle(.borderedProminent).tint(Color.brand)
                if case .marker(let id) = selection { DeviceLinkChips(model: model, markerId: id) }
            }
        }
        .padding(14)
        .frame(maxWidth: 440, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
        .shadow(color: Color.black.opacity(0.15), radius: 12, y: 4)
        .padding(.horizontal, 12)
    }

    @ViewBuilder
    private var content: some View {
        switch selection {
        case .marker(let id):
            if let m = model.bundle.liveMarkers.first(where: { $0.id == id }) { markerInfo(m) }
        case .closet(let id):
            if let c = model.bundle.liveClosets.first(where: { $0.id == id }) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(c.name).font(.headline)
                    Text(Catalog.closetInfo(c.kind).name).font(.subheadline).foregroundStyle(.secondary)
                    if let n = c.notes, !n.isEmpty { Text(n).font(.footnote).lineLimit(3) }
                }
            }
        case .run(let id):
            if let r = model.bundle.liveRuns.first(where: { $0.id == id }) { runInfo(r) }
        }
    }

    private func markerInfo(_ m: Marker) -> some View {
        HStack(alignment: .top, spacing: 12) {
            DeviceSymbol(type: app.type(m.deviceTypeId), size: 34, tentative: m.tentative)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: "\(m.label)  \(app.type(m.deviceTypeId)?.name ?? String(localized: "Device"))").font(.headline).lineLimit(2)
                Text(detailLine(m)).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                if !m.notes.isEmpty { Text(m.notes).font(.footnote).lineLimit(3) }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func detailLine(_ m: Marker) -> String {
        var parts: [String] = []
        if !m.room.isEmpty { parts.append(m.room) }
        parts.append(tr(m.mount.rawValue.capitalized, context: "Catalog"))
        if !m.cables.isEmpty { parts.append(Cables.summary(m.cables)) }
        if m.tentative { parts.append(String(localized: "Optional")) }
        return parts.joined(separator: ", ")
    }

    private func runInfo(_ r: Run) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(r.kind == .wire ? "Wire run" : r.kind == .stair ? "Stair run" : "LED run").font(.headline)
            let len = Geometry.runLengthFt(r).map { "\($0.clean) ft" } ?? String(localized: "No length yet")
            Text(r.kind == .wire ? "\(Cables.summary(r.cables)), \(len)" : len).font(.subheadline).foregroundStyle(.secondary)
        }
    }
}
