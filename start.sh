#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
shared_openrouter_env="$(cd .. && pwd)/.openrouter.env"
if [ -f "$shared_openrouter_env" ]; then set -a; source "$shared_openrouter_env"; set +a; fi
if [ -f .env ]; then set -a; source ./.env; set +a; fi
export UI_PORT="${UI_PORT:-4542}"
export API_PORT="${API_PORT:-5542}"
export UI_HOST="${UI_HOST:-127.0.0.1}"
export API_HOST="${API_HOST:-127.0.0.1}"
export PUBLIC_HOST="${PUBLIC_HOST:-$UI_HOST}"
export OPENROUTER_BASE_URL="${OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}"
export OPENROUTER_MODEL="${OPENROUTER_MODEL:-anthropic/claude-haiku-4.5}"
export SESSION_SECRET="${SESSION_SECRET:-local-demo-session-secret-change-before-production}"
# Separate key for AES-256-GCM ePHI field encryption (falls back to SESSION_SECRET if unset).
export PHI_ENCRYPTION_KEY="${PHI_ENCRYPTION_KEY:-local-demo-phi-encryption-key-change-before-production}"
api_pid=""
ui_pid=""
sftp_pid=""
cleanup() {
  for pid in "$ui_pid" "$api_pid" "$sftp_pid"; do
    if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
}
trap cleanup EXIT
if [ -z "${SFTP_HOST:-}" ]; then
  ./scripts/setup_sftp.sh >/dev/null
  mkdir -p .local-sftp/outbound .local-sftp/inbound
  sftp_root="$PWD/.local-sftp"
  sftp_binary="$(command -v sshd || true)"
  if [ -z "$sftp_binary" ] && [ -x /usr/sbin/sshd ]; then sftp_binary=/usr/sbin/sshd; fi
  if [ -z "$sftp_binary" ]; then echo "OpenSSH sshd is required for the local SFTP service." >&2; exit 1; fi
  export SFTP_HOST=127.0.0.1
  export SFTP_PORT="${SFTP_PORT:-2222}"
  export SFTP_USER="$(id -un)"
  export SFTP_PRIVATE_KEY_FILE="$sftp_root/client_key"
  export SFTP_HOST_KEY_FILE="$sftp_root/host_key.pub"
  export SFTP_OUTBOUND_PATH="$sftp_root/outbound"
  export SFTP_INBOUND_PATH="$sftp_root/inbound"
  cat > "$sftp_root/sshd_config" <<EOF
Port $SFTP_PORT
ListenAddress 127.0.0.1
HostKey $sftp_root/host_key
AuthorizedKeysFile $sftp_root/client_key.pub
PubkeyAuthentication yes
PasswordAuthentication no
ChallengeResponseAuthentication no
StrictModes no
UsePAM no
PidFile $sftp_root/sshd.pid
Subsystem sftp internal-sftp
EOF
  "$sftp_binary" -t -f "$sftp_root/sshd_config"
  "$sftp_binary" -D -e -f "$sftp_root/sshd_config" > "$sftp_root/sshd.log" 2>&1 &
  sftp_pid=$!
  for _ in {1..30}; do
    if ! kill -0 "$sftp_pid" 2>/dev/null; then cat "$sftp_root/sshd.log" >&2; exit 1; fi
    if nc -z 127.0.0.1 "$SFTP_PORT" >/dev/null 2>&1; then break; fi
    sleep 0.1
  done
  echo "RenewalCare SFTP: 127.0.0.1:$SFTP_PORT"
fi
if [ -z "${DATABASE_URL:-}" ]; then
  db_user="${PGUSER:-$(id -un)}"
  db_name="profit_ai_medicaid_redetermination_operations"
  if ! psql -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='$db_name'" | grep -q 1; then createdb -h 127.0.0.1 -U "$db_user" "$db_name"; fi
  export DATABASE_URL="postgresql://$db_user@127.0.0.1:5432/$db_name"
fi
PGOPTIONS='--client-min-messages=warning' psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
$(for migration in backend/migrations/*.sql; do echo "\\i $migration"; done)
SQL
node backend/scripts/seed.mjs
node backend/server.mjs &
api_pid=$!
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && break; sleep 0.1; done
echo "RenewalCare Medicaid UI: http://$PUBLIC_HOST:$UI_PORT"
echo "RenewalCare Medicaid API: http://$PUBLIC_HOST:$API_PORT"
cd frontend
./node_modules/.bin/vite --host "$UI_HOST" --port "$UI_PORT" &
ui_pid=$!
wait "$ui_pid"
