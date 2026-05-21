#!/usr/bin/env bash
# Pre-commit commit-msg hook. Rejects commits whose message contains a
# Co-Authored-By trailer — single-author policy per .claude/rules/engineering.md.
#
# pre-commit passes the path to the commit-message file as $1.

set -euo pipefail

msg_file="${1:?usage: check-single-author.sh <commit-msg-file>}"

if grep -iE '^Co-Authored-By:' "$msg_file"; then
  cat >&2 <<'EOF'
ERROR Co-Authored-By trailers are forbidden in this repo (single-author
      policy: founder only). Remove the trailer and re-commit.
      Do not bypass with --no-verify.
      See .claude/rules/engineering.md.
EOF
  exit 1
fi
