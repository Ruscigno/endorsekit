#!/usr/bin/env bash
# PostToolUse hook for Edit/Write. Reads JSON from stdin, dispatches lint/scan
# based on the modified file path. Exits non-zero to block; exits 0 to pass.
#
# Failure here surfaces to Claude as a correction signal. Keep checks fast (<2s
# per file) so the loop stays interactive.

set -euo pipefail

# Read the tool payload from stdin
payload="$(cat)"

# Extract file_path. Bail silently if jq isn't available or path is missing.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

file_path="$(echo "$payload" | jq -r '.tool_input.file_path // empty')"
[[ -z "$file_path" ]] && exit 0
[[ ! -f "$file_path" ]] && exit 0

# Skip files that git is ignoring — they're not going to be committed, so
# scanning them only produces false-positive blocks (e.g. real secrets in .env).
if git check-ignore -q "$file_path" 2>/dev/null; then
  exit 0
fi

# Skip non-source paths
case "$file_path" in
  *.md|*.txt|*.json|*.yml|*.yaml|*.toml|*.gitignore|*.env.example) exit 0 ;;
  */node_modules/*|*/.svelte-kit/*|*/build/*|*/dist/*|*/tmp/*) exit 0 ;;
  */docs/*|*/.claude/*|*/.github/*|*/scripts/*|*/journal/*|*/prompts/*) exit 0 ;;
esac

# Repo root (parent of the dir containing this script's parent)
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

failed=0
report() {
  echo "::hook::$1" >&2
  failed=1
}

# Secret scan — every modified file
if command -v gitleaks >/dev/null 2>&1; then
  if ! gitleaks detect --no-banner --no-git --source "$file_path" >/dev/null 2>&1; then
    report "gitleaks: secrets detected in $file_path"
  fi
fi

# Per-stack checks
case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.svelte)
    if [[ -f "web/package.json" ]] && [[ -d "web/node_modules" ]]; then
      (cd web && pnpm exec eslint --no-warn-ignored "../$file_path" 2>&1 >&2) || report "eslint: $file_path has lint errors"
    fi
    ;;
  *.go)
    if [[ -f "backend/go.mod" ]] && command -v gofmt >/dev/null 2>&1; then
      unformatted="$(gofmt -l "$file_path" 2>/dev/null || true)"
      [[ -n "$unformatted" ]] && report "gofmt: $file_path needs formatting (run gofmt -w)"
    fi
    ;;
  *.sql)
    # Migration round-trip is too heavy for per-file; defer to PR-time.
    :
    ;;
esac

exit $failed
