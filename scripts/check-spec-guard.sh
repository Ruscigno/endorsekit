#!/usr/bin/env bash
# Warn (do NOT block) if the PR diff introduces deferred-scope / off-stack
# keywords. The forbidden list is GEAR-LOCAL: scripts/spec-guard-forbidden.txt
# (one regex alternative per line; '#' comments and blank lines ignored).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./ci-lib.sh
. "$DIR/ci-lib.sh"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
FORBIDDEN_FILE="${REPO_ROOT:-.}/scripts/spec-guard-forbidden.txt"

base="$(resolve_base)"
if ! fetch_err="$(git fetch origin "$base" --depth=200 --quiet 2>&1)"; then
  echo "spec-guard: note — base fetch failed: ${fetch_err:-unknown}" >&2
fi
if ! git rev-parse --verify --quiet "origin/$base" >/dev/null 2>&1; then
  echo "spec-guard: skipped (base 'origin/$base' unresolvable; warn-only gate)"; exit 0
fi
if [ ! -f "$FORBIDDEN_FILE" ]; then echo "spec-guard: OK (no forbidden list)"; exit 0; fi
pattern="$(grep -vE '^[[:space:]]*(#|$)' "$FORBIDDEN_FILE" | paste -sd'|' -)"
if [ -z "$pattern" ]; then echo "spec-guard: OK (empty forbidden list)"; exit 0; fi
# ^+[^+] skips the `+++ b/<path>` file headers (a keyword in a FILENAME is
# not scope creep); the gate's own config is data, not a finding.
matches="$(git diff "origin/$base...HEAD" -- ':(exclude)docs/**' ':(exclude)scripts/spec-guard-forbidden.txt' | grep -E '^\+[^+]' | grep -Eni "$pattern" || true)"
if [ -n "$matches" ]; then
  echo "WARNING spec-guard: PR introduces deferred-scope or off-stack keywords. Confirm with spec-guardian."
  printf '%s\n' "$matches"
fi
echo "spec-guard: OK (warn-only)"
