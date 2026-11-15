-- Brand/model product library, per-job product choices, and cable bundles.

-- ---------- products ----------
create table public.products (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  -- Device type id, or 'wire:<cable type>' for cable products (priced per ft).
  device_type_id text not null,
  brand text not null default '',
  model text not null default '',
  sku text,
  unit_price double precision not null default 0,
  labor_price double precision not null default 0,
  notes text,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create trigger products_synced_at before insert or update on public.products
  for each row execute function public.set_synced_at();
create index products_synced_at_idx on public.products (synced_at);

alter table public.products enable row level security;
create policy products_owner on public.products for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- new columns ----------
-- { "<device type id>" | "wire:<cable type>": "<product id>" }
alter table public.projects add column if not exists product_choices jsonb;
-- Several cables to one device (e.g. ["HDMI","Cat6"]), and a per-device product.
alter table public.markers add column if not exists wires jsonb, add column if not exists product_id text;
-- The cables a home run carries when it is a bundle.
alter table public.runs add column if not exists wire_types jsonb;
