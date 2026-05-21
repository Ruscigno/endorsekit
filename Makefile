# EndorseKit — repo root Makefile. Thin wrappers over the toolchain so
# contributors don't memorize paths. Targets stay phony; every recipe is one
# canonical command. EndorseKit is two deployables: web/ (SvelteKit) and
# backend/ (Go) — targets are namespaced web.* and backend.*.

SHELL := /usr/bin/env bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# ============================================================
# Help — `make` with no args
# ============================================================
.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "; printf "EndorseKit Makefile targets:\n\n"} /^[a-zA-Z0-9._-]+:.*?## / { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ============================================================
# Bootstrap
# ============================================================
.PHONY: bootstrap
bootstrap: ## Install pre-commit hooks + verify toolchain (one-time, idempotent)
	@command -v pre-commit >/dev/null || { echo "Install pre-commit: brew install pre-commit" >&2; exit 1; }
	@command -v gitleaks >/dev/null || { echo "Install gitleaks: brew install gitleaks" >&2; exit 1; }
	@command -v pnpm >/dev/null || corepack enable
	@command -v go >/dev/null || { echo "Install Go 1.25+: brew install go" >&2; exit 1; }
	@command -v migrate >/dev/null || { echo "Install golang-migrate: brew install golang-migrate" >&2; exit 1; }
	@command -v supabase >/dev/null || { echo "Install supabase CLI: brew install supabase/tap/supabase" >&2; exit 1; }
	pre-commit install --install-hooks
	@[[ -d web ]] && [[ -f web/package.json ]] && $(MAKE) web.deps || echo "(web/ not initialized yet — Phase 5 M1)"
	@[[ -d backend ]] && [[ -f backend/go.mod ]] && $(MAKE) backend.deps || echo "(backend/ not initialized yet — Phase 5 M2)"
	@echo "Bootstrap done."

# ============================================================
# Web — SvelteKit (Svelte 5) / pnpm
# ============================================================
.PHONY: web.deps web.dev web.test web.lint web.typecheck web.build
web.deps: ## pnpm install (frozen lockfile)
	cd web && pnpm install --frozen-lockfile

web.dev: ## Run SvelteKit dev server on :5173
	cd web && pnpm dev

web.test: ## Run vitest + playwright
	cd web && pnpm test

web.lint: ## ESLint + prettier check
	cd web && pnpm lint

web.typecheck: ## svelte-check (typecheck)
	cd web && pnpm check

web.build: ## Production build (adapter-node)
	cd web && pnpm build

# ============================================================
# Backend — Go 1.25 / pgx + sqlc + golang-migrate
# ============================================================
.PHONY: backend.deps backend.dev backend.test backend.lint backend.build backend.sqlc backend.vuln
backend.deps: ## go mod download
	cd backend && go mod download

backend.dev: ## Run the Go service with air live-reload on :8080
	cd backend && air

backend.test: ## go test -race -cover ./...
	cd backend && go test -race -cover ./...

backend.lint: ## gofmt check + go vet + golangci-lint
	cd backend && gofmt -l . && go vet ./... && golangci-lint run

backend.build: ## Compile the server binary
	cd backend && CGO_ENABLED=0 go build -o tmp/server ./cmd/server

backend.sqlc: ## Regenerate sqlc query code (asserts schema/query alignment)
	cd backend && sqlc generate

backend.vuln: ## govulncheck against the module
	cd backend && govulncheck ./...

# ============================================================
# Database (Supabase Postgres for prod/staging; local Supabase CLI for dev)
# ============================================================
.PHONY: db.up db.down db.migrate db.rollback db.fresh db.new db.shell
db.up: ## Boot the local Supabase stack (Postgres + GoTrue + Studio + Inbucket)
	supabase start

db.down: ## Stop the local Supabase stack (preserves the volume)
	supabase stop

db.migrate: ## Apply all pending migrations against SUPABASE_DB_URL
	migrate -path db/migrations -database "$$SUPABASE_DB_URL" up

db.rollback: ## Roll back one migration
	migrate -path db/migrations -database "$$SUPABASE_DB_URL" down 1

db.fresh: ## up -> down-all -> up (CI's migration round-trip)
	migrate -path db/migrations -database "$$SUPABASE_DB_URL" up
	migrate -path db/migrations -database "$$SUPABASE_DB_URL" down -all
	migrate -path db/migrations -database "$$SUPABASE_DB_URL" up

db.new: ## Create a new migration: make db.new name=add_endorsements
	@[ -n "$(name)" ] || { echo "Usage: make db.new name=<snake_case_name>" >&2; exit 1; }
	migrate create -ext sql -dir db/migrations -seq $(name)

db.shell: ## psql shell into the local Supabase DB
	psql "$$SUPABASE_DB_URL"

# ============================================================
# Security
# ============================================================
.PHONY: security.scan security.audit security.secrets
security.scan: security.secrets security.audit ## Run all security checks locally
	@echo "Security scan done."

security.audit: ## Dependency vulnerability audits (web + backend)
	@[[ -f web/package.json ]] && (cd web && pnpm audit --audit-level=high) || echo "(web/ not initialized yet — skipping pnpm audit)"
	@[[ -f backend/go.mod ]] && (cd backend && govulncheck ./...) || echo "(backend/ not initialized yet — skipping govulncheck)"

security.secrets: ## gitleaks sweep
	gitleaks detect --no-banner --redact

# ============================================================
# CI parity — what .woodpecker/pr.yml runs
# ============================================================
.PHONY: ci
ci: security.scan ## Run the same gates CI runs
	@[[ -d web ]] && [[ -f web/package.json ]] && $(MAKE) web.lint web.typecheck web.test web.build || echo "(web/ not initialized yet — skipping web steps)"
	@[[ -d backend ]] && [[ -f backend/go.mod ]] && $(MAKE) backend.lint backend.test backend.build || echo "(backend/ not initialized yet — skipping backend steps)"
	@echo "Local CI green."

# ============================================================
# Convenience
# ============================================================
.PHONY: clean
clean: ## Remove build caches
	@[[ -d web ]] && (cd web && rm -rf .svelte-kit build node_modules/.cache) || true
	@[[ -d backend ]] && (cd backend && rm -rf tmp bin dist) || true
	rm -rf .pytest_cache .ruff_cache dist build
