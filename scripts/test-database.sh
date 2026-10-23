#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  printf 'Error: Docker is required for pnpm test:db but was not found in PATH.\n' >&2
  printf 'Install/start Docker, then run pnpm test:db again.\n' >&2
  exit 1
fi

# A new, unexposed container each time. No production URL or local data volume.
test_container="notetracker-db-test-$$"
trap 'docker rm -f "$test_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$test_container" \
  -e POSTGRES_PASSWORD=local-test-only "${NOTETRACKER_TEST_POSTGRES_IMAGE:-postgres:17}" >/dev/null
ready=false
for attempt in {1..30}; do
  if docker exec "$test_container" pg_isready -U postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  docker logs "$test_container"
  exit 1
fi
run_sql() {
  local sql_file="$1"
  if ! docker exec -i "$test_container" \
    psql -X -U postgres -v ON_ERROR_STOP=1 -q --echo-errors -o /dev/null \
    < "$sql_file"; then
    printf 'Error while applying %s\n' "$sql_file" >&2
    return 1
  fi
}
run_sql supabase/tests/auth-fixture.sql
for migration in supabase/migrations/*.sql; do
  run_sql "$migration"
done
run_sql supabase/tests/rls.sql
printf 'Database bootstrap and RLS tests passed.\n'
