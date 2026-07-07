> ⏸️ **DEFERRED — not under active development (2026-07).**
> Specs (Phase 1–4) are complete, but implementation is paused: the portfolio is on a
> **single-product focus**, concentrating 100% on **Tail Number Radar** (the sole active
> product, hosted under the Aviation Cortex portal). This gear will be picked up once TNR
> earns the right to expand. See `PROJECTS.md` and ADR-0009.

# EndorseKit

**The operating system for the independent flight instructor.** One
subscription that replaces the Calendly + Stripe + Google-Sheets stack a
solo CFI runs their business on: an aviation-literate booking page,
one-tap endorsement issuance with a permanent searchable registry, a
lightweight student roster, and Stripe-connected invoicing.

## Goal

Give an independent Certificated Flight Instructor a single tool that
does the four jobs they currently glue together by hand — **take a
booking, issue and keep an endorsement, remember where each student is,
and get paid** — so the CFI spends their evenings teaching, not
reconciling spreadsheets, and never loses an endorsement record the FAA
can ask for.

## What this product does

- **Booking page** — a Calendly-style public page that knows aviation:
  the CFI's availability, ground vs. flight vs. sim lesson types,
  Hobbs/Tach awareness, and a weather-cancellation policy. A student
  books a slot; the CFI confirms.
- **Endorsement issuance** — pick the **AC 61-65** reference, EndorseKit
  autofills the CFI's certificate number and expiry, the CFI signs on
  their phone, and the server emails a PDF to the student and stores the
  record. (See *Regulatory care* below.)
- **Endorsement registry** — an **append-only, searchable, exportable**
  record of every endorsement the CFI has ever issued. 14 CFR 61.189 and
  AC 61-65 require a CFI to keep these for at least 3 years; the registry
  is built to be that system of record, with a tamper-evident audit
  trail.
- **Lightweight student CRM** — the CFI's roster: each student's contact
  info, certificate target, an **ACS-progress checklist** (the CFI's
  at-a-glance view, not a full training journal), a running
  training-hour tally, and a last-flown-date **re-engagement nudge**.
- **Stripe-connected invoicing** — the CFI invoices a student with
  aviation line items (ground, flight, sim, materials); the student pays
  by card; the money lands in the CFI's own Stripe account via **Stripe
  Connect**. EndorseKit is the platform, never the merchant of record.

## What this product does NOT do (the V1 cut list)

EndorseKit is deliberately narrow. The following are **refusals**, not a
backlog — see [`docs/product-research.md`](docs/product-research.md)
§5.4 for the full list and reasoning.

- **It is not a flight school back office.** No multi-CFI scheduling, no
  Part 141 training-records management, no fleet/aircraft scheduling, no
  school billing. Flight Schedule Pro / FlightCircle own that; a solo
  CFI does not need it.
- **It is not a student-side training journal.** The student CRM is the
  *CFI's* roster view. EndorseKit will not grow a student-owned
  lesson-by-lesson ACS journal with debriefs and chair-fly notes — that
  is the sibling product `acsready`, where the student is the buyer. See
  the boundary statement in [`docs/01-discovery.md`](docs/01-discovery.md).
- **It is not a logbook.** It does not maintain the CFI's personal
  flight log or compute the CFI's own currency. MyFlightbook /
  ForeFlight Logbook own that.
- **It does not file 8710 / IACRA applications** and does not transmit
  anything to the FAA. EndorseKit issues endorsements and keeps the
  records; the CFI and applicant remain responsible for FAA filings.
- **No SMS or Web Push in V1.** Email is the V1 reminder channel.
- **No native iOS/Android app.** An installable PWA covers the need.
- **No ML/AI features.** There is no Python service in V1.

## Adjacent products (boundary)

EndorseKit is the **CFI-side business OS** — the CFI is the paying
customer. It is **not** `acsready` (a student-side ACS training journal
where the CFI is a free guest) and **not** a pilot-currency tracker or
an aircraft-airworthiness tracker. See
[`docs/01-discovery.md`](docs/01-discovery.md) for the explicit
EndorseKit ↔ acsready boundary.

## Regulatory care

An endorsement is a **legal document**. 14 CFR 61.189 and Advisory
Circular AC 61-65 require a CFI to keep a record of every endorsement
they give for at least **3 years**, and those records are referenced in
FAA certificate actions and enforcement. EndorseKit treats the
endorsement registry as a **first-class compliance system**: every
issued endorsement is written to an **append-only** store with a
tamper-evident hash chain, retained well beyond the 3-year floor, and
exportable by the CFI at any time. Corrections are made by issuing a new
record that supersedes the prior one — records are never edited in place
or deleted.

## Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | SvelteKit (Svelte 5 runes) + Tailwind + Vite-PWA | ~15-25 KB JS payload — wins on a CFI's phone on FBO Wi-Fi |
| Backend | Go 1.25 service on Cloud Run (`net/http.ServeMux`, `pgx/v5` + `sqlc`, `slog`) | Server-side endorsement-PDF generation, the booking/lesson reminder cron, and Stripe Connect — see [ADR-0001](docs/adr/0001-go-backend-for-endorsements-and-jobs.md) |
| DB + Auth | Supabase (Postgres + GoTrue + RLS + PostgREST) | One vendor for data + identity; RLS gates browser-direct CRUD |
| File storage | Cloudflare R2 (presigned PUT URLs, zero egress) | 10 GB free; endorsement PDFs, invoice PDFs, registry exports |
| Payments | Stripe Checkout + Customer Portal (CFI's subscription) + Stripe **Connect** (CFI invoices students) | The CFI pays $12/mo; the CFI gets paid via their own Connect account — see [ADR-0004](docs/adr/0004-stripe-connect-invoicing.md) |
| Email | Resend (100/day, 3 000/mo, 1 verified domain) | Transactional + endorsement-PDF delivery + lesson reminders |
| Hosting | Google Cloud Run (us-central1, scale-to-zero) | Free tier covers the first ~50 paying CFIs |
| Analytics | PostHog Cloud free tier | 1M events + session replay + flags in one tool |
| Errors | Sentry developer tier | 5K errors/mo, web + Go SDKs |
| Migrations | golang-migrate | Sequential `db/migrations/NNNN_*.up.sql` / `*.down.sql` |
| CI | Self-hosted Woodpecker on the founder's Mac via Cloudflare Tunnel | Free; runner infra lives in `iac-tickerbeats` |

Total infrastructure cost target: \$0/mo at 0 paying CFIs; <\$30/mo at
50 paying CFIs; <\$80/mo at 500.

## Repo layout

```
web/            SvelteKit app (not yet scaffolded — Phase 5 / M1)
backend/        Go service: endorsement PDFs + reminder cron + Stripe Connect (scaffolded skeleton — Phase 5 / M2)
db/migrations/  sequential SQL — consumed by golang-migrate + sqlc
db/seeds/       reference seed data (the AC 61-65 endorsement template catalog) + dev fixtures
docs/           spec + phase artifacts + ADRs; product-research.md is the source of truth
journal/        running session log per .claude/rules/journal.md
prompts/        reusable phase-kickoff prompts for Claude Code
.claude/        agent + rule definitions for Claude Code
.woodpecker/    CI pipeline definitions; infra lives in iac-tickerbeats
scripts/        Claude Code hooks + branch helpers
```

## Working on the code

1. **Read** [`CLAUDE.md`](CLAUDE.md) and
   [`docs/working-contract.md`](docs/working-contract.md) first. The
   contract supersedes the higher-ceremony engineering rules where they
   conflict.
2. **Bootstrap** — `make bootstrap` installs pre-commit hooks and
   verifies the local toolchain (Node 20+, pnpm, Go 1.25+, gitleaks,
   golang-migrate, supabase CLI).
3. **Day-to-day** — once scaffolded, `make web.dev` runs the SvelteKit
   dev server, `make backend.dev` runs the Go service with air
   live-reload.
4. **Migrations** — `make db.migrate` runs `golang-migrate -path
   db/migrations` against `$SUPABASE_DB_URL`. Numbered sequentially;
   irreversible migrations require an ADR. Migrations touching the
   endorsement registry are reviewed against the append-only contract.
5. **Stacked epics** — `./scripts/new-epic-branch.sh NN-slug` cuts a new
   epic branch from the most recent unmerged parent.

CI runs on every push to a branch with an open PR via
[iac-tickerbeats](https://github.com/Ruscigno/iac-tickerbeats)'
Woodpecker server. The single-author policy is enforced both locally
(pre-commit `commit-msg` hook) and in CI — `Co-Authored-By:` trailers
are rejected; never bypass with `--no-verify`.

## Phase status

Phase 0 (Bootstrap) just landed alongside the Phase 1–4 draft
artifacts. **Phases 1–4 in `docs/` are DRAFTS awaiting founder review —
no founder approval has been recorded.** The kickoff prompt is
[`prompts/01-discovery-kickoff.md`](prompts/01-discovery-kickoff.md).

## Disclaimer

EndorseKit is recordkeeping and business-management software for flight
instructors. It is not affiliated with or endorsed by the FAA. It does
not give legal, regulatory, or tax advice. The certificated flight
instructor remains solely responsible for the correctness, currency, and
applicability of every endorsement they issue under 14 CFR Part 61 and
AC 61-65, and for retaining the records the regulations require.

## Contact

Built solo. Reach me at [tickerbeats@gmail.com](mailto:tickerbeats@gmail.com).
