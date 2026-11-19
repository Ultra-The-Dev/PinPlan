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

-- ---------- a stale offline copy never undoes what already happened on the server ----------
-- A device that edited the RFI offline pushes its whole row (last write wins). The app only ever moves an RFI forward
-- in ways a stale copy can't express, so a push that would
--   * blank an answer (the app never clears answered_at: reopen keeps the old answer),
--   * turn a sent RFI back into a draft or drop its share link (nothing un-sends),
--   * bring a void RFI back (void is final)
-- is a stale copy: keep what the server has, and stamp the row newer so that device pulls it back.
create or replace function public.rfis_keep_answer() returns trigger
language plpgsql set search_path = public as $$
declare stale boolean := false;
begin
  if current_user <> 'authenticated' then return new; end if;
  -- Only drafts are deleted in the app: deleting a draft that was sent meanwhile is a stale copy too.
  if new.deleted and not old.deleted and new.status = 'draft' and old.status <> 'draft' then
    new.deleted := false;
  end if;
  if new.deleted then return new; end if;
  if old.answered_at is not null and new.answered_at is null then
    new.answer := old.answer;
    new.answered_by := old.answered_by;
    new.answered_at := old.answered_at;
    if new.status in ('draft', 'open') then
      new.status := 'answered';
      new.ball_in_court := 'us';
    end if;
    stale := true;
  end if;
  if old.status <> 'draft' and new.status = 'draft' then
    new.status := old.status;
    new.ball_in_court := old.ball_in_court;
    new.sent_at := coalesce(new.sent_at, old.sent_at);
    new.closed_at := coalesce(new.closed_at, old.closed_at);
    stale := true;
  end if;
  if old.status = 'void' and new.status <> 'void' then
    new.status := 'void';
    new.ball_in_court := old.ball_in_court;
    new.closed_at := old.closed_at;
    stale := true;
  end if;
  if old.share_token is not null and new.share_token is null then
    new.share_token := old.share_token;
    new.sent_at := coalesce(new.sent_at, old.sent_at);
    new.sender := coalesce(new.sender, old.sender);
    stale := true;
  end if;
  if stale then
    new.updated_at := greatest(now(), new.updated_at + interval '1 millisecond', old.updated_at + interval '1 millisecond');
  end if;
  return new;
end $$;
drop trigger if exists rfis_keep_answer on public.rfis;
create trigger rfis_keep_answer before update on public.rfis for each row execute function public.rfis_keep_answer();
