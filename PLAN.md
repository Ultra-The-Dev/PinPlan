# Floor Plan Device Mapper — Build Plan

_Source: "Floor Plan Device Mapper — Build Plan for Claude Code" (Nov 11, 2026). Condensed here as the project's reference spec._

## Overview
A tablet-first web app where a low-voltage / smart-home installer uploads a client's floor plans, taps to place every
device (cameras, Wi-Fi APs, speakers, TVs, LED runs, shades, closets), gets an automatic count and linear-foot takeoff per
floor, and turns that takeoff into a priced estimate that is pushed to Billdu as an invoice.

- **Users:** the installer and their team, on an iPad at the job site or a laptop in the office.
- **Problem:** plans are marked by hand, counted by hand and retyped into an invoice; the marked paper isn't shared with the crew.
- **Done means:** load the 4-page plan set for 20 Hilltop Dr E, place every device, reproduce the hand counts below, then create the matching invoice in Billdu in one click.

## 20 Hilltop Dr E hand counts (read from handwriting — confirm before relying on them)

| Floor | Indoor cams | Outdoor cams | Speakers | TVs | SH | VS | Wi-Fi APs | LED zones | LED total |
|---|---|---|---|---|---|---|---|---|---|
| Attic | 3 | 0 | 0 | 1 | 1 | 0 | 1 | 3 | 48 LF |
| 1st Fl | 3 | 9 | 2 (both marked ?) | 1 | 0 | 0 | 2 | 9 | 305 LF |
| 2nd Fl | 4 | 0 | 2 | 1 | 1 | 1 | 0 (one circled M) | 16 | 520 LF |
| Cellar | 3 | 0 | 0 (several circled S drawn) | 1 | 1 | 1 | 1 | 8 | not written |

Other marks: red `S21,22,23` switch labels tied to LED zones; red `LF` run lengths; a green "AV Equipment" closet in the
Cellar (home runs go there); `?` symbols need a **tentative** state.

Voice-note requirements: mark every floor incl. basement (indoor/outdoor cameras, iPads/monitors for cameras, speakers,
TVs, cabinet/ceiling LED); pick devices from a menu and tap to place; automatic totals incl. per-step stair LED; motorized
curtains needing LV wire, equipment closet, switch closet; turn quantities into a client estimate and use the same plan to
show the crew where wire goes and which type.

## Flow
Upload plans → (optional) AI scan assist → place devices → takeoff totals → client estimate → Billdu order/invoice;
takeoff also → crew wiring sheets. **Every count, estimate line and Billdu document comes only from markers the user placed or confirmed.**

## Plan import & markers
- PDF (multi-page, rendered with PDF.js) and photos (JPG/PNG/HEIC) with auto-straighten (OpenCV.js) + manual 4-corner adjust.
- Each page = a sheet (one per floor); name from the title block, editable.
- Scale: draw a line over a known dimension, or type the plan scale (e.g. 1/4" = 1'-0"). Without scale, LED runs use typed LF.
- Palette grouped by category; tap palette, tap plan. Drag to move, long-press to edit/delete.
- Marker: type, room, auto label (e.g. CAM-1-03), mount, wire type, notes, photo, tentative flag.
- Line tools: LED runs (zone, switch, LF), stair LED (steps × LF/step), wire runs device → closet.
- Closets: equipment, switch, network rack; every device can be assigned a home-run closet.
- Layer toggles per trade; undo/redo; offline with sync.
- AI scan assist: Claude vision returns JSON (floor name, LED callouts, hand-drawn symbols); shown as ghost markers the user accepts/moves/rejects. AI never writes counts.

## Billdu
API key + secret (Settings → API in Billdu, owner only), stored server-side only. Resources: clients, products, documents
(order/invoice/estimate…). Catalog → Products; estimate → Order/Estimate or Invoice with the same lines and the project
address; save Billdu IDs to prevent duplicates; deposit/progress invoices by %; CSV + PDF fallback if the API fails.

## Stack
Next.js (App Router) + React + TypeScript + Tailwind, PWA · react-konva + PDF.js · OpenCV.js · Supabase (Postgres, auth,
storage, RLS) · IndexedDB cache + sync queue · Anthropic API from a server route · @react-pdf/renderer · Billdu via server routes · Vercel.

## Data model
projects, sheets, device_types (catalog), markers (x,y 0–1 relative), runs (LED / stair / wire), closets, estimate_lines (overrides).

## Starting catalog
| Category | Device types | Unit | Typical wire |
|---|---|---|---|
| Security | Indoor camera, outdoor camera, camera monitor / iPad display (VS) | each | Cat6 |
| Network | Wi-Fi access point, network rack, switch | each | Cat6 |
| Audio/Video | In-ceiling speaker, TV location | each | 16/4 speaker; HDMI + Cat6 |
| Smart home | SH (smart-home control point), keypad | each | Cat6 |
| Lighting | LED strip (ceiling moulding, furniture, cabinet, bench, bed backlit), stair-step LED, LED zone/driver | LF; each | 18/2 or LV per driver |
| Shades | Motorized curtain / shade | each | LV per manufacturer |
| Infrastructure | Equipment closet, switch closet | each | — |

## Phases
1. Setup (Next.js, Supabase, migrations, CLAUDE.md) · 2. Projects & plan import · 3. Catalog & markers · 4. LED runs, closets & wiring ·
5. Takeoff totals & exports (+ automated test with the 20 Hilltop counts) · 6. Estimate & Billdu · 7. AI scan assist.

## Open questions (still to answer)
- What do SH, VS and the circled M (2nd Fl) stand for? (Assumed: SH = smart-home control point, VS = video screen for cameras; M = motorized shade.)
- Should circled S marks count as speakers? (Cellar and 1st Fl have more circled S than the written totals.)
- Is the Attic note "Setup LED 60" a 60 LF run?
- Unit prices, labor rates and markup.
- Billdu: first document Order/Estimate or straight to Invoice? Who owns the Billdu account?
- iPad only or iPhone too? Simultaneous editing by several people?
- Should the crew see prices? (Built: crew view has no prices.)
