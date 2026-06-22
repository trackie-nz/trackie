#!/bin/sh
# Run pending DB migrations, then start the sync-server.
#
# The from-scratch build keeps the bundle under build/; the official prebuilt
# base image flattens it into the workdir. Detect which layout we are in.
set -e

if [ -f build/app.js ]; then
  base=build
else
  base=.
fi

echo "[entrypoint] running migrations..."
node "$base/scripts/run-migrations.js" up

echo "[entrypoint] starting sync-server..."
exec node "$base/app.js"
