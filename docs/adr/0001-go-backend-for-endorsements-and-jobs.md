# 0001. EndorseKit gets a Go backend service, not a web-only stack

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

The founder's portfolio default is the ACSReady stack: a SvelteKit PWA
on Cloud Run, a single Supabase project, with SvelteKit server routes
covering the handful of paths that need a server secret. That stack is
web-only — no separate backend service. It works for a pure-CRUD product
like ACSReady.

EndorseKit is not pure-CRUD. It has three jobs that a request/response
SvelteKit-on-scale-to-zero runtime handles poorly or not at all:

1. **Server-side endorsement-PDF generation.** Issuing an endorsement
   produces a PDF that is a **legal document**. It must be rendered
   server-side, deterministically, from the *sealed* endorsement record
   — never assembled in the browser, where the rendered content could
   diverge from the sealed data. PDF rendering is CPU-bursty and wants a
   real server runtime.
2. **A daily booking/lesson reminder cron.** EndorseKit reminds a CFI of
   an upcoming lesson, nudges opt-in students about an approaching
   booking, and surfaces the "not flown in N weeks" re-engagement
   prompt. Something must run once a day. SvelteKit on Cloud Run with
   `min-instances=0` is a request-driven runtime with no scheduler.
3. **Stripe Connect.** The CFI invoices students through Stripe Connect;
   funds settle to the CFI's connected account. Connect has its own
   webhook surface (`account.updated`, `capability.updated`, `payout.*`,
   connected-account `invoice.*`), a strict platform-vs-connected
   boundary, and onboarding state that must be tracked server-side. This
   is a genuine third-party integration, not a Checkout redirect.

The founder's stated portfolio rule: *any product needing scheduled
jobs, notification fan-out, server-side document generation, or
third-party API integration gets a Go service on Cloud Run, following
tail-number-radar's Go conventions.* EndorseKit triggers that rule on
all three counts. This decision is **load-bearing** — it changes the
deployable count, the CI surface, and the architecture diagram — so it
must be settled before any code lands.

## Decision drivers

- **Server-side document generation is mandatory.** The endorsement PDF
  is a legal artifact; it must render from sealed data, server-side. A
  pure-Go PDF library on a Go service is the clean home for this.
- **A real scheduler is needed.** Cloud Scheduler → an OIDC-authed
  endpoint on a scale-to-zero Go service costs \$0 idle and spins the
  container up once a day. The alternative — a SvelteKit service pinned
  at `min-instances=1` purely to host an in-process timer — is a
  recurring ~\$5/mo cost for an idle container.
- **Stripe Connect wants a server.** Two webhook endpoints, two signing
  secrets, connected-account scoping, and persisted onboarding state are
  more than a SvelteKit `+server.ts` Checkout redirect comfortably
  carries.
- **Portfolio consistency.** The sibling `tail-number-radar` already
  runs a Go service on Cloud Run with exactly these conventions (stdlib
  `net/http.ServeMux`, `pgx/v5` + `sqlc`, `golang-migrate`, `slog`).
  Reusing them is one mental model, not two.
- **No ML component.** EndorseKit has no AI/ML feature, so the
  portfolio's "ML → Python service" rule does not apply. Go covers the
  whole backend.
- **Free-tier discipline.** Two Cloud Run services both scale to zero;
  the combined free tier (2M req/mo) is far above V1 projections.

## Considered options

1. **Web-only — SvelteKit + Supabase, no separate service.** Host the
   cron as an in-process timer on a `min-instances=1` SvelteKit service;
   generate PDFs client-side or in a SvelteKit route; handle Stripe
   Connect from `+server.ts`.
2. **SvelteKit web tier + a Go backend service on Cloud Run.** The Go
   service owns endorsement-PDF generation, the reminder cron, and
   Stripe Connect; the web tier does simple CRUD and proxies the rest.
3. **SvelteKit web tier + a Cloud Run Job for the cron only.** A Cloud
   Run Job for the cron; PDF generation and Stripe Connect still in
   SvelteKit routes.

## Decision outcome

Chosen option: **Option 2 — a SvelteKit web tier plus a Go backend
service on Cloud Run** — because EndorseKit triggers the founder's
portfolio backend rule on three independent counts (server-side document
generation, a scheduled job, and a third-party API integration), and a
dedicated Go service is the right home for the endorsement-PDF renderer,
the reminder cron, and the Stripe Connect webhook surface.

### Positive consequences

- The endorsement PDF renders server-side, deterministically, from the
  sealed record — in a pure-Go renderer (ADR-0003) that keeps the
  distroless image valid.
- The cron is a clean OIDC-authed endpoint on a scale-to-zero service —
  \$0 idle.
- Stripe Connect's two webhook endpoints, connected-account scoping, and
  onboarding state live in a service built to handle them.
- Server secrets (Stripe platform + Connect, Resend, R2, the URL- and
  endorsement-seal keys) concentrate in the Go service; the web tier's
  secret surface shrinks.
- Conventions are shared with `tail-number-radar` — one Go mental model
  across the portfolio.

### Negative consequences

- **Two deployables instead of one.** Two Dockerfiles, two Cloud Run
  services, a slightly larger CI surface and Secret-Manager footprint.
  Mitigated by one `.woodpecker/deploy.yml` with path-gated steps.
- A web↔backend network hop for backend-backed calls. Acceptable —
  same-region Cloud Run, and the calls are not latency-critical.
- More to learn/maintain if the founder is more fluent in TS than Go —
  but `tail-number-radar` already establishes the Go conventions.

## Pros and cons of each option

### Option 1 — web-only

- 👍 One deployable, simplest CI.
- 👍 No web↔backend hop.
- 👎 No clean home for server-side PDF generation of a legal artifact.
- 👎 The cron needs `min-instances=1` → a recurring idle cost, OR an
  awkward external-trigger hack into a request runtime.
- 👎 Stripe Connect's webhook surface + onboarding state is awkward in
  SvelteKit `+server.ts` routes.
- 👎 Contradicts the founder's portfolio backend rule.

### Option 2 — SvelteKit web + Go backend (chosen)

- 👍 A proper home for PDF generation, the cron, and Stripe Connect.
- 👍 Portfolio-consistent with `tail-number-radar`.
- 👍 Server secrets concentrate in the Go service.
- 👎 Two deployables; larger CI + secret surface.

### Option 3 — web + a Cloud Run Job for the cron only

- 👍 The cron gets a proper scheduled runtime.
- 👍 One fewer standing service than Option 2.
- 👎 PDF generation and Stripe Connect still have no clean server home —
  the same weakness as Option 1 for two of the three drivers.
- 👎 A Cloud Run Job plus a SvelteKit service plus PDF-in-TS is arguably
  *more* moving parts than one coherent Go service.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §2.1
  (backend reasoning), §3 (architecture).
- Related ADRs: [0002](0002-endorsement-record-immutability.md) (the
  append-only registry the Go service writes), [0003](0003-endorsement-pdf-and-esignature.md)
  (the PDF + e-signature), [0004](0004-stripe-connect-invoicing.md)
  (Stripe Connect).
- Sibling-repo reference: `tail-number-radar` — Go monolith on Cloud
  Run, `net/http.ServeMux` + `pgx/v5` + `sqlc` + `golang-migrate`.
- External: [Cloud Run pricing](https://cloud.google.com/run/pricing),
  [Cloud Scheduler free tier](https://cloud.google.com/scheduler/pricing).
