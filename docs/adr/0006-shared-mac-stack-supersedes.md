# 0006. Shared Mac stack supersedes per-product cloud (EndorseKit)

- Status: proposed
- Date: 2026-05-24
- Deciders: founder
- Supersedes (in part): the load-bearing-decision bullets in `CLAUDE.md` that pin **Cloud Run us-central1** (two services), **Cloud Scheduler** (the daily booking/lesson-reminder cron transport), and **single-vendor Supabase cloud (Postgres + GoTrue Auth + RLS)**. Cloudflare R2, Stripe (platform + Connect), Resend, and the Go backend / `pgx/v5` / `sqlc` / `golang-migrate` shape are unchanged.

## Context and problem statement

EndorseKit's existing plan ships two Cloud Run services (`endorsekit-web` and
`endorsekit-api`) against a hosted Supabase project (Postgres + GoTrue), with
Cloud Scheduler firing the daily booking/lesson-reminder cron, R2 for
endorsement / invoice / registry-export PDFs, Stripe Checkout for the CFI's
own subscription, Stripe Connect for student-invoice payment, and Resend for
endorsement-PDF delivery + reminders.

The portfolio plan is 11 such products — repeating that account-creation and
token-management ceremony eleven times before any product has proven demand
is the wrong burn for a solo, pre-revenue founder.

The infra repo ([`iac-tickerbeats`](https://github.com/Ruscigno/iac-tickerbeats))
has been extended with a shared Mac stack ([its ADR-0003](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/adr/0003-shared-mac-stack.md))
that hosts Postgres + GoTrue + per-project Cloudflare-Tunnel ingress on the
founder's Mac. The full portfolio architecture is in
[`iac-tickerbeats/docs/portfolio-architecture.md`](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/portfolio-architecture.md).

EndorseKit has not begun implementation. This ADR records what changes for
**EndorseKit specifically** when its build begins on the shared stack instead
of cloud per product.

## Decision drivers

- Per-product setup cost approaches zero (one `make new-project` invocation).
- No new monthly cost. Cloudflare (DNS + Tunnel + R2) + Resend + Stripe are
  the only external services portfolio-wide — all already used.
- Customer identity unified — one GoTrue, parent-domain cookie.
- The Mac is a single point of failure for the whole portfolio; the trade-off
  is accepted at <100 paying CFIs.

## Considered options

1. **Status quo** — keep EndorseKit plan on Cloud Run + cloud Supabase + Cloud Scheduler.
2. **Pivot EndorseKit to the shared Mac stack** — the iac-tickerbeats infra.

## Decision outcome

**Chosen: 2.** EndorseKit will run on the shared Mac stack when implementation
begins. **No code lands in this ADR** — the repo is pre-implementation; this
is a planning-doc update only. The cloud-stack bullets in `CLAUDE.md` are kept
verbatim as historical record; this ADR is the supersession.

### What changes for EndorseKit when implementation begins

- **Subdomain assignment.** `enk.tickerbeats.com` (SvelteKit web tier — CFI
  app + public booking page) + `enk-api.tickerbeats.com` (Go backend) per
  the portfolio's two-subdomain convention.
- **Both tiers host on the Mac** behind per-project Cloudflare Tunnels — no
  Cloud Run services, no Cloudflare Workers, no Vercel. The Go service runs
  as a Docker container alongside the SvelteKit container.
- **Postgres + GoTrue are the shared instances** at
  `host.docker.internal:5433` + `https://auth.tickerbeats.com`. The
  single-Supabase / RLS-primary shape is preserved — RLS still scopes every
  CFI-owned table by `owner_cfi_id` keyed on `auth.uid()`; only the GoTrue
  endpoint and the Postgres host change. The signed-token surfaces for
  students (booking page, endorsement-PDF download) are unaffected.
- **JWT verification** flips to HS256 against the shared
  `GOTRUE_JWT_SECRET` for the Mac-pivoted runtime; the asymmetric-keys
  path (ES256 + JWKS) is the V1.1 evolution when GoTrue ships that feature.
- **The daily cron transport changes** from Cloud Scheduler OIDC to a Mac
  `launchd` plist invoking `POST /cron/daily` with a shared
  `X-Cron-Secret` header (constant-time compared in the Go handler). The
  reminder-dedupe DB UNIQUE constraint is unchanged.
- **R2 is unchanged.** Endorsement PDFs, invoice PDFs, and the registry
  export archive (the legal copy of record) stay on Cloudflare R2; the
  endorsement-PDF emailed-to-student signed token shape is unaffected.
- **CI/CD shape is unchanged.** Woodpecker remains the CI; the deploy
  stage rewrites to `git fetch && git reset --hard origin/main &&
  docker compose up -d --build` on the Mac, replacing `gcloud run deploy`.
- **Stripe (platform + Connect)** is unaffected; only the success-URL
  hostname changes. The two webhook endpoints + two signing secrets
  posture (ADR-0004) is preserved.

### What does NOT change

- The append-only endorsement registry + per-record HMAC seal chain
  (ADR-0002) — these are legal-record contracts independent of where the
  Go backend runs.
- The e-signature binding (ADR-0003), the Stripe-Connect flat-subscription
  no-`application_fee` model (ADR-0005), the platform-vs-connected-account
  separation, money as integer cents.
- `golang-migrate` migrations, `sqlc diff` in CI, the cross-tenant
  regression test.

### Phasing

- **Phase 1 — this ADR (docs only, today).** Annotates `CLAUDE.md`, amends
  `docs/product-research.md`, assigns subdomains in `.env.example`. No
  code, no migrations.
- **Phase 2 — at the start of implementation.** Phase 0 / Phase 1 artifacts
  get cut against the Mac stack from the start; no intermediate
  cloud-deployment ever ships.

### Positive consequences

- Setup of project N+1 is `make new-project SLUG=enk …` — minutes, not hours.
- Customer can use one tickerbeats identity across every product.
- Free-tier discipline preserved — the Mac stack adds no monthly cost.

### Negative consequences

- **HS256 + shared `GOTRUE_JWT_SECRET`** across every backend's `.env`.
  Leaking one product's `.env` compromises portfolio-wide auth. Mitigations:
  `.env` 0600, gitleaks pre-commit, no `.env` in CI logs.
- **The Mac is a SPOF** for the whole portfolio. The legal-record
  obligation on the endorsement registry makes the existing
  nightly `pg_dump` + the R2 registry-export archive non-optional after
  the pivot; both are spec'd in `security.md` already.

## Links

- [iac-tickerbeats portfolio architecture](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/portfolio-architecture.md)
- [iac-tickerbeats ADR-0003 shared Mac stack](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/adr/0003-shared-mac-stack.md)
- ADR [0001. Go backend for endorsements and jobs](0001-go-backend-for-endorsements-and-jobs.md) — unchanged in shape; only the host moves.
- ADR [0002. Endorsement record immutability](0002-endorsement-record-immutability.md) — append-only registry contract preserved.
- ADR [0004. Stripe Connect invoicing](0004-stripe-connect-invoicing.md) — Connect posture preserved; only the success-URL hostname changes.
- ADR [0005. Billing model (no application_fee)](0005-billing-model.md) — unaffected.
