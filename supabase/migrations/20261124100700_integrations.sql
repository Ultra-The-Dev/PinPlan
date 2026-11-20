-- Accounting integrations (QuickBooks Online, Xero, and Billdu through the same framework). See docs/integrations.md.
-- Safe to run more than once.
--
-- Each company (a team, or a person without a team) connects its own accounting app. Only the app's server routes
-- touch these tables, with the service-role key: RLS is on and there are deliberately NO policies for anon /
-- authenticated, and their table grants are revoked (same model as team_secrets). OAuth tokens are encrypted by the
-- server (AES-256-GCM with PINPLAN_ENCRYPTION_KEY, bound to the owner and provider) before they are stored here.
--
-- integration_connections  one row per owner + provider: status, encrypted tokens, mapping settings, last sync.
-- integration_links        what each local invoice / credit note / payment / customer is called in the remote app.
-- integration_events       audit trail (connect, push, refresh, errors), shown as "last 20 events" in Settings.
-- integration_oauth_states single-use nonces (and the PKCE verifier) for an OAuth sign-in in progress (10 minutes).

create table if not exists public.integration_connections (
  owner_kind text not null check (owner_kind in ('team', 'user')),
  owner_id uuid not null,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect', 'disconnected', 'error')),
  -- Encrypted token set (access + refresh token); null for providers that keep their keys elsewhere.
  token_payload text,
  -- When the access token expires (refreshed shortly before) and when the refresh token stops working.
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  -- Non-secret facts about the connection: QuickBooks realmId, Xero tenantId, the remote company's name.
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  -- Mapping chosen in Settings (items, accounts, tax), and the accountant export's account names.
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  -- Bumped on every token write: refreshes use it as a compare-and-swap so two servers never both rotate a token.
  version integer not null default 1,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (owner_kind, owner_id, provider)
);

create table if not exists public.integration_links (
  owner_kind text not null check (owner_kind in ('team', 'user')),
  owner_id uuid not null,
  provider text not null,
  local_type text not null check (local_type in ('invoice', 'credit_note', 'payment', 'customer')),
  local_id text not null check (char_length(local_id) between 1 and 200),
  remote_id text check (remote_id is null or char_length(remote_id) <= 200),
  remote_number text check (remote_number is null or char_length(remote_number) <= 100),
  -- QuickBooks SyncToken (optimistic locking on updates).
  sync_token text check (sync_token is null or char_length(sync_token) <= 64),
  -- Fingerprint of what was last sent: an unchanged document is not sent again.
  hash text check (hash is null or char_length(hash) <= 128),
  remote_total numeric(14, 2),
  remote_status text check (remote_status is null or char_length(remote_status) <= 32),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  last_pushed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_kind, owner_id, provider, local_type, local_id)
);
create index if not exists integration_links_remote on public.integration_links (owner_kind, owner_id, provider, remote_id);

create table if not exists public.integration_events (
  id bigserial primary key,
  owner_kind text not null check (owner_kind in ('team', 'user')),
  owner_id uuid not null,
  provider text not null,
  kind text not null check (kind in ('connect', 'disconnect', 'refresh', 'test', 'push', 'void', 'error', 'settings')),
  ok boolean not null default true,
  local_type text,
  local_id text,
  remote_id text,
  message text check (message is null or char_length(message) <= 1000),
  actor uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists integration_events_recent on public.integration_events (owner_kind, owner_id, provider, created_at desc);

create table if not exists public.integration_oauth_states (
  nonce text primary key check (char_length(nonce) between 16 and 128),
  owner_kind text not null check (owner_kind in ('team', 'user')),
  owner_id uuid not null,
  provider text not null,
  -- Encrypted PKCE code verifier.
  verifier text not null,
  redirect_uri text not null check (char_length(redirect_uri) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index if not exists integration_oauth_states_expiry on public.integration_oauth_states (expires_at);

alter table public.integration_connections enable row level security;
alter table public.integration_links enable row level security;
alter table public.integration_events enable row level security;
alter table public.integration_oauth_states enable row level security;
revoke all on public.integration_connections, public.integration_links, public.integration_events, public.integration_oauth_states from public, anon, authenticated;
revoke all on sequence public.integration_events_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.integration_connections, public.integration_links, public.integration_events, public.integration_oauth_states to service_role;
grant usage, select on sequence public.integration_events_id_seq to service_role;

-- Keep the audit trail bounded: drop events older than a year and expired sign-in states (called by the server).
create or replace function public.prune_integration_rows() returns void
language sql security definer set search_path = public as $$
  delete from public.integration_oauth_states where expires_at < now() - interval '1 day';
  delete from public.integration_events where created_at < now() - interval '1 year';
$$;
revoke all on function public.prune_integration_rows() from public, anon, authenticated;
grant execute on function public.prune_integration_rows() to service_role;

notify pgrst, 'reload schema';
