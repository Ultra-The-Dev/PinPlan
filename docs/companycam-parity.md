# CompanyCam feature analysis → PinPlan

CompanyCam is a photo-first job documentation app for contractors. This is its feature set, grouped the way it presents
them, and where each one lives in PinPlan (web app + iPad/iPhone app). PinPlan keeps its own core — plans, device
takeoff, estimate, Billdu — and adds CompanyCam's field documentation around it, tied to the same jobs and devices.

Legend: ✅ in both apps · 🌐 web only · 📱 iPad/iPhone only · ➖ not added (reason given)

## 1. Photo capture & organisation

| CompanyCam | PinPlan | Where |
|---|---|---|
| Unlimited photos per project, from camera or library | ✅ | Job → **Photos** tab (web: Take photo / Add photos / drag & drop; iPad: camera or library) |
| Auto time + GPS stamp, who took it | ✅ EXIF time/GPS kept from library photos; device location for new ones (toggle) | `src/lib/photos.ts`, `src/lib/exif.ts`, `ios/PinPlan/Field/FieldSupport.swift` |
| Photos organised by project, grouped by day | ✅ | Photos tab (day headers, "Select day") |
| Tags (and filter by tag) | ✅ suggested + custom tags, multi-tag filter, bulk tag | Photos tab |
| Filter by user / search captions | ✅ | Photos tab |
| Captions / descriptions | ✅ | Photo viewer |
| Company-wide photo feed across all jobs | ✅ | Web: header → **Photos** (`/photos`); iPad: Projects → **All photos** |
| Project cover photo | ✅ falls back to the newest photo when a job has no plan | Jobs list |
| Video / voice notes | ➖ large uploads on Supabase's free tier; photos + comments cover the need |

## 2. Photo mark-up

| CompanyCam | PinPlan | Where |
|---|---|---|
| Draw: arrows, freehand, shapes, text, colours | ✅ arrow, draw, box, circle, text; 6 colours, 3 widths, undo, clear | Viewer → **Mark up** |
| Non-destructive (original kept) | ✅ shapes stored separately, relative 0–1 coords, same on both apps | `PhotoShape` in `types.ts` / `FieldDocs.swift` |
| Export / share the marked-up photo | ✅ | Viewer → Save with mark-up (web) / Share (iPad) |
| Photos pinned to a spot on the plan (PinPlan extra) | ✅ devices with site photos show a camera badge on the plan; the device panel lists them and adds more | Plan → tap a device |
| Before & after comparison | ✅ link an "after" to its "before", side-by-side compare | Viewer |

## 3. Collaboration

| CompanyCam | PinPlan | Where |
|---|---|---|
| Comments on photos | ✅ | Viewer → Comments |
| Team members on projects | ✅ (already existed: team access via Supabase membership) | Settings → Account |
| Activity timeline / project feed | ✅ photos, comments, checklist items, logs, documents, Billdu docs | Job → **Field → Timeline** |
| @mentions / push notifications | ➖ needs a push service; the timeline shows who did what |

## 4. Checklists

| CompanyCam | PinPlan | Where |
|---|---|---|
| Checklist templates | ✅ Pre-wire walkthrough, Trim-out, Equipment rack, Final walkthrough & handoff (+ blank) | Field → Checklists |
| Require a photo on an item | ✅ item isn't complete until it has one (amber warning if ticked without) | Checklist item camera button |
| Who completed what, when | ✅ | Item subtitle + timeline |
| Tasks / punch list: assign to a person, due date | ✅ any item can be assigned and dated; **Punch list** template | Item person icon (web) / swipe or long-press (iPad) |
| "My tasks" across all jobs (overdue / today / next 7 days / later) | ✅ tick done right from the list | Web: header → **Tasks**; iPad: Projects → **Tasks** |

## 5. Daily logs & documents

| CompanyCam | PinPlan | Where |
|---|---|---|
| Daily logs with that day's photos | ✅ | Field → Daily logs |
| AI-written daily log from photos | ✅ "Draft from photos" (Claude via the server) | `/api/photos/summary` |
| Documents/files on a project | ✅ any file up to 25 MB, synced | Field → Documents |

## 6. Reports & sharing

| CompanyCam | PinPlan | Where |
|---|---|---|
| Branded photo report PDF | ✅ 1/2/4 per page, logo, captions, mark-up, before/after labels | Photos → Photo report |
| Shareable report link for the client | ✅ `/r?t=…`, no login | Photo report → Share link |
| Showcase / client gallery | ✅ the report link and plan review link |
| Plan review for the client (PinPlan extra) | ✅ plans + legend, no prices; client approves or requests changes | Takeoff → Plan review / Send plan to client |

## 7. AI

| CompanyCam | PinPlan | Where |
|---|---|---|
| AI photo captions & tags | ✅ caption, tags, and an "AI check" comment for visible issues | Viewer → AI caption (`/api/photos/describe`) |
| AI summaries | ✅ daily log draft | Daily logs |

## 8. Projects & map

| CompanyCam | PinPlan | Where |
|---|---|---|
| Project labels / status filters | ✅ labels (suggested + custom), label filter on the jobs list | Job tab; jobs list |
| Map of all projects | ✅ coloured by status (web: Leaflet/OpenStreetMap; iPad: Apple Maps) | Web: header → **Map**; iPad: Projects → **Jobs map** |
| Project location | ✅ from first GPS photo, "use my location", or a photo's location | Job tab |

## 9. Platform

| CompanyCam | PinPlan | Where |
|---|---|---|
| Works offline, syncs later | ✅ local-first (IndexedDB / on-device files), Supabase sync of rows + photo/document files | `sync.ts`, `CloudSync.swift` |
| Web + mobile apps | ✅ web (Next.js) + native SwiftUI iPad/iPhone |
| Integrations (CRM, invoicing) | ✅ Billdu (existing) |

## Verification

- Web: unit tests (`tests/fieldDocs.test.ts`, `exif.test.ts`, `photoAi.test.ts`, `proposal.test.ts`, `schema.test.ts`, `syncMap.test.ts`),
  Playwright runs of upload → mark-up → tags → comments → report PDF → share link → client page, checklists, logs, feed and map;
  share links tested against a real local Supabase (RLS, storage, `get_photo_report`).
- Database: `supabase/tests/rls_test.sql` covers photos/team/outsider access and the report link.
- iOS: core logic tests in `PinPlanCore` (Linux + CI); app built in CI; the **iOS screenshots** workflow launches the demo job
  (which includes sample site photos, a checklist and a daily log) on iPhone and iPad simulators and captures Photos, the viewer,
  mark-up, photo report, checklists, a checklist, daily logs, timeline, plan review, the all-photos feed and the jobs map.
