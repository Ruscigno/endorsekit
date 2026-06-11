#!/usr/bin/env bash
set -eu
DIRC="$(cd "$(dirname "$0")" && pwd)"; SCRIPT="$DIRC/check-spec-guard.sh"
fail=0; TMP=""
cleanup() { cd / 2>/dev/null || true; [ -n "${TMP:-}" ] && rm -rf "$TMP"; return 0; }
trap cleanup EXIT
mkrepo() { TMP="$(mktemp -d)"; git init -q --bare "$TMP/remote.git"
  git clone -q "$TMP/remote.git" "$TMP/work" 2>/dev/null; cd "$TMP/work" || exit 1
  git config user.email t@e.com; git config user.name T; git config commit.gpgsign false
  mkdir -p scripts; printf 'next.js\nGORM\n' > scripts/spec-guard-forbidden.txt
  git add scripts; git commit -q -m base; git branch -M main; git push -q origin main
  git remote set-head origin main; unset CI_COMMIT_PULL_REQUEST_BASE_BRANCH; }
rung() { bash "$SCRIPT" 2>&1; }
chk() { local d="$1" inc="${2:-}" exc="${3:-}" out st ok=1
  if out="$(rung)"; then st=0; else st=$?; fi
  [ "$st" -eq 0 ] || ok=0   # warn-only: always exit 0
  [ -z "$inc" ] || printf '%s' "$out"|grep -qF "$inc" || ok=0
  [ -z "$exc" ] || ! printf '%s' "$out"|grep -qF "$exc" || ok=0
  if [ "$ok" = 1 ]; then echo "ok   - $d"; else echo "FAIL - $d (exit $st)"; printf '%s\n' "$out"|sed 's/^/  | /'; fail=1; fi; }

mkrepo; git checkout -q -b f; echo "const x = 1" > app.ts; git add app.ts; git commit -q -m clean
chk "clean diff: no warning, exit 0" "spec-guard: OK" "WARNING"; cleanup
mkrepo; git checkout -q -b f; echo "import next.js stuff" > app.ts; git add app.ts; git commit -q -m bad
chk "forbidden keyword warns (still exit 0)" "WARNING"; cleanup
# a keyword that appears only in an added FILENAME (the `+++ b/<path>` diff
# header) is not scope creep — must not warn
mkrepo; git checkout -q -b f
echo "notes about the removal" > gorm-removal-notes.txt
git add gorm-removal-notes.txt; git commit -q -m notes
chk "keyword only in a filename does not warn" "spec-guard: OK" "WARNING"; cleanup
# editing the gate's own forbidden list must not self-trigger
mkrepo; git checkout -q -b f
printf 'next.js\nGORM\ngin-gonic\n' > scripts/spec-guard-forbidden.txt
git add scripts/spec-guard-forbidden.txt; git commit -q -m "extend cut-list"
chk "editing spec-guard-forbidden.txt does not self-trigger" "spec-guard: OK" "WARNING"; cleanup
# docs/** is out of scope — a forbidden keyword in documentation must not warn
mkrepo; git checkout -q -b f
mkdir -p docs; echo "we deliberately rejected GORM and next.js" > docs/decisions.md
git add docs; git commit -q -m docs
chk "keyword inside docs/ does not warn (scope boundary)" "spec-guard: OK" "WARNING"; cleanup
[ "$fail" -ne 0 ] && { echo "spec-guard tests: FAILED"; exit 1; }; echo "spec-guard tests: all passed"
