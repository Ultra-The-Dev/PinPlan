# Trades

PinPlan started as a low-voltage tool. Trade packs make it work for electrical, fire alarm, HVAC, plumbing, solar/EV
and general contractors too. Low voltage looks and behaves exactly as before.

## Model

**Categories: one fixed superset.** `Category` holds the original eight (`security … infrastructure`) plus
`power`, `switching`, `panels`, `fire`, `hvac`, `plumbing`, `solar`, `ev` and `general`. The database
(`device_types.category` check), the web app (`src/lib/types.ts`, `CATEGORIES` in `catalog.ts`) and the iPad app
(`Category` in `Models.swift`) share the list. No existing id changed. A pack does not add categories. It picks some
and can rename them, for example `power` → "Receptacles" and `fire` → "Life safety" in Electrical.

**Closet kinds: same idea.** `equipment | switch | rack` plus `panel`, `subpanel`, `facp`, `nac`, `airhandler`,
`condenser`, `waterheater`, `manifold` and `inverter`. Each kind has a category, which is the layer it lives on
(`closetMeta` / `Catalog.closetInfo`). The takeoff always reports the three low-voltage kinds and adds other kinds
only when they're placed, so existing fixtures and parity tests are unchanged.

**Tolerant readers.** If a client meets an id it doesn't know, it falls back instead of failing:
- Web: `categoryOf` → General; `closetMeta` → equipment look.
- iOS: a custom `init(from:)` decodes an unknown `Category` or `Layer` as `.general` and an unknown `ClosetKind` as
  `.equipment`.

Older iPad builds don't have this. Their sync silently skips any row they can't decode, so it doesn't crash, but
those builds won't see other-trade items until they update.

**Trade packs** live in `src/lib/trades.ts`. `ios/PinPlanCore/Sources/PinPlanCore/TradePacksData.swift` is
generated from that file by `tests/tradesSwift.test.ts`, and the test fails if the Swift file is stale. Regenerate
with `UPDATE_SWIFT=1 npx vitest run tests/tradesSwift.test.ts`. Each pack has:
- id, name, examples and colour
- its categories (order and names)
- its closet kinds
- run naming: Wire run / Circuit / Line run / Pipe run / Conduit run
- the closet noun
- wire, pipe or line types, with starting $/ft
- a seed catalog: letters, shapes, colours, default wire and mount, unit, and starting unit and labor prices. The
  low-voltage seed still starts at $0, as before. Electrical seeds also carry VA, breaker, volts and poles for the
  panel schedule.
- built-in checklist templates
- an AI scan hint

**Company trades.** `AppSettings.trades` is primary first; missing means `["lowvoltage"]`. It is mirrored on
`teams.trades` (text[]), so every member of the team follows the same trades. On a team, the team's value wins. Only
`saveTrades` / `chooseTrades` write it (`src/lib/useTrades.ts`). `saveSettings` keeps the stored value, so an older
settings form can't overwrite a trade change.

You choose trades at sign-up (trade cards; if none is picked, low voltage) and in Settings → Trades (web and iPad).
Turning a trade on adds that pack's catalog items, wire prices and checklists. It only adds what's missing. It never
replaces or deletes anything, and archived items come back only when the trade is newly enabled.

**What follows the trades:**
- Palette sections and names. Items from a pack the company doesn't use are hidden; the company's own types show
  when their category is enabled.
- Layer toggles, closet kinds and the inspector's cable list.
- Catalog sections. Items from other trades sit behind an "Other trades" toggle.
- Takeoff summary cards and wording, and the crew view's layers.
- Legend names and descriptions, PDF layer names, and built-in checklists.
- AI scan and plan-reader prompts. With low voltage only, the prompt text is byte-for-byte the original.

## Openings and alarm sensors

Door and Window (`gen-door`, `gen-window`) belong to the General pack but are in every company's catalog and palette
(`OPENING_TYPE_IDS`: `typeVisible` always shows them; the palette gives them an "Openings" section when the General
trade is off). They are reference counts for Find similar and alarm sensors: shown in the Takeoff (an "Openings"
summary), left off the estimate while $0 (`buildEstimate` / `EstimateBuilder`), and not counted in the Price list's
"still at $0" warning.

The low-voltage catalog's Security section has the intrusion alarm items: Door contact, Window contact, Glass-break
detector, Motion detector, Siren and Alarm keypad, on the new `22/4 alarm` cable (port prefix `ZN`, 500 ft boxes). They
are appended after the original 19 items and, unlike them, carry starting prices. `builtInAdditions` adds them and
Door / Window to catalogs saved earlier, on the device (see docs/find-similar.md, "Alarm sensors from openings").

## Electrical

A wire run that ends at a panel or subpanel is a **circuit**. `Run.circuit` is
`{ number, breakerA, volts, poles, description }` and is stored in a new `runs.circuit` jsonb column. When you draw a
circuit, it starts with the device's usual breaker, voltage and poles. Devices that share a circuit get the same
`Marker.circuit` number (new `markers.circuit` text column), set one at a time or in bulk.

**Panel schedule** (`src/lib/panelSchedule.ts`, mirrored in `PanelSchedule.swift`). For each panel, devices are
grouped by circuit number. A circuit's breaker, wire and voltage come from the circuit; if the circuit doesn't say,
they come from device defaults (marked "?"). The load is a rough VA total: 180 VA per receptacle yoke, typical
fixture watts, 5 kVA for a dryer, and so on. **Number circuits** gives the next free spaces, and a 2-pole breaker
takes n and n+2. The schedule exports as CSV or PDF and appears in the crew view (no prices). Devices on a panel with
no circuit are listed as "No circuit".

## Migration

`supabase/migrations/20261122020000_trades.sql` is idempotent. It:
- finds the generated category and kind check constraints through `pg_constraint` and replaces them with the
  superset,
- adds `runs.circuit`, `markers.circuit` and `teams.trades`.

**Run it before shipping the web or iOS build.** Until it runs:
- web sync skips the missing columns (`schemaGap`),
- a new-category catalog row would be refused by the old check,
- the iPad app sends `circuit` and stops on the missing column, as with earlier column additions.

## Follow-ups

- iOS: no panel schedule screen yet (the core and its tests are done); no circuit editor in the run inspector; team
  trades aren't read from `teams.trades`; no wire colours for the new types.
- Estimate group labels ("Cabling", "Infrastructure") and Billdu line wording are still generic. Panels are $0
  closet lines, like equipment closets.
- Product library cable list (`ProductsEditor`) still shows the low-voltage cables only.
