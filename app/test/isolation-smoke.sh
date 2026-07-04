#!/bin/sh
# Cross-user budget-isolation smoke, shared by ci.yml (image-smoke) and
# release.yml (the pre-push smoke that gates the shipped image). Asserts one user
# cannot read, overwrite or list another user's budget file through app-sync.ts -
# the file the overlay never patches, so the zero-fuzz git-apply drift detector is
# blind to an isolation regression in it.
#
# Tests AUTHORISATION (the file.owner === userId gate), not AUTHENTICATION: the
# OIDC -> HMAC identity path is already covered by trackie-identity.test.ts and
# assert-overlay.sh, so two sessions are seeded directly (see ci-seed-users.cjs)
# rather than driving a login. It couples to the users/sessions schema on purpose
# - on schema drift the seed fails loudly rather than passing silently.
#
# Expects a container already running the image with the sync-server reachable at
# BASE. Both callers name the container `trackie` on port 5006, which are the
# defaults; override via env for other setups.
#
# Usage: sh app/test/isolation-smoke.sh
#        CONTAINER=foo BASE=http://localhost:5006/sync sh app/test/isolation-smoke.sh
set -eu

CONTAINER=${CONTAINER:-trackie}
BASE=${BASE:-http://localhost:5006/sync}   # app-sync.ts is mounted under /sync
FID=cialicefile
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

# Locate the account DB and ensure the user-files dir exists, without assuming the
# data dir path (the image default is /data, but derive it rather than hard-code).
DBFILE=$(docker exec "$CONTAINER" sh -c \
  'find / -path "*server-files/account.sqlite" -not -path "*/node_modules/*" 2>/dev/null | head -1')
test -n "$DBFILE" || { echo "account.sqlite not found in container"; exit 1; }
DATADIR=$(dirname "$(dirname "$DBFILE")")
docker exec "$CONTAINER" mkdir -p "$DATADIR/user-files"

# Seed from /app so the script resolves the server's own better-sqlite3.
docker cp "$SCRIPT_DIR/ci-seed-users.cjs" "$CONTAINER:/app/ci-seed-users.cjs"
docker exec "$CONTAINER" node /app/ci-seed-users.cjs "$DBFILE"

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "alice uploads her budget file (must be 200):"
test "$(code -X POST "$BASE/upload-user-file" \
  -H 'X-ACTUAL-TOKEN: ci-alice-token' \
  -H "X-ACTUAL-FILE-ID: $FID" \
  -H 'X-ACTUAL-NAME: alice-budget' \
  -H 'X-ACTUAL-FORMAT: 2' \
  -H 'Content-Type: application/actual-sync' \
  --data-binary 'ci-alice-secret-budget')" = 200

echo "bob downloads alice's file (must be 403):"
test "$(code "$BASE/download-user-file" \
  -H 'X-ACTUAL-TOKEN: ci-bob-token' -H "X-ACTUAL-FILE-ID: $FID")" = 403

echo "bob overwrites alice's file (must be 403):"
test "$(code -X POST "$BASE/upload-user-file" \
  -H 'X-ACTUAL-TOKEN: ci-bob-token' \
  -H "X-ACTUAL-FILE-ID: $FID" \
  -H 'X-ACTUAL-NAME: bob-hijack' \
  -H 'X-ACTUAL-FORMAT: 2' \
  -H 'Content-Type: application/actual-sync' \
  --data-binary 'ci-bob-overwrite')" = 403

echo "bob's file list must NOT contain alice's file id:"
BOB_LIST=$(curl -s "$BASE/list-user-files" -H 'X-ACTUAL-TOKEN: ci-bob-token')
echo "$BOB_LIST"
if echo "$BOB_LIST" | grep -q "$FID"; then
  echo "LEAK: bob's file list contains alice's file id"; exit 1
fi

echo "positive control - alice downloads her own file (must be 200):"
test "$(code "$BASE/download-user-file" \
  -H 'X-ACTUAL-TOKEN: ci-alice-token' -H "X-ACTUAL-FILE-ID: $FID")" = 200

echo "isolation smoke passed"
