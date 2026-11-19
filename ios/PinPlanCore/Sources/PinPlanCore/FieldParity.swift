import Foundation

// Field parity: the pure rules behind the iPad/iPhone field screens that show what the office made on the web —
// redlines (plan markups), saved measurements, plan links, RFIs, the schedule — and the technician's Today card.
// Ported from the web app so both show the same values:
//   Measure   ← src/lib/measure.ts   (lengths, areas, allowances, formatting)
//   Markup    ← src/lib/markups.ts   (cloud and arrow shapes, who sees a private markup)
//   RFI       ← src/lib/rfis.ts      (RFI-007, status names, ball in court, overdue)
//   Schedule  ← src/lib/schedule.ts  (day maths, look-ahead window, my crew, behind/late)
// Inputs are plain values (points, strings, numbers) so the app can feed it whichever rows sync gives it. Nothing here
// is counted: markups, measurements and links never reach the takeoff (Takeoff.swift).
public enum FieldParity {}

// MARK: - saved measurements

extension FieldParity {
    public enum Measure {
        public enum Kind: String, CaseIterable, Sendable {
            case length, polyline, area
            /// Lenient: an unknown kind reads as a length.
            public init(raw: String?) { self = Kind(rawValue: raw ?? "") ?? .length }
            public var name: String {
                switch self { case .length: "Length"; case .polyline: "Run"; case .area: "Area" }
            }
            public var minPoints: Int { self == .area ? 3 : 2 }
        }

        public struct Value: Equatable, Sendable {
            /// Feet for a length/run, square feet for an area — with allowances.
            public var value: Double
            public var unit: String
            /// Before extra/waste.
            public var raw: Double
            /// Areas: the outline length in feet (no allowances).
            public var perimeterFt: Double?
            /// The area's edges cross (its size is then only an approximation).
            public var selfIntersecting: Bool
        }

        /// The sheet image size and scale (Sheet.width / height / pxPerFt).
        public struct Scale: Equatable, Sendable {
            public var width: Double
            public var height: Double
            public var pxPerFt: Double?
            public init(width: Double, height: Double, pxPerFt: Double?) { self.width = width; self.height = height; self.pxPerFt = pxPerFt }
            public var isCalibrated: Bool { (pxPerFt ?? 0) > 0 && width > 0 && height > 0 }
        }

        static func px(_ points: [Double], _ s: Scale) -> [(x: Double, y: Double)] {
            stride(from: 0, to: points.count - 1, by: 2).map { (points[$0] * s.width, points[$0 + 1] * s.height) }
        }

        static func pathPx(_ p: [(x: Double, y: Double)], closed: Bool) -> Double {
            var d = 0.0
            for i in p.indices.dropFirst() { d += hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y) }
            if closed, p.count > 2, let a = p.first, let b = p.last { d += hypot(a.x - b.x, a.y - b.y) }
            return d
        }

        /// Length along the points in feet (open path). Nil when the sheet has no scale.
        public static func lengthFt(_ points: [Double], _ s: Scale) -> Double? {
            guard s.isCalibrated, let ppf = s.pxPerFt else { return nil }
            return pathPx(px(points, s), closed: false) / ppf
        }

        /// Closed-path length (an area's outline) in feet.
        public static func perimeterFt(_ points: [Double], _ s: Scale) -> Double? {
            guard s.isCalibrated, let ppf = s.pxPerFt else { return nil }
            return pathPx(px(points, s), closed: true) / ppf
        }

        /// Polygon area in square feet (shoelace, absolute). Nil when the sheet has no scale.
        public static func areaSqFt(_ points: [Double], _ s: Scale) -> Double? {
            guard s.isCalibrated, let ppf = s.pxPerFt else { return nil }
            let p = px(points, s)
            guard p.count >= 3 else { return 0 }
            var a = 0.0
            for i in p.indices {
                let j = (i + 1) % p.count
                a += p[i].x * p[j].y - p[j].x * p[i].y
            }
            return abs(a) / 2 / (ppf * ppf)
        }

        /// True when a polygon's edges cross.
        public static func isSelfIntersecting(_ points: [Double]) -> Bool {
            let p = px(points, Scale(width: 1, height: 1, pxPerFt: nil))
            let n = p.count
            guard n >= 4 else { return false }
            func o(_ a: (x: Double, y: Double), _ b: (x: Double, y: Double), _ c: (x: Double, y: Double)) -> Double {
                (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
            }
            func cross(_ a: (x: Double, y: Double), _ b: (x: Double, y: Double), _ c: (x: Double, y: Double), _ d: (x: Double, y: Double)) -> Bool {
                let d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d)
                return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
            }
            for i in 0..<n {
                let a = p[i], b = p[(i + 1) % n]
                for j in (i + 2)..<max(i + 2, n) {
                    if i == 0 && j == n - 1 { continue } // neighbours through the closing edge
                    if cross(a, b, p[j], p[(j + 1) % n]) { return true }
                }
            }
            return false
        }

        private static func pos(_ v: Double?) -> Double { if let v, v.isFinite, v > 0 { return v }; return 0 }

        /// A measurement's value on its sheet (same as measurementValue in measure.ts), nil when the sheet has no scale.
        /// Lengths and runs: (length + extraFt) × (1 + waste%). Areas: area × (1 + waste%).
        public static func value(kind: Kind, points: [Double], extraFt: Double?, wastePct: Double?, scale s: Scale) -> Value? {
            let waste = 1 + pos(wastePct) / 100
            if kind == .area {
                guard let raw = areaSqFt(points, s), let per = perimeterFt(points, s) else { return nil }
                return Value(value: raw * waste, unit: "sq ft", raw: raw, perimeterFt: per, selfIntersecting: isSelfIntersecting(points))
            }
            guard let raw = lengthFt(points, s) else { return nil }
            return Value(value: (raw + pos(extraFt)) * waste, unit: "ft", raw: raw, perimeterFt: nil, selfIntersecting: false)
        }

        /// 12.5 → 12' 6" (rounded to the inch).
        public static func formatFeetInches(_ ft: Double?) -> String {
            guard let ft, ft.isFinite else { return "—" }
            let totalIn = Int((abs(ft) * 12).rounded())
            return "\(ft < 0 ? "-" : "")\(grouped(totalIn / 12))' \(totalIn % 12)\""
        }

        /// 1234.4 → "1,234 sq ft" (one decimal under 10).
        public static func formatSqFt(_ v: Double?) -> String {
            guard let v, v.isFinite else { return "—" }
            let f = NumberFormatter()
            f.locale = Locale(identifier: "en_US")
            f.numberStyle = .decimal
            f.maximumFractionDigits = v < 10 ? 1 : 0
            f.roundingMode = .halfUp // like toLocaleString (2.25 → 2.3)
            return "\(f.string(from: NSNumber(value: v)) ?? String(v)) sq ft"
        }

        public static func format(_ v: Value?) -> String {
            guard let v else { return "—" }
            return v.unit == "sq ft" ? formatSqFt(v.value) : formatFeetInches(v.value)
        }

        private static func grouped(_ n: Int) -> String {
            let f = NumberFormatter()
            f.locale = Locale(identifier: "en_US")
            f.numberStyle = .decimal
            return f.string(from: NSNumber(value: n)) ?? String(n)
        }

        /// Where to put the value label (relative), same as labelAnchor in measure.ts: an area's centroid (the mean of
        /// its corners when it has no size), else halfway along the path.
        public static func labelPoint(kind: Kind, points: [Double], scale s: Scale) -> (x: Double, y: Double)? {
            let unit = Scale(width: max(s.width, 1), height: max(s.height, 1), pxPerFt: nil)
            let p = px(points, unit)
            guard let first = p.first else { return nil }
            if kind == .area && p.count >= 3 {
                var a = 0.0, cx = 0.0, cy = 0.0
                for i in p.indices {
                    let j = (i + 1) % p.count
                    let f = p[i].x * p[j].y - p[j].x * p[i].y
                    a += f; cx += (p[i].x + p[j].x) * f; cy += (p[i].y + p[j].y) * f
                }
                if abs(a) > 1e-9 { return (cx / (3 * a) / unit.width, cy / (3 * a) / unit.height) }
                let n = Double(p.count)
                return (p.map(\.x).reduce(0, +) / n / unit.width, p.map(\.y).reduce(0, +) / n / unit.height)
            }
            let half = pathPx(p, closed: false) / 2
            guard half > 0 else { return (first.x / unit.width, first.y / unit.height) }
            var run = 0.0
            for i in p.indices.dropFirst() {
                let seg = hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)
                if run + seg >= half, seg > 0 {
                    let t = (half - run) / seg
                    return ((p[i - 1].x + (p[i].x - p[i - 1].x) * t) / unit.width, (p[i - 1].y + (p[i].y - p[i - 1].y) * t) / unit.height)
                }
                run += seg
            }
            return (first.x / unit.width, first.y / unit.height)
        }
    }
}

// MARK: - plan markups (redlines)

extension FieldParity {
    public enum Markup {
        /// Purple: private markups (only their author sees them).
        public static let privateColor = "#7c3aed"
        public static let defaultLayers = ["Redlines", "As-built", "Notes"]
        /// Default stroke width and text size (fractions of the sheet width; the web's "M").
        public static let defaultWidth = 0.0024
        public static let defaultFontSize = 0.013
        /// The highlighter is wide and see-through.
        public static let highlightFactor = 6.0
        public static let highlightOpacity = 0.35
        /// Padding around a text box, in font sizes.
        public static let textPad = 0.35

        /// Private markups are seen by their author only (unowned ones were drawn on a device while signed out).
        public static func canSee(isPrivate: Bool?, authorId: String?, userId: String?) -> Bool {
            isPrivate != true || (authorId ?? "").isEmpty || authorId == userId
        }

        /// Layers to offer: the defaults, then any used on the job, first-seen order, case-insensitive.
        public static func layerNames(_ used: [String]) -> [String] {
            var out: [String] = [], seen = Set<String>()
            for l in defaultLayers + used {
                let name = l.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty, seen.insert(name.lowercased()).inserted else { continue }
                out.append(name)
            }
            return out
        }

        /// Revision-cloud outline for the box (x0,y0)–(x1,y1), same as cloudPath in markups.ts: scallops of about
        /// `arcSize` along each side, inside the box. A closed polyline [x, y, …] whose last point repeats the first.
        public static func cloudPath(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double, arcSize: Double) -> [Double] {
            let lx = min(x0, x1), hx = max(x0, x1), ly = min(y0, y1), hy = max(y0, y1)
            let w = hx - lx, h = hy - ly
            guard w > 0, h > 0 else { return [lx, ly, hx, ly, hx, hy, lx, hy, lx, ly] }
            let size = max(arcSize, 1e-9)
            let bulge = min(size / 3, min(w, h) / 4)
            let ix0 = lx + bulge, iy0 = ly + bulge, ix1 = hx - bulge, iy1 = hy - bulge
            let sides: [(Double, Double, Double, Double, Double, Double)] = [
                (ix0, iy0, ix1, iy0, 0, -1), (ix1, iy0, ix1, iy1, 1, 0), (ix1, iy1, ix0, iy1, 0, 1), (ix0, iy1, ix0, iy0, -1, 0),
            ]
            let steps = 8
            var out: [Double] = []
            for (ax, ay, bx, by, nx, ny) in sides {
                let len = hypot(bx - ax, by - ay)
                let n = max(1, Int((len / size).rounded()))
                for s in 0..<n {
                    for k in 0..<steps {
                        let t = Double(k) / Double(steps)
                        let u = (Double(s) + t) / Double(n)
                        let b = sin(Double.pi * t) * bulge
                        out.append(ax + (bx - ax) * u + nx * b)
                        out.append(ay + (by - ay) * u + ny * b)
                    }
                }
            }
            out.append(out[0]); out.append(out[1])
            return out
        }

        /// Arrow head at the last point: [leftX, leftY, tipX, tipY, rightX, rightY]. Empty if there's no direction.
        public static func arrowHead(_ points: [Double], size: Double) -> [Double] {
            let n = points.count
            guard n >= 4 else { return [] }
            let tx = points[n - 2], ty = points[n - 1]
            var i = n - 4
            while i >= 0 {
                let dx = tx - points[i], dy = ty - points[i + 1]
                let d = hypot(dx, dy)
                if d >= 1e-12 {
                    let ux = dx / d, uy = dy / d
                    let bx = tx - ux * size, by = ty - uy * size, half = size * 0.5
                    return [bx - uy * half, by + ux * half, tx, ty, bx + uy * half, by - ux * half]
                }
                i -= 2
            }
            return []
        }

        /// Lines of a text markup (never empty).
        public static func textLines(_ text: String?) -> [String] {
            (text ?? "").components(separatedBy: "\n")
        }
    }
}

// MARK: - RFIs

extension FieldParity {
    public enum RFI {
        public static let statuses = ["draft", "open", "answered", "closed", "void"]

        public static func statusLabel(_ status: String) -> String {
            switch status {
            case "draft": "Draft"
            case "open": "Open"
            case "answered": "Answered"
            case "closed": "Closed"
            case "void": "Void"
            default: status.capitalized
            }
        }

        /// 7 → "RFI-007" (wider numbers are never cut: 1234 → "RFI-1234").
        public static func code(_ n: Int) -> String {
            let s = String(max(0, n))
            return "RFI-" + String(repeating: "0", count: max(0, 3 - s.count)) + s
        }

        /// One past the highest ever used (deleted and void included, so numbers aren't reused).
        public static func nextNumber(_ numbers: [Int]) -> Int { (numbers.max() ?? 0) + 1 }

        /// Who has to act: "With them" (waiting on the GC / architect) or "With us". Nil once closed or void.
        public static func ballLabel(status: String, ballInCourt: String) -> String? {
            guard status != "closed" && status != "void" else { return nil }
            return ballInCourt == "them" ? "With them" : "With us"
        }

        /// Open and past its due day (due today is not overdue yet).
        public static func isOverdue(status: String, due: String?, deleted: Bool? = nil, today: String) -> Bool {
            deleted != true && status == "open" && !(due ?? "").isEmpty && due! < today
        }

        /// Still in play (shown first in the field list): draft, open or answered.
        public static func isActive(_ status: String) -> Bool { status == "draft" || status == "open" || status == "answered" }

        /// What a technician may do (rfis.ts canRfi): raise drafts with photos; the office sends, answers and closes.
        /// No team (working alone) means full access.
        public static func techCan(_ action: String) -> Bool { ["view", "create", "editDraft", "addPhoto"].contains(action) }
        public static func can(_ role: TeamRole?, _ action: String) -> Bool { role == .tech ? techCan(action) : true }

        /// May this person change the RFI's text and photos (canEditRfi)? Technicians: drafts only. Void: nobody.
        public static func canEdit(_ role: TeamRole?, status: String) -> Bool {
            guard status != "void" else { return false }
            return can(role, "edit") || (status == "draft" && can(role, "editDraft"))
        }

        /// A draft needs a subject or a question before it can be saved.
        public static func draftIsSavable(subject: String, question: String) -> Bool {
            !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }

        /// Subject from the question when none was typed (first line, up to 80 characters).
        public static func subject(_ subject: String, question: String) -> String {
            let s = subject.trimmingCharacters(in: .whitespacesAndNewlines)
            if !s.isEmpty { return s }
            let first = question.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n").first ?? ""
            return first.count > 80 ? String(first.prefix(79)) + "…" : first
        }
    }
}

// MARK: - schedule

extension FieldParity {
    public enum Schedule {
        private static var utc: Calendar = {
            var c = Calendar(identifier: .gregorian)
            c.timeZone = TimeZone(identifier: "UTC")!
            return c
        }()

        /// "2026-11-23" → days since 1970-01-01 (nil when malformed).
        public static func dayNum(_ day: String) -> Int? {
            let parts = day.split(separator: "-")
            guard day.count == 10, parts.count == 3, let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
                  let date = utc.date(from: DateComponents(year: y, month: m, day: d)) else { return nil }
            return Int((date.timeIntervalSince1970 / 86_400).rounded())
        }

        public static func dayStr(_ n: Int) -> String {
            let c = utc.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: Double(n) * 86_400))
            return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
        }

        /// 0 = Sunday … 6 = Saturday.
        public static func weekday(_ n: Int) -> Int { ((n + 4) % 7 + 7) % 7 }
        public static func isWeekend(_ n: Int) -> Bool { let w = weekday(n); return w == 0 || w == 6 }
        public static func addDays(_ day: String, _ n: Int) -> String { dayNum(day).map { dayStr($0 + n) } ?? day }

        /// Monday of the week `day` is in.
        public static func weekStart(_ day: String) -> String {
            guard let n = dayNum(day) else { return day }
            let w = weekday(n)
            return dayStr(n + (w == 0 ? -6 : 1 - w))
        }

        /// Monday of this week through the Sunday `weeks` weeks later (lookaheadWindow in schedule.ts).
        public static func window(today: String, weeks: Int) -> (from: String, to: String) {
            let from = weekStart(today)
            return (from, addDays(from, max(1, weeks) * 7 - 1))
        }

        /// An item (start…end inclusive) touches the window.
        public static func touches(start: String, end: String, from: String, to: String) -> Bool { start <= to && end >= from }

        /// Working days from a to b, both included (0 when b < a).
        public static func workdaysBetween(_ a: String, _ b: String, workdaysOnly: Bool = true) -> Int {
            guard let x = dayNum(a), let y = dayNum(b), y >= x else { return 0 }
            if !workdaysOnly { return y - x + 1 }
            return (x...y).filter { !isWeekend($0) }.count
        }

        /// The person is on the item's crew (names match whatever the capitalisation).
        public static func onCrew(_ crew: [String]?, me: String?) -> Bool {
            let k = (me ?? "").trimmingCharacters(in: .whitespaces).lowercased()
            guard !k.isEmpty else { return false }
            return (crew ?? []).contains { $0.trimmingCharacters(in: .whitespaces).lowercased() == k }
        }

        public enum Status: String, Sendable { case done, late, behind, active, upcoming
            public var label: String {
                switch self { case .done: "Done"; case .late: "Late"; case .behind: "Behind"; case .active: "Under way"; case .upcoming: "Coming up" }
            }
        }

        /// Behind: past its end and not finished, or under way and progress trails elapsed time by more than 25 points.
        public static func status(start: String, end: String, progress: Double?, workdaysOnly: Bool?, today: String) -> Status {
            let p = min(100, max(0, (progress ?? 0).isFinite ? (progress ?? 0) : 0))
            if p >= 100 { return .done }
            if today > end { return .late }
            if today < start { return .upcoming }
            let wd = workdaysOnly != false
            let duration = max(1, workdaysBetween(start, end, workdaysOnly: wd))
            let elapsed = Double(workdaysBetween(start, today, workdaysOnly: wd)) / Double(duration) * 100
            return elapsed - p > 25 ? .behind : .active
        }
    }
}

// MARK: - Today (technician)

extension FieldParity {
    public enum Today {
        /// My open tasks due today or overdue (assigned to me, any capitalisation), overdue first.
        public static func dueTasks(_ tasks: [PlanTask], me: String, today: String) -> [TaskLogic.OpenPlanTask] {
            TaskLogic.openPlanTasksFor(me, tasks, today: today).filter { $0.bucket == .overdue || $0.bucket == .today }
        }

        /// Today's daily log written by me (or by anyone, when I haven't written one), newest first.
        public static func todaysLog(_ logs: [JobLog], me: String, today: String) -> JobLog? {
            let todays = logs.filter { $0.deleted != true && $0.date == today }.sorted { $0.createdAt > $1.createdAt }
            return todays.first { ($0.author ?? "").lowercased() == me.lowercased() } ?? todays.first
        }

        /// Checklists with items still to do, in the order they were started.
        public static func openChecklists(_ lists: [Checklist], photos: [Photo]) -> [Checklist] {
            lists.filter { c in
                guard c.deleted != true else { return false }
                let p = FieldDocs.progress(c, photos: photos)
                return p.total > 0 && p.done < p.total
            }
            .sorted { $0.createdAt < $1.createdAt }
        }
    }
}
