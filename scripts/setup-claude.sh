#!/usr/bin/env bash
# One-shot setup for Claude Code in this repo.
# Run after cloning. Installs pre-commit hooks and prints next steps for
# credentialed MCPs.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Installing pre-commit hooks"
pre-commit install --install-hooks || echo "  (skipped: 'pre-commit install' failed; install pre-commit first via brew install pre-commit)"

echo
echo "→ Local subagents in .claude/agents/:"
echo "    spec-guardian, endorsement-registry-auditor, stripe-connect-auditor, rls-and-tenancy-auditor"
echo

echo "→ MCPs requiring credentials (add when accounts exist)"
echo "  Run these from your shell once you have the tokens:"
cat <<'EOF'

  # GitHub MCP
  claude mcp add github -- env GITHUB_TOKEN=$GH_TOKEN \
    npx -y @modelcontextprotocol/server-github

  # Sentry MCP (after F-08)
  claude mcp add sentry -- env SENTRY_AUTH_TOKEN=$SENTRY_TOKEN \
    npx -y @sentry/mcp-server

  # Stripe MCP (after F-07) — EndorseKit uses Stripe Connect; use a
  # restricted test-mode key for MCP, never the platform live key.
  claude mcp add stripe -- env STRIPE_API_KEY=$STRIPE_TEST_KEY \
    npx -y @stripe/mcp-server

  # Postgres MCP pointing at a read-only Supabase role (after F-03)
  # NOTE: Use a read-only role — never the migration role.
  claude mcp add postgres -- env DATABASE_URL=$SUPABASE_READONLY_URL \
    npx -y @modelcontextprotocol/server-postgres

EOF

echo "→ Skipped intentionally"
echo "  - Filesystem MCP — single repo, scope unnecessary."
echo "  - Memory MCP — CLAUDE.md + auto-memory + journal/ cover this."
echo
echo "✓ Setup script complete. Open Claude Code in this repo and read CLAUDE.md."
