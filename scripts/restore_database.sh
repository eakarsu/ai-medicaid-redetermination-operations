#!/usr/bin/env bash
# Restores a backup produced by backup_database.sh into the configured database.
# Usage: scripts/restore_database.sh backups/<snapshot>.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${1:-}" ] || { echo "Usage: $0 backups/<snapshot>.sql.gz"; exit 1; }
[ -f "$1" ] || { echo "Snapshot not found: $1"; exit 1; }
if [ -f .env ]; then set -a; source ./.env; set +a; fi
if [ -z "${DATABASE_URL:-}" ]; then
  db_user="${PGUSER:-$(id -un)}"
  export DATABASE_URL="postgresql://$db_user@127.0.0.1:5432/profit_ai_medicaid_redetermination_operations"
fi
echo "Restoring $1 into ${DATABASE_URL%%\?*} (this drops and recreates the schema)…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null
gunzip -c "$1" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null
echo "Restore complete."
