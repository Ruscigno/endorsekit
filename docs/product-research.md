# EndorseKit — MVP V1 Development Plan & Architecture Blueprint

This document is the end-to-end build plan for a solo developer to ship
**EndorseKit** — the operating system for the independent flight
instructor — over ~10–12 evenings/weekends-paced weeks, using Google
Cloud and Supabase free tiers. It is opinionated, pragmatic, and biased
toward shipping over theoretical purity. It expands research §5
**Opportunity 3 — "Independent CFI Operating System (EndorseKit)"** into
a concrete plan.

Every decision is constrained by one hard truth: **the user is one
person with a few hours a night, building for a paying customer — an
independent CFI — who is also one person with a few hours a night, and
who has a legal obligation to keep the records the product produces.**
Boring tech wins. The product's defensible moat is **vertical depth**
(aviation-literate booking, the AC 61-65 endorsement catalog, a
trustworthy permanent registry) and **stickiness** (endorsement records
must be kept 3+ years).

> **This file is the sacred source of truth.** It is never edited after
> bootstrap. Every other doc cites it by section number. When a decision
> changes, write an ADR in `docs/adr/` that supersedes the specific row.

---

## 0. The product in three sentences

EndorseKit is a single $12/mo subscription that replaces the Calendly +
Stripe + Google-Sheets stack an independent Certificated Flight
Instructor runs their business on: a Hobbs/Tach-aware **booking page**, a
one-tap **endorsement issuance** flow backed by the AC 61-65 reference
catalog, an **append-only endorsement registry** that is the CFI's
system of record for the 3-year retention 14 CFR 61.189 / AC 61-65
require, a lightweight **student CRM** with an ACS-progress checklist and
re-engagement nudges, and **Stripe Connect invoicing** so the CFI gets
paid into their own account. The CFI is the paying customer; the student
is a free, unauthenticated secondary user who books lessons and receives
endorsement PDFs.

**What it does NOT do** (the V1 cut list — see §5.4): it is not a flight
school back office (no multi-CFI scheduling, no Part 141 records, no
fleet scheduling, no school billing), it is not a student-side training
journal (that is the sibling product `acsready`), it is not the CFI's
personal logbook, it does not file 8710/IACRA applications or transmit
anything to the FAA, and V1 has no SMS, no Web Push, no native app, and
no ML/AI.

### Goal

Give an independent CFI one tool that does the four jobs they currently
glue together by hand — **take a booking, issue and keep an endorsement,
remember where each student is, and get paid** — so the CFI spends their
evenings teaching, not reconciling spreadsheets, and never loses an
endorsement record the FAA can ask for.

---

## 1. Executive Summary of Decisions

| Layer             | Recommendation                                                                                                  | Why (one line)                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Frontend          | **SvelteKit (Svelte 5 runes) + Tailwind CSS + Vite-PWA plugin**                                                  | Smallest bundles; the CFI uses it one-handed on a phone on FBO Wi-Fi; the public booking page must load instantly |
| Backend           | **Go 1.25 service on Cloud Run** — stdlib `net/http.ServeMux`, `pgx/v5` + `sqlc`, `golang-migrate`, `slog`       | Server-side endorsement-PDF generation, a booking/lesson reminder cron, and Stripe Connect all need a real server (ADR-0001) |
| Endorsement registry | **An append-only Postgres table, HMAC-sealed and hash-chained** (`backend/internal/endorsements`)            | Endorsement records are legal documents (14 CFR 61.189 / AC 61-65) — immutable, tamper-evident, 3-year retention (ADR-0002) |
| Database          | **Supabase Postgres** (free tier, upgrade to Pro at first ~10 paying CFIs)                                       | Real Postgres; data + Auth + RLS in one product                                                                 |
| Auth              | **Supabase Auth** (email/password + magic link + Google OAuth) — the CFI only                                    | The CFI is the only authenticated principal; the student is unauthenticated (signed-token surfaces)             |
| Authorization     | **RLS (browser-direct CRUD) + Go-backend owner predicate** — two layers                                          | RLS gates `supabase-js` calls; the Go service scopes every query by the JWT-derived CFI                         |
| File storage      | **Cloudflare R2** (10 GB + zero egress free) — endorsement PDFs, invoice PDFs, registry exports                  | Supabase Storage's egress would be exhausted; R2 has none. The registry export archive is the durable legal copy |
| Payments          | **Stripe Checkout + Customer Portal** (CFI's subscription, platform account) + **Stripe Connect** (CFI invoices students) | The CFI pays $12/mo; the CFI gets paid into their own connected account (ADR-0004)                       |
| Billing model     | **Flat $12/mo or $120/yr subscription; NO `application_fee` on the Connect path**                                | The CFI keeps 100% of student payments minus Stripe's processing fee — a simple, trust-building model (ADR-0005) |
| E-signature       | **Typed-name + an explicit intent affirmation, bound to the sealed endorsement content hash**                    | Legally attributable, no drawing-canvas edge cases; a drawn-signature image is V1.1 (ADR-0003)                  |
| Email             | **Resend** (3 000/mo free, 100/day cap) — transactional + endorsement-PDF delivery + lesson reminders            | Best DX; deliverability matters because an endorsement email landing in spam is a real product failure          |
| Reminder cron     | **Cloud Scheduler → OIDC-authed `POST /cron/daily`**; reminder dedupe is a DB UNIQUE constraint                  | The cron is idempotent by construction; over-firing is a safe no-op                                            |
| Hosting           | **Google Cloud Run** us-central1, scale-to-zero — two services (`endorsekit-web`, `endorsekit-api`)              | 2M req free; both services scale to zero when idle                                                              |
| Monitoring        | **Sentry** (free 5k errors/mo, web + Go SDKs) + Cloud Run native logs                                            | Don't add a third observability tool                                                                            |
| Analytics         | **PostHog Cloud free tier** (1M events + session replay + flags)                                                 | Single tool covers behavioural analytics + replay + flags                                                       |
| Local dev         | **Supabase CLI (Docker)** + **air** (Go reload) + **Vite dev server**                                            | The CLI runs the whole Supabase stack locally                                                                   |
| CI/CD             | **Self-hosted Woodpecker** on the founder's Mac via Cloudflare Tunnel                                            | Free; runner infra lives in `iac-tickerbeats`. No GitHub Actions billing                                        |

The single most important architectural decision is **"a SvelteKit web
tier plus a Go backend service, split deliberately."** EndorseKit has
three things a request-driven SvelteKit-on-scale-to-zero runtime handles
poorly: **server-side endorsement-PDF generation** (a legal artifact,
rendered deterministically from sealed data), a **daily booking/lesson
reminder cron**, and **Stripe Connect** (a marketplace integration with
its own webhook surface and a strict platform-vs-connected boundary).
The founder's portfolio rule assigns any such product a Go service on
Cloud Run. There is no Python service — EndorseKit has no ML component.

---

## 2. Tech Stack Recommendation With Detailed Reasoning

### 2.1 Backend: a Go service, decided — not deferred

A pure-CRUD micro-SaaS can often skip a dedicated backend and let
SvelteKit server routes handle the few server-secret paths. **EndorseKit
cannot**, for three reasons — and the founder's portfolio rule
("anything needing scheduled jobs, notification fan-out, server-side
document generation, or third-party API integration gets a Go service on
Cloud Run") triggers on all three:

1. **Server-side endorsement-PDF generation.** An issued endorsement
   produces a PDF that is a **legal document**. It must be rendered
   server-side, deterministically, from the *sealed* endorsement record
   — never assembled in the browser where the content could diverge from
   the sealed data. PDF generation is also CPU-bursty and benefits from
   a real server runtime.

2. **A daily booking/lesson reminder cron.** EndorseKit nudges a CFI of
   an upcoming lesson and (where the CFI opted in) reminds a student of
   an approaching booking, and surfaces the "you haven't flown with this
   student in N weeks" re-engagement nudge. Something must run once a
   day. SvelteKit on Cloud Run with `min-instances=0` is a request-
   driven runtime with no scheduler. Cloud Scheduler → an OIDC-authed
   endpoint on a scale-to-zero Go service is the clean answer: \$0 idle.

3. **Stripe Connect.** The CFI invoices students through Stripe Connect;
   funds settle to the CFI's connected account. Connect has its own
   webhook surface (`account.updated`, `capability.updated`, `payout.*`,
   connected-account `invoice.*`), a strict platform-vs-connected
   boundary, and onboarding state that must be tracked server-side. This
   is a real third-party integration, not a Checkout redirect — it wants
   a server with a proper webhook receiver and secret handling.

**Go vs Python.** Go. EndorseKit is CRUD + PDF rendering + a cron + a
payments integration — no ML, no data-science libraries. Go compiles to
a ~15–25 MB static binary, cold-starts under 100 ms, uses modest RAM per
Cloud Run instance, and deploys as a distroless image. Python's only
edge (ML libraries) does not apply. **A Python service is reserved for a
future ML/AI component; V1 has none.**

**PDF library note.** The endorsement-PDF and invoice-PDF renderer must
use a **pure-Go** PDF library so the distroless/static image stays valid
(no cgo, no headless Chromium). The specific library is chosen in
[ADR-0003](adr/0003-endorsement-pdf-and-esignature.md) before the
dependency is added.

**Framework within Go.** Stdlib `net/http.ServeMux` (Go 1.22+ enhanced
patterns). The route surface is small and RESTful; the enhanced ServeMux
handles it without a framework. **No chi, gin, echo, fiber.** This
mirrors the sibling `tail-number-radar` repo's conventions exactly —
`pgx/v5` + `sqlc`, `golang-migrate`, `slog`, no GORM, no `database/sql`.

The formal architecture call is recorded in
[ADR-0001](adr/0001-go-backend-for-endorsements-and-jobs.md).

### 2.2 Database: Supabase

Supabase Postgres is the right choice. The free tier (as of May 2026):
500 MB Postgres DB, 50k MAU on Auth, 2 active projects, **7-day
inactivity pause**.

Why Supabase wins for EndorseKit:

- It is real PostgreSQL — the data model (CFIs, students, bookings,
  lesson types, endorsements, the AC 61-65 template catalog, invoices,
  connected accounts) is relational and maps cleanly. The **append-only
  endorsement registry** is a Postgres table with a withheld grant set
  and an append-only trigger — Postgres gives this for free; a document
  store would not.
- Row-Level Security gives the multi-tenant authorization model at the
  database layer, so a frontend bug cannot leak one CFI's students or
  endorsements to another.
- Auth + database in one product means one billing surface.
- The Go backend connects via `pgxpool` directly (a trusted server) and
  also relies on RLS as defense-in-depth.

The migration path off Supabase is `pg_dump | psql` to Cloud SQL — no
lock-in. **Upgrade trigger:** Supabase Pro ($25/mo) at ~10 paying CFIs
OR ~400 MB DB. EndorseKit's data is small (text, dates, hashes — not
media; PDFs live in R2), so the 500 MB free DB lasts a long time.

### 2.3 Frontend: SvelteKit

The web tier is a mobile-first PWA. The CFI uses it one-handed at the
airport — picking an AC 61-65 reference and signing an endorsement on
their phone after a lesson — and the **public booking page** is a
customer-facing surface a student opens on whatever connection they
have. Bundle size and time-to-interactive dominate. **SvelteKit (Svelte
5 runes)** ships a ~15–25 KB JS payload vs ~80–90 KB for Next.js. Form
Actions give progressive enhancement for free. Tailwind, `@supabase/ssr`,
and `@vite-pwa/sveltekit` are first-class. Deploys to Cloud Run with
`@sveltejs/adapter-node` in a ~50 MB image. Next.js is rejected for the
same reasons it is across the portfolio — the React ecosystem matters
for a team, not a solo dev optimizing mobile shipping speed.

### 2.4 Auth: Supabase Auth — the CFI only

Email + password (verification on), magic link, Google OAuth. No
phone/SMS in V1. The browser uses `@supabase/supabase-js`; the web SSR
tier uses `@supabase/ssr`'s `createServerClient` + `safeGetSession()`;
the Go backend verifies the `Authorization: Bearer <jwt>` header on
every authenticated route — ES256, JWKS fetched once at boot and cached,
HS256 rejected, `aud='authenticated'` enforced.

**The student is not an authenticated user.** A student interacts with
EndorseKit only through unauthenticated, HMAC-signed-token surfaces — the
public booking page, the booking-confirmation page, and the
endorsement-PDF download link. This is a deliberate design choice: it
keeps the auth surface small, keeps the product squarely CFI-side, and
is the structural line that prevents EndorseKit from drifting into
`acsready`'s student-side territory.

### 2.5 Payments: Stripe — two relationships

EndorseKit runs **two distinct Stripe relationships** (see
[ADR-0004](adr/0004-stripe-connect-invoicing.md) and
[ADR-0005](adr/0005-billing-model.md)):

1. **The platform's own billing.** The CFI subscribes to EndorseKit.
   Standard Stripe **Checkout** + **Customer Portal** + **Billing** on
   the **platform account**. Two prices: `price_monthly` ($12/mo) and
   `price_annual` ($120/yr). EndorseKit is the merchant here.

2. **The CFI invoicing students.** Via **Stripe Connect**. Each CFI
   onboards a **connected account** (Standard accounts in V1 — the CFI
   gets a full Stripe dashboard, and Stripe handles their tax/identity
   onboarding). The CFI creates an invoice with aviation line items
   (ground instruction, flight instruction, simulator, materials); the
   student pays via Stripe-hosted Checkout/Payment Element scoped to the
   connected account; funds settle to the **CFI's** account. EndorseKit
   is the *platform*, **never the merchant of record for a lesson**.

**The billing model takes no `application_fee`.** V1 monetizes solely
through the flat subscription; the CFI keeps 100% of what a student pays
minus Stripe's own processing fee. This is simple, trust-building, and
keeps the product a pure SaaS rather than a payments-skimming
marketplace. A per-transaction fee is a different business model and
would require an ADR superseding ADR-0005.

Webhook handling: **two endpoints, two signing secrets.** Platform
events (`checkout.session.completed`, `customer.subscription.*`,
`invoice.*` for the CFI's subscription, `charge.refunded`) and
connected-account events (`account.updated`, `capability.updated`,
`payout.*`, connected `invoice.*`, `payment_intent.succeeded`) arrive on
separate endpoints. Each verifies the signature against the **raw**
request body. Idempotency: a `processed_webhook_events` table with
`UNIQUE (provider, event_id)`; the handler short-circuits duplicates.

### 2.6 Email: Resend

Resend free tier: 3 000 emails/month, 100/day, 1 verified domain. This
covers transactional email (CFI verification, magic link, password
reset), **the delivery of the endorsement PDF to the student** (the core
of the issuance flow), and the daily booking/lesson reminders.

Email volume is comfortably within the free tier at V1 scale: a CFI
issues a handful of endorsements a week and has a handful of bookings —
even at ~100 paying CFIs the daily send count stays well under 100/day.
The §11 risk register tracks it; Resend Pro ($20/mo for 50k) is the
escape hatch. **Deliverability is a first-class concern** — an
endorsement PDF landing in a student's spam folder is a real product
failure. SPF + DKIM + DMARC on the sender domain before launch.

### 2.7 File storage: Cloudflare R2

EndorseKit's user-file surfaces are all **server-generated documents**:
the **endorsement PDF** (the legal artifact), the **invoice PDF**, and
the **registry export archive**. The Go backend renders each and writes
it to R2; clients fetch via signed GET URLs. R2's free tier (10 GB
storage, 1M Class-A ops, **zero egress**) is ample — EndorseKit's
documents are small and low-volume.

The **registry export archive in R2 is the durable legal copy of
record.** R2 object versioning + a retention/lifecycle policy on the
endorsement-PDF and registry-export prefixes protect these legal records
from accidental deletion. Supabase Storage's egress would be the first
wall; R2 has none.

### 2.8 Reminder cron + scheduling

Cloud Scheduler (free tier: 3 jobs) fires once a day, posting an
OIDC-authed request to the Go backend's `POST /cron/daily`. The backend
verifies the OIDC token (issuer = Google, audience = the Cloud Run
service URL), then: finds bookings happening soon and sends the CFI (and
opt-in students) a reminder; finds students not flown in N weeks and
surfaces a re-engagement nudge. For each (booking × channel × send
window) it attempts an `INSERT … ON CONFLICT DO NOTHING RETURNING id`
into the reminder audit table. The email is sent only when the INSERT
won the dedupe. **The UNIQUE constraint is the at-most-once guarantee** —
re-running the cron the same day is a safe no-op. V1 uses a **single UTC
slot** (default 13:00 UTC = 09:00 ET / 06:00 PT); per-user-timezone
scheduling is a documented V1.1 evolution.

### 2.9 Monitoring, error tracking, analytics

- **Sentry** — free 5k errors/mo; SDKs in both the SvelteKit tier
  (client + server) and the Go backend.
- **Cloud Run** — built-in metrics + Cloud Logging. $5 budget alert.
- **PostHog Cloud free** — 1M events, session replay, feature flags.
  Funnel: landing → signup → first student added → first booking → first
  endorsement issued → invoicing connected → paid.
- **UptimeRobot** free — synthetic checks on `/healthz` (both services),
  the landing page, and a representative public booking page.

### 2.10 Local dev environment

- **Supabase CLI** + Docker — runs Postgres + GoTrue + Studio + Inbucket
  locally.
- **mise** to pin Node 20, Go 1.25, pnpm, golang-migrate, the Supabase
  CLI.
- **pnpm** for the SvelteKit project; **air** for Go hot reload.
- `.env` (gitignored) holds local keys; `.env.example` is checked in.
- `stripe listen` forwards for both the platform and the Connect webhook
  endpoints when working on billing.

Project layout:

```
/web              # SvelteKit app
  /src/lib
  /src/routes
  Dockerfile
/backend          # Go service: endorsement PDFs + reminder cron + Stripe Connect
  /cmd/server     # main()
  /internal
    /server       # net/http.ServeMux wiring, middleware chain
    /auth         # ES256 JWT verification (JWKS cached); OIDC verify
    /endorsements # endorsement issuance, the AC 61-65 catalog, the
                  # append-only registry + the HMAC seal / hash chain
    /pdf          # server-side PDF rendering (endorsements + invoices)
    /bookings     # booking + lesson-type CRUD
    /students     # the CFI's roster + ACS-progress checklist
    /reminders    # the daily reminder cron + the re-engagement nudge
    /billing      # Stripe Checkout (CFI subscription) + Stripe Connect
                  # (CFI→student invoicing) + the webhook receivers
    /db           # sqlc-generated queries + the pgxpool
      /queries    # *.sql source for sqlc
    /ratelimit    # in-process token bucket
  sqlc.yaml
  Dockerfile
/db
  /migrations     # golang-migrate *.up.sql / *.down.sql (shared)
  /seeds          # the AC 61-65 endorsement-template catalog + fixtures
/.woodpecker
.env.example
```

---

## 3. Architecture Blueprint

### 3.1 System diagram (described)

```
   ┌──────────────────────────┐     ┌──────────────────────────┐
   │  CFI (Mike)              │     │  Student (anonymous —     │
   │  Browser / PWA           │     │  books a lesson, opens an │
   │  (the paying customer)   │     │  endorsement-PDF link)    │
   └────────────┬─────────────┘     └────────────┬─────────────┘
                │ HTTPS                          │ HTTPS (signed-token surfaces)
                ▼                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │   Cloudflare DNS + CDN  (free; caches static assets)        │
   └────────────┬───────────────────────────────────────────────┘
                │
       ┌────────┴──────────────────────────────┐
       ▼                                        ▼
   ┌──────────────────────────┐    ┌──────────────────────────────┐
   │  Cloud Run: web          │    │  Cloud Run: api (Go)         │
   │  SvelteKit adapter-node  │───►│  - endorsement issuance +    │
   │  - SSR pages (CFI app)   │REST│    the append-only registry  │
   │  - public booking page   │JSON│  - endorsement / invoice PDF │
   │  - auth UI (CFI)         │    │  - POST /cron/daily (OIDC)   │
   │  - simple CRUD proxied   │    │  - Stripe Checkout + Connect  │
   │    or browser-direct     │    │  - webhook receivers         │
   └───────┬──────────────────┘    └──┬────────┬─────────┬───┬────┘
           │ supabase-js (anon         │ pgxpool│ Stripe  │   │ Resend
           │  key + CFI JWT)           │        │ SDK     │   │ SDK
           ▼                           ▼        ▼         │   ▼
   ┌─────────────────┐         ┌─────────────┐ ┌────────┐ │ ┌────────┐
   │   Supabase       │◄────────┤  (Go reads  │ │ Stripe │ │ │ Resend │
   │   ─ Postgres     │         │  + writes   │ │ platform│ │ └────────┘
   │   ─ Auth (GoTrue)│         │  via pgx)   │ │ + Connect│ │
   │   ─ RLS policies │         └─────────────┘ └────────┘  │ R2 SDK
   └─────────────────┘                                       ▼
                                      ▲              ┌──────────────┐
   ┌──────────────────┐               │ OIDC POST    │ Cloudflare   │
   │  Cloud Scheduler │───────────────┘ (daily)      │ R2 — PDFs +  │
   │  (daily cron)    │                              │ registry exp.│
   └──────────────────┘                              └──────────────┘

   ┌──────────────┐   ┌──────────────┐
   │   PostHog    │   │   Sentry     │
   │   analytics  │   │   errors     │
   └──────────────┘   └──────────────┘
```

Notes:

- The **CFI's browser** does simple, CFI-owned CRUD **directly** against
  Supabase via `@supabase/supabase-js` — RLS authorizes it. Anything
  needing the endorsement registry, PDF generation, the cron-managed
  data, Stripe, or privileged SQL goes to the **Go backend**.
- The **student** never authenticates. The public booking page and the
  endorsement-PDF link are served via signed tokens; the booking-
  submission endpoint accepts a scoped write.
- The Go backend is `--no-allow-unauthenticated` on Cloud Run; it
  verifies a CFI JWT (CFI calls), an OIDC token (the cron), a Stripe
  signature (webhooks), or a signed token (the public student surfaces)
  inside the handler.
- No load balancer, no Redis, no message queue — Cloud Run + Supabase +
  R2 + Cloud Scheduler cover everything.

### 3.2 API design

REST over JSON. The CFI's browser uses `@supabase/supabase-js` for
simple CRUD; the Go backend exposes a small additive surface (full
contract in `docs/api/openapi.yaml`):

| Method | Path                              | Purpose                                          | Auth                |
| ------ | --------------------------------- | ------------------------------------------------ | ------------------- |
| GET    | `/healthz`                        | Liveness                                         | none                |
| GET/POST | `/me/lesson-types`              | Read / configure the CFI's lesson types          | CFI JWT             |
| GET/PUT | `/me/availability`               | Read / set the CFI's booking availability        | CFI JWT             |
| GET/POST | `/me/students`                  | Read / add students to the CFI's roster          | CFI JWT             |
| PATCH  | `/me/students/:id/acs-progress`   | Update a student's ACS-progress checklist        | CFI JWT             |
| GET    | `/me/bookings`                    | The CFI's bookings                               | CFI JWT             |
| PATCH  | `/me/bookings/:id`                | Confirm / cancel / complete a booking            | CFI JWT             |
| POST   | `/me/endorsements`                | Issue an endorsement (sign → seal → store → PDF) | CFI JWT             |
| GET    | `/me/endorsements`                | Search the endorsement registry                  | CFI JWT             |
| GET    | `/me/endorsements/export`         | Export the full registry (CFI's legal copy)      | CFI JWT             |
| GET    | `/me/endorsement-templates`       | The AC 61-65 endorsement template catalog        | CFI JWT             |
| POST   | `/me/invoices`                    | Create + send a student invoice (Connect)        | CFI JWT             |
| GET    | `/me/invoices`                    | The CFI's invoices + their status                | CFI JWT             |
| POST   | `/me/connect/onboard`             | Start / resume Stripe Connect onboarding         | CFI JWT             |
| POST   | `/me/billing/checkout`            | Create the CFI-subscription Checkout Session     | CFI JWT             |
| POST   | `/me/billing/portal`              | Create a Customer Portal session                 | CFI JWT             |
| GET    | `/book/:cfiSlug`                  | Public booking page data (a CFI's availability)  | none (public)       |
| POST   | `/book/:cfiSlug`                  | Submit a booking request                         | none (rate-limited) |
| GET    | `/endorsement/:token`             | Download an issued endorsement PDF               | signed token        |
| POST   | `/cron/daily`                     | Daily booking/lesson reminder + re-engagement    | OIDC (Cloud Sched.) |
| POST   | `/webhooks/stripe`                | Stripe platform billing events                   | Stripe signature    |
| POST   | `/webhooks/stripe/connect`        | Stripe connected-account events                  | Stripe signature    |
| POST   | `/webhooks/resend`                | Resend deliverability events                     | Resend HMAC         |

### 3.3 The endorsement registry — the legal-record heart

This is the heart of the product and the reason for
[ADR-0002](adr/0002-endorsement-record-immutability.md).

**Why it matters.** 14 CFR 61.189 requires a flight instructor to sign
the logbook of each person they give training or an endorsement to, and
to **keep a record** of each endorsement; AC 61-65 reinforces this and
the FAA's guidance is to retain those records for at least **3 years**.
Those records surface in FAA certificate actions and enforcement
proceedings. A CFI who loses them is exposed.

**The two-table shape.** `endorsement_templates` is the **AC 61-65
catalog** — the canonical list of instructor endorsements (solo, solo
cross-country, knowledge test, practical test, flight review, IPC,
etc.), each with its AC 61-65 paragraph reference, regulatory citation,
and a parameterized text template. `endorsements` is **the registry** —
one immutable row per endorsement the CFI actually issues.

**The append-only contract.** The `endorsements` table accepts `INSERT`
only:

- No code path issues `UPDATE` or `DELETE`. There is no `sqlc` query
  that mutates a row.
- The DB grant set withholds `UPDATE`/`DELETE` from the application
  role; an append-only trigger raises on either, as defense-in-depth.
- A **correction** is made by `INSERT`ing a *new* record that supersedes
  the prior one (a `supersedes_endorsement_id` link). Both rows survive
  forever; the registry shows the chain. This mirrors how the FAA
  expects a paper endorsement correction (line out, do not erase).

**The seal + hash chain.** Each `endorsements` row carries a content
hash over its material fields — CFI identity, student identity, the
AC 61-65 reference, the full rendered endorsement text, the issue date,
and the signature artifact reference — HMAC-keyed with
`ENDORSEMENT_SEAL_SECRET` and **chained to the prior record's hash** (the
new row's seal input includes the previous row's seal). The chain makes
silent tampering detectable: altering any historical row breaks every
subsequent link. A chain-verifier function walks the chain on demand
(and as part of the backup-restore drill). The seal algorithm and key
version are stored per row, so `ENDORSEMENT_SEAL_SECRET` can be rotated
without invalidating sealed history.

**E-signature.** The CFI signs on their phone. Per
[ADR-0003](adr/0003-endorsement-pdf-and-esignature.md) the V1 approach
is a **typed-name + an explicit intent affirmation** ("I, <name>, CFI
<cert#>, affirm I am issuing this endorsement") bound to the sealed
content hash and to the authenticated CFI identity (from the verified
JWT — never a request-body field). A drawn-signature image is a V1.1
nicety. Whatever the approach, the signature binds to the *sealed
content*, not floats free of it.

### 3.4 Critical flows

- **Signup + onboarding.** Supabase Auth (email/password + magic link +
  Google OAuth) → on first authenticated call the Go backend lazily
  creates the `cfis` row → onboarding asks display name, FAA certificate
  number + expiry, home airport, the CFI's public booking slug, and
  shows the CFI-responsibility / endorsement disclaimer checkbox
  (persisted, versioned).
- **Booking.** A student opens `endorsekit.app/book/<cfiSlug>` → sees
  the CFI's lesson types + availability → submits a booking request
  (name, email, desired slot, lesson type) → a `booking` row is created
  in `requested` status → the CFI is notified and confirms/declines from
  the app → on confirm, the student gets a confirmation email. Bookings
  carry aviation context: lesson type (ground/flight/sim), and on
  completion the CFI records Hobbs/Tach in/out.
- **Endorsement issuance.** The CFI picks an AC 61-65 reference from the
  catalog → EndorseKit autofills the CFI's certificate number + expiry
  and the chosen student's details → the CFI reviews the rendered
  endorsement text → signs (typed-name + affirmation) → the Go backend
  seals the record (content hash, chained), `INSERT`s it into the
  append-only registry, renders the **endorsement PDF** to R2, and emails
  the student a signed download link. The whole record + the audit row
  are written in one transaction.
- **Registry search + export.** The CFI searches the registry by
  student, date, or endorsement type → any time, the CFI exports the
  full registry (every row, including superseded ones) as a PDF/CSV
  archive written to R2 — their durable legal copy of record.
- **Stripe Connect — invoice + payout.** The CFI completes Connect
  onboarding (`POST /me/connect/onboard` → a Stripe-hosted account link)
  → once `account.updated` confirms `charges_enabled`, the CFI can
  create an invoice with aviation line items → the invoice is created
  **on the CFI's connected account** → the student pays via Stripe-hosted
  Checkout → the connected-account webhook records the payment → funds
  settle to the CFI's account on Stripe's payout schedule. EndorseKit
  stores only IDs; it is never the merchant of record.
- **Daily reminder cron.** As §2.8.

### 3.5 STRIDE threat boundaries (enumerated in docs/02-architecture.md)

Trust boundaries the Phase 2 STRIDE pass walks: CFI browser ↔ web,
CFI browser ↔ Supabase, web ↔ Go backend, Go backend ↔ Supabase, Go
backend ↔ R2, Go backend ↔ Stripe (platform **and** connected
accounts), Go backend ↔ Resend, Cloud Scheduler ↔ Go backend, the
anonymous student ↔ the public booking page, and the anonymous student ↔
the endorsement-PDF download link.

---

## 4. Data Model Deep Dive

### 4.1 Schema overview

```
cfis                       (one per auth.user — the paying customer:
                            profile, FAA cert number + expiry, booking
                            slug, disclaimer ack)
lesson_types               (per CFI — ground / flight / sim, duration, rate)
availability               (per CFI — booking-page open slots / rules)
students                   (the CFI's roster — contact, certificate target;
                            NOT an authenticated account)
acs_progress               (per student — the CFI's lightweight checklist)
bookings                   (a booking request → confirmed lesson; Hobbs/Tach)
endorsement_templates      (the AC 61-65 catalog — reference seed data)
endorsements               (THE REGISTRY — append-only, sealed, hash-chained)
endorsement_audit          (append-only — issuance / supersession / delivery)
connected_accounts         (per CFI — Stripe Connect onboarding state)
invoices                   (per CFI — a student invoice; Connect)
invoice_line_items         (aviation line items — ground/flight/sim/materials)
reminder_audit             (one row per reminder send — the cron's dedupe)
subscriptions              (the CFI's own EndorseKit subscription state)
processed_webhook_events   (Stripe + Resend webhook idempotency)
```

The endorsement model is deliberately a **two-table** shape:
`endorsement_templates` is *what an endorsement can be* (the AC 61-65
catalog — reference data, seeded once); `endorsements` is *what the CFI
actually issued* (the immutable registry). This keeps the catalog
maintainable (a new AC 61-65 revision = a new catalog version) without
touching a single issued record.

### 4.2 Effective schema (formal migrations land in Phase 5)

This is illustrative — the binding DDL is the `db/migrations/` files
written in Phase 5. Every CFI-owned table gets `enable row level
security` + own-read/own-write policies in the same migration. **The
`endorsements` table is the exception: its policy set is INSERT + own-
SELECT only — no UPDATE/DELETE policy — and the migration also withholds
the UPDATE/DELETE grant and installs an append-only trigger.**

```sql
-- cfis: the paying customer — identity bridge + profile + ack ----
create table cfis (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            citext not null,
  display_name     text not null,
  faa_cert_number  text,             -- the CFI certificate number
  faa_cert_expiry  date,             -- CFI certificates expire (24 cal months)
  home_airport     text,
  booking_slug     text unique,      -- the public booking-page slug
  disclaimer_acked_at      timestamptz,
  disclaimer_acked_version smallint not null default 0,
  created_at       timestamptz not null default now()
);

-- lesson_types: ground / flight / sim, per CFI ------------------
create type lesson_kind as enum ('ground', 'flight', 'sim');

create table lesson_types (
  id            uuid primary key default gen_random_uuid(),
  owner_cfi_id  uuid not null references cfis(user_id) on delete cascade
                  default auth.uid(),
  kind          lesson_kind not null,
  label         text not null,         -- "Private pilot — flight lesson"
  duration_min  int not null,
  rate_cents    int,                   -- money is integer cents, never float
  created_at    timestamptz not null default now()
);

-- availability: the booking-page open-slots model ---------------
create table availability (
  owner_cfi_id  uuid primary key references cfis(user_id) on delete cascade
                  default auth.uid(),
  rules         jsonb not null,        -- weekly recurring availability rules
  updated_at    timestamptz not null default now()
);

-- students: the CFI's roster (NOT an authenticated account) ------
create table students (
  id                uuid primary key default gen_random_uuid(),
  owner_cfi_id      uuid not null references cfis(user_id) on delete cascade
                      default auth.uid(),
  full_name         text not null,
  email             citext,
  phone             text,
  certificate_target text,             -- 'private' | 'instrument' | 'commercial' | ...
  created_at        timestamptz not null default now()
);

-- acs_progress: the CFI's lightweight checklist per student ------
-- A roster view, NOT a student training journal (that is acsready).
create table acs_progress (
  id            uuid primary key default gen_random_uuid(),
  owner_cfi_id  uuid not null references cfis(user_id) on delete cascade
                  default auth.uid(),
  student_id    uuid not null references students(id) on delete cascade,
  acs_area      text not null,         -- a coarse ACS area label
  status        text not null,         -- 'not_started' | 'in_progress' | 'ready'
  updated_at    timestamptz not null default now(),
  unique (student_id, acs_area)
);

-- bookings: a booking request → a completed lesson --------------
create type booking_status as enum
  ('requested', 'confirmed', 'completed', 'cancelled', 'no_show');

create table bookings (
  id              uuid primary key default gen_random_uuid(),
  owner_cfi_id    uuid not null references cfis(user_id) on delete cascade,
  student_id      uuid references students(id) on delete set null,
  lesson_type_id  uuid references lesson_types(id) on delete set null,
  requested_name  text not null,       -- a booking can precede a roster entry
  requested_email citext not null,
  slot_start      timestamptz not null,
  slot_end        timestamptz not null,
  status          booking_status not null default 'requested',
  hobbs_out       numeric,             -- recorded on completion
  hobbs_in        numeric,
  tach_out        numeric,
  tach_in         numeric,
  notes           text,
  created_at      timestamptz not null default now()
);

-- endorsement_templates: the AC 61-65 catalog (reference seed) ---
create table endorsement_templates (
  id              text primary key,    -- e.g. 'ac6165_a65_solo'
  ac_paragraph    text not null,       -- 'AC 61-65J ¶ A.65'
  cfr_citation    text not null,       -- '14 CFR 61.87(n)'
  title           text not null,       -- 'Solo flight (first 90-day period)'
  body_template   text not null,       -- parameterized AC 61-65 text
  ac_revision     text not null,       -- the AC 61-65 revision transcribed
  display_order   int not null
);

-- endorsements: THE REGISTRY — append-only, sealed, hash-chained -
create table endorsements (
  id                  uuid primary key default gen_random_uuid(),
  owner_cfi_id        uuid not null references cfis(user_id),
  student_id          uuid references students(id),
  template_id         text not null references endorsement_templates(id),
  -- a faithful snapshot of the facts AT ISSUANCE — never back-references
  -- that could drift if the cfis/students rows later change.
  cfi_name_snapshot   text not null,
  cfi_cert_snapshot   text not null,
  student_name_snapshot text not null,
  ac_paragraph        text not null,
  cfr_citation        text not null,
  rendered_text       text not null,   -- the full endorsement text issued
  issued_on           date not null,
  -- e-signature (ADR-0003)
  signature_kind      text not null,   -- 'typed_affirmation' (V1)
  signature_artifact  text not null,   -- the typed name + affirmation
  -- the seal (ADR-0002)
  content_hash        text not null,   -- HMAC over the material fields
  prev_content_hash   text,            -- chains to the prior record; null for the first
  seal_algo           text not null,   -- e.g. 'hmac-sha256'
  seal_key_version    smallint not null,
  -- supersession (corrections)
  supersedes_endorsement_id uuid references endorsements(id),
  -- the rendered PDF in R2
  pdf_r2_key          text,
  created_at          timestamptz not null default now()
  -- NO updated_at: this table is never updated.
);
-- The migration: withhold UPDATE/DELETE from the app role + an
-- append-only trigger. RLS: INSERT + own-SELECT only, no UPDATE/DELETE
-- policy. See ADR-0002.

-- endorsement_audit: append-only issuance / delivery trail ------
create table endorsement_audit (
  id              uuid primary key default gen_random_uuid(),
  endorsement_id  uuid not null references endorsements(id),
  owner_cfi_id    uuid not null references cfis(user_id),
  event           text not null,       -- 'issued' | 'superseded' | 'pdf_delivered' | 'pdf_redelivered'
  detail          jsonb,
  occurred_at     timestamptz not null default now()
);

-- connected_accounts: Stripe Connect onboarding state per CFI ---
create table connected_accounts (
  owner_cfi_id        uuid primary key references cfis(user_id) on delete cascade
                        default auth.uid(),
  stripe_account_id   text unique,
  charges_enabled     boolean not null default false,
  payouts_enabled     boolean not null default false,
  onboarding_status   text not null default 'not_started',
  updated_at          timestamptz not null default now()
);

-- invoices + line items: the CFI invoices a student (Connect) ----
create type invoice_status as enum
  ('draft', 'open', 'paid', 'void', 'uncollectible');

create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  owner_cfi_id        uuid not null references cfis(user_id) on delete cascade
                        default auth.uid(),
  student_id          uuid references students(id) on delete set null,
  booking_id          uuid references bookings(id) on delete set null,
  stripe_invoice_id   text unique,     -- the invoice ON THE CONNECTED ACCOUNT
  status              invoice_status not null default 'draft',
  total_cents         int not null,    -- money is integer cents, never float
  currency            text not null default 'usd',
  created_at          timestamptz not null default now()
);

create table invoice_line_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  owner_cfi_id  uuid not null references cfis(user_id) on delete cascade,
  kind          text not null,         -- 'ground' | 'flight' | 'sim' | 'materials'
  description   text not null,
  quantity      numeric not null,      -- e.g. 1.3 Hobbs hours
  unit_cents    int not null,          -- money is integer cents, never float
  amount_cents  int not null
);

-- reminder_audit: one row per reminder send — the cron's dedupe -
create table reminder_audit (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references bookings(id) on delete cascade,
  owner_cfi_id       uuid not null references cfis(user_id) on delete cascade,
  channel            text not null,    -- 'email'
  send_window_label  text not null,    -- e.g. '24h_before' | 'reengagement'
  recipient          text not null,    -- 'cfi' | 'student'
  status             text not null default 'sent',
  provider_message_id text,
  sent_at            timestamptz not null default now(),
  unique (booking_id, channel, send_window_label, recipient)
);

-- billing: the CFI's own EndorseKit subscription ----------------
create type sub_status as enum
  ('trialing','active','past_due','canceled','incomplete','unpaid');

create table subscriptions (
  user_id              uuid primary key references cfis(user_id) on delete cascade,
  stripe_customer_id   text unique,    -- ON THE PLATFORM ACCOUNT
  stripe_subscription_id text unique,
  plan                 text,           -- 'monthly' | 'annual'
  status               sub_status not null,
  current_period_end   timestamptz,
  updated_at           timestamptz not null default now()
);

create table processed_webhook_events (
  provider     text not null,          -- 'stripe' | 'stripe_connect' | 'resend'
  event_id     text not null,
  event_type   text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);
```

### 4.3 Row-Level Security

Every CFI-owned table (`cfis`, `lesson_types`, `availability`,
`students`, `acs_progress`, `bookings`, `endorsement_audit`,
`connected_accounts`, `invoices`, `invoice_line_items`, `subscriptions`)
gets RLS enabled with own-read / own-write policies keyed on
`auth.uid()`, in the same migration that creates the table. **The
`endorsements` table is the deliberate exception:** RLS allows the
owning CFI to `INSERT` and `SELECT` their own rows, and there is **no
`UPDATE` / `DELETE` policy at all** — append-only by policy as well as by
grant + trigger (ADR-0002). `endorsement_templates` is world-readable
reference data. `reminder_audit` and `processed_webhook_events` are
written by the cron / webhook app-admin path. The Go backend
additionally scopes every query by the JWT-derived `owner_cfi_id`; RLS +
the owner predicate are belt-and-suspenders. The
`rls-and-tenancy-auditor` enforces this.

### 4.4 Seed data

EndorseKit's one substantial seed asset is the **AC 61-65 endorsement
template catalog** (`db/seeds/`). It is the canonical list of instructor
endorsements — solo flight, solo cross-country, additional 90-day solo,
knowledge-test, practical-test, flight review, instrument proficiency
check, and the rest — each transcribed from the **current AC 61-65
revision** with: the AC 61-65 paragraph reference, the 14 CFR citation
the endorsement satisfies, the parameterized template text the FAA
publishes, and the revision letter it was transcribed from. This is
transcribed once (a multi-evening, careful task — the catalog is
content, and getting an endorsement's wording wrong is the worst kind of
bug), checked in as YAML, and loaded by the Phase 5 seed loader. A future
AC 61-65 revision is handled as a new catalog version + an opt-in
migration — never an in-place edit of an already-issued endorsement.

EndorseKit ships the FAA's **published** template text. It does not
invent endorsement wording.

### 4.5 Migration strategy

`golang-migrate`, sequential `db/migrations/NNNN_<name>.up.sql` /
`*.down.sql`, shared by both tiers. CI runs `up → down-all → up` on
every migration-touching PR, and `sqlc diff` asserts the Go queries
still match the schema. Never edit a committed migration. **Any
migration touching the `endorsements` table is founder-only** — it is a
legal-record table; the `endorsement-immutability` CI heuristic and the
`endorsement-registry-auditor` subagent both review it.

---

## 5. MVP Feature Scope — In, Out, Deferred

### 5.1 V1 (must ship to charge money)

| #   | Feature                                                          | Notes                                                                       |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Self-serve CFI signup (email/password, magic link, Google)       | Supabase Auth, email verification on                                        |
| 2   | Onboarding — name, FAA cert number + expiry, home airport, booking slug + the CFI-responsibility / endorsement disclaimer ack | Drives endorsement autofill |
| 3   | Lesson types (ground / flight / sim, duration, rate)             | The CFI configures what they teach                                          |
| 4   | Booking availability                                             | Weekly recurring availability rules                                         |
| 5   | Public, Hobbs/Tach-aware booking page                            | A student books a slot at `endorsekit.app/book/<slug>`; the CFI confirms     |
| 6   | Booking management (confirm / cancel / complete; record Hobbs/Tach) | The CFI's view of their bookings                                          |
| 7   | Student CRM — roster (contact, certificate target)               | The CFI's lightweight roster; NOT a student training journal                |
| 8   | ACS-progress checklist per student                               | The CFI's at-a-glance view of where each student stands                     |
| 9   | Training-hour tally + last-flown re-engagement nudge             | Derived from completed bookings; the cron surfaces "not flown in N weeks"    |
| 10  | The AC 61-65 endorsement template catalog                        | Seeded reference data — pick an endorsement by AC 61-65 reference            |
| 11  | Endorsement issuance — pick reference → autofill → sign → seal → store → PDF → email | The core flow                                          |
| 12  | The append-only, searchable endorsement registry                 | Every endorsement ever issued; sealed + hash-chained (ADR-0002)             |
| 13  | Endorsement registry export                                      | The CFI's durable legal copy of record (PDF/CSV to R2)                      |
| 14  | Server-side endorsement-PDF generation + signed download link    | The legal artifact, delivered to the student                                |
| 15  | Stripe Connect onboarding for the CFI                            | The CFI connects their own Stripe account to get paid                       |
| 16  | Invoicing — create + send a student invoice with aviation line items | Ground / flight / sim / materials; paid into the CFI's connected account |
| 17  | Daily booking/lesson reminder cron + reminder emails             | Cloud Scheduler → OIDC `/cron/daily` → Resend                               |
| 18  | Stripe Checkout (the CFI's own $12/mo subscription) + Customer Portal | Two prices; self-service cancellation                                   |
| 19  | Paywall                                                          | After a trial / activity threshold (exact trigger set in Phase 1)           |
| 20  | PWA installability                                               | Manifest + service worker; iOS install instructions card                    |
| 21  | Mobile-responsive everything                                     | One layout that works at 360px width                                        |
| 22  | Legal pages (Terms, Privacy, Refund) + the aviation disclaimer surfaces | Disclaimer on signup, the issuance screen, every endorsement PDF, footer |

### 5.2 V1.1 (within ~6 weeks of launch)

- A drawn-signature image option for endorsements (V1 ships typed-name +
  affirmation; see ADR-0003).
- SMS reminders (Twilio — requires A2P 10DLC, a multi-week external lead).
- Per-user-timezone reminder scheduling.
- ICS calendar feed of the CFI's bookings.
- Recurring / package bookings (e.g. a 10-lesson block).
- A student-facing "your training so far" read-only summary page (a
  signed-token surface — carefully scoped so it does NOT become a
  training journal).
- Endorsement-template catalog refresh tooling for a new AC 61-65
  revision.

### 5.3 V2 (the roadmap, not a promise)

- Native mobile shell wrapping the PWA.
- A deeper student-facing portal (still must not duplicate `acsready`).
- Two-way calendar sync (Google Calendar).
- A second CFI under one account (the moment it grows past one CFI it is
  no longer this product — gated behind a deliberate strategy decision).
- An optional `application_fee` / usage-based tier (a billing-model
  change — would supersede ADR-0005).

### 5.4 Features that look important but are cut from V1

This is a **refusal list**, not a backlog. Adding any of these in V1
requires a founder override + an ADR superseding the row.

| Cut                                            | Reason                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| A flight-school back office (multi-CFI scheduling, Part 141 records, fleet/aircraft scheduling, school billing) | EndorseKit is for the *solo independent CFI*; Flight Schedule Pro / FlightCircle own school management |
| A full student-side training journal           | The student CRM is the CFI's roster view; a student-owned ACS journal with debriefs is the sibling product `acsready` |
| An LMS / course-content hosting                | Sporty's / King / Gleim own training content; EndorseKit is a business tool, not a curriculum |
| The CFI's personal logbook / currency tracking | MyFlightbook / ForeFlight own the logbook; the CFI's own currency is a different product |
| 8710 / IACRA application filing                | EndorseKit issues endorsements and keeps records; it does not transmit anything to the FAA — regulatory liability + scope |
| Inventing or editing endorsement wording       | EndorseKit ships the FAA's published AC 61-65 template text; it does not author endorsements |
| Mutating or deleting an issued endorsement     | The registry is append-only (ADR-0002); a correction is a new superseding record        |
| A Stripe `application_fee` on student invoices | V1's billing model is a flat subscription (ADR-0005); a per-transaction skim is a different business model |
| EndorseKit as merchant of record for a lesson  | The CFI is paid through their own connected account; EndorseKit is the platform only    |
| SMS notifications                              | Twilio A2P 10DLC is a multi-week external dependency; email-only in V1                  |
| Web Push                                       | Service-worker push + iOS-install gating; deferred to V1.1                              |
| Native iOS / Android app                       | PWA covers 95% of the need; native is a multi-week distraction                          |
| ML / AI features                               | No ML component → no Python service in V1; an AI wrapper is not a product               |
| A student login / student-owned authenticated account | The student is a free, unauthenticated, signed-token user; an account drifts toward acsready |
| A social feed / community / CFI marketplace    | The founder cannot moderate it; a CFI↔student matching marketplace is a multi-year liquidity problem |

---

## 6. Week-by-Week Development Plan (~10–12 weeks)

Assumes ~12–15 hours/week. Compress if you can do more. Each week ends
with one deployable artifact. Maps to the milestones in `docs/04-plan.md`.

### Week 0 — Pre-flight

- Domain + Cloudflare DNS (F-01). Create GCP project, $5 budget alert
  (F-02). Create Supabase project (F-03). Create Stripe account + enable
  Connect (F-07), Resend, R2, PostHog, Sentry. Install Node 20, Go 1.25,
  Supabase CLI, golang-migrate, Docker, mise.

### Week 1 — Skeleton + auth + the CFI shell

- Scaffold `web/` (SvelteKit, TS, ESLint, Prettier, Vitest, Playwright)
  and `backend/` (Go module, `net/http.ServeMux`, `pgxpool`, `sqlc`).
- First migration: `cfis` + RLS. CFI signup / login / magic link /
  Google OAuth. Onboarding (cert number, booking slug, disclaimer ack).
- Mobile-responsive CFI app shell.

### Week 2 — The endorsement registry + the AC 61-65 catalog

- Transcribe the AC 61-65 endorsement-template catalog into
  `db/seeds/endorsement-templates.yaml` (the careful, multi-evening
  content task). Write the seed loader.
- Migrations: `endorsement_templates`, `endorsements` (append-only —
  withheld grants + trigger + INSERT/SELECT-only RLS), `endorsement_audit`.
- The seal + hash-chain logic in `backend/internal/endorsements` —
  exhaustively unit-tested, including a tamper-detection test.

### Week 3 — Endorsement issuance + PDF + first cloud deploy

- The endorsement-issuance flow: pick a reference → autofill → render
  text → sign (typed-name + affirmation) → seal → `INSERT` → audit.
- Server-side endorsement-PDF rendering (`backend/internal/pdf`) → R2 →
  the signed download link → Resend delivery to the student.
- Dockerfiles for both services; first Cloud Run staging deploy of both
  `endorsekit-web` and `endorsekit-api`. Sentry + PostHog wired.

### Week 4 — The registry UI + students + ACS checklist

- The searchable endorsement registry UI + the registry export.
- Migrations: `students`, `acs_progress`. The student-roster CRM and the
  ACS-progress checklist UI.
- The training-hour tally (derived from completed bookings).

### Week 5 — Booking page + booking management

- Migrations: `lesson_types`, `availability`, `bookings`.
- Lesson-type + availability configuration. The public, Hobbs/Tach-aware
  booking page (`/book/<slug>`) + the booking-submission endpoint
  (rate-limited, hostile-input-hardened).
- Booking management: confirm / cancel / complete; record Hobbs/Tach.

### Week 6 — The reminder cron + re-engagement nudge

- Migrations: `reminder_audit` (with the per-(booking, channel, window,
  recipient) UNIQUE constraint).
- `POST /cron/daily` — OIDC verification, the booking-reminder scan, the
  re-engagement nudge, the dedupe-INSERT, the Resend fan-out. Cloud
  Scheduler job (F-04).
- Reminder email templates (with the aviation disclaimer footer).

### Week 7 — Stripe Connect onboarding + invoicing

- Migrations: `connected_accounts`, `invoices`, `invoice_line_items`.
- Stripe Connect onboarding (`POST /me/connect/onboard` → account link;
  `account.updated` drives the persisted onboarding-status flag).
- Invoice creation with aviation line items, created **on the connected
  account**; the connected-account webhook receiver.

### Week 8 — The CFI's subscription + paywall

- Migrations: `subscriptions`, `processed_webhook_events`.
- Stripe Checkout (the CFI's $12/mo or $120/yr subscription, platform
  account) + Customer Portal + the platform webhook receiver +
  idempotency. The paywall.

### Week 9 — PWA + polish + the cross-tenant test

- Vite-PWA config (manifest, icons, service worker). iOS install card.
- Empty states, loading skeletons, error boundaries, 404/500.
- The cross-tenant isolation regression test (both layers, every
  CFI-owned table, the signed-token replay case).
- The endorsement hash-chain verifier + its tamper-detection test green.

### Week 10 — Legal, beta, launch

- Legal pages; the aviation disclaimer on all required surfaces.
  SPF/DKIM/DMARC. Lighthouse audit.
- Beta with ~10–15 independent CFIs from the founder's network (the
  founder's own CFI is in the ICP — start there).
- Production cutover; r/CFI + AskACFI + NAFI-channel launch post.

> Weeks 7–8 (invoicing + the CFI's subscription) are the natural slip
> buffer: if the ~12-week budget tightens, invoicing is the clean cut to
> a fast-follow (research §5 explicitly notes "V1 can ship without
> invoicing if needed"), and the product still ships its core — booking,
> endorsements, the registry, the CRM.

---

## 7. Testing Strategy

Solo-dev testing obeys one rule: **only write tests that catch bugs that
would cost you customers.** For EndorseKit the highest-value tests guard
the legal-record and the money paths.

### 7.1 Unit tests — the seal + the money are the priority

- **`backend/internal/endorsements` (the seal + hash chain)** targets
  ≥ 90% coverage. Tests: the content hash is stable for fixed inputs;
  the chain links correctly; a tampered historical row breaks the chain
  verifier; supersession produces a new row and never mutates the
  prior; the seal-key version is honored so a rotated key still verifies
  old records.
- **The endorsement-text renderer** — every AC 61-65 template renders
  with autofilled fields correctly and carries its citation.
- **The Stripe-webhook dispatcher + the money math** — invoice totals
  are integer cents end-to-end, never `float64`; the platform-vs-
  connected boundary is exercised.
- **The cron's reminder-window matching + the re-engagement threshold.**
- Web: Vitest for component logic that has real branching.

### 7.2 Integration tests

- Spin up local Supabase in CI; run migrations + seed; exercise:
  - **Cross-tenant isolation** — create two CFIs, write CFI A's data,
    query as CFI B (both via anon `supabase-js`/RLS and via the Go API
    with B's JWT), assert zero rows on every CFI-owned table. Assert an
    endorsement-PDF signed token for one of A's records cannot be
    replayed to read a different record. **The single most important
    test in the suite.**
  - **Endorsement append-only** — assert an `UPDATE`/`DELETE` against
    `endorsements` is rejected at the DB layer; assert a correction
    produces a superseding row and both survive.
  - **Reminder dedupe** — fire `/cron/daily` twice; assert each
    (booking × channel × window × recipient) produces exactly one
    `reminder_audit` row and one send.
  - **Cron OIDC** — an unauthenticated `POST /cron/daily` returns 401.
  - **Stripe webhook replay** — post the same event twice (platform and
    Connect endpoints), assert state mutates once.
  - **Stripe Connect routing** — assert a student invoice charge is
    created on the connected account, not the platform account.

### 7.3 End-to-end tests (Playwright)

Happy paths: (1) CFI signup → onboarding → CFI app; (2) issue an
endorsement → the registry shows it → the PDF download link works;
(3) a student opens the public booking page → submits a booking → the
CFI confirms it. One sad path: the paywall blocks after the trigger.

### 7.4 Manual + monitoring

Lighthouse before any prod deploy; real-device test each weekly deploy;
a manual end-to-end Stripe Connect test (onboard a test connected
account, send a test invoice, confirm the charge lands on it) before
launch; Sentry + PostHog replay catch the rest.

---

## 8. CI/CD Pipeline (self-hosted Woodpecker)

CI runs on a self-hosted Woodpecker server on the founder's Mac,
reachable from GitHub via Cloudflare Tunnel — no GitHub Actions billing.
Pipelines live in `.woodpecker/`.

- **`.woodpecker/pr.yml`** — every PR + push to main. Always-on gates:
  gitleaks secret scan, semgrep SAST, single-author check, PII-in-logs
  check, the endorsement-immutability heuristic, spec-guard heuristic.
  Path-gated: the `web` step (pnpm lint / check / test / build / audit),
  the `backend` step (gofmt / vet / golangci-lint / `sqlc diff` /
  `go test -race` / govulncheck), and the `db` step (golang-migrate
  `up → down-all → up` against ephemeral Postgres).
- **`.woodpecker/deploy.yml`** — push to main only. Applies migrations
  to the production Supabase Postgres first, then deploys both Cloud Run
  services (Go API + SvelteKit web) blue/green with a `/healthz` smoke
  test before promoting traffic.

---

## 9. Cloud + Launch Plan

### 9.1 Hosting

Two Cloud Run services in us-central1, both scale-to-zero, min-instances
0. Cloudflare proxied CNAME → Cloud Run for SSL + WAF. Cloud Scheduler
(1 of 3 free jobs) drives the daily cron. Secrets in Google Secret
Manager, injected at runtime. Staging = a second Supabase project +
`-staging` Cloud Run services.

### 9.2 Cost by user count

EndorseKit's data is small (text, dates, hashes — PDFs in R2) and its
compute is bursty (an app load, an endorsement issuance, a daily cron).
At 0 CFIs: \$0. At ~50 paying CFIs: ~\$0 (within every free tier). At
~500 paying CFIs: ~\$25/mo (Supabase Pro) + possibly Resend Pro
($20/mo) if endorsement + reminder volume crosses 100/day — the §11 risk
register tracks the crossover. Stripe takes its standard processing fee
on the CFI's subscription (~2.9% + 30¢ on $12 = ~$0.65/CFI/mo);
EndorseKit takes no Connect `application_fee`, so the student-invoicing
path costs EndorseKit nothing. Gross margin stays above 85%.

### 9.3 Launch plan

- **Distribution** (research §5 first-50 plan): r/CFI, r/flightschool,
  AskACFI, NAFI member channels, AOPA Flight Training Magazine forums,
  CFI YouTube/Instagram communities (Carly Chamerlik, Boldmethod). The
  founder's own CFI is in the ICP — start there. Build-in-public
  framing: "I built the tool I wished my CFI had."
- **Pre-launch**: a landing page with a one-sentence promise and a
  waitlist. If a single well-targeted r/CFI post can't collect ~50
  emails, revisit the pitch.
- **Beta**: ~10–15 independent CFIs on a free code.
- **Launch**: a public r/CFI / AskACFI post, a 90-second demo video,
  monitor Sentry + PostHog + Stripe for 72 hours.

### 9.4 Pricing

A flat **$12/mo or $120/yr** subscription — inside the research §5
$12–15/mo band, at the bottom of it to win the price-sensitive
independent CFI, with an annual offer at a ~17% discount. **No
`application_fee`** on the Connect path — the CFI keeps 100% of student
payments minus Stripe's own processing fee. The subscription is tax-
deductible as a business expense for the CFI. A CFI who charges $80/hr
and recovers even one billable hour a month of admin time pays back
$12/mo many times over.

---

## 10. Strategic Recommendations

### 10.1 Why this product, briefly

Research §5 Opportunity 3 sizes the market at ~138k active US CFIs, with
an independent slice of 30–50k. Independent CFIs are a single-operator
vertical where Calendly + Stripe + a spreadsheet is the de-facto stack —
underserved because the big tools (Flight Schedule Pro, FlightCircle)
are built for *schools*, and the free options (Pilot Partner CFI
Dashboard) are bundled into logbook products. The whitespace is
**CFI-as-a-business**: one aviation-literate subscription that replaces
three tools. Willingness-to-pay is the highest of any GA segment in the
research — a CFI's time is billable, and the tool is tax-deductible.

### 10.2 The moat

- **Vertical depth.** Aviation-literate booking (Hobbs/Tach, ground vs
  flight vs sim), the AC 61-65 endorsement catalog, ACS-progress
  tagging — a generic Calendly clone cannot do any of this.
- **Stickiness via the registry.** Endorsement records must be kept
  3+ years and are referenced in FAA enforcement. Once a CFI's registry
  lives in EndorseKit, leaving is real friction — and the registry
  compounds in value every month.
- **Network effect.** Every endorsement issued is a PDF emailed to a
  student — a marketing impression to a future pilot, possibly a future
  CFI.
- **Correctness compounds trust.** A CFI must be able to trust that the
  registry is complete, immutable, and correct. Getting that right —
  the append-only contract, the seal, the catalog accuracy — is the
  moat that a fast copycat will not replicate carefully.

### 10.3 Stay-narrow discipline

The graveyards of GA SaaS are full of all-in-one platforms. The single
most important discipline is to **refuse flight-school drift**. Every
feature request that pulls toward multi-CFI scheduling, fleet
management, or Part 141 records is a step toward competing with Flight
Schedule Pro — and losing. The second discipline is to **refuse student-
journal drift**: the student CRM is the CFI's roster view, not a
student-owned training journal (that is the sibling `acsready`). One
buyer (the independent CFI), four jobs (book, endorse, track, get paid),
one regulatory anchor (AC 61-65 / 14 CFR 61.189). Ship that.

### 10.4 Three principles to refer back to

1. **If it isn't on the §5.1 V1 list and a paying CFI hasn't asked for
   it twice, it isn't real.** Ship the list, then read the support inbox.
2. **The endorsement registry is the product.** Its immutability and
   correctness are not reversible after a CFI trusts it with a year of
   legal records. Spend the test budget on the seal.
3. **Boring tech compounds.** SvelteKit + a Go service + Supabase +
   Cloud Run + Stripe is boring on purpose. Excitement is for V2.

---

## 11. Risk Assessment

| Risk                                                                                   | Likelihood | Impact       | Mitigation                                                                                                       |
| -------------------------------------------------------------------------------------- | ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| **R1** — an endorsement record is lost, mutated, or un-attributable (a legal-record defect) | Medium | Catastrophic | The append-only contract (ADR-0002) — withheld grants + trigger + INSERT/SELECT-only RLS + the immutability CI heuristic + the `endorsement-registry-auditor`; the seal + hash chain + a tamper-detection test |
| **R2** — an AC 61-65 endorsement template ships with wrong wording                     | Medium     | High         | EndorseKit ships the FAA's *published* text, transcribed once carefully, with the revision letter recorded; a citation per template; the `endorsement-registry-auditor` checks every catalog entry |
| **R3** — a student payment is mis-routed (lands on the platform account, not the CFI)  | Medium     | High         | The platform-vs-connected boundary enforced in code + a test asserting the charge is created on the connected account; `stripe-connect-auditor`; money is integer cents, never float |
| **R4** — a Stripe webhook is replayed or its signature is mis-verified                 | Medium     | High         | `processed_webhook_events` UNIQUE `(provider, event_id)` + dedupe-before-mutation in one TX; raw-body signature verification on both endpoints; a replay test |
| **R5** — an RLS / owner-predicate bug leaks one CFI's students or endorsements to another | Medium  | Catastrophic | Two-layer authz (RLS + the Go owner predicate); the cross-tenant regression test covering both layers + the signed-token replay case |
| **R6** — Stripe Connect onboarding / live-mode review is slower than expected          | Medium     | Medium       | F-07 starts Connect enablement early; invoicing (M6/weeks 7–8) is the documented slip-buffer — the product ships without it if needed (research §5 says so) |
| **R7** — the disclaimer is missing from a required surface at launch                   | Low        | Medium       | An explicit surface-audit ticket gating launch; `endorsement-registry-auditor` flags it on relevant PRs          |
| **R8** — Supabase free project auto-pauses after 7 days inactivity (dev)               | High (dev) | Medium       | Move to Pro at first paying-CFI testing; ping staging weekly                                                     |
| **R9** — an endorsement PDF lands in a student's spam folder                           | Medium     | Medium       | SPF/DKIM/DMARC before launch; the CFI can re-send the endorsement from the registry; deliverability is a launch checklist item |
| **R10** — two Cloud Run services double the deploy + secret surface                    | Low        | Low          | One `.woodpecker/deploy.yml` with path-gated steps; shared Secret Manager                                        |
| **R11** — Pilot Partner's free CFI Dashboard / ForeFlight bundling undercuts the price | Medium     | Medium       | Aggressive vertical depth on *independents* (most incumbent CFI features assume school enrollment); the registry + invoicing are the wedge a free logbook add-on does not have |
| **R12** — the ~12-week build over-runs (the largest single risk)                       | High       | High         | Narrow V1; invoicing is the explicit slip-buffer; the §6 plan is paced; weekly 15-minute ops ritual              |
| **R13** — solo-developer fatigue over a ~12-week build                                 | Medium     | High         | The narrowest viable V1; a paced plan; the founder's own CFI as beta user #1 keeps motivation concrete           |

---

## 12. Closing Notes

EndorseKit has a real audience (~30–50k independent US CFIs), a real
recurring pain (running a CFI business on Calendly + Stripe + a
spreadsheet), and a defensible moat (vertical depth + a sticky,
regulation-anchored registry). The riskiest single factors are an
endorsement-record integrity defect — which is why the registry is
append-only, sealed, and hash-chained with a dedicated auditor — and a
~12-week build over-running, which is why invoicing is the explicit
slip-buffer.

Refer back to three things whenever a decision feels hard: **(1)** the
endorsement registry is the product — its immutability and correctness
are not reversible; **(2)** if it pulls toward flight-school management
or a student training journal, refuse it; **(3)** boring tech compounds.
Ship the §5.1 list, in the §6 order, and read the support inbox.
