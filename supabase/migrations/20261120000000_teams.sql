-- Company teams: the owner invites office staff and technicians, each with their own login.
-- Everyone on a team sees the team's jobs (plans, photos, checklists, logs, documents) and the owner's catalog.
-- Roles: owner (one per team) · admin (office: everything, manages the team) · tech (field work: no prices,
-- estimates, proposals or Billdu, and can't delete jobs). Safe to run more than once.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default '' check (char_length(name) <= 120),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null default 'tech' check (role in ('owner', 'admin', 'tech')),
  name text not null default '' check (char_length(name) <= 80),
  email text,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_team_idx on public.team_members (team_id);

create table if not exists public.team_invites (
  code text primary key check (char_length(code) between 8 and 64),
  team_id uuid not null references public.teams (id) on delete cascade,
  role text not null default 'tech' check (role in ('admin', 'tech')),
  name text not null default '' check (char_length(name) <= 80),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  revoked boolean not null default false
);
create index if not exists team_invites_team_idx on public.team_invites (team_id);

-- ---------- helpers (security definer: they read the team tables regardless of the caller's RLS) ----------
create or replace function public.my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;

create or replace function public.my_team_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.team_members where user_id = auth.uid();
$$;

-- Is `other` on the caller's team (the caller counts as on their own team)?
create or replace function public.same_team(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from public.team_members a join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

-- Technicians don't see prices: estimate lines and proposals are off limits to them.
create or replace function public.is_tech() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'tech' from public.team_members where user_id = auth.uid()), false);
$$;

-- Project access now includes everyone on the job owner's team.
create or replace function public.is_project_member(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = pid and p.owner_id = auth.uid())
      or exists (select 1 from public.project_members m where m.project_id = pid and m.user_id = auth.uid())
      or exists (select 1 from public.projects p
                 join public.team_members owner_m on owner_m.user_id = p.owner_id
                 join public.team_members me on me.team_id = owner_m.team_id and me.user_id = auth.uid()
                 where p.id = pid);
$$;

-- ---------- RLS on the team tables ----------
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select using (id = public.my_team_id());
drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update
  using (id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'))
  with check (id = public.my_team_id());

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select using (team_id = public.my_team_id());
-- Your own display name is yours to change; roles and removals go through the functions below.
drop policy if exists team_members_update_self on public.team_members;
create policy team_members_update_self on public.team_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists team_invites_admin on public.team_invites;
create policy team_invites_admin on public.team_invites for all
  using (team_id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'))
  with check (team_id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'));

-- Members may only change their name through the self-update policy (not their role or team).
create or replace function public.team_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('pinplan.team_admin', true) = 'on' then return new; end if;
  if new.role is distinct from old.role or new.team_id is distinct from old.team_id or new.user_id is distinct from old.user_id then
    raise exception 'Use the team settings to change roles' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists team_members_guard on public.team_members;
create trigger team_members_guard before update on public.team_members
  for each row execute function public.team_members_guard();

-- ---------- team functions ----------
create or replace function public.create_team(p_name text, p_my_name text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if exists (select 1 from public.team_members where user_id = uid) then
    raise exception 'You are already on a team' using errcode = '23505';
  end if;
  insert into public.teams (name, owner_id) values (left(coalesce(nullif(trim(p_name), ''), 'My company'), 120), uid) returning id into t;
  insert into public.team_members (team_id, user_id, role, name, email)
    values (t, uid, 'owner', left(coalesce(trim(p_my_name), ''), 80), (select email from auth.users where id = uid));
  return t;
end $$;

-- What an invite code is for, before signing in (the join page). Only for live codes.
create or replace function public.team_invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('team', t.name, 'role', i.role, 'name', i.name, 'expires_at', i.expires_at)
  from public.team_invites i join public.teams t on t.id = i.team_id
  where i.code = upper(trim(p_code)) and not i.revoked and i.used_by is null and i.expires_at > now();
$$;

create or replace function public.accept_team_invite(p_code text, p_name text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare i public.team_invites; uid uuid := auth.uid(); t public.teams; nm text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into i from public.team_invites where code = upper(trim(p_code)) for update;
  if i.code is null or i.revoked then raise exception 'That invite code is not valid' using errcode = 'P0002'; end if;
  if i.used_by is not null and i.used_by <> uid then raise exception 'That invite has already been used' using errcode = 'P0002'; end if;
  if i.expires_at <= now() and i.used_by is null then raise exception 'That invite has expired. Ask for a new one.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.team_members where user_id = uid and team_id <> i.team_id) then
    raise exception 'You are already on another team. Leave it first.' using errcode = '23505';
  end if;
  nm := left(coalesce(nullif(trim(p_name), ''), i.name, ''), 80);
  insert into public.team_members (team_id, user_id, role, name, email)
    values (i.team_id, uid, i.role, nm, (select email from auth.users where id = uid))
    on conflict (team_id, user_id) do nothing;
  update public.team_invites set used_by = uid, used_at = coalesce(used_at, now()) where code = i.code;
  select * into t from public.teams where id = i.team_id;
  return jsonb_build_object('team_id', t.id, 'team', t.name, 'role', (select role from public.team_members where user_id = uid));
end $$;

create or replace function public.set_team_member_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.team_members; them public.team_members;
begin
  select * into me from public.team_members where user_id = auth.uid();
  select * into them from public.team_members where user_id = p_user;
  if me.role is null or me.role not in ('owner', 'admin') or them.team_id is distinct from me.team_id then
    raise exception 'Only the owner or an admin can change roles' using errcode = '42501';
  end if;
  if them.role = 'owner' or p_role not in ('admin', 'tech') then
    raise exception 'The owner''s role can''t be changed' using errcode = '42501';
  end if;
  perform set_config('pinplan.team_admin', 'on', true);
  update public.team_members set role = p_role where user_id = p_user;
end $$;

create or replace function public.remove_team_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me public.team_members; them public.team_members;
begin
  select * into me from public.team_members where user_id = auth.uid();
  select * into them from public.team_members where user_id = p_user;
  if them.team_id is null or them.team_id is distinct from me.team_id then
    raise exception 'Not on your team' using errcode = '42501';
  end if;
  if them.role = 'owner' then raise exception 'The owner can''t be removed' using errcode = '42501'; end if;
  -- Anyone may leave; removing someone else takes the owner or an admin.
  if p_user <> auth.uid() and me.role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can remove people' using errcode = '42501';
  end if;
  delete from public.team_members where user_id = p_user;
end $$;

revoke all on function public.create_team(text, text) from public;
revoke all on function public.team_invite_info(text) from public;
revoke all on function public.accept_team_invite(text, text) from public;
revoke all on function public.set_team_member_role(uuid, text) from public;
revoke all on function public.remove_team_member(uuid) from public;
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.team_invite_info(text) to anon, authenticated;
grant execute on function public.accept_team_invite(text, text) to authenticated;
grant execute on function public.set_team_member_role(uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;

-- ---------- what changes for existing tables ----------
-- The team reads the owner's catalog and products (device letters, colours, product names on the plans).
drop policy if exists device_types_team_read on public.device_types;
create policy device_types_team_read on public.device_types for select using (public.same_team(owner_id));
drop policy if exists products_team_read on public.products;
create policy products_team_read on public.products for select using (public.same_team(owner_id));

-- Prices stay with the office: technicians can't read or write estimate lines or proposals.
drop policy if exists estimate_lines_member on public.estimate_lines;
create policy estimate_lines_member on public.estimate_lines for all
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech());

drop policy if exists proposals_team on public.proposals;
create policy proposals_team on public.proposals for all
  using ((owner_id = auth.uid() or public.is_project_member(project_id)) and not public.is_tech())
  with check (owner_id = auth.uid() and not public.is_tech());

-- Technicians can't delete a job (deletes are soft: deleted = true) or change its pricing.
create or replace function public.projects_tech_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_tech() and new.owner_id is distinct from auth.uid() then
    if new.deleted and not old.deleted then raise exception 'Only the office can delete a job' using errcode = '42501'; end if;
    new.pricing := old.pricing;
    new.billdu_docs := old.billdu_docs;
    new.billdu_client_id := old.billdu_client_id;
  end if;
  return new;
end $$;
drop trigger if exists projects_tech_guard on public.projects;
create trigger projects_tech_guard before update on public.projects
  for each row execute function public.projects_tech_guard();

-- Office staff can delete any team job for real (the owner's rule already covers their own).
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete
  using (owner_id = auth.uid() or (public.is_project_member(id) and public.my_team_role() in ('owner', 'admin')));

grant select, insert, update, delete on public.teams, public.team_members, public.team_invites to authenticated;

notify pgrst, 'reload schema';
