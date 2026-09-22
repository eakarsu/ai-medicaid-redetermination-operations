#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local-sftp
if [ ! -f .local-sftp/host_key ]; then
  ssh-keygen -q -t ed25519 -N '' -f .local-sftp/host_key
fi
if [ ! -f .local-sftp/client_key ]; then
  ssh-keygen -q -t ed25519 -N '' -f .local-sftp/client_key
fi
chmod 600 .local-sftp/host_key .local-sftp/client_key
echo 'SFTP keys are ready in .local-sftp/'
