# Job templates and Duplicate job

Contractors set up every job the same way: the same product choices, pricing tweaks, labels, checklists and standard
extra charges. Builders' model homes repeat whole layouts. Two features cover this:

- **Job templates**: "Save as template" on a job's Job tab keeps the reusable setup (never the client, address, plans,
  devices, ticks, dates or photos). "Start from template" on the New project form applies it to a new job.
- **Duplicate job**: copies a whole job (plan sheets with their calibration, devices, runs, closets and estimate edits,
  and optionally its checklists, unticked) under a new client and address.

Code: `src/lib/jobTemplates.ts` (pure rules, tested in `tests/jobTemplates.test.ts`), `src/lib/jobTemplatesDb.ts`
(Dexie reads and writes), `src/components/templates/*` (UI), `supabase/migrations/20261123101000_job_templates.sql`.

## Who can do what

| | Owner / admin (office) | Technician |
|---|---|---|
| Save as template, rename, describe, delete, export, import | yes | no (hidden; the database refuses) |
| Duplicate job | yes | no (hidden) |
| Start a new job from a template | yes | yes, if they can create jobs. Prices and estimate lines are never applied for them, and the picker shows no prices |

Technicians' devices can read the template rows (they need them to start jobs), so the prices are in the synced
JSON. The app never shows or applies them for a technician. If that's not acceptable later, save templates without
prices: the toggle is in the Save as template sheet.

## Data model

One synced, company-level table. It isn't part of a job (`ProjectBundle`), so it isn't in a job backup, but it is in
the "Export my data" backup (`exportAllBackup`), and Settings → Job templates can export and import a JSON file.

### Local (Dexie `jobTemplates`, db version 30, key `id`, index `updatedAt`)

```ts
interface JobTemplate {
  id: string;                    // nanoid
  name: string;
  description?: string | null;
  trades?: string[] | null;      // the company's trades when it was saved ("lowvoltage", "electrical", …)
  payload: JobTemplatePayload;
  createdBy?: string | null;     // set by the database (auth user id)
  createdAt: string; updatedAt: string; deleted?: boolean;   // soft delete like every synced row
}

interface JobTemplatePayload {
  version: 1;
  project: {
    pricing?: Partial<PricingSettings> | null;   // only when saved "with prices"
    productChoices?: Record<string, string> | null; // device type id (or "wire:<cable>") -> product id
    labels?: string[] | null;
    notes?: string | null;                        // only when "Job notes" is on
    trades?: string[] | null;
  };
  checklists: { name: string; items: { text: string; requiresPhoto?: boolean; assignee?: string | null }[] }[];
  estimateLines: { key: string; description?: string | null; qty?: number | null; unit?: string | null;
                   unitPrice?: number | null; sort?: number }[];
  parts?: Record<string, unknown>;  // extension data, by registered part key (see below)
}
```

Estimate lines kept in a template: `custom:*` lines (description, qty, unit, price), and overrides of computed lines
(`dev:<typeId>`, `opt:<typeId>`, `wire:<type>`) reduced to what makes sense without the job's devices: the wording and
the price. A quantity override, a removed line or a deleted line is not kept. Without prices, `unitPrice` and
`project.pricing` are left out.

### Cloud (`public.job_templates`)

| column | type | notes |
|---|---|---|
| id | text pk | |
| team_id | uuid → teams | set by the `job_templates_scope` trigger from the signed-in user (`my_team_id()`); null when working alone |
| name | text | ≤ 200 chars |
| description | text | ≤ 2000 chars |
| trades | jsonb array | |
| payload | jsonb object, not null | ≤ 1 MB |
| created_by | uuid → auth.users | set by the trigger (`auth.uid()`); kept on update |
| created_at, updated_at, deleted | | as every synced table |
| synced_at | timestamptz | `set_synced_at` trigger + index (pull watermark) |

RLS: team members select (`team_id = my_team_id()`); owner/admin insert, update and delete. A solo user (no team)
owns their own templates (`team_id is null and created_by = auth.uid()`); when they create or join a team, their
template moves to it on its next save. The `job_write_guard` trigger makes templates read-only while the team's
subscription has lapsed (the owner is the team's owner, or the author without a team).

Sync: `TABLES.jobTemplates` in `src/lib/syncMap.ts` (last in `PUSH_ORDER`). The app never sends `team_id`; a
`createdBy` that isn't a uuid is sent as null. A technician's device drops queued template writes instead of
pushing them (like estimate lines).

### For the iPad app

- Decode `payload` tolerantly: unknown keys are ignored, missing arrays mean empty, `version` > 1 means "made by a
  newer app" (don't apply), missing `version` means 1.
- Unknown `parts` keys are ignored with a warning (`validateTemplate` in `jobTemplates.ts` is the reference).
- Applying: new ids for everything, checklist items `done = false`, custom estimate lines get a new `custom:<id>` key,
  computed keys stay. Skip product choices whose product or device type no longer exists, and estimate lines for
  device types that no longer exist, and list them to the user. Labels are merged; notes are appended.

## Duplicate job

`duplicateJob(bundle, opts, newId, now)` gives every copied row a new id and remaps every reference:
`marker.sheetId`, `marker.closetId`, `run.sheetId`, `run.markerId`, `run.closetId`, `closet.sheetId`. Estimate line
keys stay (they key by device type). Device labels (CAM-1-03), `pxPerFt` / `pxPerInch` / `scaleLabel` stay. The new job
starts as an estimate with no Billdu links, no location and the new client details.

Never copied: photos (and `marker.photoId`), photo comments, daily logs, documents, quotes/invoices/credit notes and
payments, proposals, Billdu links. Deleted rows are never copied. Checklists are copied unticked (no done-by, dates,
notes, photos; assignees kept) or left out.

Plan images: the local `images` table is plain content storage (not owned by a job, and deleting a job doesn't delete
images), but cloud storage keeps files at `<project id>/<image id>` and only members of that job can read them, and
sync uploads/downloads by the sheet's own job. So the copy gets its own image rows (`saveImage`, new ids), which upload
under the new job. A sheet whose image isn't on this device keeps the original image id.

Writes go parents first (project, sheets, closets, markers, runs, estimate lines, checklists) through `putMany` in
chunks of 200, with a progress bar.

## Registry: template parts for other features

```ts
import { registerTemplatePart } from "@/lib/jobTemplates";

registerTemplatePart({
  key: "forms",                              // unique; "checklists" and "estimate" are built in
  label: "Forms",
  capture: (bundle, opts) => ({ … }),        // JSON-safe data, or undefined to save nothing
  apply: async (data, ctx) => {              // ctx: project, now, newId, includePrices, warnings, write(table, rows)
    await ctx.write("someTable", rows);
  },
});
```

Register at module load of the feature (import it once somewhere that's loaded before templates are saved or
applied). Captured data lives under `payload.parts[key]`. A template with a part this app version doesn't know keeps
working: the part is skipped with a warning. A part that throws while capturing is left out; one that throws while
applying adds a warning and the rest still applies.
