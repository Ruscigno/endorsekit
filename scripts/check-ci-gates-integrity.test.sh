#!/usr/bin/env bash
set -eu
DIRC="$(cd "$(dirname "$0")" && pwd)"; SCRIPT="$DIRC/check-ci-gates-integrity.sh"
fail=0; TMP=""
cleanup() { [ -n "${TMP:-}" ] && rm -rf "$TMP"; return 0; }
trap cleanup EXIT
setup() { TMP="$(mktemp -d)"; mkdir -p "$TMP/scripts"
  printf '#a\n' > "$TMP/scripts/check-a.sh"
  ( cd "$TMP/scripts"; shasum -a 256 check-a.sh > .ci-gates-version )
  cp "$SCRIPT" "$TMP/scripts/check-ci-gates-integrity.sh"; }
setup; out="$(cd "$TMP/scripts" && bash check-ci-gates-integrity.sh 2>&1)"; st=$?
if { [ "$st" = 0 ] && printf '%s' "$out"|grep -q "OK"; }; then echo "ok   - matching => OK"; else echo "FAIL - matching ($st): $out"; fail=1; fi
printf '#a EDITED\n' > "$TMP/scripts/check-a.sh"
out="$(cd "$TMP/scripts" && bash check-ci-gates-integrity.sh 2>&1)" && st=$? || st=$?
if [ "$st" = 1 ]; then echo "ok   - edited => fail"; else echo "FAIL - edited not caught ($st)"; fail=1; fi
cleanup
[ "$fail" -ne 0 ] && { echo "integrity tests: FAILED"; exit 1; }; echo "integrity tests: all passed"
