#!/usr/bin/env bash
# Shared helpers for PR-scoped CI gates (single-author, spec-guard).
# SOURCE this file (`. ci-lib.sh`); do not execute it. Callers run set -uo pipefail.

# resolve_base: print the PR base branch name.
#   CI_COMMIT_PULL_REQUEST_BASE_BRANCH  ->  origin/HEAD default  ->  "main"
resolve_base() {
  if [ -n "${CI_COMMIT_PULL_REQUEST_BASE_BRANCH:-}" ]; then
    printf '%s' "$CI_COMMIT_PULL_REQUEST_BASE_BRANCH"; return 0
  fi
  local d
  if d="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')" && [ -n "$d" ]; then
    printf '%s' "$d"; return 0
  fi
  printf 'main'
}

# pr_commit_range: print the PR's own non-merge commit SHAs (reachable from HEAD
# but not from origin/<base>), one per line. Fails loudly (return 1, message to
# stderr) if the base can't be resolved or a shallow clone can't reach it —
# never a full-history walk (which would re-include base-branch commits).
pr_commit_range() {
  local base; base="$(resolve_base)"
  git fetch origin "$base" --depth=200 --quiet 2>/dev/null || true
  if ! git rev-parse --verify --quiet "origin/$base" >/dev/null 2>&1; then
    echo "ERROR could not resolve base ref 'origin/$base' to scope the check." >&2
    echo "      The base fetch may have failed transiently — re-run the pipeline." >&2
    return 1
  fi
  if [ -f "$(git rev-parse --git-dir)/shallow" ] && ! git merge-base HEAD "origin/$base" >/dev/null 2>&1; then
    echo "ERROR the clone is too shallow to reach base 'origin/$base' — increase clone depth." >&2
    return 1
  fi
  git rev-list --no-merges HEAD "^origin/$base"
}
