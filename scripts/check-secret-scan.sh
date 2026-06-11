#!/usr/bin/env bash
# Scan full branch history for secrets. .gitleaks.toml allowlists .env.example/docs.
set -uo pipefail
exec gitleaks detect --no-banner --redact --source=.
