#!/usr/bin/env bash
# Encrypted-at-rest target optional; dumps a compressed snapshot with a timestamp.
# Recovery point objective for the demo: last nightly run. See docs/architecture.md (RC.RP).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; source ./.env; set +a; fi
if [ -z "${DATABASE_URL:-}" ]; then
  db_user="${PGUSER:-$(id -un)}"
  export DATABASE_URL="postgresql://$db_user@127.0.0.1:5432/profit_ai_medicaid_redetermination_operations"
fi
mkdir -p backups
outfile="backups/$(basename "$(/usr/bin/env python3 -c "import os,sys; print(os.path.basename(os.environ['DATABASE_URL'].split('?')[0]))" 2>/dev/null || echo db)")-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$outfile"
echo "Backup written: $outfile ($(du -h "$outfile" | cut -f1))"
# Retention: keep the 14 most recent snapshots (recovery window).
ls -t backups/*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --