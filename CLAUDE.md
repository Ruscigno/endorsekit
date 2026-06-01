# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

The source of truth for scope, architecture, and sequencing is [docs/product-research.md](docs/product-research.md) — the full MVP V1 build plan for **EndorseKit**, the operating system for the independent flight instructor. A single $12/mo subscription that replaces the Calendly + Stripe + Google-Sheets stack a solo CFI runs their business on: a Hobbs/Tach-aware booking page, one-tap endorsement issuance backed by the AC 61-65 catalog, an append-only endorsement registry, a lightweight student CRM, and Stripe-connected invoicing. **The CFI is the paying customer.** **That file is sacred** — it is never edited after bootstrap. When decisions change, write an ADR in [docs/adr/](docs/adr/) that links back and supersedes the specific row. The chain of supersession is the audit trail.

The repo is pre-implementation. This commit lands the Phase 0 scaffold (rules, subagents, CI, founder-action track, ADR template, Go-backend skeleton) **alongside draft Phase 1–4 artifacts** in `docs/`. **No founder approval is recorded for any phase** — `docs/01-discovery.md` through `docs/04-plan.md` and ADRs `0001`–`0005` are review drafts. Phase 1 (Discovery) is re-run / finalized via [prompts/01-discovery-kickoff.md](prompts/01-discovery-kickoff.md).

## Aviation Cortex platform integration

This gear ships as part of the Aviation Cortex portfolio. The platform contract that governs the gear's public surface is documented in [iac-tickerbeats ADR-0006](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/adr/0006-path-routing-and-web-component-shell.md) and the master [landing-pages brief](https://github.com/Ruscigno/aviation-cortex/blob/main/docs/landing-pages-brief.md). Forward-looking guarantees gear code must respect:

- **Public URL**: `aviationcortex.com/endorsekit/*` (path-based; this gear's slug is `endorsekit`, abbreviated `edk` in dense contexts). Routed via Cloudflared ingress to a local SvelteKit process on port `3014`.
- **Subscription**: covered by the single Cortex bundle subscription ($19/mo monthly, $108/yr founder's annual for the first 100 annual subscribers, $182/yr standard after the cap — landing-pages brief §7). No per-gear pricing. Paywall reads `cortex.users.access_until` from shared Postgres.
- **Auth**: shared GoTrue at `auth.aviationcortex.com` (HS256). Single first-party cookie on `aviationcortex.com`, no wildcard.
- **Shared chrome**: header, footer, gear switcher, locale switcher, account menu, `part of Cortex` badge, and loading skeleton are rendered by the Web Component shell `<aviation-cortex-shell>` loaded from `aviationcortex.com/assets/shell.js`. The gear does NOT re-implement any of those.
- **Locale propagation** (landing-pages brief §28.X): locale is shell-owned. Read from the `<aviation-cortex-shell>` reflected attribute + `cortex:locale-changed` event. Propagate internally via SvelteKit `setContext('locale', ...)`. Gear code does NOT parse URL/cookie or call `navigator.language`, and does NOT render its own locale switcher.
- **Breadcrumb**: anchors at the gear's 3-letter abbreviation (`edk`) per landing-pages brief §4.7.4.

This block is forward-looking — architectural statements elsewhere in this file that conflict with the platform contract (e.g., older Cloud Run / Supabase-managed Postgres / per-product subscription wording) are out of scope for the PR that landed this section. They will be reconciled separately when this gear's frontend is brought under the Cortex umbrella.

## How work proceeds

We work in named phases, each ending with a reviewable artifact. **Phase-artifact gates are stop-and-confirm — never auto-advance.** Per-ticket implementation work inside a milestone does NOT require per-PR founder approval; see [Working contract (cadence)](#working-contract-cadence) below. See [.claude/rules/engineering.md](.claude/rules/engineering.md#phase-gates) for the full SDLC.

@docs/working-contract.md
@.claude/rules/engineering.md
@.claude/rules/security.md
@.claude/rules/communication.md
@.claude/rules/journal.md

## Working contract (cadence)

The agent has **self-merge authority** for PRs that pass CI + auditor gates and do not touch any of the four founder-only categories below. The agent reports periodically (every 5–10 merged PRs, or at ≥10% overall progress) instead of seeking per-PR approval.

**Founder-only approval categories** (the only PR types gated):

1. **New external dependency** — any new npm/Go package, cloud service, MCP server, or third-party API beyond what's already pinned in [docs/product-research.md](docs/product-research.md) §1.
2. **New cost commitment > \$0** — any paid-service unlock or quota that costs money. V1 is free-tier-only per research §1. Also: introducing a Stripe `application_fee` on the Connect path — that is a billing-model change (supersedes ADR-0005).
3. **Schema-incompatible migration** — anything that breaks the data model implied by research §3/§4 (CFIs, students, bookings, lesson types, endorsements + the AC 61-65 catalog, the endorsement registry, invoices, connected accounts, billing). **Any migration touching the `endorsements` table is founder-only by default** — it is a legal-record table.
4. **Load-bearing-decision change** — touching any commitment in the [Load-bearing decisions](#load-bearing-decisions-do-not-re-litigate-without-cause) block, OR scope creep into the research §5.4 "cut from V1" list.

For any PR touching one of these, the agent opens the PR with a "FOUNDER APPROVAL REQUIRED — \<category\>" header and does not self-merge. For all other PRs: CI green + auditor PASS/CONCERN = self-merge, logged in `journal/decisions.md`.

**Reporting cadence:**
- **Batch report** every 5–10 merged PRs (≤300 words in chat).
- **Milestone report** at every ≥10% overall progress (in chat + `journal/milestones.md`).
- **Proactive blocker alert** immediately on foreseeing a blocker that needs founder attention.

## Architecture (one paragraph)

EndorseKit is **two deployables on Cloud Run (us-central1, scale-to-zero)**: a SvelteKit (Svelte 5 runes) PWA web tier (`web/`) and a **Go 1.25 backend service** (`backend/`). The web tier serves SSR pages — the CFI app and the public booking page — handles auth UI, and does simple CFI-owned CRUD browser-direct via `@supabase/supabase-js` (RLS gates it); for anything needing the endorsement registry, PDF generation, the reminder cron, or Stripe it calls the Go backend. The Go service ([ADR-0001](docs/adr/0001-go-backend-for-endorsements-and-jobs.md)) owns the three things that genuinely need a server: **server-side endorsement-PDF generation** (a legal artifact, rendered deterministically from the sealed record), the **daily booking/lesson reminder cron** (`POST /cron/daily`, OIDC-authed, called by Cloud Scheduler), and **Stripe Connect invoicing**. The Go service uses stdlib `net/http.ServeMux`, `pgx/v5` + `sqlc`, `slog`, and verifies Supabase-issued ES256 JWTs against the JWKS endpoint — no chi/gin, no GORM. A **single Supabase project** hosts Postgres + GoTrue Auth + RLS + PostgREST; **Row-Level Security is the primary authorization layer for browser-direct CRUD**, and the Go backend additionally scopes every query by the JWT-derived `owner_cfi_id`. The **endorsement registry is append-only** ([ADR-0002](docs/adr/0002-endorsement-record-immutability.md)) — endorsement records are legal documents (14 CFR 61.189 / AC 61-65); the `endorsements` table accepts `INSERT` only, every row is HMAC-sealed and hash-chained, and a correction is a new superseding record. Stripe runs **two relationships**: standard Checkout + Customer Portal for the CFI's own $12/mo subscription on the platform account, and **Stripe Connect** for the CFI invoicing students ([ADR-0004](docs/adr/0004-stripe-connect-invoicing.md)) — funds settle to the CFI's connected account; EndorseKit is never merchant of record for a lesson, and takes no `application_fee` ([ADR-0005](docs/adr/0005-billing-model.md)). Migrations use `golang-migrate` (sequential `db/migrations/NNNN_*`), shared by both tiers. Cloudflare R2 holds server-generated endorsement PDFs, invoice PDFs, and the registry export archive. Resend sends transactional email, endorsement-PDF delivery, and the daily reminders. PostHog + Sentry cover analytics and errors. There is **no Python service in V1** — EndorseKit has no ML component.

## Load-bearing decisions (do not re-litigate without cause)

> **2026-05-24 — Shared Mac stack pivot ([ADR-0006](docs/adr/0006-shared-mac-stack-supersedes.md))** supersedes the cloud-hosting bullets below (Cloud Run us-central1 + Cloud Scheduler + single-vendor Supabase cloud — kept verbatim as historical record). When implementation begins, `enk.tickerbeats.com` (web) + `enk-api.tickerbeats.com` (backend) will run on the Mac via Cloudflare Tunnel against shared Postgres + shared GoTrue from [iac-tickerbeats](https://github.com/Ruscigno/iac-tickerbeats); the daily cron transport flips to a Mac launchd plist + shared `X-Cron-Secret`; see [portfolio architecture](https://github.com/Ruscigno/iac-tickerbeats/blob/main/docs/portfolio-architecture.md). The append-only endorsement registry + HMAC seal chain + R2 registry-export archive + Stripe (platform + Connect) + Resend are unchanged.

These were chosen deliberately in [docs/product-research.md](docs/product-research.md). Each has reasoning in the cited section — read it before proposing a swap.

- **SvelteKit (Svelte 5) + Tailwind + Vite-PWA** for the web tier, not Next.js. Bundle size and TTI dominate — the CFI uses it one-handed on a phone, and the public booking page is customer-facing (research §2.3).
- **A Go backend service on Cloud Run** ([ADR-0001](docs/adr/0001-go-backend-for-endorsements-and-jobs.md)). EndorseKit has server-side endorsement-PDF generation, a daily booking/lesson reminder cron, and Stripe Connect — the founder's portfolio rule assigns any product with server-side document generation, a scheduled job, or a third-party API integration to a Go service. Conventions mirror `tail-number-radar`: stdlib `net/http.ServeMux`, `pgx/v5` + `sqlc`, `golang-migrate`, `slog`. No chi/gin/echo/fiber, no GORM (research §2.1).
- **The endorsement registry is append-only** ([ADR-0002](docs/adr/0002-endorsement-record-immutability.md)). An endorsement is a legal document; 14 CFR 61.189 / AC 61-65 require a CFI to keep the record 3+ years. The `endorsements` table accepts `INSERT` only — no `UPDATE`/`DELETE` query, the DB grant set withholds them, an append-only trigger enforces it, and RLS has INSERT + own-SELECT policies only. Every row is HMAC-sealed with a content hash chained to the prior record; a correction is a new superseding `INSERT`. This is the legal-record heart of the product.
- **E-signature is a typed-name + intent affirmation bound to the sealed content** ([ADR-0003](docs/adr/0003-endorsement-pdf-and-esignature.md)). The CFI signs by typing their name + an explicit affirmation, bound to the endorsement's content hash and the authenticated CFI identity. A drawn-signature image is V1.1. The endorsement-PDF renderer is pure-Go (so the distroless image stays valid).
- **Single-vendor Supabase: Postgres + Auth + RLS.** The CFI is the only authenticated principal; the student is unauthenticated (signed-token surfaces). Browser uses `@supabase/supabase-js` for both auth and simple CRUD; **RLS is the primary authorization layer** for browser-direct calls. The Go backend connects via `pgxpool`, verifies GoTrue JWTs, and scopes every query by `owner_cfi_id` (research §2.2 / §3).
- **Stripe runs two relationships** ([ADR-0004](docs/adr/0004-stripe-connect-invoicing.md)): standard Checkout + Customer Portal for the CFI's own subscription on the **platform account**; **Stripe Connect** for the CFI invoicing students — funds settle to the CFI's **connected account**. EndorseKit is the platform, never merchant of record for a lesson. Two webhook endpoints, two signing secrets, raw-body signature verification. Money is integer cents, never `float64`.
- **The billing model is a flat subscription with no `application_fee`** ([ADR-0005](docs/adr/0005-billing-model.md)). $12/mo or $120/yr; the CFI keeps 100% of student payments minus Stripe's own processing fee. A per-transaction skim is a different business model and needs an ADR superseding ADR-0005.
- **Cloudflare R2 for server-generated documents**, not Supabase Storage. Zero egress, 10 GB free; endorsement PDFs, invoice PDFs, and the registry export archive (the durable legal copy of record) go here (research §2.7).
- **Resend for email**, free 100/day / 3 000/mo. Transactional + endorsement-PDF delivery + the daily reminders. Deliverability matters — an endorsement email in spam is a real failure. SPF + DKIM + DMARC before launch (research §2.6).
- **Cloud Run us-central1, single region, scale-to-zero**, two services (`endorsekit-web`, `endorsekit-api`). Cloudflare proxied CNAME → Cloud Run for SSL/WAF (research §2 and §9).
- **`golang-migrate` for migrations**, sequential `db/migrations/NNNN_*.up.sql` / `*.down.sql`, shared by both tiers. CI runs a round-trip (up → down-all → up) on every migration-touching PR. `sqlc diff` in CI catches schema/query drift.
- **The daily cron fires once at a single UTC slot in V1.** Per-user-timezone scheduling is a documented V1.1 evolution; V1 keeps Cloud Scheduler at 1 of its 3 free jobs.
- **Email-only notifications in V1.** No SMS, no Web Push (research §5.4 cut list). iOS PWA install is an in-app instructions card.
- **PWA with Vite-PWA plugin** (manifest + service worker + maskable icons). No native shell in V1.
- **CI runs on self-hosted Woodpecker** on the founder's Mac, reachable from GitHub via Cloudflare Tunnel. Pipelines live in `.woodpecker/*.yml`; runner infrastructure lives in the separate [`iac-tickerbeats`](https://github.com/Ruscigno/iac-tickerbeats) repo. Don't reintroduce `.github/workflows/` — doing so re-incurs GitHub Actions billing.
- **Single-author policy.** Every commit on every branch is authored by the founder. `Co-Authored-By:` trailers (Claude or otherwise) are rejected by pre-commit AND CI; do not bypass with `--no-verify`.

## Hard external constraints

- **Free-tier-only V1.** No paid service is authorized without a merged ADR. The §1 stack table is the approved list; everything else needs justification.
- **Supabase free tier:** 500 MB Postgres DB, 1 GB storage (unused — we use R2), 50k MAU on Auth, 2 active projects, **7-day inactivity pause**. Plan migration to Supabase Pro ($25/mo) when ~10 paying customers exist OR DB approaches 400 MB; until then, ping the staging project at least weekly.
- **Cloud Run us-central1 free tier:** 2M req + 180k vCPU-s + 360k GiB-s/month — shared across **two services**. Set a $5 GCP budget alert during F-02.
- **Cloud Scheduler free tier: 3 jobs.** V1 uses 1 (the daily reminder cron).
- **Resend:** 100 emails/day, 3 000/month, 1 verified domain. Endorsement-PDF delivery + reminders stay well within this at V1 scale; the §11 risk register watches it. SPF + DKIM + DMARC must land before launch.
- **R2 free tier:** 10 GB storage, 1M Class-A ops, 10M Class-B ops. Zero egress. The registry-export prefix has a retention/lifecycle policy — it is a legal record.
- **Stripe:** the CFI's subscription incurs Stripe's standard processing fee (~2.9%+30¢); the Connect path takes no `application_fee` so it costs EndorseKit nothing. Stripe Connect live-mode review can take extra time — start F-07 early.
- **PWA on iOS:** Web Push requires Add-to-Home-Screen; cut from V1. iOS install is an in-app card.
- **Refund policy must be visible before launch** (research §9).

## Aviation-domain disclaimer (calibrated)

EndorseKit issues legal endorsements and keeps the records the FAA can demand. The disclaimer treatment is **calibrated higher than ACSReady's training-journal footnote** — ACSReady deliberately *cut* endorsement generation precisely because of this liability — and is comparable to a regulatory-record bar, though framed as "you, the CFI, remain the responsible party." "EndorseKit is recordkeeping software. The certificated flight instructor is solely responsible for the correctness, applicability, and currency of every endorsement issued under 14 CFR Part 61 and AC 61-65, and for retaining the records the regulations require. EndorseKit does not provide legal or regulatory advice and is not affiliated with the FAA." must appear on: the signup/onboarding flow (acknowledged checkbox, persisted + versioned), the endorsement-issuance screen, every issued endorsement PDF, and the app footer. Missing it from signup or the issuance screen is a CONCERN; missing it everywhere is a launch-readiness defect tracked in the risk register. See [.claude/rules/security.md](.claude/rules/security.md#aviation-domain-risk--the-disclaimer-calibrated).

## Boundary — do not duplicate sibling products

EndorseKit is the **CFI-side business operating system** — the CFI is the buyer. It is **not** `acsready` (a **student-side** ACS training journal where the CFI is a free guest and the *student* pays). EndorseKit's student CRM + ACS-progress checklist is the CFI's **lightweight roster view of their students** — contact, certificate target, a coarse ACS-progress checklist, an hour tally, a re-engagement nudge. It must **NOT** expand into a full student-owned training journal with debriefs, chair-fly notes, per-element student notes, photo uploads, or a student login — that is `acsready`'s product. EndorseKit is also not a pilot-currency tracker (`currency-hub`) and not an aircraft-airworthiness tracker (`tail-number-radar`). The student is a free, unauthenticated, signed-token user — never an authenticated account. (Note: `acsready` deliberately CUT endorsement / 8710 generation as out-of-scope because of its regulatory liability — EndorseKit legitimately owns endorsement issuance, and treats the regulatory care that demands as a first-class concern.) The EndorseKit ↔ acsready boundary is stated explicitly in [docs/01-discovery.md](docs/01-discovery.md). A PR that drifts EndorseKit toward a student training journal or toward flight-school management is scope creep — `spec-guardian` BLOCKs it.

## Working with the spec

- The week-by-week plan (§6) is the authoritative sequence. When asked to implement, locate the matching week first and stay inside its scope.
- The §1 stack table, §3 system diagram + flows, §4 data model, and §6 weekly milestones are concrete enough to code against directly — link to them, don't paraphrase.
- The "cut from V1" list in §5.4 is a refusal list, not a backlog. Adding any of them requires founder override + an ADR superseding the row.
- Every claim about an endorsement's wording, applicability, or recordkeeping obligation must cite its AC 61-65 paragraph and/or 14 CFR section. "I think the solo endorsement is good for 90 days" is not acceptable; "14 CFR 61.87(n) — a solo endorsement is renewed every 90 days" is.

## Subagents available locally

Defined in [.claude/agents/](.claude/agents/) — invoke with the Agent tool.

- **`spec-guardian`** — reviews any change for scope creep against `docs/product-research.md` (especially §1 stack table, §5.4 cut list, §6 weekly milestones), the load-bearing-decisions block above, and the EndorseKit ↔ acsready / flight-school-management boundary. Returns `PASS / CONCERN / BLOCK`.
- **`endorsement-registry-auditor`** — reviews any change to `backend/internal/endorsements/**`, the `endorsements` / endorsement-template tables or migrations, the endorsement-PDF renderer, or the e-signature path. Verifies the registry is append-only, the per-record HMAC seal is chained to the prior record, every AC 61-65 template carries its citation, the e-signature binds to the sealed content, and the aviation disclaimer surfaces.
- **`stripe-connect-auditor`** — reviews any change to `backend/internal/billing/**`, the Stripe webhook receivers, or `connected_accounts` / `invoices` / `subscriptions` tables. Verifies webhook signature-on-raw-body + DB idempotency, the platform-vs-connected-account boundary, that the platform never becomes merchant of record, that money is never `float64`, and that onboarding state is verified.
- **`rls-and-tenancy-auditor`** — reviews migrations and any code path touching CFI-owned data. Verifies RLS on every CFI-owned table, the Go backend's per-request owner predicate, the `endorsements` table's INSERT+own-SELECT-only tenancy, and that public student-facing signed-token surfaces expose only their scope.

Invocation triggers documented in [.claude/rules/engineering.md](.claude/rules/engineering.md#subagent-invocation-triggers).

## Update cadence for this file

Update when:
- A new ADR is accepted that supersedes a prior decision (refresh the load-bearing block, link the ADR).
- A new external constraint is discovered (free-tier change, rate-limit change).
- A new subagent is added.

**Don't** update just because implementation changed — `CLAUDE.md` carries invariants, not code state.
