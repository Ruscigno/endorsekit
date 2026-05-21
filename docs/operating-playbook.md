# Operating playbook

> **Purpose.** Runbooks for production operations. Filled out as the
> system grows — each section ships when its system reaches production.

## 1. Source-of-truth doctrine

[docs/product-research.md](product-research.md) is **sacred**. It is not
edited after bootstrap.

Decisions that change the research are encoded as ADRs in
[docs/adr/](adr/) with `Status: superseded by` linking forward.

When asked to "fix the spec", check the question first:

- If the **research file** is wrong (typo, broken link, factual error
  about an external service): edit it, note in `journal/decisions.md`
  why this was an exception.
- If a **decision in the research** is wrong (we'd choose differently
  today): write an ADR that supersedes the specific row. Do not edit
  the research.

## 2. Local dev runbook

_Filled during M1._ Expected flow:

1. `make bootstrap` — installs pre-commit, verifies the toolchain (Node
   20+, pnpm, Go 1.25+, gitleaks, golang-migrate, supabase CLI).
2. `cp .env.example .env`, fill in Supabase / Stripe test keys from
   F-03, F-07. Local Supabase URLs come from `supabase start` below.
3. `supabase start` — boots the full local Supabase stack via Docker
   (Postgres on :54322, GoTrue on :54321, Studio on :54323, Inbucket
   SMTP on :54324). Prints the local API URL, anon key, service-role
   key, and DB URL — paste into `.env`.
4. `make db.migrate` — applies `db/migrations/*` against the local
   Supabase Postgres via `golang-migrate`.
5. `make backend.dev` — Go service on :8080 with air live-reload.
6. `make web.dev` — SvelteKit dev server on :5173.
7. (Optional) `stripe listen --forward-to localhost:8080/webhooks/stripe`
   for platform-account billing; a second `stripe listen` for the
   Connect webhook endpoint when working on invoicing.
8. (Optional) To exercise the reminder cron locally, POST to
   `localhost:8080/cron/daily` with a dev bypass token (the OIDC check
   accepts a documented dev escape hatch off-prod only).

To stop: `supabase stop` (preserves the volume) or
`supabase stop --no-backup` (wipes it).

## 3. Deploy runbook

_Filled during M3 (first staging deploy)._ Will cover the two Cloud Run
services (endorsekit-web + endorsekit-api), blue/green rollout, Cloud
Scheduler cron wiring, secret rotation, rollback.

## 4. Endorsement registry runbook

_Filled during M2._ Will cover: how to verify the endorsement
hash-chain integrity (the chain verifier), how a CFI's registry export
is produced and where the durable copy lives in R2, how a correction
(supersession) is recorded, and how to investigate a "my endorsement
PDF didn't arrive" report. **The registry is append-only — there is no
"delete a bad row" operation; a correction is always a new superseding
record.**

## 5. Reminder cron runbook

_Filled during M5._ Will cover: how to confirm the daily
booking/lesson reminder cron fired, how to read the reminder audit to
see what was sent / skipped / failed, how to safely re-run the cron
(idempotent by the UNIQUE constraint — over-firing is safe), and how to
diagnose a missed reminder.

## 6. Stripe runbook (platform billing + Connect)

_Filled during M6._ Will cover two distinct surfaces:

- **Platform billing** — how to find a failed CFI-subscription webhook,
  replay it via the Stripe dashboard, verify idempotency via
  `processed_webhook_events`.
- **Stripe Connect** — how to read a CFI's connected-account onboarding
  status, what `account.updated` / `capability.updated` events mean for
  invoice-sending eligibility, how to investigate a student payment that
  did not settle to the CFI, and how a CFI updates their payout
  destination (in Stripe's hosted UI, not EndorseKit).

## 7. Database backup + restore

_Filled before launch (M7)._ Will cover: Supabase free-tier daily
backups (7-day retention) + an extra nightly `pg_dump` to Cloud Storage
with a 30-day lifecycle. **The endorsement registry export archive in
R2 is the durable legal copy of record and is retained well beyond the
Postgres backup window.** The restore dry run must include re-validating
the endorsement hash-chain after restore.

## 8. Secret rotation schedule

_Filled before launch._ 90-day rotation for: Stripe platform + Connect
keys and webhook secrets, Resend API key, R2 access keys,
`URL_SIGNING_SECRET`, `ENDORSEMENT_SEAL_SECRET`, Supabase service-role
key. **Note:** rotating `ENDORSEMENT_SEAL_SECRET` does NOT invalidate
already-sealed endorsement records — each row stores the seal algorithm
and key version, so historical seals remain verifiable. New records
seal with the new key. Rotating `URL_SIGNING_SECRET` invalidates live
public booking links and outstanding endorsement-PDF download links —
document the user-comms step (CFIs may need to re-share booking links).

## 9. Incident response

_Filled before launch._ Sentry alert → triage → user comms template.
Special case: any report of a wrong or missing endorsement record, or a
mis-routed student payment, is a **P0** — endorsement records are legal
documents and money is money. Status page consideration deferred unless
paying-CFI count justifies.

## 10. Replicating this scaffolding in another repo

This repo's way-of-working was bootstrapped from three sibling repos
(`acsready`, `currency-hub`, `tail-number-radar`). If you ever bootstrap
another:

1. Copy `.editorconfig`, `.gitignore`, `.dockerignore`,
   `.pre-commit-config.yaml`, `.gitleaks.toml`, `Makefile`,
   `.env.example`, `CLAUDE.md`, `README.md` — adapt the stack-specific
   bits.
2. Copy `docs/adr/0000-template.md`, `docs/founder-actions.md`,
   `docs/operating-playbook.md`, `docs/working-contract.md`, and the
   four phase docs.
3. Copy `.claude/settings.json`, `.claude/agents/*.md`,
   `.claude/rules/*.md` — adapt subagents to the new domain.
4. Copy `scripts/hooks/*.sh`, `scripts/new-epic-branch.sh`,
   `scripts/setup-claude.sh`, plus any product-relevant check script.
5. Copy `journal/README.md` + the supporting journal files.
6. Copy `prompts/01-discovery-kickoff.md` — adapt to the new product.
7. Copy `.woodpecker/{pr,deploy}.yml` — adapt to the new stack's
   lint/test commands.
8. Copy `.github/PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/`,
   `dependabot.yml`.

The principle: this scaffolding is the founder's portable working style,
not a property of any one product. A future Go-backed product can copy
EndorseKit's `backend/` configs (`sqlc.yaml`, `.golangci.yml`,
`.air.toml`, `Dockerfile`) too.
