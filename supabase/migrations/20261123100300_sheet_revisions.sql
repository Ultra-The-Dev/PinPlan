-- Sheet revisions: a re-issued drawing replaces the sheet's image while the sheet row (and everything pinned to it)
-- stays. `revision_label` names the current drawing ("Rev B"); `revisions` is the JSON history of earlier drawings,
-- newest first (see docs/sheet-revisions.md). Old images stay in the plans bucket at <project>/<image id>.
-- RLS, synced_at and the billing write guard already cover public.sheets.
alter table public.sheets add column if not exists revision_label text, add column if not exists revisions jsonb;
