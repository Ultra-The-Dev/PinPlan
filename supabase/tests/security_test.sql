-- Security checks for 20261124100100_security_hardening.sql: run after supabase_stubs.sql, the migrations and the other
-- suites (ids and users here are its own). Any failed check raises an exception.
\set ON_ERROR_STOP on
-- Billing enforcement is off until launch (billing_settings.enforce); these checks need it on.
update public.billing_settings set enforce = true;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000005e1', 'sec-owner@example.com'),
                                          ('00000000-0000-0000-0000-0000000005e2', 'sec-admin@example.com'),
                                          ('00000000-0000-0000-0000-0000000005e3', 'sec-tech@example.com'),
                                          ('00000000-0000-0000-0000-0000000005e4', 'sec-outsider@example.com'),
                                          ('00000000-0000-0000-0000-0000000005e5', 'sec-leaver@example.com');

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
  if not coalesce(ok, false) then raise exception 'SECURITY CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end $$;
-- How many rows a statement touched (a delete hidden by row security touches none, without an error).
create function pg_temp.rows(stmt text) returns integer language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.as_anon(), pg_temp.check(boolean, text), pg_temp.fails(text),
  pg_temp.error_of(text), pg_temp.rows(text) to anon, authenticated;

-- ---------- a company: owner (e1), admin (e2), tech (e3), and e5 who will leave; e4 is an outsider ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
insert into public.projects (id, client_name, address, status) values ('sec-p1', 'Client', '1 Security St', 'estimate'),
                                                                       ('sec-p2', 'Client', '2 Security St', 'estimate');
insert into public.sheets (id, project_id, name, page_number, sort_order, image_id, width, height) values ('sec-s1', 'sec-p1', 'Main', 1, 0, 'sec-img1', 1000, 800);
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y) values ('sec-m1', 'sec-p1', 'sec-s1', 'cam', 0.5, 0.5),
                                                                                 ('sec-m2', 'sec-p1', 'sec-s1', 'cam', 0.4, 0.4);
select pg_temp.check(public.create_team('Security Test Co', 'Owner') is not null, 'owner starts a team');
insert into public.team_invites (code, team_id, role, email) values ('SECADMIN1', public.my_team_id(), 'admin', 'sec-admin@example.com'),
                                                                   ('SECTECH01', public.my_team_id(), 'tech', null),
                                                                   ('SECLEAVE1', public.my_team_id(), 'admin', 'sec-leaver@example.com');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select public.accept_team_invite('SECADMIN1', 'Admin');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
select public.accept_team_invite('SECTECH01', 'Tech');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e5');
select public.accept_team_invite('SECLEAVE1', 'Leaver');

-- The outsider works alone on a job of their own.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e4');
insert into public.projects (id, client_name, address, status) values ('sec-op1', 'Other', '9 Elsewhere Rd', 'estimate');

-- Files: proposal renders under <user id>/<token>/, plan images under <job id>/.
reset role;
insert into storage.objects (bucket_id, name) values
  ('proposals', '00000000-0000-0000-0000-0000000005e1/tok_sec_owner_aaaaaaaaaa/sheet.jpg'),
  ('proposals', '00000000-0000-0000-0000-0000000005e1/reports/rep_sec_owner_aaaaaaaaaa/photo.jpg'),
  ('proposals', '00000000-0000-0000-0000-0000000005e4/tok_sec_other_aaaaaaaaaa/sheet.jpg'),
  ('plans', 'sec-p1/sec-img1'),
  ('plans', 'sec-p1/sec-img2'),
  ('plans', 'sec-p1/sec-img3');

-- ---------- 1. nobody lists another person's proposal files ----------
set role anon;
select pg_temp.as_anon();
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'proposals') = 0, 'signed out: proposal files can''t be listed');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'plans') = 0, 'signed out: plan images can''t be listed');
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e4');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'proposals') = 1, 'outsider lists only their own proposal folder');
select pg_temp.check((select count(*) from storage.objects where name like '00000000-0000-0000-0000-0000000005e1/%') = 0, 'outsider can''t list the company''s proposal files');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'proposals') = 2, 'owner still lists their own proposal and report files');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'proposals') = 0, 'tech can''t list the owner''s proposal files');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'plans') = 3, 'tech still reads the job''s plan images');

-- ---------- 2. nobody takes over a job or a company ----------
select pg_temp.check(pg_temp.fails($$update public.projects set owner_id = '00000000-0000-0000-0000-0000000005e3' where id = 'sec-p1'$$), 'tech can''t make themselves the job owner');
select pg_temp.check(pg_temp.fails($$update public.projects set owner_id = '00000000-0000-0000-0000-0000000005e4' where id = 'sec-p1'$$), 'tech can''t hand the job to an outsider');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select pg_temp.check(pg_temp.fails($$update public.projects set owner_id = '00000000-0000-0000-0000-0000000005e2' where id = 'sec-p1'$$), 'admin can''t make themselves the job owner');
update public.projects set notes = 'gate code' where id = 'sec-p1';
select pg_temp.check((select notes from public.projects where id = 'sec-p1') = 'gate code', 'admin still edits the job');
select pg_temp.check(pg_temp.fails($$update public.teams set owner_id = '00000000-0000-0000-0000-0000000005e2'$$), 'admin can''t make themselves the company owner');
select pg_temp.check(pg_temp.fails($$update public.teams set created_at = now() - interval '9 years'$$), 'admin can''t change when the company was made');
update public.teams set name = 'Security Test Company', trades = '{electrical}', updated_at = now();
select pg_temp.check((select name from public.teams where id = public.my_team_id()) = 'Security Test Company', 'admin still renames the company and sets trades');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
select pg_temp.check(pg_temp.fails($$update public.teams set id = gen_random_uuid()$$), 'owner can''t change the company id');
select pg_temp.check(pg_temp.fails($$update public.teams set owner_id = '00000000-0000-0000-0000-0000000005e4'$$), 'owner can''t give the company away from the app');
select pg_temp.check(pg_temp.fails($$insert into public.project_members (project_id, user_id, role) values ('sec-p1', '00000000-0000-0000-0000-0000000005e4', 'editor')$$),
  'owner can''t add people to a job directly (sharing rows are the database''s)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e4');
select pg_temp.check(pg_temp.fails($$insert into public.project_members (project_id, user_id, role) values ('sec-p1', '00000000-0000-0000-0000-0000000005e4', 'owner')$$),
  'outsider can''t add themselves to a job');
reset role;
insert into public.project_members (project_id, user_id, role) values ('sec-p1', '00000000-0000-0000-0000-0000000005e4', 'owner');
set role authenticated;
select pg_temp.check((select count(*) from public.projects where id = 'sec-p1') = 0, 'a stale ''owner'' sharing row opens nothing');
select pg_temp.check(public.project_owner('sec-p1') is null and public.billing_owner('sec-p1') is null, 'owner lookups say nothing about someone else''s job');
reset role;
delete from public.project_members where project_id = 'sec-p1' and user_id = '00000000-0000-0000-0000-0000000005e4';
set role authenticated;

-- ---------- 3. real deletes are office work ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
select pg_temp.check(pg_temp.rows($$delete from public.markers where id = 'sec-m1'$$) = 0, 'tech can''t hard-delete a device');
select pg_temp.check(pg_temp.rows($$delete from public.sheets where id = 'sec-s1'$$) = 0, 'tech can''t hard-delete a sheet');
select pg_temp.check(pg_temp.rows($$delete from storage.objects where bucket_id = 'plans'$$) = 0, 'tech can''t delete plan images');
select pg_temp.check((select count(*) from public.markers where id = 'sec-m1') = 1 and (select count(*) from public.sheets where id = 'sec-s1') = 1,
  'the device and sheet are still there');
update public.markers set deleted = true where id = 'sec-m2';
select pg_temp.check((select deleted from public.markers where id = 'sec-m2'), 'tech still deletes a device the app''s way (soft)');
update public.markers set deleted = false where id = 'sec-m2';
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select pg_temp.check(pg_temp.rows($$delete from public.markers where id = 'sec-m2'$$) = 1, 'office can still hard-delete a device');
select pg_temp.check(pg_temp.rows($$delete from storage.objects where name = 'sec-p1/sec-img3'$$) = 1, 'office can still delete a plan image');

-- ---------- 5. proposals, reports, links and payments only on your own jobs ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e4');
select pg_temp.check(pg_temp.fails($$insert into public.proposals (id, project_id, snapshot) values ('tok_sec_foreign_aaaaaaaa', 'sec-p1', '{}')$$),
  'outsider can''t file a proposal on someone else''s job');
select pg_temp.check(pg_temp.fails($$insert into public.photo_reports (id, project_id, snapshot) values ('rep_sec_foreign_aaaaaaaa', 'sec-p1', '{}')$$),
  'outsider can''t file a photo report on someone else''s job');
select pg_temp.check(pg_temp.fails($$insert into public.proposals (id, project_id, snapshot) values ('tok_sec_nojob_aaaaaaaaaa', 'no-such-job', '{}')$$),
  'nobody can file a proposal on a job that doesn''t exist');
insert into public.proposals (id, project_id, snapshot) values ('tok_sec_own_aaaaaaaaaaaa', 'sec-op1', '{"lines": []}');
select pg_temp.check((select count(*) from public.proposals where id = 'tok_sec_own_aaaaaaaaaaaa') = 1, 'a proposal on your own job still works');

select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
insert into public.sales_documents (id, project_id, kind) values ('sec-d1', 'sec-p1', 'quote'), ('sec-d2', 'sec-p2', 'invoice');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_sec_link_aaaaaaaaaaa', 'sec-d1', 'sec-p1', '{}');
select pg_temp.check((select count(*) from public.document_links where id = 'tok_sec_link_aaaaaaaaaaa') = 1, 'a client link for a document on the job works');
select pg_temp.check(pg_temp.fails($$insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_sec_mixed_aaaaaaaaaa', 'sec-d2', 'sec-p1', '{}')$$),
  'a link can''t pair a job with another job''s document');
select pg_temp.check(pg_temp.fails($$insert into public.sales_document_payments (id, project_id, document_id, amount) values ('sec-pay1', 'sec-p1', 'sec-d2', 10)$$),
  'a payment can''t pair a job with another job''s document');
insert into public.sales_document_payments (id, project_id, document_id, amount) values ('sec-pay2', 'sec-p2', 'sec-d2', 10);
select pg_temp.check((select count(*) from public.sales_document_payments where id = 'sec-pay2') = 1, 'a payment on the document''s own job works');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e4');
select pg_temp.check(pg_temp.fails($$insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_sec_steal_aaaaaaaaaa', 'sec-d1', 'sec-op1', '{}')$$),
  'outsider can''t publish a link to another company''s document');
select pg_temp.check(pg_temp.fails($$insert into public.sales_document_payments (id, project_id, document_id, amount) values ('sec-pay3', 'sec-op1', 'sec-d1', -500)$$),
  'outsider can''t record a payment on another company''s document');

-- The office withdraws a proposal someone else on the job published.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
insert into public.proposals (id, project_id, snapshot) values ('tok_sec_ownerprop_aaaaaa', 'sec-p1', '{"lines": []}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
update public.proposals set status = 'revoked' where id = 'tok_sec_ownerprop_aaaaaa';
select pg_temp.check((select status from public.proposals where id = 'tok_sec_ownerprop_aaaaaa') = 'revoked', 'admin can withdraw the owner''s proposal');
select pg_temp.check(pg_temp.fails($$update public.proposals set owner_id = '00000000-0000-0000-0000-0000000005e4' where id = 'tok_sec_ownerprop_aaaaaa'$$),
  'admin can''t hand a proposal to someone outside the company');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
insert into public.photo_reports (id, project_id, snapshot) values ('rep_sec_ownerrep_aaaaaaaa', 'sec-p1', '{"title": "Rough-in"}');
select pg_temp.check(pg_temp.fails($$update public.photo_reports set owner_id = '00000000-0000-0000-0000-0000000005e4' where id = 'rep_sec_ownerrep_aaaaaaaa'$$),
  'nobody can hand a photo report to someone outside the company');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
select pg_temp.check(pg_temp.rows($$update public.photo_reports set snapshot = '{}', revoked = true where id = 'rep_sec_ownerrep_aaaaaaaa'$$) = 0,
  'tech can''t change or withdraw the office''s photo report');
insert into public.photo_reports (id, project_id, snapshot) values ('rep_sec_techrep_aaaaaaaaa', 'sec-p1', '{}');
select pg_temp.check(pg_temp.rows($$update public.photo_reports set revoked = true where id = 'rep_sec_techrep_aaaaaaaaa'$$) = 1,
  'tech can still withdraw their own photo report');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select pg_temp.check(pg_temp.rows($$update public.photo_reports set revoked = true where id = 'rep_sec_ownerrep_aaaaaaaa'$$) = 1,
  'admin can withdraw the owner''s photo report');

-- ---------- money and office-only tables stay away from technicians ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
insert into public.change_orders (id, project_id, title) values ('sec-co1', 'sec-p1', 'Extra cameras');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
select pg_temp.check((select count(*) from public.change_orders) = 0, 'tech can''t see change orders');
select pg_temp.check(pg_temp.fails($$insert into public.change_orders (id, project_id, title) values ('sec-co2', 'sec-p1', 'x')$$), 'tech can''t add change orders');
select pg_temp.check(pg_temp.fails($$insert into public.sheet_links (id, project_id, sheet_id, target) values ('sec-l1', 'sec-p1', 'sec-s1', '{"kind": "url", "url": "https://example.com"}')$$),
  'tech can''t add sheet links');
select pg_temp.check((select count(*) from public.proposals) = 0 and (select count(*) from public.document_links) = 0, 'tech sees no proposals or client links');

-- ---------- verifying is office work ----------
insert into public.tasks (id, project_id, title, status) values ('sec-t1', 'sec-p1', 'Mount camera', 'verified');
select pg_temp.check((select status from public.tasks where id = 'sec-t1') = 'done', 'tech can''t create a verified task');
update public.tasks set status = 'verified' where id = 'sec-t1';
select pg_temp.check((select status from public.tasks where id = 'sec-t1') = 'done', 'tech can''t verify a task');
update public.markers set install = '{"status": "verified"}' where id = 'sec-m1';
select pg_temp.check((select install from public.markers where id = 'sec-m1') is null, 'tech can''t mark a device verified');
update public.markers set install = '{"status": "installed"}' where id = 'sec-m1';
select pg_temp.check((select install ->> 'status' from public.markers where id = 'sec-m1') = 'installed', 'tech still records install progress');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
update public.markers set install = '{"status": "verified"}' where id = 'sec-m1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
update public.markers set install = '{"status": "issue"}' where id = 'sec-m1';
select pg_temp.check((select install ->> 'status' from public.markers where id = 'sec-m1') = 'verified', 'tech can''t undo the office''s verification');

-- ---------- private markups ----------
insert into public.plan_markups (id, project_id, sheet_id, kind, points, private, author_id)
  values ('sec-mk1', 'sec-p1', 'sec-s1', 'pen', '[0.1, 0.1, 0.2, 0.2]', true, '00000000-0000-0000-0000-0000000005e3');
select pg_temp.check((select count(*) from public.plan_markups where id = 'sec-mk1') = 1, 'author sees their private markup');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select pg_temp.check((select count(*) from public.plan_markups where id = 'sec-mk1') = 0, 'others (even the office) can''t see a private markup');
-- The database stamps the author (20261125001000_access_guards.sql): a markup sent under someone else's id is filed
-- under the sender's own.
insert into public.plan_markups (id, project_id, sheet_id, kind, private, author_id)
  values ('sec-mk2', 'sec-p1', 'sec-s1', 'pen', true, '00000000-0000-0000-0000-0000000005e3');
select pg_temp.check((select author_id from public.plan_markups where id = 'sec-mk2') = '00000000-0000-0000-0000-0000000005e2',
  'nobody files a private markup under someone else''s name');

-- ---------- a stale RFI copy never blanks an answer ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
insert into public.rfis (id, project_id, subject, status, ball_in_court, answer, answered_by, answered_at, share_token, sent_at)
  values ('sec-r1', 'sec-p1', 'Ceiling height?', 'answered', 'us', '9 ft', 'Architect', now(), 'rfi_sec_token_aaaaaaaa', now());
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
update public.rfis set status = 'open', ball_in_court = 'them', answer = null, answered_by = null, answered_at = null, share_token = null where id = 'sec-r1';
select pg_temp.check((select answer = '9 ft' and status = 'answered' and share_token is not null from public.rfis where id = 'sec-r1'), 'a stale RFI copy keeps the answer and the link');

-- ---------- 4. someone who leaves: their work stays with the company ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e5');
insert into public.projects (id, client_name, address, status) values ('sec-p5', 'Their client', '5 Leaver Ln', 'estimate');
insert into public.proposals (id, project_id, snapshot) values ('tok_sec_leaver_aaaaaaaaa', 'sec-p5', '{"lines": []}');
insert into public.photo_reports (id, project_id, snapshot) values ('rep_sec_leaver_aaaaaaaaa', 'sec-p5', '{}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select public.remove_team_member('00000000-0000-0000-0000-0000000005e5');
select pg_temp.check((select owner_id from public.projects where id = 'sec-p5') = '00000000-0000-0000-0000-0000000005e1', 'the removed person''s job now belongs to the company owner');
select pg_temp.check((select count(*) from public.proposals where id = 'tok_sec_leaver_aaaaaaaaa' and owner_id = '00000000-0000-0000-0000-0000000005e1') = 1, 'their proposals stay with the company');
select pg_temp.check((select count(*) from public.photo_reports where id = 'rep_sec_leaver_aaaaaaaaa' and owner_id = '00000000-0000-0000-0000-0000000005e1') = 1, 'their photo reports stay with the company');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e5');
select pg_temp.check((select count(*) from public.projects) = 0, 'the removed person sees none of the jobs');
select pg_temp.check((select count(*) from public.proposals) = 0 and (select count(*) from public.photo_reports) = 0, 'or their proposals and reports');
reset role;
select pg_temp.check((select count(*) from public.project_members where user_id = '00000000-0000-0000-0000-0000000005e5') = 0, 'their job sharing rows are gone');
set role authenticated;

-- ---------- lapsed subscription: real deletes are refused too ----------
reset role;
update public.teams set plan_status = 'canceled', trial_ends_at = now() - interval '1 day' where owner_id = '00000000-0000-0000-0000-0000000005e1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select pg_temp.check(pg_temp.error_of($$delete from public.markers where id = 'sec-m1'$$) like '%subscription inactive%', 'a lapsed company can''t hard-delete job data');
select pg_temp.check((select count(*) from public.markers where id = 'sec-m1') = 1, 'the device is still there');
reset role;
update public.teams set plan_status = 'active' where owner_id = '00000000-0000-0000-0000-0000000005e1';

-- ---------- signed out: link pages only ----------
set role anon;
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.projects) = 0 and (select count(*) from public.proposals) = 0, 'signed out: no jobs or proposals (and no error)');
select pg_temp.check(pg_temp.fails($$select public.is_project_member('sec-p1')$$), 'signed out: helper functions can''t be called');
select pg_temp.check(pg_temp.fails($$select public.my_team_id()$$), 'signed out: team lookup can''t be called');
select pg_temp.check(pg_temp.fails($$truncate public.markers$$), 'signed out: no TRUNCATE');
select pg_temp.check(public.get_photo_report('rep_sec_leaver_aaaaaaaaa') is not null, 'signed out: a photo report link still opens');
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
select pg_temp.check(pg_temp.fails($$truncate public.markers$$), 'signed in: no TRUNCATE (it skips row security)');
reset role;

-- ---------- access guards (20261125001000_access_guards.sql) ----------
-- Plan files: a technician can't overwrite a file someone else uploaded; the office can.
update storage.objects set owner = '00000000-0000-0000-0000-0000000005e1' where bucket_id = 'plans' and name = 'sec-p1/sec-img1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
select pg_temp.check(pg_temp.rows($$update storage.objects set name = name where bucket_id = 'plans' and name = 'sec-p1/sec-img1'$$) = 0,
  'tech can''t overwrite a plan file the office uploaded');
insert into storage.objects (bucket_id, name, owner) values ('plans', 'sec-p1/sec-tech1', '00000000-0000-0000-0000-0000000005e3');
select pg_temp.check(pg_temp.rows($$update storage.objects set name = name where bucket_id = 'plans' and name = 'sec-p1/sec-tech1'$$) = 1,
  'tech can replace a plan file they uploaded');
-- Current Supabase storage fills owner_id (text) too.
insert into storage.objects (bucket_id, name, owner_id) values ('plans', 'sec-p1/sec-tech2', '00000000-0000-0000-0000-0000000005e3');
select pg_temp.check(pg_temp.rows($$update storage.objects set name = name where bucket_id = 'plans' and name = 'sec-p1/sec-tech2'$$) = 1,
  'tech can replace a plan file they uploaded (owner_id)');
select pg_temp.check(pg_temp.rows($$update storage.objects set owner_id = '00000000-0000-0000-0000-0000000005e3' where bucket_id = 'plans' and name = 'sec-p1/sec-img1'$$) = 0,
  'tech can''t claim a plan file the office uploaded');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name, owner) values ('plans', 'sec-op1/x', '00000000-0000-0000-0000-0000000005e3')$$),
  'nobody uploads into another company''s job folder');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select pg_temp.check(pg_temp.rows($$update storage.objects set name = name where bucket_id = 'plans' and name = 'sec-p1/sec-img1'$$) = 1,
  'the office can replace any plan file on the job');

-- Proposal and photo report images: only <me>/<token>/<id>.jpg or <me>/reports/<token>/<id>.jpg.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
select pg_temp.check(not pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('proposals', '00000000-0000-0000-0000-0000000005e1/tok_sec_owner_bbbbbbbbbb/sheet_1.jpg')$$),
  'a proposal plan render uploads');
select pg_temp.check(not pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('proposals', '00000000-0000-0000-0000-0000000005e1/reports/rep_sec_owner_bbbbbbbbbb/ph-1.jpg')$$),
  'a photo report image uploads');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('proposals', '00000000-0000-0000-0000-0000000005e1/page.html')$$),
  'no loose files at the top of the folder');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('proposals', '00000000-0000-0000-0000-0000000005e1/tok_sec_owner_bbbbbbbbbb/x.svg')$$),
  'no SVG (or anything but .jpg) in the public bucket');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('proposals', '00000000-0000-0000-0000-0000000005e1/short/x.jpg')$$),
  'the folder must be a link token');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('proposals', '00000000-0000-0000-0000-0000000005e1/tok_sec_owner_bbbbbbbbbb/a/b.jpg')$$),
  'no deeper folders');
reset role;
select pg_temp.check((select file_size_limit = 10485760 and allowed_mime_types @> array['image/jpeg'] and not allowed_mime_types && array['image/svg+xml', 'text/html']
  from storage.buckets where id = 'proposals'), 'proposals bucket: 10 MB, images only, no SVG');
select pg_temp.check((select file_size_limit = 52428800 and allowed_mime_types @> array['image/jpeg', 'image/png', 'application/pdf']
  and not allowed_mime_types && array['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/javascript']
  from storage.buckets where id = 'plans'), 'plans bucket: 50 MB, images, PDF and office files, no SVG or HTML');

-- Markups: the author is stamped and never changes; markups with no author are the office's.
insert into public.plan_markups (id, project_id, sheet_id, kind) values ('sec-mk3', 'sec-p1', 'sec-s1', 'pen');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e3');
select pg_temp.check(pg_temp.rows($$update public.plan_markups set text = 'tech' where id = 'sec-mk3'$$) = 0, 'tech can''t edit a markup with no author');
select pg_temp.check(pg_temp.rows($$delete from public.plan_markups where id = 'sec-mk3'$$) = 0, 'tech can''t delete a markup with no author');
insert into public.plan_markups (id, project_id, sheet_id, kind) values ('sec-mk4', 'sec-p1', 'sec-s1', 'pen');
update public.plan_markups set author_id = '00000000-0000-0000-0000-0000000005e2' where id = 'sec-mk4';
select pg_temp.check((select author_id from public.plan_markups where id = 'sec-mk4') = '00000000-0000-0000-0000-0000000005e3', 'a markup''s author never changes');
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e2');
select pg_temp.check(pg_temp.rows($$update public.plan_markups set text = 'office' where id = 'sec-mk3'$$) = 1, 'the office edits a markup with no author');

-- Ids that become storage paths are plain ids.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005e1');
select pg_temp.check(pg_temp.fails($$insert into public.projects (id, client_name, address, status) values ('sec-p9/../sec-p1', 'C', 'A', 'estimate')$$), 'a job id can''t hold a path');
select pg_temp.check(pg_temp.fails($$insert into public.projects (id, client_name, address, status) values (repeat('a', 65), 'C', 'A', 'estimate')$$), 'a job id is at most 64 characters');
select pg_temp.check(pg_temp.fails($$insert into public.sheets (id, project_id, name, page_number, sort_order, image_id, width, height) values ('sec-s9', 'sec-p1', 'X', 1, 0, '../x', 10, 10)$$),
  'a sheet image id can''t hold a path');
select pg_temp.check(pg_temp.fails($$update public.sheets set image_path = 'sec-op1/sec-img1' where id = 'sec-s1'$$), 'a sheet image path stays in its own job folder');
select pg_temp.check(pg_temp.fails($$update public.sheets set image_path = 'sec-p1/a/b' where id = 'sec-s1'$$), 'a sheet image path is <job>/<id>');
update public.sheets set image_path = 'sec-p1/sec-img1' where id = 'sec-s1';
select pg_temp.check((select image_path from public.sheets where id = 'sec-s1') = 'sec-p1/sec-img1', 'a normal sheet image path is fine');
select pg_temp.check(pg_temp.fails($$insert into public.photos (id, project_id, image_id) values ('sec-ph9', 'sec-p1', 'a b')$$), 'a photo image id is a plain id');
select pg_temp.check(pg_temp.fails($$insert into public.job_documents (id, project_id, file_id) values ('sec-jd9', 'sec-p1', 'x.html')$$), 'a document file id is a plain id');
-- The apps send '' for a row that lost its file id (syncMap NOT_NULL_DEFAULTS); it names no file, so it isn't refused.
select pg_temp.check(not pg_temp.fails($$insert into public.photos (id, project_id, image_id) values ('sec-ph8', 'sec-p1', '')$$), 'a photo row without an image id still syncs');
reset role;
select pg_temp.check((select bool_and(convalidated) from pg_constraint where conname in
  ('projects_id_format', 'sheets_image_id_format', 'sheets_image_path_format', 'photos_image_id_format', 'job_documents_file_id_format')), 'the id checks are validated');
select pg_temp.check((select count(*) from pg_constraint where conname in
  ('projects_id_format', 'sheets_image_id_format', 'sheets_image_path_format', 'photos_image_id_format', 'job_documents_file_id_format')) = 5, 'all five id checks exist');

-- ---------- catalog ----------
select pg_temp.check(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'every security-definer function pins its search_path');
select pg_temp.check((
  select coalesce(array_agg(p.proname::text order by p.proname), '{}') from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosecdef and has_function_privilege('anon', p.oid, 'execute'))
  = array['get_document', 'get_photo_report', 'get_proposal', 'respond_document', 'respond_proposal', 'schema_version', 'team_invite_info'],
  'signed out, only the link pages and the invite lookup are callable');
select pg_temp.check(not exists (
  select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
         or has_table_privilege('anon', c.oid, 'TRIGGER') or has_table_privilege('authenticated', c.oid, 'TRIGGER')
         or has_table_privilege('anon', c.oid, 'REFERENCES') or has_table_privilege('authenticated', c.oid, 'REFERENCES'))),
  'the API roles have no TRUNCATE, TRIGGER or REFERENCES on any table');
select pg_temp.check(not exists (
  select 1 from pg_policies where schemaname = 'public' and cmd = 'ALL' and policyname like '%\_member' and qual not like '%is_tech()%'),
  'no job table lets technicians in through an all-in-one rule (deletes are separate)');
select pg_temp.check(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_members' and cmd <> 'SELECT'),
  'project_members is read-only from the apps');
select pg_temp.check((select roles from pg_policies where schemaname = 'storage' and policyname = 'proposals_files_read') = '{authenticated}',
  'proposal files are listed by signed-in users only');

\echo SECURITY CHECKS PASSED
