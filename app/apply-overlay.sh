#!/bin/sh
# Applies the TRACKIE overlay to an upstream actualbudget/actual checkout.
#
#   0. Backports upstream's Akahu bank-sync feature (PR #6041), which is not yet
#      in any released tag, as a single immutable commit diff (see below).
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
# Akahu bank sync. The Akahu feature lands in two layers: first this script
# backports the upstream feature (step 0), then the per-user overlay (drop-ins +
# patches) that makes its tokens per-user is layered on top.
# See patches/README.md for how the patches are authored and regenerated.
set -e

TARGET=${1:-$PWD}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

# ---------------------------------------------------------------------------
# Step 0: backport upstream Akahu bank sync (PR #6041)
# ---------------------------------------------------------------------------
# #6041 landed on master five days after v26.6.0 was tagged, so it is in no
# released tag yet. It was a squash merge, so one immutable commit diff carries
# the whole feature. We fetch it and `git apply --reject`: against v26.6.0, 23 of
# 24 files apply cleanly; exactly one hunk rejects - the single `akahu-accounts`
# method registration in loot-core accounts/app.ts, because the surrounding
# simplefin/gocardless lines drifted after the tag. Our zero-fuzz
# patches/akahu-6041-appmethod.patch (applied in step 2) covers that one line.
# Any OTHER reject means upstream drifted further, so we fail loudly here and the
# backport must be re-verified against the new base.
#
# Retire on release: when a tagged release (27.x) ships #6041, bump ACTUAL_VERSION
# to it and delete this step plus patches/akahu-6041-appmethod.patch - the per-user
# overlay then targets the released Akahu code directly.
AKAHU_PR_DIFF_URL="https://github.com/actualbudget/actual/commit/f1c0960fee7b470d4def336dbba6009d43fbd115.diff"
AKAHU_EXPECTED_REJECT="packages/loot-core/src/server/accounts/app.ts.rej"

echo "[overlay] backporting upstream Akahu PR #6041"
curl -fsSL "$AKAHU_PR_DIFF_URL" -o "$TARGET/.akahu-6041.diff"
# --reject exits non-zero on the one expected reject, so shield it from set -e.
git -C "$TARGET" apply --reject "$TARGET/.akahu-6041.diff" || true
rm -f "$TARGET/.akahu-6041.diff"

# Exactly the one known reject must be present - nothing more, nothing less.
rejects=$(cd "$TARGET" && find . -name '*.rej' | sed 's#^\./##' | sort)
if [ "$rejects" != "$AKAHU_EXPECTED_REJECT" ]; then
  echo "[overlay] FAIL: unexpected reject(s) backporting Akahu PR #6041:"
  printf '%s\n' "${rejects:-<none>}" | sed 's/^/  /'
  echo "[overlay] expected exactly: $AKAHU_EXPECTED_REJECT"
  echo "[overlay] upstream PR #6041 drifted vs this base - re-verify the backport."
  exit 1
fi
# The appmethod patch (step 2) re-adds the rejected line; drop the stray .rej so
# it does not linger in the build context.
rm -f "$TARGET/$AKAHU_EXPECTED_REJECT"

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
