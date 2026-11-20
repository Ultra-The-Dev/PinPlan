# Backups and restore

PinPlan's server data lives in Supabase: the **Postgres database** (accounts, teams, jobs, markers, estimates, photos
metadata, proposals, error reports) and **Storage** (plan sheet and photo images in the private `plans` bucket, proposal and
report images in the public `proposals` bucket). Devices also keep their own copy in IndexedDB / on iOS, but that is not a
backup you control.

> Keep connection strings and keys in a password manager or your CI secrets store. Never paste them into chat, tickets
> or commits. The commands below read them from environment variables you set in your own shell.

## What Supabase does for you

| Plan / add-on | What you get |
| --- | --- |
| Pro | Daily logical backups, kept 7 days (Database → Backups). Restore replaces the whole project database. |
| PITR add-on | Restore to any second within the retention window (7, 14 or 28 days). **Recommended for production.** |
| Storage | **Not** included in database backups. Objects are durable (S3) but deletions are not undoable → back them up yourself. |

Restoring a Supabase backup rolls the **entire** database back, losing later writes from every customer. For a single
customer's mistake, restore into a scratch project and copy just their rows (see below).

## Your own off-site backups (recommended weekly + before risky migrations)

### Database

```bash
# Connection string: Supabase → Project Settings → Database → Connection string (URI, session pooler or direct).
# Export it in your shell first, e.g. from your password manager:  export SUPABASE_DB_URL='postgresql://…'
supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql                 # roles excluded, schema only
supabase db dump --db-url "$SUPABASE_DB_URL" -f data.sql --data-only --use-copy
supabase db dump --db-url "$SUPABASE_DB_URL" -f roles.sql --role-only
# or plain pg_dump (custom format, compressed, restorable table-by-table):
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage -f pinplan-$(date +%F).dump
```

`auth` holds users (password hashes) and `storage.objects` holds file metadata — include them for a full restore.

### Storage

```bash
# Uses the S3-compatible endpoint: Storage → Settings → S3 access keys (create keys just for backups; read-only if possible).
export AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…   # from your password manager
EP="https://<project-ref>.supabase.co/storage/v1/s3"
aws s3 sync s3://plans     ./backup/plans     --endpoint-url "$EP" --region <project-region>
aws s3 sync s3://proposals ./backup/proposals --endpoint-url "$EP" --region <project-region>
```

### Where to run them — never from this repository

This repository is **public**. Its Actions logs, caches and artifacts can be seen or downloaded by others, and a
workflow here could be changed by a pull request. So:

- Run backups only from a **private** repository (or a private self-hosted runner / a machine you control) whose only
  job is backups. Give it read-only credentials made just for backups, stored as that private repo's secrets.
- **Never upload a dump or a storage copy as a workflow artifact** (`actions/upload-artifact`), never cache it, and never
  print it to the log. Write it to the runner's disk, encrypt it there, upload the encrypted file, delete the plain one.
- Encrypt before anything leaves the machine: `pg_dump … | age -r "$BACKUP_AGE_PUBLIC_KEY" > pinplan-$(date +%F).dump.age`
  (the public key can live in the workflow; the private key stays offline in your password manager), and the same for a
  `tar` of the storage sync folder.

Sketch of the private job (weekly, plus by hand before a risky migration):

```bash
set -euo pipefail
umask 077
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage | age -r "$BACKUP_AGE_PUBLIC_KEY" > "db-$(date +%F).dump.age"
aws s3 sync s3://plans     ./plans     --endpoint-url "$SUPABASE_S3_ENDPOINT" --region "$SUPABASE_REGION"
aws s3 sync s3://proposals ./proposals --endpoint-url "$SUPABASE_S3_ENDPOINT" --region "$SUPABASE_REGION"
tar -cf - plans proposals | age -r "$BACKUP_AGE_PUBLIC_KEY" > "storage-$(date +%F).tar.age"
rm -rf plans proposals
# upload the two .age files to the off-site bucket (different provider/account), then delete them locally
```

### Where to keep them

- Storage in a different provider/account (S3 with versioning + object lock, B2…), reachable only with the backup job's
  write-only key.
- Keep at least 4 weekly + 3 monthly copies; delete older ones so deleted customer data really goes away (match the
  retention promise in the Privacy Policy).

## Restore

### Whole project (disaster)

1. Supabase → Database → Backups → choose a daily backup or PITR timestamp → Restore. The project is unavailable during restore.
2. If the project is gone, create a new one, then:
   ```bash
   psql "$NEW_DB_URL" -f roles.sql
   psql "$NEW_DB_URL" -f schema.sql
   psql "$NEW_DB_URL" -f data.sql
   # or: pg_restore --no-owner --no-privileges -d "$NEW_DB_URL" pinplan-YYYY-MM-DD.dump
   aws s3 sync ./backup/plans s3://plans --endpoint-url "$NEW_EP" --region <region>   # recreate buckets first
   aws s3 sync ./backup/proposals s3://proposals --endpoint-url "$NEW_EP" --region <region>
   ```
3. Re-run `supabase/migrations/*.sql` (all are safe to re-run) so functions, policies and grants are current.
4. Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel and redeploy
   (the CSP picks up the new Supabase origin at build time). Update Auth URL configuration and SMTP in the new project.
5. Check `/api/health` and `/admin`, sign in on a device, confirm a job syncs.

### One customer's data (e.g. a deleted job)

1. Restore the backup (or PITR point) into a **separate scratch project** — never over production.
2. Find the rows: `select id from projects where owner_id = '<user id>' and …`; related tables key on `project_id`
   (`sheets`, `markers`, `runs`, `closets`, `estimate_lines`, `photos`, `checklists`, `job_logs`, `job_documents`, …).
3. Copy them across with `pg_dump --data-only --table=… --where`-style exports or `\copy (select …) to …` / `\copy … from …`,
   and copy matching `plans/<project_id>/…` objects. Set `deleted = false` if the job was soft-deleted.
4. Devices pick the job up on their next sync.

A customer can also restore a single job themselves from a **Download backup** file (Projects → Restore backup).

## Customers' own copy

Owners and admins can take everything themselves, any time, from **Settings › Account › Download all my data** — also
offline and while the account is read-only (trial over or payment failed). It is one `.zip` built on their device
(`src/lib/accountExport.ts`): a backup file per job (restorable with Restore backup), every quote, invoice, credit note
and payment (also ones not tied to a job) as JSON and as CSV, the price list as CSV, products, job templates, company
settings and the team list. Point customers who are leaving, or who ask for "all my data", there first.

## Knowing something is wrong

- `GET /api/health` answers **503** when the database is unreachable, when the database is missing migrations the code
  needs (`schema: "behind"`; it compares `public.schema_version()` with `REQUIRED_SCHEMA_VERSION` in
  `src/lib/server/envCheck.ts`), or — on the production deployment — when a required setting is missing
  (`missingConfig` lists the names, never values). Point an uptime monitor at it.
- At start-up the server logs one line, `[PinPlan] PRODUCTION CONFIG INCOMPLETE — missing: …`, when settings are missing.
- Server errors (route handlers, server rendering, the billing webhook, account deletion) are written to `app_errors`
  with platform `server` and show in `/admin` under Recent errors › Server. App floods can't stop them being recorded:
  the database caps each signed-in user (20 / 5 min), each signed-out device (10), all signed-out reports (100) and all
  app reports (300), and server reports have their own allowance (100). `/admin` lists only the newest 50 reports of
  any kind, so during an app flood older server reports can drop off that list — they are still in the table
  (`select * from app_errors where platform = 'server' order by created_at desc`).
- After a restore, re-run the migrations and check that `/api/health` says `ok: true`.

## Test it

Do a restore drill into a scratch project at least once before launch and every quarter. Time it, and note anything
missing from this document.
