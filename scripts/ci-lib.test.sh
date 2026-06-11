#!/usr/bin/env bash
# Tests for ci-lib.sh (resolve_base, pr_commit_range). Plain bash + git.
set -eu
LIB="$(cd "$(dirname "$0")" && pwd)/ci-lib.sh"
fail=0; TMP=""
cleanup() { cd / 2>/dev/null || true; [ -n "${TMP:-}" ] && rm -rf "$TMP"; return 0; }
trap cleanup EXIT

mkrepo() {
  TMP="$(mktemp -d)"; git init -q --bare "$TMP/remote.git"
  git clone -q "$TMP/remote.git" "$TMP/work" 2>/dev/null
  cd "$TMP/work" || exit 1
  git config user.email t@e.com; git config user.name T; git config commit.gpgsign false
  git commit -q --allow-empty -m base; git branch -M main
  git push -q origin main; git remote set-head origin main
  unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH
}
expect() { # desc want_exit [stdout-substr [excluded-substr]]
  local d="$1" w="$2" inc="${3:-}" exc="${4:-}" out st ok=1
  if out="$(bash -c '. "'"$LIB"'"; pr_commit_range' 2>&1)"; then st=0; else st=$?; fi
  [ "$st" -eq "$w" ] || ok=0
  [ -z "$inc" ] || printf '%s' "$out" | grep -qF "$inc" || ok=0
  [ -z "$exc" ] || ! printf '%s' "$out" | grep -qF "$exc" || ok=0
  if [ "$ok" = 1 ]; then echo "ok   - $d"; else echo "FAIL - $d (want $w got $st)"; printf '%s\n' "$out"|sed 's/^/  | /'; fail=1; fi
}

mkrepo; git checkout -q -b feat; git commit -q --allow-empty -m clean
out="$(bash -c '. "'"$LIB"'"; resolve_base')"
if [ "$out" = main ]; then echo "ok   - resolve_base origin/HEAD->main"; else echo "FAIL - resolve_base ($out)"; fail=1; fi
expect "pr_commit_range lists only PR commits" 0 ""; cleanup

mkrepo; git checkout -q -b feat; git commit -q --allow-empty -m c1
n="$(bash -c '. "'"$LIB"'"; pr_commit_range' | grep -c .)"
if [ "$n" = 1 ]; then echo "ok   - range excludes base (1 commit)"; else echo "FAIL - range count $n"; fail=1; fi
cleanup

mkrepo; git checkout -q -b feat; git commit -q --allow-empty -m c
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=does-not-exist; export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
expect "unresolvable base fails loudly" 1 "could not resolve base ref"
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH; cleanup

# branch 1 positive: CI var with a NON-main base is honoured (resolve_base
# returns it and the range is scoped to the feature commit only)
mkrepo
git checkout -q -b release/v2; git commit -q --allow-empty -m "release base"
git push -q origin release/v2
git checkout -q -b feat; git commit -q --allow-empty -m clean
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=release/v2; export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
rb="$(bash -c '. "'"$LIB"'"; resolve_base')"
if [ "$rb" = release/v2 ]; then echo "ok   - resolve_base honours CI var (non-main base)"; else echo "FAIL - CI var base ($rb)"; fail=1; fi
n="$(bash -c '. "'"$LIB"'"; pr_commit_range' | grep -c .)"
if [ "$n" = 1 ]; then echo "ok   - non-main base scopes range to the PR commit"; else echo "FAIL - non-main range count $n"; fail=1; fi
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH; cleanup

# branch 3: CI var unset AND origin/HEAD removed -> base falls back to literal
# 'main'. A co-authored commit sits on main, so a broken resolution that
# widened the scope would surface it downstream — this passes only because
# the base correctly resolves to main and excludes it.
mkrepo
printf 'chore: dep\n\nCo-authored-by: bot <b@e.com>\n' | git commit -q --allow-empty -F -
git push -q origin main
git remote set-head origin --delete
git checkout -q -b feat; git commit -q --allow-empty -m clean
rb="$(bash -c '. "'"$LIB"'"; resolve_base')"
if [ "$rb" = main ]; then echo "ok   - resolve_base falls back to literal main (no CI var, no origin/HEAD)"; else echo "FAIL - literal-main fallback ($rb)"; fail=1; fi
n="$(bash -c '. "'"$LIB"'"; pr_commit_range' | grep -c .)"
if [ "$n" = 1 ]; then echo "ok   - fallback base still excludes main's commits"; else echo "FAIL - fallback range count $n"; fail=1; fi
cleanup

# shallow clone too shallow -> fail loud (CI-shaped: init + remote add + depth-1 fetch of the SHA)
mkrepo; git checkout -q -b feat
git commit -q --allow-empty -m f1; git commit -q --allow-empty -m f2; git commit -q --allow-empty -m f3
git push -q origin feat; sha="$(git rev-parse HEAD)"
SH="$TMP/shallow"; mkdir -p "$SH"; cd "$SH" || exit 1
git init -q; git remote add origin "file://$TMP/remote.git"
git fetch --depth=1 origin "$sha" --quiet 2>/dev/null; git checkout -q FETCH_HEAD
CI_COMMIT_PULL_REQUEST_BASE_BRANCH=main; export CI_COMMIT_PULL_REQUEST_BASE_BRANCH
expect "too-shallow base fails loudly" 1 "too shallow"
unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH; cleanup

[ "$fail" -ne 0 ] && { echo "ci-lib tests: FAILED"; exit 1; }; echo "ci-lib tests: all passed"
