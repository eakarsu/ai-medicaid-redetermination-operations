#!/bin/sh
# Container entrypoint: apply migrations, seed when empty, then start the API.
set -e
node scripts/migrate.mjs
node scripts/seed.mjs
exec node server.mjs
