# Job schedule, 3-week look-ahead and crew board

Small trades run several jobs at once with a handful of techs. The office needs to see which crew is on which job
this week, and how a slipped rough-in pushes trim and final. PinPlan gives each job a short list of **phases** with
real finish-to-start dependencies, plus a cross-job **crew board**.

- **Job → Field → Schedule** (`src/components/schedule/ScheduleView.tsx`): Gantt (`Gantt.tsx`) on tablets and
  desktops, an agenda grouped by week on phones (< 640 px). Toolbar: Add phase, Start from template (when the job has
  no phases), 3 weeks / All, Today, Days / Weeks zoom, `.ics` export and a link to the crew board.
- **Crew board** `/schedule` (`CrewBoard.tsx`): people × days (two weeks, Monday first), a job chip per job in each
  cell, red when overbooked. Tap a chip to open that job's schedule (`/project?id=…&tab=field&section=schedule`).
- **My Tasks** `/tasks`: a "This week" strip of phases the current person is on the crew of (`ThisWeekStrip.tsx`).

All pure logic is in `src/lib/schedule.ts` (tests: `tests/schedule.test.ts`; end-to-end: `scripts/e2e-schedule.cjs`).

## Data model

One synced table, `scheduleItems` locally (Dexie version 29: `id, projectId, start, updatedAt`) and
`public.schedule_items` in Supabase (`supabase/migrations/20261123100900_schedule.sql`). Rows are soft-deleted like
every other job table, are included in job backups, and are part of `ProjectBundle` (`loadProject`).

| Local (`ScheduleItem`) | Column           | Type / notes                                                                 |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `id`                   | `id`             | text primary key                                                             |
| `projectId`            | `project_id`     | text → `projects.id` (cascade delete)                                        |
| `name`                 | `name`           | text, e.g. "Rough-in"                                                        |
| `phase`                | `phase`          | text or null — template key (`prewire`, `rough-in`, `trim`, `final`, …)      |
| `start`                | `start_date`     | date `YYYY-MM-DD` (renamed: `start`/`end` are SQL keywords)                  |
| `end`                  | `end_date`       | date, **inclusive**; `end_date >= start_date` is enforced                    |
| `crew`                 | `crew`           | jsonb `string[]` — team member names, same names as checklist assignees      |
| `hoursPlanned`         | `hours_planned`  | numeric or null — total crew hours for the phase                             |
| `progress`             | `progress`       | int 0–100                                                                    |
| `color`                | `color`          | text `#rrggbb` or null                                                       |
| `dependsOn`            | `depends_on`     | jsonb `[{ "id": "<item id>", "lagDays": 2 }]` — finish-to-start, lag optional |
| `sheetIds`             | `sheet_ids`      | jsonb `string[]` — plan sheets / areas the phase covers                      |
| `notes`                | `notes`          | text or null                                                                 |
| `sort`                 | `sort_order`     | int — tie-break for phases that start the same day                           |
| `workdaysOnly`         | `workdays_only`  | boolean or null; **null/missing means true** (skip Saturday and Sunday)      |
| `createdAt`/`updatedAt`/`deleted` | same, snake_case | as every synced table; `synced_at` is set by the server         |

The database stores `[]` for null `crew`, `depends_on` and `sheet_ids`. Readers (web `normalizeItem`, and a future iOS
decoder) must tolerate missing or unknown fields: treat missing lists as empty, missing `progress` as 0, missing
`workdaysOnly` as true, and drop `dependsOn` entries without an `id`.

**Access.** No money lives here, so RLS is the same as checklists: any member of the job's team reads and writes
(`is_project_member(project_id)`). The billing read-only lock (`job_write_guard`) applies. In the apps, the office
(owner/admin, or anyone working alone) creates, edits, moves and deletes phases; a technician can change only
**progress and notes**, and only on phases where they are on the crew — `canEditSchedule(role, item, me)`.

## Rules (`src/lib/schedule.ts`)

- **Days** are calendar days as strings; arithmetic is on whole UTC days so daylight saving never shifts a date.
  `addWorkdays(day, n, workdaysOnly)` skips weekends (Fri + 1 → Mon; starting on a weekend counts from it: Sat + 1 → Mon).
  `workdaysBetween(a, b)` counts both ends. `durationDays(item)` is at least 1. Holidays are out of scope.
- **Dependencies** are finish-to-start: a phase may start on the first workday after its predecessor's end, plus
  `lagDays` (in the dependent phase's own days). A dependency on a missing or deleted phase is ignored and reported by
  `validateDeps` (the UI shows a warning with "Clean up"). Cycles are reported too and the editor won't offer a
  dependency that would create one (`wouldCycle`, `allowedDeps`).
- **Cascade** (`cascade(items, changedId)`): a topological pass over the phases downstream of the change. Any phase
  that now starts too early is pushed later, keeping its duration. Phases are **never pulled earlier** automatically.
  `moveItem` (snaps off weekends in the direction of travel) and `resizeItem` (rejects end < start) both cascade and
  return every changed row; the UI saves them with one `putMany` and offers **Undo** (restores the previous rows).
- **Critical path** (`criticalPath`): the longest chain by workdays plus lags. The Gantt outlines it in red when some
  work runs alongside it (in a single chain everything is critical, so nothing is highlighted).
- **Look-ahead** (`lookahead(items, today, weeks = 3)`): phases that touch Monday of this week through the Sunday three
  weeks later, including ones already under way.
- **Crew load** (`crewLoad(itemsByJob, from, to)`): per person per day, the jobs and hours. A phase's planned hours are
  spread evenly over its working days and its crew. A day is **overbooked** at more than 8 hours or on more than one
  job (two phases of the same job on one day are fine). Names match case-insensitively.
- **% complete** (`schedulePercent`): progress weighted by planned hours when every phase has hours, else by duration.
- **Templates** (`phaseTemplates(trades)`): a default sequence per trade from the company's trades
  (`src/lib/trades.ts`). Low voltage: Pre-wire (3 d) → Rough inspection (1 d, +1 d wait) → Trim (2 d, +5 d) →
  Programming (1 d) → Final / walkthrough (1 d). `itemsFromTemplate` lays one out as a chain from a start day.
- **Calendar export** (`toIcs`): one all-day `VEVENT` per phase, `DTSTART;VALUE=DATE` and an exclusive `DTEND`
  (the day after `end`), CRLF line endings, folded at 75 octets.

## Porting to iOS (PinPlanCore)

Everything above is pure and small; mirror `schedule.ts` as `Schedule.swift` with the same function names and the
same test cases (`tests/schedule.test.ts`). Use `Int` day numbers (days since 1970-01-01, UTC) internally and convert
to/from `YYYY-MM-DD` at the edges. The sync mapping is the `scheduleItems` entry in `src/lib/syncMap.ts`.
