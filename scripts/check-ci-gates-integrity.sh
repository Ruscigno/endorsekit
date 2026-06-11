#!/usr/bin/env bash
# Fail if a synced CI-gate script was edited locally without re-syncing.
# Compares sha256 of local scripts to the committed .ci-gates-version stamp.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$DIR/.ci-gates-version"
if [ ! -f "$STAMP" ]; then echo "ERROR missing $STAMP — run sync-ci-gates.sh."; exit 1; fi
fail=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  want="${line%% *}"; name="${line##* }"
  got="$(shasum -a 256 "$DIR/$name" 2>/dev/null | awk '{print $1}')"
  if [ "$got" != "$want" ]; then
    echo "ERROR CI gate '$name' diverged from canonical — re-run sync-ci-gates.sh."; fail=1
  fi
done < "$STAMP"
if [ "$fail" -ne 0 ]; then exit 1; fi
echo "ci-gates-integrity: OK"
