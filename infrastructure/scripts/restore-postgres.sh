#!/usr/bin/env bash
set -euo pipefail

# Usage: DATABASE_URL=postgresql://user:pass@host:5432/db ./restore-postgres.sh backup.sql
IN="${1:-}"
if [[ -z "$IN" || ! -f "$IN" ]]; then
  echo "Provide an existing SQL dump path" >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$IN"
echo "Restored $IN into $DATABASE_URL"
