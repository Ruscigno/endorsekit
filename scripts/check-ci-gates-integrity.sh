#!/usr/bin/env bash
# Fail if a synced CI-gate script was edited locally without re-syncing.
# Compares sha256 of local scripts to the committed .ci-gates-version stamp.
#
# The stamp lives in the same tree, so a PR that edits a gate AND recomputes
# the stamp passes here by design — that residual risk is accepted and is
# caught after merge by the central `make ci.check` (gear stamp vs canonical
# CHECKSUMS) plus human review of sync PRs; see design §4.4 / ADR-0009.
# What this gate DOES guarantee: no silent pass on a missing, empty or
# truncated stamp — every file of the synced set must be stamped and match.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$DIR/.ci-gates-version"
# must mirror SYNCED in iac-tickerbeats scripts/sync-ci-gates.sh (minus the
# gear-local spec-guard-forbidden.txt, which is data, not synced logic)
REQUIRED="ci-lib.sh check-single-author.sh check-spec-guard.sh check-secret-scan.sh check-sast.sh check-ci-gates-integrity.sh ci-lib.test.sh check-single-author.test.sh check-spec-guard.test.sh check-ci-gates-integrity.test.sh"
if [ ! -f "$STAMP" ]; then echo "ERROR missing $STAMP — run sync-ci-gates.sh."; exit 1; fi
if ! grep -q '[^[:space:]]' "$STAMP"; then
  echo "ERROR $STAMP is empty — a truncated stamp must not pass; re-run sync-ci-gates.sh."
  exit 1
fi
fail=0
for name in $REQUIRED; do
  if ! grep -q "[[:space:]]$name\$" "$STAMP"; then
    echo "ERROR '$name' missing from $STAMP — a subset stamp must not pass; re-run sync-ci-gates.sh."
    fail=1
  fi
done
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
