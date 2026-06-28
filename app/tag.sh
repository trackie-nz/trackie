#!/bin/sh
# Sets and pushes the release tag: <ACTUAL_VERSION>-trackie.<N>, where the base is
# read from app/version.env and N is one past the highest existing tag for that base.
set -eu

version_env="$(cd "$(dirname "$0")" && pwd)/version.env"

base=$(grep '^ACTUAL_VERSION=' "$version_env" | cut -d= -f2)
[ -n "$base" ] || { echo "Could not read ACTUAL_VERSION from $version_env" >&2; exit 1; }

git fetch --tags --quiet
highest=$(git tag --list "${base}-trackie.*" \
  | sed "s/^${base}-trackie\\.//" \
  | grep -E '^[0-9]+$' \
  | sort -n \
  | tail -1)
next="${base}-trackie.$(( ${highest:-0} + 1 ))"

git tag "$next"
git push origin "$next"
echo "Tagged $next"
