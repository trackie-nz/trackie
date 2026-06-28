#!/bin/sh
# Prints the next release tag: <ACTUAL_VERSION>-trackie.<N>, where the base is
# read from release.yml and N is one past the highest existing tag for that base.
# Pass --push to also create the tag and push it (triggers the Release workflow).
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
release_yml="$repo_root/.github/workflows/release.yml"

base=$(sed -n "s/^[[:space:]]*ACTUAL_VERSION:[[:space:]]*['\"]\\([^'\"]*\\)['\"].*/\\1/p" "$release_yml")
[ -n "$base" ] || { echo "Could not read ACTUAL_VERSION from $release_yml" >&2; exit 1; }

git fetch --tags --quiet
highest=$(git tag --list "${base}-trackie.*" \
  | sed "s/^${base}-trackie\\.//" \
  | grep -E '^[0-9]+$' \
  | sort -n \
  | tail -1)
next="${base}-trackie.$(( ${highest:-0} + 1 ))"

git tag "$next"
echo "Tagged $next"

if [ "${1:-}" = "--push" ]; then
  git push origin "$next"
  echo "Pushed $next"
fi
