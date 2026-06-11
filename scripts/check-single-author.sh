#!/usr/bin/env bash
# Fail if any commit introduced by THIS PR carries a Co-Authored-By trailer.
# PR scope + base resolution come from ci-lib.sh (fail-loud, shallow-safe).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./ci-lib.sh
. "$DIR/ci-lib.sh"

if ! shas="$(pr_commit_range)"; then exit 1; fi
bad=0; checked=""
while IFS= read -r sha; do
  [ -n "$sha" ] || continue
  checked="${checked:+$checked }${sha:0:9}"
  if ! body="$(git log -1 --format='%B' "$sha")"; then
    echo "ERROR could not read commit message for $sha."; bad=1; continue
  fi
  if printf '%s\n' "$body" | grep -iqE '^Co-Authored-By:'; then
    echo "ERROR $(git log -1 --oneline "$sha") has a Co-Authored-By trailer (single-author policy)."; bad=1
  fi
done <<< "$shas"
if [ "$bad" -ne 0 ]; then echo "See .claude/rules/engineering.md — single author per commit."; exit 1; fi
echo "single-author: OK (checked: ${checked:-none})"
