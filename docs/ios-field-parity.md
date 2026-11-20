# iPad / iPhone: what the office made on the web, in the field

Technicians on the iPad and iPhone app see the office's redlines, measurements, plan links, RFIs and schedule, and can
raise an RFI from site. Everything here is read-only except new RFI drafts. None of it counts in the takeoff: counts
still come only from devices and wire runs (`Takeoff.swift`, `computeTakeoff`).

The rows come down with cloud sync (`PlanMarkup`, `Measurement`, `SheetLink`, `Rfi`, `ScheduleItem` in
`ios/PinPlanCore/Sources/PinPlanCore/FieldSync.swift`). The rules are ported from the web into
`ios/PinPlanCore/Sources/PinPlanCore/FieldParity.swift` and tested against the same fixtures as the web tests
(`FieldParityTests.swift`):

| Swift | Web |
|---|---|
| `FieldParity.Measure` (length, area, allowances, `12' 6"`, label spot) | `src/lib/measure.ts` |
| `FieldParity.Markup` (cloud, arrow head, private markups) | `src/lib/markups.ts` |
| `FieldParity.RFI` (RFI-007, With us / With them, overdue, what a technician may do) | `src/lib/rfis.ts` |
| `FieldParity.Schedule` (weeks, look-ahead window, my crew, Behind / Late) | `src/lib/schedule.ts` |
| `FieldParity.Today` (my tasks due, today's log, open checklists) | — |

## On the plan

Three overlays registered through `PlanOverlayRegistry` (`ios/PinPlan/Markups/OfficeOverlays.swift`, registered from
`TaskOverlays.register()`):

- **Markups** (`office-markups`): pen, highlighter, line, arrow, cloud, rectangle, ellipse and text, drawn like the web
  PDF export. Private markups show only to their author, in purple.
- **Measurements** (`office-measurements`, `ios/PinPlan/Measure/`): the line or area with a chip showing the label and
  the value worked out from the plan's current scale ("No scale" when the plan has none).
- **Plan links** (`office-links`, `ios/PinPlan/Markups/OfficeLinks.swift`): red see-through boxes with a chip naming
  where they go. A tap opens the other plan (centred on the spot), a document (Quick Look), a photo or a web page
  (http/https only). Links to something deleted are grey and dashed. In Edit mode a link only opens with the Select
  tool, so placing devices over a callout still works.

Layers › **From the office** has a switch for each (remembered on the device). Hiding never changes anything saved.

## Field tab

- **Today** (technicians, top of Field, folds away): Take photo, Write today's log / Today's log, my tasks due today or
  overdue, this week's phases on my crew, open checklists.
- **RFIs**: Open / With them / All; each row shows the number, status, who has to act and the due day. The detail shows
  the question, our suggestion, the answer, the spot on the plan and photos. **New RFI** (subject, question, suggestion,
  photos, spot on the plan) saves a **draft**; the office sends it from the web. Only drafts can be edited on the
  device (a sent RFI is changed on the web, and only drafts sync up); technicians may edit drafts, like the web
  (`canEditRfi`). "Send it from the web" shows only to people who may send.
- **Schedule**: This week / Next 2 weeks, read-only, "Only my crew" (on by default for technicians).
- **More on the web**: one quiet row that opens the web app in Safari for what only the web does. Office: change
  orders, quotes and invoices, sending RFIs, planning the schedule, job templates. Technicians: updating schedule
  progress (the rest is office only on the web too). It uses the server set in Settings and is hidden when none is set.

On iPhone the Field sections are a scrolling row of chips; on iPad, segments.
