#!/usr/bin/env bash
# Create a new Epic branch stacked on top of the most recent Epic.
#
# Usage: ./scripts/new-epic-branch.sh <NN-short-slug>
# Example: ./scripts/new-epic-branch.sh 02-architecture
#
# Behavior:
#   1. Looks for the most recent epic/* branch on origin (sorted by number).
#   2. If found: branches the new Epic from that one.
#      If none: branches from origin/main.
#   3. Pushes the new branch with -u origin.
#   4. Prints the gh command to open a PR targeting the parent.

set -euo pipefail

slug="${1:-}"
if [[ -z "$slug" ]] || ! [[ "$slug" =~ ^[0-9]{2}-[a-z0-9-]+$ ]]; then
  echo "Usage: $0 <NN-short-slug>"
  echo "Example: $0 02-architecture"
  echo "Slug must start with 2 digits, hyphen, then lowercase-kebab-case."
  exit 1
fi

new_branch="epic/${slug}"
new_number="${slug%%-*}"

# Refresh remote refs
git fetch origin --quiet --prune

# Find the most recent epic on origin with a number lower than the new one.
parent="$(
  { git branch -r --list 'origin/epic/*' \
      | sed -E 's,^[ *]+origin/,,' \
      | grep -E '^epic/[0-9]{2}-' \
      | sort \
      | awk -v n="$new_number" -F'[/-]' '$2 < n {print $0}' \
      | tail -n1; } \
  || true
)"

if [[ -z "$parent" ]]; then
  parent="main"
fi

echo "→ Parent branch: $parent"
echo "→ New branch:    $new_branch"
echo

if git show-ref --verify --quiet "refs/heads/$new_branch"; then
  echo "✗ Branch $new_branch already exists locally."
  exit 1
fi

git switch --create "$new_branch" "origin/$parent"
git push -u origin "$new_branch"

echo
echo "✓ $new_branch created and pushed (tracking origin/$parent)."
echo
echo "Next steps:"
echo "  1. Make commits on this branch."
echo "  2. Open a PR targeting the parent:"
echo "       gh pr create --base $parent --head $new_branch --draft"
echo "  3. When $parent merges into main, rebase + retarget:"
echo "       git fetch origin"
echo "       git rebase origin/main"
echo "       git push --force-with-lease"
echo "       gh pr edit --base main"
