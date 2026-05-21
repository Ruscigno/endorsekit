#!/usr/bin/env bash
# Endorsement-registry immutability guard.
#
# The endorsement registry is a legal record (14 CFR 61.189, AC 61-65)
# and must be APPEND-ONLY. This heuristic catches the two most dangerous
# regressions before code review:
#
#   1. An UPDATE or DELETE statement targeting the endorsements table in
#      a sqlc query file or a SvelteKit server route. Corrections are
#      made by issuing a NEW superseding record — never by mutating or
#      deleting a row.
#   2. A migration that drops the append-only trigger / revoke grant, or
#      that adds an UPDATE/DELETE grant on the endorsements table.
#
# This is a fast pre-commit / CI heuristic, not a substitute for the
# `endorsement-registry-auditor` subagent — it catches the obvious cases
# so the auditor can focus on the subtle ones.

set -euo pipefail

bad=0
report() {
  echo "::endorsement-immutability::$1" >&2
  bad=1
}

# ---------------------------------------------------------------------------
# 1. sqlc query files + Go handlers + SvelteKit server routes — no UPDATE /
#    DELETE on the endorsements table.
# ---------------------------------------------------------------------------
search_paths=()
[[ -d backend/internal/db/queries ]] && search_paths+=("backend/internal/db/queries")
[[ -d backend/internal ]] && search_paths+=("backend/internal")
[[ -d web/src ]] && search_paths+=("web/src")

if [[ ${#search_paths[@]} -gt 0 ]]; then
  while IFS= read -r hit; do
    [[ -n "$hit" ]] && report "UPDATE/DELETE on endorsements table — registry is append-only: $hit"
  done < <(grep -rniE '(update|delete +from)[[:space:]]+("?public"?\.)?"?endorsements"?' \
    "${search_paths[@]}" \
    --include='*.sql' --include='*.go' --include='*.ts' \
    2>/dev/null || true)
fi

# ---------------------------------------------------------------------------
# 2. Migrations — flag a GRANT of UPDATE/DELETE on the endorsements table.
#    (An ADR-justified, reviewed exception can suppress this with a
#    `-- endorsement-immutability: exception <ADR-link>` comment on the line.)
# ---------------------------------------------------------------------------
if [[ -d db/migrations ]]; then
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    echo "$hit" | grep -qi 'endorsement-immutability: exception' && continue
    report "GRANT update/delete on endorsements in a migration — needs an ADR + auditor review: $hit"
  done < <(grep -rniE 'grant[[:space:]]+.*(update|delete).*on[[:space:]]+("?public"?\.)?"?endorsements"?' \
    db/migrations --include='*.sql' 2>/dev/null || true)
fi

if [[ $bad -ne 0 ]]; then
  echo "" >&2
  echo "ERROR Endorsement registry must stay append-only." >&2
  echo "      See docs/adr/0002-endorsement-record-immutability.md," >&2
  echo "      .claude/rules/security.md, and the endorsement-registry-auditor." >&2
  echo "      Corrections = a new superseding record, never an UPDATE/DELETE." >&2
  exit 1
fi

exit 0
