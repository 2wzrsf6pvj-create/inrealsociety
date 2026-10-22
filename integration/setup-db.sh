#!/usr/bin/env bash
# integration/setup-db.sh — prépare une base VIDE pour les tests d'intégration :
# environnement façon Supabase, puis le bundle de migrations (scripts/fresh-setup.sql,
# identique à l'application 001→NNN une par une).
#
#   INTEGRATION_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
#     bash integration/setup-db.sh
set -euo pipefail

: "${INTEGRATION_DATABASE_URL:?INTEGRATION_DATABASE_URL requis}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql "$INTEGRATION_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$ROOT/integration/supabase-stub.sql" \
  2> >(grep -vE 'NOTICE|WARNING|HINT|already been granted' >&2)
psql "$INTEGRATION_DATABASE_URL" -q -v ON_ERROR_STOP=1 -1 -f "$ROOT/scripts/fresh-setup.sql" \
  2> >(grep -v 'NOTICE' >&2)

echo "✓ base prête ($(ls "$ROOT/supabase/migrations" | wc -l | tr -d ' ') migrations)"
