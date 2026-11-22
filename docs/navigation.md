# Web navigation

The marketing site and the app are separate: `/` is always the public home page (signed in or not; `/welcome` is its
old address), and the app starts at **`/jobs`** (the jobs list). In-app links, sign-in, emails and the installed
app's start page go to `/jobs`; the public header shows **Open the app** when signed in.

The simplified navigation from `docs/ux-audit.md` (items 2 and 6).

## Header

**Jobs** (`/`) · **Tasks** (`/tasks`) · **Money** (`/invoices`, office) · **Price list** (`/catalog`, office) and the
avatar **account menu** (Settings, Team, Plan & billing, Help & tutorials, Sign out; Help is `/help`, docs/help-and-tours.md). Labels show at every width (under the icon on
phones). `src/components/AppHeader.tsx`, `src/components/AccountMenu.tsx`.

Older pages still work and light up the section they belong to:

| Page | Now part of |
| --- | --- |
| `/map` | Jobs → List \| Map toggle (`nav/JobsViewToggle.tsx`) |
| `/photos` | Jobs → Recent photos |
| `/schedule` | Tasks (crew board) |
| `/products` | Price list → Products (`nav/PriceListNav.tsx`) |

## Job tabs

`/project?id=…&tab=…` with seven tabs, always labelled: **Overview · Plan · Takeoff · Tasks · Photos · Money (office) ·
Field**. The office opens a job on Overview; technicians open it on Field (`section=today`). Every tab but the plan
is lazy-loaded.

The plan is for devices. Tasks and photos have tabs of their own (the owner: "creating tasks on the same sheet as
pinning devices creates a lot of conflict… the plan shows you where things are, and if you click on it, it takes
you to the picture"):

- **Plan** shows devices. Task pins and the camera badges on devices with photos are layers, **off by default**:
  Layers → Show on plan → *Task pins* / *Photos* (`useTasks.showPins`, `usePhotoPins` in
  `src/components/photos/photoPinsUi.ts`). The plan rail's Tasks button (filters, this sheet's tasks) shows only
  while task pins are on. There is no "+ Task" on the plan (and no Shift T): tasks are made in the Tasks tab. Placing
  an existing task on the plan (task → *Show on plan* / *Place on plan*) still works and switches the pins on.
  Install progress colours are unchanged.
- **Device card → photos / tasks**: a selected device's card (`Inspector`, `DeviceLinks`) shows **N photos** and
  **N tasks** when it has any. One tap opens the Photos tab filtered to that device (`&device=<marker id>`), or the
  task itself (`&task=<id>`; several tasks open the Tasks tab filtered to the device, `&tf=dv:<marker id>`).
- **Tasks** (`tasks/TasksTab.tsx` → `TaskList`): the task board that was Field → Tasks, unchanged, plus a device
  filter chip. **Add task** opens a simple form; where it is (a sheet, and optionally a device picked from a list)
  is a field of that form. Picking a device puts the task at the device.
- **Phones**: the job header gives the job name up to two lines (client and status on the small line under it, the
  back link is the chevron alone). Tasks shows Mine · Overdue · Filter in one row; the status counts and the sort
  are in the Filter sheet. Photos keeps search, dates, people and tags behind Filter so the photos are on the first
  screen. `/tasks` Everyone includes unassigned tasks, and an **Unassigned** chip shows only those.
- **Photos** (`photos/PhotosTab.tsx`): the gallery that was Field → Photos. `&device=` narrows it to one device
  (a chip clears it) and photos added while it's set are linked to that device; `&photo=` opens one.

| Tab | Sub-views (query params) |
| --- | --- |
| `overview` | Job health and next step (each number opens what it counts: **Open tasks** is the Tasks tab's open tasks, `openTaskCounts`), install progress, details; labels, templates and backup under **More** |
| `plan` | `manage=1` opens the **Manage sheets** drawer (`ManageSheetsDrawer` in `SheetsTab.tsx`) |
| `takeoff` | `view=wiring` shows **Wiring sheets** (the old Crew tab) |
| `tasks` | `tf=` the list's filter (`encodeTaskFilter`; `dv:` = one device), `task=` opens a task |
| `photos` | `device=` one device's photos, `photo=` opens a photo |
| `money` | `step=pricing \| quote \| changes \| invoices` (`money/MoneyTab.tsx`); `doc=` opens a document |
| `field` | `section=today \| checklists \| forms \| logs \| files \| rfis \| schedule \| progress \| timeline` |

### Where the tabs are

| Screen | Office | Technician |
| --- | --- | --- |
| Desktop, iPad (header strip; tablets in portrait give it its own row) | Overview · Plan · Takeoff · Tasks · Photos · Money · Field | the same without Money |
| Phone (bottom bar, `JobTabBar`) | Plan · Tasks · Photos · Money · **More** (Overview, Takeoff, Field) | Plan · Tasks · Photos · Field · **More** (Overview, Takeoff) |

The phone bar is `phoneTabs(office)` in `src/lib/tabRoutes.ts`: the three things done on site every day, then Money
for the office or Field for technicians, and More for the rest (a small menu; More is lit while one of its tabs is
open). The iPad/iPhone app has the same tabs (`ProjectTab` in `ios/PinPlan/Views/ProjectView.swift`; the
iPhone tab bar is Plan · Tasks · Photos · Money · More, technicians Plan · Tasks · Photos · Field · More).

### Old links

Old `?tab=` values keep working: `src/lib/tabRoutes.ts` maps them and the page rewrites the URL.

| Old | New |
| --- | --- |
| `sheets` | `plan&manage=1` |
| `field&section=tasks` (and `field` with `task=` or `tf=` but no section, the old My Tasks links) | `tasks` (other params kept) |
| `field&section=photos` | `photos` (other params kept) |
| `estimate` | `money&step=pricing` |
| `billing` | `money&step=quote` |
| `changes` | `money&step=changes` |
| `crew` | `takeoff&view=wiring` |
| `info` | `overview` |

`photos` was an old id for Field → Photos; it is a tab again. Technicians asking for Money (or an old money tab) land
on their default tab. `tests/tabRoutes.test.ts` checks every `?tab=` written in `src/` resolves to a real tab. To move
between tabs from inside the job use `useJobNav()` (`src/components/nav/useJobNav.ts`): `setTab`, `setParam`,
`openManageSheets`. Links from the iPad/iPhone app to the web use `WebLinks` (`ios/PinPlanCore`), which knows the
seven tabs.

## Settings

Sections: Company · Team · Plan & billing · Quotes & invoices (office) · Connected apps (office) · Templates · More.
Older anchors (`#trades`, `#business`, `#pricing`, `#wire`, `#invoicing`, `#billdu`, `#checklists`, `#forms`, `#team`,
`#billing`, `#account`) still land on their card. Other connected apps render in the Connected apps section through
`SettingsForm`'s `connectedApps` slot.
