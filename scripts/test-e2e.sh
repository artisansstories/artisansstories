#!/usr/bin/env bash
# npm run test:e2e — integration suite against a throwaway local Postgres.
# Brings the DB up (scripts/test-db.sh), runs every tests/e2e test, stops the DB.
#   E2E_KEEP_DB=1   leave the database running afterwards
#   E2E_SKIP_UI=1   skip the `next start` admin-page tests (no production build)
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="postgresql://postgres@127.0.0.1:54329/artisans_test"
exec npx vitest run -c vitest.e2e.config.ts "$@"
