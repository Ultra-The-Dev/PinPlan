-- Job templates: a company's saved job setup (product choices, pricing tweaks, labels, checklists, standard estimate
-- lines, and parts other features add) to start new jobs from. See docs/job-templates.md.
-- * Company level, not part of a job: scoped to the team (team_id), or to the author when they work alone.
-- * team_id and created_by are set here from the signed-in user; whatever the app sends for them is ignored.
-- * Everyone on the team reads them (technicians start jobs from them); the owner and admins write them.
-- * Read-only like the job tables when the team's subscription has lapsed (job_write_guard).
-- Safe to run more than once.

create table if not exists public.job_templates (
  id text primary key,
  team_id uuid references public.teams (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 200),
  description text check (description is null or char_length(description) <= 2000),
  trades jsonb check (trades is null or jsonb_typeof(trades) = 'array'),
  -- JobTemplatePayload (src/lib/types.ts): { version, project, checklists, estimateLines, parts? }.
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 1048576),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists job_templates_team_idx on public.job_templates (team_id);
create index if not exists job_templates_created_by_idx on public.job_templates (created_by);

-- ---------- synced_at trigger + watermark index (like the other synced tables) ----------
drop trigger if exists job_templates_synced_at on public.job_templates;
create trigger job_templates_synced_at before insert or update on public.job_templates
  for each row execute function public.set_synced_at();
create index if not exists job_templates_synced_at_idx on public.job_templates (synced_at);

-- ---------- scope: the team and author come from the signed-in user ----------
-- Runs before the policies' WITH CHECK, so an app can't file a template under another team.
-- A template saved while working alone moves to the team its author later creates or joins on its next save.
create or replace function public.job_templates_scope() returns trigger
-- Invoker rights on purpose (like teams_billing_guard): current_user tells app writes from the server and SQL editor.
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.team_id := public.my_team_id();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.team_id := coalesce(old.team_id, case when old.created_by = auth.uid() then public.my_team_id() end);
  end if;
  return new;
end $$;
drop trigger if exists job_templates_scope on public.job_templates;
create trigger job_templates_scope before insert or update on public.job_templates
  for each row execute function public.job_templates_scope();

-- ---------- row-level security ----------
alter table public.job_templates enable row level security;

drop policy if exists job_templates_select on public.job_templates;
create policy job_templates_select on public.job_templates for select using (
  (team_id is not null and team_id = public.my_team_id())
  or (team_id is null and created_by = auth.uid())
);

drop policy if exists job_templates_insert on public.job_templates;
create policy job_templates_insert on public.job_templates for insert with check (
  (team_id is not null and team_id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'))
  or (team_id is null and created_by = auth.uid() and public.my_team_id() is null)
);

drop policy if exists job_templates_update on public.job_templates;
create policy job_templates_update on public.job_templates for update
  using (
    (team_id is not null and team_id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'))
    or (team_id is null and created_by = auth.uid())
  )
  with check (
    (team_id is not null and team_id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'))
    or (team_id is null and created_by = auth.uid() and public.my_team_id() is null)
  );

-- Deletes are soft (deleted = true); a real delete is for the office only.
drop policy if exists job_templates_delete on public.job_templates;
create policy job_templates_delete on public.job_templates for delete using (
  (team_id is not null and team_id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'))
  or (team_id is null and created_by = auth.uid())
);

grant select, insert, update, delete on public.job_templates to authenticated;

-- ---------- read-only when the subscription has lapsed ----------
-- The owner whose subscription counts for a template: its team's owner, or its author when there is no team.
create or replace function public.job_template_owner(tid uuid, author uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select owner_id from public.teams where id = tid), author);
$$;

-- Same guard as 20261121000000_billing.sql, plus job_templates (no project_id: the team's owner decides).
create or replace function public.job_write_guard() returns trigger
language plpgsql set search_path = public as $$
declare owner uuid;
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_table_name in ('projects', 'proposals') then
    owner := new.owner_id;
  elsif tg_table_name = 'job_templates' then
    owner := public.job_template_owner(new.team_id, new.created_by);
  else
    owner := public.project_owner(new.project_id);
  end if;
  if owner is not null and not public.team_can_write(owner) then
    raise exception 'PinPlan subscription inactive'
      using errcode = 'P0001', detail = 'This company''s PinPlan subscription has lapsed, so its jobs are read-only.',
            hint = 'The owner or an admin can restart the subscription in Settings → Billing.';
  end if;
  return new;
end $$;

-- Trigger names sort after job_templates_scope, so the guard sees the team the scope trigger set.
drop trigger if exists job_templates_write_guard on public.job_templates;
create trigger job_templates_write_guard before insert or update on public.job_templates
  for each row execute function public.job_write_guard();

notify pgrst, 'reload schema';
