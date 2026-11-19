-- RFIs (requests for information) per job: question to the GC / architect / owner with a plan spot, photos, due date
-- and ball-in-court. Answered in the app or through a no-login link (/q?t=…) that goes through the server with the
-- service role (src/app/api/rfis/public/route.ts); anon gets nothing here. See docs/rfis.md. Safe to run more than once.

create table if not exists public.rfis (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  number integer not null default 0,
  subject text not null default '',
  question text not null default '',
  suggestion text,
  status text not null default 'draft' check (status in ('draft', 'open', 'answered', 'closed', 'void')),
  ball_in_court text not null default 'us' check (ball_in_court in ('us', 'them')),
  priority text,
  cost_impact text,
  schedule_impact text,
  to_name text,
  to_email text,
  to_company text,
  cc jsonb,
  due date,
  -- Soft links (no foreign keys): the sheet, device, task, photos or documents may sync later.
  sheet_id text,
  x double precision,
  y double precision,
  marker_id text,
  task_id text,
  photo_ids jsonb,
  document_ids jsonb,
  answer text,
  answered_by text,
  answered_at timestamptz,
  share_token text,
  sent_at timestamptz,
  closed_at timestamptz,
  created_by text,
  -- Company name / contact / logo frozen at send time for the answer page (no prices).
  sender jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists rfis_project_idx on public.rfis (project_id);
create unique index if not exists rfis_share_token_key on public.rfis (share_token) where share_token is not null;

-- ---------- sync stamp + team access (same rules as checklists: any member of the job, techs included) ----------
drop trigger if exists rfis_synced_at on public.rfis;
create trigger rfis_synced_at before insert or update on public.rfis for each row execute function public.set_synced_at();
create index if not exists rfis_synced_at_idx on public.rfis (synced_at);
alter table public.rfis enable row level security;
drop policy if exists rfis_member on public.rfis;
create policy rfis_member on public.rfis for all
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- ---------- read-only when the subscription has lapsed (same guard as the other job tables) ----------
drop trigger if exists rfis_write_guard on public.rfis;
create trigger rfis_write_guard before insert or update on public.rfis
  for each row execute function public.job_write_guard();

-- ---------- an answer that arrived through the link is never lost to a device that hadn't seen it yet ----------
-- A device that edited the RFI offline pushes its whole row (last write wins), which would blank the answer. The app
-- never clears answered_at itself (reopen keeps the old answer), so a push without it means "stale copy": keep the
-- answer, and stamp the row newer so that device pulls it back.
create or replace function public.rfis_keep_answer() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and old.answered_at is not null and new.answered_at is null and not new.deleted
     and new.status in ('draft', 'open') then
    new.answer := old.answer;
    new.answered_by := old.answered_by;
    new.answered_at := old.answered_at;
    new.status := 'answered';
    new.ball_in_court := 'us';
    new.updated_at := greatest(now(), new.updated_at + interval '1 millisecond');
  end if;
  return new;
end $$;
drop trigger if exists rfis_keep_answer on public.rfis;
create trigger rfis_keep_answer before update on public.rfis for each row execute function public.rfis_keep_answer();
