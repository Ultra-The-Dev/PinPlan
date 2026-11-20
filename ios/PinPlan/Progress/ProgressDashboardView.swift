import SwiftUI
import PinPlanCore

/// Crew tab: install progress by floor, category or closet, open issues (tap to see it on the plan), office bulk
/// verify and the "photo required" setting. No prices.
struct ProgressDashboardView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var by: InstallProgress.GroupBy = .sheet
    @State private var photoRequired = InstallSettings.photoRequired

    var body: some View {
        let b = model.bundle
        let total = InstallProgress.totals(b.liveMarkers, catalog: app.catalog)
        let rows = InstallProgress.progress(markers: b.liveMarkers, runs: b.liveRuns, sheets: model.sheets, catalog: app.catalog, by: by,
                                            closets: b.liveClosets, trades: app.trades)
        let open = InstallProgress.issues(markers: b.liveMarkers.filter { !$0.tentative }, runs: b.liveRuns.filter { $0.tentative != true })
        Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(total.pct)%").font(.largeTitle.bold()).monospacedDigit().foregroundStyle(Color(hex: InstallProgress.color(.verified)))
                    Text("\(total.done) of \(total.total) devices tested").font(.subheadline).foregroundStyle(.secondary)
                }
                StatusBar(counts: total).frame(height: 10)
                Picker("Group by", selection: $by) {
                    Text("Floor").tag(InstallProgress.GroupBy.sheet)
                    Text("Category").tag(InstallProgress.GroupBy.category)
                    Text("Closet").tag(InstallProgress.GroupBy.closet)
                }
                .pickerStyle(.segmented)
            }
            .padding(.vertical, 4)
            ForEach(rows) { r in ProgressRowView(row: r) }
            if rows.isEmpty { Text("No devices placed yet.").foregroundStyle(.secondary) }
        } header: {
            Text("Install progress")
        } footer: {
            Text("On the plan: Progress → Walk, then tap devices to mark them. Quotes and counts don't change.")
        }
        Section("Issues (\(open.count))") {
            if open.isEmpty { Text("No issues reported.").foregroundStyle(.secondary) }
            ForEach(open) { i in
                Button { model.focusOn(i.kind == .marker ? .marker(i.id) : .run(i.id)) } label: { IssueRow(issue: i, sheet: model.sheets.first { $0.id == i.sheetId }?.name) }
            }
        }
        if InstallProgress.canSet(app.cloud.role, .verified) { officeSection }
    }

    @ViewBuilder private var officeSection: some View {
        let ready = InstallProgress.trackedMarkers(model.bundle.liveMarkers, catalog: app.catalog).filter { InstallProgress.status($0) == .tested }
        Section {
            if !ready.isEmpty {
                Button {
                    let n = model.verifyAll(ready.map(\.id))
                    model.say(String(localized: "Verified \(n) devices"))
                } label: { Label("Verify \(ready.count) tested devices", systemImage: "checkmark.seal") }
            }
            ForEach([InstallStatus.roughed, .installed, .tested, .verified, .issue], id: \.self) { s in
                Toggle(isOn: Binding(get: { photoRequired.contains(s) }, set: { on in
                    photoRequired = on ? photoRequired + [s] : photoRequired.filter { $0 != s }
                    InstallSettings.photoRequired = photoRequired
                })) { Text("Photo required for \(tr(InstallProgress.label(s), context: "Install").lowercased())") }
            }
        } header: {
            Text("Office")
        } footer: {
            Text("Technicians take a photo before they can mark a device with these statuses.")
        }
    }
}

private struct StatusBar: View {
    let counts: InstallProgress.Counts

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                ForEach(InstallProgress.order, id: \.self) { s in
                    let n = counts.count(s)
                    if n > 0 && counts.total > 0 {
                        let w: CGFloat = geo.size.width * CGFloat(n) / CGFloat(counts.total)
                        Rectangle().fill(Color(hex: InstallProgress.color(s))).frame(width: w)
                    }
                }
                Spacer(minLength: 0)
            }
            .background(Color(.tertiarySystemFill))
            .clipShape(Capsule())
        }
    }
}

private struct ProgressRowView: View {
    let row: InstallProgress.Row

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(row.name).font(.subheadline.weight(.semibold))
                Spacer()
                if row.devices.total > 0 {
                    Text("\(row.devices.done)/\(row.devices.total) · \(row.devices.pct)%").font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
                if row.runs.total > 0 {
                    Text("cables \(row.runs.done)/\(row.runs.total)").font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
            }
            if row.devices.total > 0 { StatusBar(counts: row.devices).frame(height: 8) }
            if row.runs.total > 0 { StatusBar(counts: row.runs).frame(height: 5).opacity(0.8) }
        }
        .padding(.vertical, 2)
    }
}

private struct IssueRow: View {
    let issue: InstallProgress.Issue
    let sheet: String?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color(hex: InstallProgress.color(.issue)))
            VStack(alignment: .leading, spacing: 2) {
                Text(issue.label).font(.subheadline.weight(.semibold)).foregroundStyle(Color.primary)
                if let n = issue.note, !n.isEmpty { Text(n).font(.subheadline).foregroundStyle(Color.primary) }
                Text([sheet, issue.by, issue.at.map { String($0.prefix(10)) }].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "mappin.and.ellipse").foregroundStyle(.secondary)
        }
    }
}
