-- Fix: "invalid input syntax for type integer" when syncing extra charges / custom estimate lines.
-- Their order is a timestamp (seconds with decimals on the iPad, milliseconds on the web), which doesn't fit a
-- whole-number column. Safe to run more than once.
alter table public.estimate_lines alter column sort_order type double precision;
notify pgrst, 'reload schema';
