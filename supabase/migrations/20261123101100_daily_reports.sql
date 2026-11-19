-- Structured daily reports: weather, crew & hours, work performed, deliveries, equipment, delays, safety, visitors and the
-- foreman's signature, kept as one JSON document on the existing daily log row (src/lib/dailyReport.ts). Old logs keep
-- report = null and still read as free text. job_logs already has row security, the synced_at trigger and the billing
-- write guard, so nothing else changes.
alter table public.job_logs add column if not exists report jsonb;
