-- Accounting integration tables: only the server (service role) may read or write them. Run after the migrations.
-- Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c0a1', 'iowner@example.com'),
                                          ('00000000-0000-0000-0000-00000000c0a2', 'iother@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'INTEGRATIONS CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
grant execute on function pg_temp.check(boolean, text), pg_temp.fails(text), pg_temp.as_user(text) to anon, authenticated, service_role;

-- The server writes a connection, a link, an event and a sign-in state.
set role service_role;
insert into public.integration_connections (owner_kind, owner_id, provider, status, token_payload, meta, settings, connected_by, connected_at)
  values ('user', '00000000-0000-0000-0000-00000000c0a1', 'quickbooks', 'connected', 'iv.tag.enc', '{"realmId":"123"}', '{"itemId":"1"}', '00000000-0000-0000-0000-00000000c0a1', now());
insert into public.integration_links (owner_kind, owner_id, provider, local_type, local_id, remote_id, sync_token, hash, remote_total)
  values ('user', '00000000-0000-0000-0000-00000000c0a1', 'quickbooks', 'invoice', 'doc-1', '145', '0', 'abc', 100.00);
insert into public.integration_events (owner_kind, owner_id, provider, kind, ok, local_type, local_id, message)
  values ('user', '00000000-0000-0000-0000-00000000c0a1', 'quickbooks', 'push', true, 'invoice', 'doc-1', 'Sent INV-1');
insert into public.integration_oauth_states (nonce, owner_kind, owner_id, provider, verifier, redirect_uri)
  values ('nonce-0123456789abcdef', 'user', '00000000-0000-0000-0000-00000000c0a1', 'xero', 'enc', 'https://app.example.com/api/integrations/xero/callback');
select pg_temp.check((select count(*) from public.integration_connections) = 1, 'service role writes a connection');
select pg_temp.check((select expires_at > now() + interval '9 minutes' and expires_at <= now() + interval '10 minutes' from public.integration_oauth_states), 'sign-in states expire in 10 minutes');

-- One link per owner / provider / local document.
select pg_temp.check(pg_temp.fails($$insert into public.integration_links (owner_kind, owner_id, provider, local_type, local_id, remote_id)
  values ('user', '00000000-0000-0000-0000-00000000c0a1', 'quickbooks', 'invoice', 'doc-1', '999')$$), 'a document links once per provider');
insert into public.integration_links (owner_kind, owner_id, provider, local_type, local_id, remote_id)
  values ('user', '00000000-0000-0000-0000-00000000c0a1', 'xero', 'invoice', 'doc-1', 'x-1');
select pg_temp.check((select count(*) from public.integration_links) = 2, 'the same document can link to another provider');
select pg_temp.check(pg_temp.fails($$insert into public.integration_links (owner_kind, owner_id, provider, local_type, local_id) values ('user', '00000000-0000-0000-0000-00000000c0a1', 'xero', 'quote', 'q-1')$$), 'only invoices, credit notes, payments and customers link');
select pg_temp.check(pg_temp.fails($$insert into public.integration_connections (owner_kind, owner_id, provider, status) values ('user', '00000000-0000-0000-0000-00000000c0a2', 'xero', 'bogus')$$), 'status is checked');
select pg_temp.check(pg_temp.fails($$insert into public.integration_connections (owner_kind, owner_id, provider) values ('org', '00000000-0000-0000-0000-00000000c0a2', 'xero')$$), 'owner kind is checked');
select pg_temp.check(pg_temp.fails($$insert into public.integration_connections (owner_kind, owner_id, provider, meta) values ('user', '00000000-0000-0000-0000-00000000c0a2', 'xero', '[]')$$), 'meta is an object');
select pg_temp.check(pg_temp.fails($$insert into public.integration_oauth_states (nonce, owner_kind, owner_id, provider, verifier, redirect_uri) values ('short', 'user', '00000000-0000-0000-0000-00000000c0a1', 'xero', 'v', 'r')$$), 'nonces are long');

-- Refresh compare-and-swap: only the writer holding the current version wins.
update public.integration_connections set version = version + 1, token_payload = 'new' where provider = 'quickbooks' and version = 1;
update public.integration_connections set version = version + 1, token_payload = 'stale' where provider = 'quickbooks' and version = 1;
select pg_temp.check((select token_payload from public.integration_connections where provider = 'quickbooks') = 'new', 'a stale refresh does not overwrite the newer token');

-- A sign-in state is consumed once.
create temp table consumed (n int);
with d as (delete from public.integration_oauth_states where nonce = 'nonce-0123456789abcdef' and expires_at > now() returning 1) insert into consumed select count(*) from d;
with d as (delete from public.integration_oauth_states where nonce = 'nonce-0123456789abcdef' and expires_at > now() returning 1) insert into consumed select count(*) from d;
select pg_temp.check((select array_agg(n) from consumed) = array[1, 0], 'a sign-in state is used once');
select public.prune_integration_rows();
reset role;

-- Browsers (signed in or not) can't see or change any of it, even their own rows.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c0a1');
select pg_temp.check(pg_temp.fails('select * from public.integration_connections'), 'members cannot read connections (tokens)');
select pg_temp.check(pg_temp.fails('select * from public.integration_links'), 'members cannot read links');
select pg_temp.check(pg_temp.fails('select * from public.integration_events'), 'members cannot read events');
select pg_temp.check(pg_temp.fails('select * from public.integration_oauth_states'), 'members cannot read sign-in states');
select pg_temp.check(pg_temp.fails($$insert into public.integration_connections (owner_kind, owner_id, provider) values ('user', '00000000-0000-0000-0000-00000000c0a1', 'xero')$$), 'members cannot add a connection');
select pg_temp.check(pg_temp.fails($$update public.integration_connections set status = 'connected'$$), 'members cannot change a connection');
select pg_temp.check(pg_temp.fails($$delete from public.integration_links$$), 'members cannot delete links');
select pg_temp.check(pg_temp.fails($$insert into public.integration_events (owner_kind, owner_id, provider, kind) values ('user', '00000000-0000-0000-0000-00000000c0a1', 'xero', 'push')$$), 'members cannot forge events');
select pg_temp.check(pg_temp.fails('select public.prune_integration_rows()'), 'members cannot prune');
reset role;

set role anon;
select pg_temp.check(pg_temp.fails('select * from public.integration_connections'), 'anonymous cannot read connections');
select pg_temp.check(pg_temp.fails($$insert into public.integration_oauth_states (nonce, owner_kind, owner_id, provider, verifier, redirect_uri) values ('nonce-anon-0123456789', 'user', '00000000-0000-0000-0000-00000000c0a1', 'xero', 'v', 'r')$$), 'anonymous cannot plant a sign-in state');
reset role;

select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.integration_connections'::regclass), 'RLS is on (connections)');
select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.integration_links'::regclass), 'RLS is on (links)');
select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.integration_events'::regclass), 'RLS is on (events)');
select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.integration_oauth_states'::regclass), 'RLS is on (states)');
select pg_temp.check(not exists (select 1 from pg_policies where tablename like 'integration_%'), 'no policies on the integration tables');

select 'INTEGRATIONS TESTS PASSED';
