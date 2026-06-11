#!/usr/bin/env bash
set -eu
SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-single-author.sh"
fail=0; TMP=""
cleanup() { cd / 2>/dev/null || true; [ -n "${TMP:-}" ] && rm -rf "$TMP"; return 0; }
trap cleanup EXIT
mkrepo() { TMP="$(mktemp -d)"; git init -q --bare "$TMP/remote.git"
  git clone -q "$TMP/remote.git" "$TMP/work" 2>/dev/null; cd "$TMP/work" || exit 1
  git config user.email t@e.com; git config user.name T; git config commit.gpgsign false
  git commit -q --allow-empty -m base; git branch -M main; git push -q origin main
  git remote set-head origin main; unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH; }
coauth() { printf '%s\n\nCo-authored-by: %s\n' "$1" "$2" | git commit -q --allow-empty -F -; }
short() { local s; s="$(git rev-parse "$1")" || { echo rev-parse-failed >&2; exit 1; }; printf '%s' "${s:0:9}"; }
expect() { local d="$1" w="$2" inc="${3:-}" exc="${4:-}" out st ok=1
  if out="$(bash "$SCRIPT" 2>&1)"; then st=0; else st=$?; fi
  [ "$st" -eq "$w" ] || ok=0
  [ -z "$inc" ] || printf '%s' "$out"|grep -qF "$inc" || ok=0
  [ -z "$exc" ] || ! printf '%s' "$out"|grep -qF "$exc" || ok=0
  if [ "$ok" = 1 ]; then echo "ok   - $d"; else echo "FAIL - $d (want $w got $st)"; printf '%s\n' "$out"|sed 's/^/  | /'; fail=1; fi; }

mkrepo; git checkout -q -b f; git commit -q --allow-empty -m clean
expect "clean PR passes" 0; cleanup
mkrepo; git checkout -q -b f; coauth "x" "S <s@e.com>"
expect "trailer fails" 1 "Co-Authored-By trailer"; cleanup
mkrepo; coauth "dep" "dependabot[bot] <b@e.com>"; git push -q origin main
b="$(short HEAD)"; git checkout -q -b f; git commit -q --allow-empty -m clean; ff="$(short HEAD)"
expect "base co-authored commit excluded; feature scanned" 0 "$ff" "$b"; cleanup
mkrepo; git checkout -q -b f; coauth "mid" "X <x@e.com>"; git commit -q --allow-empty -m tip
expect "intermediate trailer caught" 1; cleanup

# Unresolvable base must FAIL LOUDLY, never silently widen to a history walk —
# which would re-trip on a base-branch co-authored commit (the original
# Dependabot bug). The exc assert proves the gate fails for the RIGHT reason.
mkrepo; coauth "chore(deps): bump" "dependabot[bot] <bot@users.noreply.github.com>"
git push -q origin main
git checkout -q -b f; git commit -q --allow-empty -m clean
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=does-not-exist; export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
expect "unresolvable base fails loudly, not by tripping on a base commit" 1 "could not resolve base ref" "Co-Authored-By trailer"
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH; cleanup

# A NORMAL shallow PR — base within the clone depth — must PASS. The CI clone
# is always shallow (--depth=200), so a false-firing shallow guard would block
# every PR of every gear; this is the anti-false-fire regression net.
# `file://` forces a real shallow fetch (a bare local path would hardlink all
# objects and not be shallow). Main needs MORE commits than the script's own
# --depth=200 fetch window, or that fetch silently unshallows the test repo
# and the guard is never exercised (a guard mutated to fire on every shallow
# clone would then survive this test).
mkrepo
for i in $(seq 1 210); do git commit -q --allow-empty -m "m$i"; done
git push -q origin main
git checkout -q -b f; git commit -q --allow-empty -m clean
sha="$(git rev-parse HEAD)"; git push -q origin f
SH="$TMP/shallow"; mkdir -p "$SH"; cd "$SH" || exit 1
git init -q; git remote add origin "file://$TMP/remote.git"
git fetch --depth=3 origin "$sha" --quiet 2>/dev/null; git checkout -q FETCH_HEAD
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=main; export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
expect "shallow PR with reachable base passes (guard does not false-fire)" 0
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH; cleanup
[ "$fail" -ne 0 ] && { echo "single-author tests: FAILED"; exit 1; }; echo "single-author tests: all passed"
