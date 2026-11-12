-- Server-side secret store (e.g. the Billdu API key + secret), encrypted by the app with PINPLAN_ENCRYPTION_KEY
-- before it is written. Only the service-role key (used by the app's server routes) can read or write it:
-- RLS is enabled and there are deliberately no policies for anon/authenticated users.
create table if not exists public.app_secrets (
  name text primary key,
  payload text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
