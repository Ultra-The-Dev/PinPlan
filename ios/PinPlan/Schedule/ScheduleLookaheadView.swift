import SwiftUI
import PinPlanCore

// Field › Schedule: the job's phases for this week or the next two weeks, read-only (the office plans the schedule on
// the web). "Only my crew" narrows it to the phases I'm on. Day maths: FieldParity.Schedule (← src/lib/schedule.ts).

enum ScheduleRange: String, CaseIterable, Identifiable {
    case week = "This week", twoWeeks = "Next 2 weeks"
    var id: String { rawValue }
    var weeks: Int { self == .week ? 1 : 2 }
}

enum ScheduleField {
    /// Live items touching the window (including ones already under way), by start then order.
    static func items(_ all: [ScheduleItem], today: String, weeks: Int, me: String?) -> [ScheduleItem] {
        let w = FieldParity.Schedule.window(today: today, weeks: weeks)
        return all
            .filter { $0.deleted != true && !$0.start.isEmpty && FieldParity.Schedule.touches(start: $0.start, end: $0.end, from: w.from, to: w.to) }
            .filter { me == nil || FieldParity.Schedule.onCrew($0.crew, me: me) }
            .sorted { ($0.start, $0.sort ?? 0, $0.name) < ($1.start, $1.sort ?? 0, $1.name) }
    }

    /// Grouped by the Monday of the week they start (this week when already under way).
    static func byWeek(_ items: [ScheduleItem], today: String) -> [(week: String, items: [ScheduleItem])] {
        let thisWeek = FieldParity.Schedule.weekStart(today)
        var groups: [String: [ScheduleItem]] = [:]
        for i in items {
            var w = FieldParity.Schedule.weekStart(i.start)
            if w < thisWeek && i.end >= thisWeek { w = thisWeek }
            groups[w, default: []].append(i)
        }
        return groups.keys.sorted().map { ($0, groups[$0]!) }
    }

    static func status(_ i: ScheduleItem, today: String) -> FieldParity.Schedule.Status {
        FieldParity.Schedule.status(start: i.start, end: i.end, progress: i.progress, workdaysOnly: i.workdaysOnly, today: today)
    }

    static func color(_ s: FieldParity.Schedule.Status) -> Color {
        switch s {
        case .done: .green
        case .late: .red
        case .behind: .orange
        case .active: .blue
        case .upcoming: .secondary
        }
    }

    /// "Nov 23 – Nov 27" (one day: "Nov 23").
    static func dates(_ i: ScheduleItem) -> String {
        i.start == i.end ? TaskDates.short(i.start) : "\(TaskDates.short(i.start)) – \(TaskDates.short(i.end))"
    }
}

struct ScheduleLookaheadView: View {
    @Environment(AppModel.self) private var app
    let model: EditorModel
    @State private var range: ScheduleRange = .week
    @State private var mineOnly: Bool?

    var body: some View {
        let today = TaskDates.today()
        let me = FieldAuthor.name(app)
        // Technicians start on their own crew's phases; the office sees everything.
        let onlyMine = mineOnly ?? (app.cloud.role == .tech)
        let all = model.bundle.liveScheduleItems
        let items = ScheduleField.items(all, today: today, weeks: range.weeks, me: onlyMine ? me : nil)
        List {
            Section {
                Picker("Show", selection: $range) { ForEach(ScheduleRange.allCases) { Text(tr($0.rawValue)).tag($0) } }
                    .pickerStyle(.segmented)
                Toggle("Only my crew", isOn: Binding(get: { onlyMine }, set: { mineOnly = $0 }))
            }
            if items.isEmpty {
                ContentUnavailableView(all.isEmpty ? "No schedule yet" : "Nothing planned",
                                       systemImage: "calendar",
                                       description: Text(all.isEmpty
                                                         ? "The office plans the job's phases on the web; they show here."
                                                         : onlyMine ? (range == .week ? "You're not on the crew of any phase this week. Turn off Only my crew to see them all." : "You're not on the crew of any phase in the next two weeks. Turn off Only my crew to see them all.") : "No phases in these dates."))
                    .listRowBackground(Color.clear)
            }
            ForEach(ScheduleField.byWeek(items, today: today), id: \.week) { group in
                Section(sentence: group.week == FieldParity.Schedule.weekStart(today) ? "This week" : "Week of \(TaskDates.short(group.week))") {
                    ForEach(group.items) { i in ScheduleRow(item: i, today: today, me: me) }
                }
            }
        }
    }
}

struct ScheduleRow: View {
    let item: ScheduleItem
    let today: String
    let me: String

    var body: some View {
        let status = ScheduleField.status(item, today: today)
        let progress = min(100, max(0, item.progress ?? 0))
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Circle().fill(Color(hex: item.color ?? "#64748b")).frame(width: 10, height: 10).accessibilityHidden(true)
                Text(item.name.isEmpty ? String(localized: "Untitled phase") : item.name).font(.headline)
                Spacer()
                Text(tr(status.label, context: "Schedule status")).font(.caption.weight(.semibold)).foregroundStyle(ScheduleField.color(status))
            }
            Text(ScheduleField.dates(item)).font(.subheadline).foregroundStyle(.secondary)
            ProgressView(value: progress, total: 100).tint(ScheduleField.color(status))
            if let crew = item.crew, !crew.isEmpty {
                Text(crew.map { FieldParity.Schedule.onCrew([$0], me: me) ? String(localized: "\($0) (you)") : $0 }.joined(separator: ", "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let n = item.notes, !n.isEmpty { Text(n).font(.caption).foregroundStyle(.secondary).lineLimit(3) }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityValue("\(Int(progress)) percent done")
    }
}
