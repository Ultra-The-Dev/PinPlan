-- Database access rules (security fix package "db-access-guards"). Checked by supabase/tests/security_test.sql,
-- teams_test.sql, billing_policy_test.sql, forms_test.sql, documents_test.sql and rls_test.sql. Safe to run more than once.
--
--   1. Invite codes: a used code never works again for someone who isn't on the team (no rejoin after removal, no
--      re-escalation); expiry is always checked; an invite sent to an email address only works for that confirmed
--      address and for the account /api/team/join made with it; only an invite with an email makes an admin; invites
--      live at most 30 days and say who made them; removing (or demoting) someone withdraws the invites they made.
--      Starting a company needs a confirmed email.
--   2. Catalog (device types, products): the company's catalog belongs to the company owner; only the office writes it.
--      Technicians can't change a job's product choices either.
--   3. Read-only when the subscription has lapsed: photo reports, the catalog, company and document settings, plan
--      files and proposal / report images too. Technicians can't overwrite plan files someone else uploaded.
--   4. Storage buckets: size limits and file types (no SVG or HTML in either bucket).
--   5. Proposals: the client's answer and the frozen snapshot can't be changed from the apps; respond_proposal and
--      respond_document cap the name and note and only take a PNG signature.
--   6. teams: the apps read only the columns they need (no Stripe ids, seat limit or billing email).
--   7. Plan markups: the database says who drew a markup, and it never changes.
--   8. Forms: who started and who submitted a form (and when) is the database's to say, and stays put once submitted.
--   9. Ids that become storage paths (job ids, image and file ids, sheet image paths) are plain ids.

-- ---------- 1. invite codes ----------

-- Who made an invite, and for how long it can work, are the database's to say (at most 30 days). A used invite stays
-- used and a withdrawn one stays withdrawn. Invoker rights on purpose (as team_invites_signup_guard): writes from the
-- apps run as `authenticated`; the service role, the SQL editor and security-definer functions pass. A separate
-- trigger (and name) from the open-invite cap and the sign-up guard.
create or replace function public.team_invites_expiry_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.used_by := null;
    new.used_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.used_by := old.used_by;
    new.used_at := old.used_at;
    new.revoked := old.revoked or coalesce(new.revoked, false);
  end if;
  new.expires_at := least(coalesce(new.expires_at, new.created_at + interval '14 days'), new.created_at + interval '30 days');
  return new;
end $$;
drop trigger if exists team_invites_expiry_guard on public.team_invites;
create trigger team_invites_expiry_guard before insert or update on public.team_invites
  for each row execute function public.team_invites_expiry_guard();

-- Existing invites: none lives longer than 30 days from when it was made.
update public.team_invites set expires_at = created_at + interval '30 days' where expires_at > created_at + interval '30 days';

create or replace function public.accept_team_invite(p_code text, p_name text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i public.team_invites;
  uid uuid := auth.uid();
  t public.teams;
  u record;
  nm text;
  n int;
  grant_role text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into i from public.team_invites where code = upper(trim(p_code)) for update;
  if i.code is null then raise exception 'That invite code is not valid' using errcode = 'P0002'; end if;
  -- Already on this team (e.g. the link opened twice): answer with the membership, change nothing.
  if exists (select 1 from public.team_members where user_id = uid and team_id = i.team_id) then
    select * into t from public.teams where id = i.team_id;
    return jsonb_build_object('team_id', t.id, 'team', t.name, 'role', (select role from public.team_members where user_id = uid));
  end if;
  if i.revoked then raise exception 'That invite code is not valid' using errcode = 'P0002'; end if;
  -- A used code is spent, also for the person who used it (removed people don't come back with their old code).
  if i.used_by is not null then raise exception 'That invite has already been used' using errcode = 'P0002'; end if;
  if i.expires_at <= now() then raise exception 'That invite has expired. Ask for a new one.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.team_members where user_id = uid and team_id <> i.team_id) then
    raise exception 'You are already on another team. Leave it first.' using errcode = '23505';
  end if;
  -- The account /api/team/join made with this code is the only one that may use it.
  if i.created_user_id is not null and i.created_user_id <> uid then
    raise exception 'That invite has already been used' using errcode = '42501';
  end if;
  -- An invite sent to an address works only for that address, once it is confirmed.
  select email, email_confirmed_at into u from auth.users where id = uid;
  if i.email is not null and (u.email is null or lower(u.email) <> i.email or u.email_confirmed_at is null) then
    raise exception 'This invite was sent to a different email address. Sign in with that address (and confirm it) to join.'
      using errcode = '42501';
  end if;
  -- Office (admin) rights only come with an invite sent to a named address; a bare code makes a technician.
  grant_role := case when i.role = 'admin' and i.email is null then 'tech' else i.role end;
  -- Lock the team row so two people can't take the last seat at once.
  select * into t from public.teams where id = i.team_id for update;
  if not public.plan_allows_work(t.plan_status, t.trial_ends_at) then
    raise exception 'This company''s PinPlan subscription isn''t active, so it can''t add people right now. Ask the owner to restart it.'
      using errcode = 'P0001';
  end if;
  select count(*) into n from public.team_members where team_id = i.team_id;
  if t.seat_limit is not null and n + 1 > t.seat_limit then
    raise exception 'Your company has used all % seats. Ask the owner to add a seat.', t.seat_limit using errcode = 'P0001';
  end if;
  nm := left(coalesce(nullif(trim(p_name), ''), i.name, ''), 80);
  insert into public.team_members (team_id, user_id, role, name, email)
    values (i.team_id, uid, grant_role, nm, u.email)
    on conflict (team_id, user_id) do nothing;
  update public.team_invites set used_by = uid, used_at = coalesce(used_at, now()) where code = i.code;
  return jsonb_build_object('team_id', t.id, 'team', t.name, 'role', (select role from public.team_members where user_id = uid));
end $$;

create or replace function public.create_team(p_name text, p_my_name text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = uid and email_confirmed_at is not null) then
    raise exception 'Confirm your email address first (check your inbox for the link).' using errcode = '42501';
  end if;
  if exists (select 1 from public.team_members where user_id = uid) then
    raise exception 'You are already on a team' using errcode = '23505';
  end if;
  insert into public.teams (name, owner_id) values (left(coalesce(nullif(trim(p_name), ''), 'My company'), 120), uid) returning id into t;
  insert into public.team_members (team_id, user_id, role, name, email)
    values (t, uid, 'owner', left(coalesce(trim(p_my_name), ''), 80), (select email from auth.users where id = uid));
  return t;
end $$;

-- Same as before; a person demoted to technician can no longer hand out the invites they made.
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
  if p_role = 'tech' then
    update public.team_invites set revoked = true where team_id = them.team_id and created_by = p_user and not revoked;
  end if;
end $$;

-- Same as 20261124100100_security_hardening.sql, plus: the invites the person used or made are withdrawn.
create or replace function public.remove_team_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me public.team_members; them public.team_members; boss uuid;
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
  select owner_id into boss from public.teams where id = them.team_id;
  if boss is not null and boss <> p_user then
    update public.projects set owner_id = boss where owner_id = p_user;
    update public.proposals set owner_id = boss where owner_id = p_user;
    update public.photo_reports set owner_id = boss where owner_id = p_user;
    if to_regclass('public.document_links') is not null then
      update public.document_links set owner_id = boss where owner_id = p_user;
    end if;
    delete from public.project_members m
    using public.projects p, public.team_members o
    where m.user_id = p_user and p.id = m.project_id and o.user_id = p.owner_id and o.team_id = them.team_id;
  end if;
  update public.team_invites set revoked = true
    where team_id = them.team_id and (used_by = p_user or created_by = p_user) and not revoked;
  delete from public.team_members where user_id = p_user;
end $$;

revoke all on function public.accept_team_invite(text, text) from public, anon;
revoke all on function public.create_team(text, text) from public, anon;
revoke all on function public.set_team_member_role(uuid, text) from public, anon;
revoke all on function public.remove_team_member(uuid) from public, anon;
grant execute on function public.accept_team_invite(text, text) to authenticated;
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.set_team_member_role(uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;
revoke all on function public.team_invites_expiry_guard() from public, anon, authenticated;

-- ---------- 2. catalog: the company's, written by the office ----------
-- Rows the apps send without an owner go to the company's catalog (the team owner's; your own when you work alone).
alter table public.device_types alter column owner_id set default public.my_billing_owner();
alter table public.products alter column owner_id set default public.my_billing_owner();

drop policy if exists device_types_owner on public.device_types;
drop policy if exists device_types_team_read on public.device_types;
drop policy if exists device_types_select on public.device_types;
drop policy if exists device_types_insert on public.device_types;
drop policy if exists device_types_update on public.device_types;
drop policy if exists device_types_delete on public.device_types;
create policy device_types_select on public.device_types for select to authenticated
  using (public.same_team(owner_id) or owner_id = public.my_billing_owner());
create policy device_types_insert on public.device_types for insert to authenticated
  with check (owner_id = public.my_billing_owner() and not public.is_tech());
create policy device_types_update on public.device_types for update to authenticated
  using (owner_id = public.my_billing_owner() and not public.is_tech())
  with check (owner_id = public.my_billing_owner() and not public.is_tech());
create policy device_types_delete on public.device_types for delete to authenticated
  using (owner_id = public.my_billing_owner() and not public.is_tech());

drop policy if exists products_owner on public.products;
drop policy if exists products_team_read on public.products;
drop policy if exists products_select on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
create policy products_select on public.products for select to authenticated
  using (public.same_team(owner_id) or owner_id = public.my_billing_owner());
create policy products_insert on public.products for insert to authenticated
  with check (owner_id = public.my_billing_owner() and not public.is_tech());
create policy products_update on public.products for update to authenticated
  using (owner_id = public.my_billing_owner() and not public.is_tech())
  with check (owner_id = public.my_billing_owner() and not public.is_tech());
create policy products_delete on public.products for delete to authenticated
  using (owner_id = public.my_billing_owner() and not public.is_tech());

-- Technicians can't delete a job or change its pricing, Billdu links or product choices (they set prices too).
create or replace function public.projects_tech_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_tech() and new.owner_id is distinct from auth.uid() then
    if new.deleted and not old.deleted then raise exception 'Only the office can delete a job' using errcode = '42501'; end if;
    new.pricing := old.pricing;
    new.billdu_docs := old.billdu_docs;
    new.billdu_client_id := old.billdu_client_id;
    new.product_choices := old.product_choices;
  end if;
  return new;
end $$;

-- ---------- 3. read-only when the subscription has lapsed ----------
drop trigger if exists photo_reports_write_guard on public.photo_reports;
create trigger photo_reports_write_guard before insert or update on public.photo_reports
  for each row execute function public.job_write_guard();

-- Company-wide rows (catalog, company and document settings): the caller's company decides (their own account when
-- they work alone). Same error as job_write_guard, so the apps show the same message.
create or replace function public.company_write_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return coalesce(new, old); end if;
  if not public.team_can_write(public.my_billing_owner()) then
    raise exception 'PinPlan subscription inactive'
      using errcode = 'P0001', detail = 'This company''s PinPlan subscription has lapsed, so its jobs are read-only.',
            hint = 'The owner or an admin can restart the subscription in Settings → Billing.';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.company_write_guard() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['device_types', 'products', 'company_settings', 'document_settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_company_write_guard', t);
      execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.company_write_guard()',
                     t || '_company_write_guard', t);
    end if;
  end loop;
end $$;

-- Plan files (<job id>/<file id>): adding or replacing one is a write on the job. Technicians replace only files
-- they uploaded themselves (storage fills owner_id, and owner on older files).
drop policy if exists plans_insert on storage.objects;
create policy plans_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1])
              and public.team_can_write(public.billing_owner((storage.foldername(name))[1])));
drop policy if exists plans_update on storage.objects;
create policy plans_update on storage.objects for update to authenticated
  using (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1])
         and (owner = auth.uid() or owner_id = auth.uid()::text or not public.is_tech())
         and public.team_can_write(public.billing_owner((storage.foldername(name))[1])))
  with check (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1])
              and (owner = auth.uid() or owner_id = auth.uid()::text or not public.is_tech())
              and public.team_can_write(public.billing_owner((storage.foldername(name))[1])));

-- Proposal and photo report images: only <your id>/<link token>/<id>.jpg or <your id>/reports/<link token>/<id>.jpg.
drop policy if exists proposals_files_insert on storage.objects;
create policy proposals_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text
              and name ~ ('^' || auth.uid()::text || '/(reports/)?[A-Za-z0-9_-]{20,64}/[A-Za-z0-9_-]{1,64}\.jpg$')
              and public.team_can_write(public.my_billing_owner()));
drop policy if exists proposals_files_update on storage.objects;
create policy proposals_files_update on storage.objects for update to authenticated
  using (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text
              and name ~ ('^' || auth.uid()::text || '/(reports/)?[A-Za-z0-9_-]{20,64}/[A-Za-z0-9_-]{1,64}\.jpg$')
              and public.team_can_write(public.my_billing_owner()));

-- ---------- 4. bucket limits ----------
-- proposals (public): the plan renders and report photos the apps upload, all JPEG; PNG and WebP for good measure.
update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'proposals';
-- plans (private): plan pages, photos, signatures, logos and job documents (permits, spec sheets, contracts,
-- drawings, site videos; the apps cap those at 25 MB). Images other than SVG, PDF, office, text, CAD, archive, audio
-- and video formats; anything else is sent as application/octet-stream (the apps do that for a type not on this
-- list, so it downloads instead of opening in the browser). Never SVG, HTML or XML. Keep the list the same as
-- src/lib/storageTypes.ts and PinPlanCore's StorageTypes.swift (tests/storageTypes.test.ts checks it).
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/tiff', 'image/bmp', 'image/avif',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-word.document.macroEnabled.12', 'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-word.document.macroenabled.12', 'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation', 'application/rtf', 'text/rtf',
    'application/vnd.apple.pages', 'application/vnd.apple.numbers', 'application/vnd.apple.keynote',
    'application/vnd.ms-project', 'application/vnd.visio', 'application/vnd.ms-visio.drawing',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
    'image/vnd.dwg', 'image/x-dwg', 'application/x-dwg', 'image/vnd.dxf', 'application/acad', 'application/dxf', 'application/x-autocad',
    'message/rfc822', 'application/vnd.ms-outlook',
    'video/mp4', 'video/quicktime', 'video/x-m4v', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
    'application/octet-stream']
  where id = 'plans';

-- ---------- 5. proposals: the answer and the snapshot are the client's and the database's ----------
-- Writes from the apps (signed in, or signed out) may withdraw a proposal or mark it viewed; the answer fields and the
-- frozen snapshot stay as they are. A new proposal always starts unanswered. respond_proposal and get_proposal are
-- security definer, so they pass.
create or replace function public.proposals_answer_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'sent';
    new.viewed_at := null;
    new.responded_at := null;
    new.client_name := null;
    new.signature := null;
    new.chosen_options := null;
    new.accepted_total := null;
    new.client_note := null;
    return new;
  end if;
  new.snapshot := old.snapshot;
  new.responded_at := old.responded_at;
  new.client_name := old.client_name;
  new.signature := old.signature;
  new.chosen_options := old.chosen_options;
  new.accepted_total := old.accepted_total;
  new.client_note := old.client_note;
  if new.status is distinct from old.status and not (new.status = 'revoked' or (old.status = 'sent' and new.status = 'viewed')) then
    raise exception 'A proposal can only be withdrawn here' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.proposals_answer_guard() from public, anon, authenticated;
drop trigger if exists proposals_answer_guard on public.proposals;
create trigger proposals_answer_guard before insert or update on public.proposals
  for each row execute function public.proposals_answer_guard();

-- Same as before, plus: the name and note are capped, and a signature must be a PNG image (data URL).
create or replace function public.respond_proposal(p_token text, p_accept boolean, p_name text, p_signature text, p_options jsonb, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.proposals;
  line jsonb;
  subtotal double precision := 0;
  tax double precision;
  opts jsonb := coalesce(p_options, '[]'::jsonb);
  sig text := nullif(p_signature, '');
begin
  select * into r from public.proposals where id = p_token for update;
  if not found or r.status = 'revoked' then raise exception 'This proposal is no longer available.'; end if;
  if r.status in ('accepted', 'declined') then raise exception 'This proposal has already been answered.'; end if;
  if r.valid_until is not null and r.valid_until < current_date then raise exception 'This proposal has expired. Please ask for an updated one.'; end if;
  if p_accept and (coalesce(trim(p_name), '') = '' or sig is null) then
    raise exception 'Please type your name and sign to accept.';
  end if;
  if length(coalesce(sig, '')) > 400000 then raise exception 'Signature image is too large.'; end if;
  if sig is not null and sig !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'The signature must be a PNG image.';
  end if;
  if jsonb_typeof(opts) <> 'array' then opts := '[]'::jsonb; end if;

  for line in select * from jsonb_array_elements(r.snapshot -> 'lines') loop
    if not coalesce((line ->> 'optional')::boolean, false) or opts ? (line ->> 'key') then
      subtotal := subtotal + coalesce((line ->> 'total')::double precision, 0);
    end if;
  end loop;
  tax := round((subtotal * coalesce((r.snapshot ->> 'taxPct')::double precision, 0) / 100)::numeric, 2);

  update public.proposals set
    status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now(), updated_at = now(),
    client_name = left(nullif(trim(coalesce(p_name, '')), ''), 120),
    signature = case when p_accept then sig end,
    chosen_options = case when p_accept then opts end,
    accepted_total = case when p_accept then round((subtotal + tax)::numeric, 2) end,
    client_note = left(nullif(trim(coalesce(p_note, '')), ''), 4000)
  where id = p_token;
  return public.get_proposal(p_token);
end $$;

-- Same as 20261122000000_documents.sql, plus the PNG signature check.
create or replace function public.respond_document(p_token text, p_accept boolean, p_name text, p_signature text, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.document_links; d public.sales_documents; need_sig boolean; sig text := nullif(p_signature, '');
begin
  select * into l from public.document_links where id = p_token for update;
  if not found or l.status = 'revoked' then raise exception 'This link is no longer available.'; end if;
  select * into d from public.sales_documents where id = l.document_id for update;
  if not found or d.deleted or d.status = 'void' then raise exception 'This document is no longer available.'; end if;
  if d.kind <> 'quote' then raise exception 'Only quotes can be accepted online.'; end if;
  if d.status in ('accepted', 'declined') then raise exception 'This has already been answered.'; end if;
  if d.status = 'draft' then raise exception 'This document is not ready yet.'; end if;
  if d.valid_until is not null and d.valid_until < current_date then raise exception 'This quote has expired. Please ask for an updated one.'; end if;
  need_sig := coalesce((l.snapshot ->> 'requireSignature')::boolean, true);
  if p_accept and (coalesce(trim(p_name), '') = '' or (need_sig and sig is null)) then
    raise exception 'Please type your name and sign to accept.';
  end if;
  if length(coalesce(sig, '')) > 400000 then raise exception 'Signature image is too large.'; end if;
  if sig is not null and sig !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'The signature must be a PNG image.';
  end if;
  update public.sales_documents set
    status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now(),
    signer_name = left(nullif(trim(coalesce(p_name, '')), ''), 120),
    signature = case when p_accept then sig end,
    client_note = left(nullif(trim(coalesce(p_note, '')), ''), 4000),
    viewed_at = coalesce(viewed_at, now()),
    updated_at = now()
  where id = d.id returning * into d;
  update public.document_links set responded_at = now() where id = p_token returning * into l;
  return public.document_public(l, d);
end $$;

revoke all on function public.respond_proposal(text, boolean, text, text, jsonb, text) from public;
revoke all on function public.respond_document(text, boolean, text, text, text) from public;
grant execute on function public.respond_proposal(text, boolean, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.respond_document(text, boolean, text, text, text) to anon, authenticated;

-- ---------- 6. teams: only the columns the apps read ----------
-- Stripe ids, the seat limit, the billing email and the reminder stamps stay with the server (team_billing() tells
-- the apps what they need).
revoke select on public.teams from authenticated, anon;
grant select (id, name, owner_id, trades, created_at, updated_at, plan_status, trial_ends_at, current_period_end, cancel_at)
  on public.teams to authenticated;

-- ---------- 7. plan markups: the author is who drew it ----------
create or replace function public.plan_markups_author_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
  else
    new.author_id := old.author_id;
  end if;
  return new;
end $$;
revoke all on function public.plan_markups_author_stamp() from public, anon, authenticated;
drop trigger if exists plan_markups_author_stamp on public.plan_markups;
create trigger plan_markups_author_stamp before insert or update on public.plan_markups
  for each row execute function public.plan_markups_author_stamp();

-- Markups with no author (drawn before this) are the office's to edit or delete.
drop policy if exists plan_markups_update on public.plan_markups;
create policy plan_markups_update on public.plan_markups for update to authenticated
  using (public.is_project_member(project_id) and (author_id = auth.uid() or not public.is_tech()))
  with check (public.is_project_member(project_id)
              and (author_id = auth.uid() or not public.is_tech())
              and (not private or author_id = auth.uid()));
drop policy if exists plan_markups_delete on public.plan_markups;
create policy plan_markups_delete on public.plan_markups for delete to authenticated
  using (public.is_project_member(project_id) and (author_id = auth.uid() or not public.is_tech()));

-- ---------- 8. forms: who started and submitted it ----------
-- The caller's name as the team knows it (their email's name part when they have none). Null when signed out.
create or replace function public.my_display_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim((select m.name from public.team_members m where m.user_id = auth.uid())), ''),
                  nullif(split_part((select u.email from auth.users u where u.id = auth.uid()), '@', 1), ''),
                  'Me')
  where auth.uid() is not null;
$$;
revoke all on function public.my_display_name() from public, anon;
grant execute on function public.my_display_name() to authenticated, service_role;

-- Same lock as 20261123100600_forms.sql (technicians can't change a submitted form), plus: for signed-in callers the
-- database stamps who started a form, and who submitted it and when; those stay as they are while it is submitted.
-- Technicians can't rename a submitted form or change its photos either.
create or replace function public.job_forms_lock() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if public.is_tech() and old.status = 'submitted' then
      raise exception 'This form was submitted and is locked'
        using errcode = '42501', hint = 'Ask the office to delete it.';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := public.my_display_name();
    if new.status = 'submitted' then
      new.submitted_by := public.my_display_name();
      new.submitted_at := now();
    else
      new.submitted_by := null;
      new.submitted_at := null;
    end if;
    return new;
  end if;
  new.created_by := old.created_by;
  if new.status = 'submitted' and old.status = 'submitted' then
    if public.is_tech() and (
         new."values" is distinct from old."values"
         or new.deleted is distinct from old.deleted
         or new.signatures is distinct from old.signatures
         or new.template is distinct from old.template
         or new.name is distinct from old.name
         or new.photo_ids is distinct from old.photo_ids) then
      raise exception 'This form was submitted and is locked'
        using errcode = '42501', hint = 'Ask the office to reopen it.';
    end if;
    new.submitted_by := old.submitted_by;
    new.submitted_at := old.submitted_at;
  elsif new.status = 'submitted' then
    new.submitted_by := public.my_display_name();
    new.submitted_at := now();
  else
    if public.is_tech() and old.status = 'submitted' then
      raise exception 'This form was submitted and is locked'
        using errcode = '42501', hint = 'Ask the office to reopen it.';
    end if;
    new.submitted_by := null;
    new.submitted_at := null;
  end if;
  return new;
end $$;
revoke all on function public.job_forms_lock() from public, anon, authenticated;
drop trigger if exists job_forms_lock on public.job_forms;
create trigger job_forms_lock before insert or update or delete on public.job_forms
  for each row execute function public.job_forms_lock();

-- ---------- 9. ids that become storage paths ----------
-- Job ids name the plan folder and image / file ids name the file in it, so they are plain ids (letters, digits,
-- _ and -). An empty image / file id is let through: the apps send '' for a row that lost its id (it names no file). Added NOT VALID, then validated when the rows already there pass (otherwise only new rows are checked,
-- and a notice says so).
do $$
declare c record;
begin
  for c in select * from (values
      ('projects', 'projects_id_format', $c$id ~ '^[A-Za-z0-9_-]{1,64}$'$c$),
      ('sheets', 'sheets_image_id_format', $c$image_id ~ '^[A-Za-z0-9_-]{0,64}$'$c$),
      ('sheets', 'sheets_image_path_format',
        $c$image_path is null or (left(image_path, length(project_id) + 1) = project_id || '/' and substr(image_path, length(project_id) + 2) ~ '^[A-Za-z0-9_-]{1,64}$')$c$),
      ('photos', 'photos_image_id_format', $c$image_id ~ '^[A-Za-z0-9_-]{0,64}$'$c$),
      ('job_documents', 'job_documents_file_id_format', $c$file_id ~ '^[A-Za-z0-9_-]{0,64}$'$c$)
    ) as v(tbl, name, expr) loop
    if to_regclass('public.' || c.tbl) is null then continue; end if;
    execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.name);
    exception when check_violation then
      raise notice '% on % left NOT VALID: some existing rows don''t pass (new and changed rows are checked)', c.name, c.tbl;
    end;
  end loop;
end $$;

-- ---------- schema version ----------
create or replace function public.schema_version() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text := '20261125001000_access_guards';
  recorded text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      execute 'select version || coalesce(''_'' || name, '''') from supabase_migrations.schema_migrations order by version desc limit 1'
        into recorded;
    exception when others then
      recorded := null;
    end;
    if recorded is not null and left(recorded, 14) > left(v, 14) then v := recorded; end if;
  end if;
  return v;
end $$;
revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
