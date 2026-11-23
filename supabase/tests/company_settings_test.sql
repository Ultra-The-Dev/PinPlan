-- Company settings checks: run after the migrations. Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000cc1', 'cowner@example.com'),
                                          ('00000000-0000-0000-0000-000000000cc2', 'ctech@example.com'),
                                          ('00000000-0000-0000-0000-000000000cc3', 'coffice@example.com'),
                                          ('00000000-0000-0000-0000-000000000cc4', 'coutsider@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role": "anon"}', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'COMPANY SETTINGS CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

set role authenticated;

-- ---------- a company: owner, office admin, technician ----------
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc1');
select pg_temp.check(public.create_team('Settings Co', 'Olivia') is not null, 'owner creates a team');
insert into public.team_invites (code, team_id, role, name, email) values ('CSTECH0001', public.my_team_id(), 'tech', 'Tom', null), ('CSOFFICE01', public.my_team_id(), 'admin', 'Ann', 'coffice@example.com');
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc2');
select pg_temp.check(public.accept_team_invite('CSTECH0001', '') ->> 'role' = 'tech', 'tech joins');
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc3');
select pg_temp.check(public.accept_team_invite('CSOFFICE01', '') ->> 'role' = 'admin', 'admin joins');

-- ---------- the owner writes, everyone on the team reads ----------
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc1');
insert into public.company_settings (owner_id, business_name, phone, address, terms, logo_image_id)
  values (public.my_billing_owner(), 'Settings Co', '555-0100', '1 Main St', 'Net 30', 'img1');
select pg_temp.check((select updated_by from public.company_settings) = '00000000-0000-0000-0000-000000000cc1', 'the database stamps who saved it');

select pg_temp.as_user('00000000-0000-0000-0000-000000000cc3');
select pg_temp.check((select business_name from public.company_settings) = 'Settings Co', 'admin reads the company row');
update public.company_settings set phone = '555-0199', updated_at = now() where owner_id = public.my_billing_owner();
select pg_temp.check((select phone from public.company_settings) = '555-0199', 'admin updates it');
select pg_temp.check((select updated_by from public.company_settings) = '00000000-0000-0000-0000-000000000cc3', 'updated_by follows the editor');

select pg_temp.as_user('00000000-0000-0000-0000-000000000cc2');
select pg_temp.check((select business_name from public.company_settings) = 'Settings Co', 'tech reads the company row');
update public.company_settings set business_name = 'Hacked' where owner_id = public.my_billing_owner();
select pg_temp.check((select business_name from public.company_settings) = 'Settings Co', 'tech cannot update it');
select pg_temp.check(pg_temp.fails($q$insert into public.company_settings (owner_id, business_name) values ('00000000-0000-0000-0000-000000000cc2', 'Mine')$q$), 'tech cannot insert a row');
delete from public.company_settings;
select pg_temp.check((select count(*) from public.company_settings) = 1, 'tech cannot delete it');

-- ---------- outsiders and the public see nothing ----------
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc4');
select pg_temp.check((select count(*) from public.company_settings) = 0, 'outsider cannot read another company');
update public.company_settings set business_name = 'Hacked';
select pg_temp.check(pg_temp.fails($q$insert into public.company_settings (owner_id, business_name) values ('00000000-0000-0000-0000-000000000cc1', 'Hijack') on conflict (owner_id) do update set business_name = 'Hijack'$q$), 'outsider cannot write the company row');
insert into public.company_settings (owner_id, business_name) values (public.my_billing_owner(), 'Solo Shop');
select pg_temp.check((select business_name from public.company_settings) = 'Solo Shop', 'someone working alone keeps their own row');
reset role;
select pg_temp.check((select business_name from public.company_settings where owner_id = '00000000-0000-0000-0000-000000000cc1') = 'Settings Co', 'the company row is unchanged');
set role anon;
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails('select count(*) from public.company_settings'), 'anon cannot read it at all');
reset role;

select pg_temp.check(pg_temp.fails($q$insert into public.company_settings (owner_id, phone) values ('00000000-0000-0000-0000-000000000cc3', repeat('9', 61))$q$), 'lengths are capped');

-- ---------- preferences: merged section by section, newest wins; prices stay with the office ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc1');
update public.company_settings set preferences = '{"checklistTemplates": {"value": [{"id": "t1"}], "updatedAt": "2026-11-20T10:00:00.000Z"}, "branding": {"value": {"tagline": "A"}, "updatedAt": "2026-11-20T10:00:00.000Z"}}'
  where owner_id = public.my_billing_owner();
select pg_temp.check((select preferences -> 'checklistTemplates' -> 'value' -> 0 ->> 'id' from public.company_settings) = 't1', 'owner saves preferences');
select pg_temp.check((select business_name from public.company_settings) = 'Settings Co', 'saving preferences leaves the business details');

select pg_temp.as_user('00000000-0000-0000-0000-000000000cc3');
update public.company_settings set preferences = '{"branding": {"value": {"tagline": "B"}, "updatedAt": "2026-11-21T10:00:00.000Z"}, "formTemplates": {"value": [], "updatedAt": "2026-11-21T10:00:00.000Z"}}'
  where owner_id = public.my_billing_owner();
select pg_temp.check((select preferences -> 'branding' -> 'value' ->> 'tagline' from public.company_settings) = 'B', 'a newer section replaces the older one');
select pg_temp.check((select preferences ? 'checklistTemplates' from public.company_settings), 'sections a write leaves out stay');
select pg_temp.check((select preferences ? 'formTemplates' from public.company_settings), 'a new section is added');
update public.company_settings set preferences = '{"branding": {"value": {"tagline": "Old"}, "updatedAt": "2026-11-19T10:00:00.000Z"}, "junk": 5, "bad": {"value": 1, "updatedAt": "not a time"}}'
  where owner_id = public.my_billing_owner();
select pg_temp.check((select preferences -> 'branding' -> 'value' ->> 'tagline' from public.company_settings) = 'B', 'an older section never wins');
select pg_temp.check((select not (preferences ? 'junk') and not (preferences ? 'bad') from public.company_settings), 'anything that is not a section is dropped');
-- An app from before this column upserts the whole row without it: the preferences stay.
insert into public.company_settings (owner_id, business_name, updated_at) values (public.my_billing_owner(), 'Settings Co', now())
  on conflict (owner_id) do update set business_name = excluded.business_name, updated_at = excluded.updated_at;
select pg_temp.check((select preferences -> 'branding' -> 'value' ->> 'tagline' from public.company_settings) = 'B', 'an older app''s save keeps the preferences');

select pg_temp.as_user('00000000-0000-0000-0000-000000000cc2');
select pg_temp.check((select preferences -> 'branding' -> 'value' ->> 'tagline' from public.company_settings) = 'B', 'tech reads the shared preferences');
update public.company_settings set preferences = '{"branding": {"value": {"tagline": "Tech"}, "updatedAt": "2030-01-01T00:00:00.000Z"}}';
select pg_temp.check((select preferences -> 'branding' -> 'value' ->> 'tagline' from public.company_settings) = 'B', 'tech cannot change the preferences');

-- Office-only preferences (pricing) live on document_settings.
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc1');
insert into public.document_settings (owner_id, config, updated_at) values (public.my_billing_owner(), '{}', '1970-01-01T00:00:00Z')
  on conflict (owner_id) do nothing;
update public.document_settings set preferences = '{"pricing": {"value": {"markupPct": 25}, "updatedAt": "2026-11-21T10:00:00.000Z"}}'
  where owner_id = public.my_billing_owner();
select pg_temp.check((select (preferences -> 'pricing' -> 'value' ->> 'markupPct')::int from public.document_settings) = 25, 'owner saves pricing');
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc3');
select pg_temp.check((select (preferences -> 'pricing' -> 'value' ->> 'markupPct')::int from public.document_settings) = 25, 'admin reads pricing');
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc2');
select pg_temp.check((select count(*) from public.document_settings) = 0, 'tech cannot read pricing');
update public.document_settings set preferences = '{"pricing": {"value": {"markupPct": 0}, "updatedAt": "2030-01-01T00:00:00.000Z"}}';
reset role;
select pg_temp.check((select (preferences -> 'pricing' -> 'value' ->> 'markupPct')::int from public.document_settings where owner_id = '00000000-0000-0000-0000-000000000cc1') = 25, 'tech cannot change pricing');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000cc4');
select pg_temp.check((select count(*) from public.document_settings where owner_id = '00000000-0000-0000-0000-000000000cc1') = 0, 'outsider cannot read another company''s pricing');
reset role;

select 'COMPANY SETTINGS TESTS PASSED';
