-- Trades: PinPlan for electrical, fire alarm, HVAC, plumbing, solar/EV and general contractors as well as low voltage.
-- * device_types.category and closets.kind accept one fixed superset of ids shared by the web and iPad apps
--   (existing ids unchanged). See docs/trades.md.
-- * runs.circuit (jsonb) and markers.circuit (text): electrical circuit details, optional.
-- * teams.trades: the company's trades (primary first) so every member of a team shares them.
-- Safe to run more than once.

-- ---------- category / closet kind superset ----------
do $$
declare c record;
begin
  -- The init migration's checks have generated names: find them by what they check.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.device_types'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.device_types drop constraint %I', c.conname);
  end loop;
  for c in
    select conname from pg_constraint
    where conrelid = 'public.closets'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.closets drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.device_types add constraint device_types_category_check check (category in (
  'security', 'network', 'audio', 'video', 'smarthome', 'lighting', 'shades', 'infrastructure',
  'power', 'switching', 'panels', 'fire', 'hvac', 'plumbing', 'solar', 'ev', 'general'
));

alter table public.closets add constraint closets_kind_check check (kind in (
  'equipment', 'switch', 'rack',
  'panel', 'subpanel', 'facp', 'nac', 'airhandler', 'condenser', 'waterheater', 'manifold', 'inverter'
));

-- ---------- electrical circuits ----------
-- runs.circuit: { number, breakerA, volts, poles, description } — a circuit's home run to its panel.
alter table public.runs add column if not exists circuit jsonb;
alter table public.runs drop constraint if exists runs_circuit_check;
alter table public.runs add constraint runs_circuit_check
  check (circuit is null or (jsonb_typeof(circuit) = 'object' and pg_column_size(circuit) <= 2048));

-- markers.circuit: the panel circuit number a device is on ("12", "3/5"); its panel is closet_id.
alter table public.markers add column if not exists circuit text;
alter table public.markers drop constraint if exists markers_circuit_check;
alter table public.markers add constraint markers_circuit_check check (circuit is null or char_length(circuit) <= 32);

-- ---------- the company's trades ----------
alter table public.teams add column if not exists trades text[] not null default '{}';
alter table public.teams drop constraint if exists teams_trades_check;
alter table public.teams add constraint teams_trades_check check (
  cardinality(trades) <= 16
  and trades <@ array['lowvoltage', 'electrical', 'fire', 'hvac', 'plumbing', 'solar', 'general']::text[]
);
