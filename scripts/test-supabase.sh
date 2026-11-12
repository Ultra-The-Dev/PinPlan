#!/usr/bin/env bash
# Apply the Supabase migrations to a throwaway Postgres database (with Supabase stand-ins)
# and run the RLS checks. Usage: PGHOST=… PGPORT=… PGUSER=postgres scripts/test-supabase.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="pinplan_rls_test"
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stubs.sql
for f in supabase/migrations/*.sql; do psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"; done
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql 2>&1 | grep -E "^(NOTICE|psql|ERROR)|PASSED" | sed 's/^psql:[^ ]* //'
