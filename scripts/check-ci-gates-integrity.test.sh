#!/usr/bin/env bash
set -eu
DIRC="$(cd "$(dirname "$0")" && pwd)"; SCRIPT="$DIRC/check-ci-gates-integrity.sh"
fail=0; TMP=""
cleanup() { [ -n "${TMP:-}" ] && rm -rf "$TMP"; return 0; }
trap cleanup EXIT
REQUIRED="ci-lib.sh check-single-author.sh check-spec-guard.sh check-secret-scan.sh check-sast.sh check-ci-gates-integrity.sh ci-lib.test.sh check-single-author.test.sh check-spec-guard.test.sh check-ci-gates-integrity.test.sh"
setup() { TMP="$(mktemp -d)"; mkdir -p "$TMP/scripts"
  # full synced set: the real integrity script + stubs for the other 9
  cp "$SCRIPT" "$TMP/scripts/check-ci-gates-integrity.sh"
  for f in $REQUIRED; do
    [ -f "$TMP/scripts/$f" ] || printf '#stub %s\n' "$f" > "$TMP/scripts/$f"
  done
  ( cd "$TMP/scripts" && for f in $REQUIRED; do shasum -a 256 "$f"; done > .ci-gates-version ); }
run() { ( cd "$TMP/scripts" && bash check-ci-gates-integrity.sh 2>&1 ); }

setup; out="$(run)"; st=$?
if [ "$st" = 0 ] && printf '%s' "$out" | grep -q "OK"; then echo "ok   - full matching set => OK"; else echo "FAIL - matching ($st): $out"; fail=1; fi
# locally edited gate -> fail
printf '#stub EDITED\n' > "$TMP/scripts/check-sast.sh"
out="$(run)" && st=$? || st=$?
if [ "$st" = 1 ] && printf '%s' "$out" | grep -q "diverged"; then echo "ok   - edited => fail"; else echo "FAIL - edited not caught ($st)"; fail=1; fi
cleanup
# EMPTY stamp must not pass (zero loop iterations used to mean silent OK)
setup; : > "$TMP/scripts/.ci-gates-version"
out="$(run)" && st=$? || st=$?
if [ "$st" = 1 ] && printf '%s' "$out" | grep -q "is empty"; then echo "ok   - empty stamp => fail"; else echo "FAIL - empty stamp not caught ($st): $out"; fail=1; fi
cleanup
# SUBSET stamp (drop the line of a file you tampered) must not pass
setup
grep -v "check-sast.sh\$" "$TMP/scripts/.ci-gates-version" > "$TMP/sub" && mv "$TMP/sub" "$TMP/scripts/.ci-gates-version"
printf '#stub TAMPERED\n' > "$TMP/scripts/check-sast.sh"
out="$(run)" && st=$? || st=$?
if [ "$st" = 1 ] && printf '%s' "$out" | grep -q "missing from"; then echo "ok   - subset stamp => fail"; else echo "FAIL - subset stamp not caught ($st): $out"; fail=1; fi
cleanup
[ "$fail" -ne 0 ] && { echo "integrity tests: FAILED"; exit 1; }; echo "integrity tests: all passed"
