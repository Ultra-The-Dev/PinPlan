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

`/project?id=…&tab=…` with five tabs, always labelled (a bottom tab bar on phones): **Overview · Plan · Takeoff ·
Money (office) · Field**. The office opens a job on Overview; technicians open it on Field (`section=today`).
Every tab but the plan is lazy-loaded.

| Tab | Sub-views (query params) |
| --- | --- |
| `overview` | Job health and next step, install progress, details; labels, templates and backup under **More** |
| `plan` | `manage=1` opens the **Manage sheets** drawer (`ManageSheetsDrawer` in `SheetsTab.tsx`) |
| `takeoff` | `view=wiring` shows **Wiring sheets** (the old Crew tab) |
| `money` | `step=pricing \| quote \| changes \| invoices` (`money/MoneyTab.tsx`); `doc=` opens a document |
| `field` | `section=…` (checklists, logs, tasks, schedule, …); `section=photos` shows the job's photos |

Old `?tab=` values keep working: `src/lib/tabRoutes.ts` maps them and the page rewrites the URL.

| Old | New |
| --- | --- |
| `sheets` | `plan&manage=1` |
| `photos` | `field&section=photos` |
| `estimate` | `money&step=pricing` |
| `billing` | `money&step=quote` |
| `changes` | `money&step=changes` |
| `crew` | `takeoff&view=wiring` |
| `info` | `overview` |

Technicians asking for Money (or an old money tab) land on their default tab. `tests/tabRoutes.test.ts` checks every
`?tab=` written in `src/` resolves to a real tab. To move between tabs from inside the job use `useJobNav()`
(`src/components/nav/useJobNav.ts`): `setTab`, `setParam`, `openManageSheets`.

## Settings

Sections: Company · Team · Plan & billing · Quotes & invoices (office) · Connected apps (office) · Templates · More.
Older anchors (`#trades`, `#business`, `#pricing`, `#wire`, `#invoicing`, `#billdu`, `#checklists`, `#forms`, `#team`,
`#billing`, `#account`) still land on their card. Other connected apps render in the Connected apps section through
`SettingsForm`'s `connectedApps` slot.
