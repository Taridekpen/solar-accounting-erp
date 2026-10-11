#!/usr/bin/env bash
set -euo pipefail

# Usage: DATABASE_URL=postgresql://user:pass@host:5432/db ./backup-postgres.sh [output.sql]
OUT="${1:-./backups/solar-$(date +%Y%m%d-%H%M%S).sql}"
mkdir -p "$(dirname "$OUT")"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

pg_dump --no-owner --format=plain --file="$OUT" "$DATABASE_URL"
echo "Wrote $OUT"
