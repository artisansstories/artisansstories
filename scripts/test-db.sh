#!/usr/bin/env bash
# Throwaway local Postgres for the e2e suite. NEVER points at Neon.
#   scripts/test-db.sh start   # init (if needed) + start + create db + prisma db push
#   scripts/test-db.sh reset   # drop + recreate the db + prisma db push
#   scripts/test-db.sh stop
#   scripts/test-db.sh status
set -euo pipefail
# postgres refuses to start on macOS without a valid locale ("postmaster became multithreaded").
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DATA_DIR="${TEST_DB_DIR:-/tmp/as-testdb}"
PORT="${TEST_DB_PORT:-54329}"
DB_NAME="${TEST_DB_NAME:-artisans_test}"
export DATABASE_URL="postgresql://postgres@127.0.0.1:${PORT}/${DB_NAME}"

cd "$(dirname "$0")/.."

push_schema() {
  case "$DATABASE_URL" in
    *127.0.0.1*|*localhost*) ;;
    *) echo "refusing: DATABASE_URL is not local" >&2; exit 1 ;;
  esac
  # prisma.config.ts loads .env; the exported DATABASE_URL wins over it.
  DATABASE_URL="$DATABASE_URL" npx prisma db push --accept-data-loss >/dev/null
  # Production-only tables/columns that raw-SQL services use (not in schema.prisma).
  "$PG_BIN/psql" -q -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f tests/e2e/sql/prod-drift.sql >/dev/null
}

running() { "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; }

start() {
  if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
    "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust >/dev/null
  fi
  if ! running; then
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA_DIR/server.log" -w start >/dev/null
  fi
  if ! "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
    "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$DB_NAME"
  fi
  push_schema
  echo "$DATABASE_URL"
}

reset() {
  running || start >/dev/null
  "$PG_BIN/dropdb" -h 127.0.0.1 -p "$PORT" -U postgres --if-exists "$DB_NAME"
  "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$DB_NAME"
  push_schema
  echo "$DATABASE_URL"
}

stop() {
  if running; then "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m fast -w stop >/dev/null; fi
}

case "${1:-}" in
  start) start ;;
  reset) reset ;;
  stop) stop ;;
  status) running && echo "running on $PORT" || echo "stopped" ;;
  url) echo "$DATABASE_URL" ;;
  *) echo "usage: $0 {start|stop|reset|status|url}" >&2; exit 2 ;;
esac
