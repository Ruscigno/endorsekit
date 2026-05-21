#!/usr/bin/env bash
# Stop hook — runs when Claude is about to end its turn. Catches anything the
# per-file hook missed (full-repo secret scan).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

failed=0
report() {
  echo "::hook::$1" >&2
  failed=1
}

# Scan only what git knows about (tracked + would-be-staged). Gitignored files
# like .env are by design out of scope — they hold real secrets locally and
# won't be committed.
if command -v gitleaks >/dev/null 2>&1; then
  tracked_files="$(git ls-files --cached --others --exclude-standard 2>/dev/null || true)"
  if [[ -n "$tracked_files" ]]; then
    if ! gitleaks detect --no-banner --no-git >/tmp/leaks.txt 2>&1; then
      filtered="$(grep -E '^\s*File:' /tmp/leaks.txt | awk '{print $2}' | while read -r f; do
        git check-ignore -q "$f" 2>/dev/null || echo "$f"
      done)"
      if [[ -n "$filtered" ]]; then
        report "gitleaks: secrets present in tracked files: $filtered"
      fi
    fi
  fi
fi

exit $failed
