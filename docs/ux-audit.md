# Usability audit (November 2026) — what to simplify

Hands-on walkthrough of the web app as a new owner (electrical), a technician on a phone and an office admin,
on phone / iPad / desktop. Each screen is well built; the problem is **structure**: too many top-level places,
the same concept under 3–4 names, two disconnected money systems, and icon-only navigation on small screens.
This is the brief for the simplification pass. Principle: **simple by default, power when you go looking for it.**

## Top changes, by impact

1. **One money flow.** The client proposal *is* the quote. When the client approves, mark the quote Approved and
   show one button: "Bill the deposit ($X)". No re-creating a quote the client already approved. Billdu wording only
   when Billdu is connected. (`ProposalPanel.tsx`, `documents/DocumentsTab.tsx`, `documents/DocDialogs.tsx`, `EstimateTab.tsx`)
2. **Job tabs 9 → 5, always labelled**: Overview · Plan · Takeoff · Money · Field (bottom tab bar with labels on phone).
3. **One name per concept** (glossary below).
4. **Billdu only when connected**; move to Settings → Connected apps; no developer env-var errors shown to users.
5. **"Sent" only when actually sent**: "Get client link" / status "Ready to send"; "Issue" → "Finalize" (hint: gives it a
   number and locks prices); hide "Email to client" when email isn't set up.
6. **Header 8 → 4**: Jobs · Tasks · Money (office) · Price list (office) + account menu. Map becomes a List | Map toggle on Jobs;
   Photos becomes a job filter / recent-photos view; Catalog + Products merge into Price list.
7. **Settings on phone**: section list → each section its own page, autosave, Sign out at top of Account; merge duplicates
   (currency, tax, deposit %, terms live in one place each).
8. **Field tab**: labelled sub-tabs (Checklists · Daily log · Files · History); a "Today" card for technicians
   (My tasks · Take photo · Write today's log).
9. **Tasks**: team-member picker (no free text), "Assign" label, office view defaults to Everyone sorted overdue first,
   "+ Add task" on Tasks page and job, plain empty state.
10. **Money screens**: total + "Send to client" first (sticky on phone), pricing knobs under "Adjust pricing"; invoice dialog
    "Deposit · Remaining balance · Custom amount" (+ More options); Invoices page: Outstanding/Overdue cards then the list,
    aging collapsed, filters Unpaid/Overdue/Paid/Drafts/All.
11. **Trade-aware copy everywhere** (examples, stats, default photo tags, placeholders) from the primary trade.
12. **Plan editor**: tool labels on tablet / long-press tooltips on phone; open the last-used sheet or the first with devices;
    "Done placing" chip; one search box; "Room (for the next devices you place)".
13. **Plain words** in the device panel and takeoff ("Optional (client can add it)", "Panel it runs to",
    "Counts come from the devices and wire you've drawn"); Crew → "Wiring", under Takeoff.
14. **One client page per job** listing the plan review, quote and invoices.
15. **Sheets**: drop misleading "Floor N" chip, sort by floor, after upload: "4 floors added. Next: open 1st Fl and place devices".

## Navigation

- Header: **Jobs** (with a "Needs attention" strip: overdue tasks, unpaid invoices, quotes waiting) · **Tasks** · **Money** (office)
  · **Price list** (office) · account menu (Settings, Team, Plan & billing, Sign out; sync status shown only when offline/failing).
- Phone bottom bar: technician Jobs · Tasks · Photos · Me; office Jobs · Tasks · Money · Me.
- Job tabs: **Overview** (default: health, next step, details) · **Plan** (+ manage sheets) · **Takeoff** (+ wiring) ·
  **Tasks** · **Photos** · **Money** (office) · **Field** (today, checklists, daily log, files, history). Tasks and
  Photos got their own tabs later (docs/navigation.md): the plan is for devices.
- Settings: Company · Pricing & wire · Quotes & invoices · Checklists · Team · Connected apps · Plan & billing · Account.
  Technicians see only Company (read-only), Team, Account.

## Glossary — one name per concept

| Use | Not |
|---|---|
| Job | Project |
| Plan / floor | Sheet, plan set, Floor N |
| Device | Marker, symbol, item |
| Wire run (to panel) | Run, home run |
| Takeoff ("Device and wire count") | — |
| Pricing (internal numbers) | Estimate tab |
| Quote (what the client approves) | Estimate, Proposal |
| Approve / Approved | Accept / Accepted |
| Invoice, Payment | — |
| Money | Billing, Invoices |
| Plan & billing (the PinPlan subscription) | Billing |
| Price list | Catalog + Products |
| Brand & model | Product |
| Optional item | Tentative, "?" |
| Get client link / Send to client | Publish, Issue |
| Finalize | Issue |
| Ready to send | Sent (before it's shared) |
| Task (one kind everywhere: from the plan, a photo comment, a form, a checklist item or a device issue) | Punch item, punch list item, assigned checklist item |
| Wiring sheets | Crew |
| Technician / Office | Tech / admin |
| Unpaid / Overdue | A/R aging, Balance due |

## Quick wins

- "Turn the estimate into a estimate" typo (`DocumentsTab.tsx`).
- Explain disabled buttons (first-run Save needs phone; client Approve needs signature + box; 24px checkbox).
- 44px tap targets for checklist rows and photo tag chips; "Take photo" as the primary button on phone; filters behind "Filter".
- "‹ Jobs" back link in the job header; technicians don't see New job / Restore backup.
- Geocode the job address so the map isn't empty.
- Job health: "Quote approved · $X of $Y billed" (not "Not in Billdu"); "Left to bill" on Money.
- Record payment button in the invoice header once finalized.
- Client proposal headings: "Price" / "Work included".
- React hydration warning (#418) on /tasks and /invoices (date formatting).

## Done: Field and Tasks (launch pass)

- Field opens on **Today** for technicians (Tasks for the office): my tasks overdue / due today with big ticks, this
  week's phases, Take photo, today's daily log (Start / Continue / Signed), open checklists and draft forms. The same
  card sits on top of /tasks across jobs.
- Field sections, labelled at every width and kept in the address (`&section=`): Today · Tasks · Checklists & forms ·
  Daily log · Photos · Files · More (RFIs, Schedule, Install progress, History).
- One task model: "Make task" on a photo comment, a checklist item or a form's "No" answers, and "Create task for this"
  on a device set to Issue, all make the same task. Older items assigned on a checklist still show on /tasks
  (read-only, linking to the item). "Mine" matches every name the person goes by (device name, team name, email).
- /tasks: "+ Add task", technicians default to Mine, the office to Everyone (overdue first); a Crew link to the board.
- Task list: Mine and Overdue chips, everything else behind "Filter", sorted by due date. Checklist ticks are 44px with
  an Undo bar.
- Daily log keeps a draft on the device while you type, warns before leaving, shows "Draft", and offers
  "Continue today's log" instead of starting a second one. Work and delivery examples follow the primary trade.
