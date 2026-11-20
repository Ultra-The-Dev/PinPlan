#!/usr/bin/env bash
# Apply the Supabase migrations to a throwaway Postgres database (with Supabase stand-ins)
# and run the RLS checks. Usage: PGHOST=… PGPORT=… PGUSER=postgres scripts/test-supabase.sh
# Exits non-zero when a migration or any check fails (CI relies on this).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${PINPLAN_TEST_DB:-pinplan_rls_test}"  # set PINPLAN_TEST_DB when several runs share one server
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stubs.sql
for f in supabase/migrations/*.sql; do psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"; done
status=0
for t in rls_test teams_test billing_test documents_test daily_reports_test schedule_test forms_test security_test; do
  ok=1
  out=$(psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "supabase/tests/$t.sql" 2>&1) || ok=0
  printf '%s\n' "$out" | grep -E "^(NOTICE|psql|ERROR)|PASSED" | sed 's/^psql:[^ ]* //' || true
  if [ "$ok" = 0 ] || printf '%s\n' "$out" | grep -qE "FAILED|ERROR"; then
    echo "FAILED: supabase/tests/$t.sql" >&2
    status=1
  fi
done
exit $status
