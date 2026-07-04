#!/bin/sh
# Applies the TRACKIE overlay to an upstream actualbudget/actual checkout.
#
#   1. Drops in whole files from overlay/ (real, type-checked .ts, compiled by
#      the normal build): the /get-started route, the HMAC identity module, the
#      deny-by-default /admin guard, and the per-user Akahu server overlay.
#   2. Applies the few in-place hooks from patches/ with `git apply` (zero fuzz,
#      so upstream drift fails the build loudly - that IS the drift detector).
#
# Usage: sh apply-overlay.sh <path-to-actual-checkout>
#
# The overlay covers privacy sign-in (HMAC identity + reject unverified email),
# the deny-by-default /admin gateway, the /get-started deep link, and per-user NZ
# Akahu bank sync. Upstream's own Akahu bank sync ships from v26.7.0, so the
# overlay layers straight onto the released Akahu code: the per-user overlay
# (drop-ins + patches) only makes its admin-wide tokens per-user.
# See patches/README.md for how the patches are authored and regenerated.
set -e

TARGET=${1:-$PWD}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

echo "[overlay] copying drop-in files into $TARGET"
# overlay/ mirrors the monorepo tree, so a plain copy lands each file in place
# (packages/sync-server/src/...).
cp -r "$SCRIPT_DIR/overlay/." "$TARGET/"

echo "[overlay] applying in-place patches"
for patch in "$SCRIPT_DIR"/patches/*.patch; do
  echo "[overlay] git apply $(basename "$patch")"
  # --verbose surfaces which hunk failed; set -e aborts the build on any drift.
  git -C "$TARGET" apply --verbose "$patch"
done

# overlay/ was copied wholesale into TARGET; remove the stray copy so it does
# not linger in the build context (the packages/... files are already placed).
rm -rf "$TARGET/overlay"

echo "[overlay] done"
