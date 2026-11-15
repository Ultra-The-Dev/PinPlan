-- Pictogram drawn inside a device type's symbol (or 'letters' for its symbol text).
alter table public.device_types add column if not exists icon text;
