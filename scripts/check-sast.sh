#!/usr/bin/env bash
set -uo pipefail
exec semgrep ci \
  --config p/owasp-top-ten --config p/security-audit \
  --config p/typescript --config p/javascript --config p/golang
