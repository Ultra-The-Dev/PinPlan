-- Plan markups: redlines, clouds, arrows, shapes and text notes drawn on a plan sheet, in named layers.
-- See docs/plan-markups.md. Never counted in the takeoff. Safe to run more than once.
--
-- Everyone on the job can draw. Only the author edits or deletes their markup, or the office (owner / admin) does.
-- Private markups (purple) are seen by their author only.

create table if not exists public.plan_markups (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  -- Soft link (no foreign key): the sheet may sync later.
  sheet_id text not null,
  kind text not null check (kind in ('pen', 'highlight', 'line', 'arrow', 'cloud', 'rect', 'ellipse', 'text')),
  -- Relative (0–1) x,y pairs: [x0, y0, x1, y1, …].
  points jsonb not null default '[]'::jsonb,
  text text check (text is null or length(text) <= 4000),
  color text,
  -- Fractions of the sheet width.
  width double precision,
  font_size double precision,
  layer text,
  private boolean not null default false,
  author text,
  author_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists plan_markups_project_idx on public.plan_markups (project_id);
create index if not exists plan_markups_sheet_idx on public.plan_markups (sheet_id);

-- ---------- synced_at trigger + watermark index (like the other synced tables) ----------
drop trigger if exists plan_markups_synced_at on public.plan_markups;
create trigger plan_markups_synced_at before insert or update on public.plan_markups
  for each row execute function public.set_synced_at();
create index if not exists plan_markups_synced_at_idx on public.plan_markups (synced_at);

-- ---------- read-only when the subscription has lapsed (same guard as the other job tables) ----------
drop trigger if exists plan_markups_write_guard on public.plan_markups;
create trigger plan_markups_write_guard before insert or update on public.plan_markups
  for each row execute function public.job_write_guard();

-- ---------- row level security ----------
alter table public.plan_markups enable row level security;

drop policy if exists plan_markups_select on public.plan_markups;
create policy plan_markups_select on public.plan_markups for select
  using (public.is_project_member(project_id) and (not private or author_id = auth.uid()));

-- An upsert checks the insert rule against the row it sends even when it ends up updating, so the office may send
-- someone else's markup here (editing it); technicians only send their own (or unowned ones made signed out).
drop policy if exists plan_markups_insert on public.plan_markups;
create policy plan_markups_insert on public.plan_markups for insert
  with check (public.is_project_member(project_id)
              and (author_id is null or author_id = auth.uid() or not public.is_tech())
              and (not private or author_id = auth.uid()));

drop policy if exists plan_markups_update on public.plan_markups;
create policy plan_markups_update on public.plan_markups for update
  using (public.is_project_member(project_id) and (author_id is null or author_id = auth.uid() or not public.is_tech()))
  with check (public.is_project_member(project_id)
              and (author_id is null or author_id = auth.uid() or not public.is_tech())
              and (not private or author_id = auth.uid()));

drop policy if exists plan_markups_delete on public.plan_markups;
create policy plan_markups_delete on public.plan_markups for delete
  using (public.is_project_member(project_id) and (author_id is null or author_id = auth.uid() or not public.is_tech()));

grant select, insert, update, delete on public.plan_markups to authenticated;

notify pgrst, 'reload schema';
