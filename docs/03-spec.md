# 03 — Spec

> **Status: DRAFT — awaiting founder review. No founder approval is
> recorded.** User stories, acceptance criteria, and the API contract
> for EndorseKit V1. The contract here is what Phase 4 (Plan) slices
> into tickets and what Phase 5 (Implement) tests against.
>
> Cross-references:
> [01-discovery.md](01-discovery.md) defines who and why.
> [02-architecture.md](02-architecture.md) defines the system shape.
> [api/openapi.yaml](api/openapi.yaml) is the formal API contract.

## 1. Authoring conventions

- Each user story has acceptance criteria with IDs `AC-NN` and a parent
  feature row from [01-discovery.md](01-discovery.md)'s in-scope table.
- Acceptance criteria are Given/When/Then — what the Phase 5 tests
  assert.
- Each `AC-NN` carries a **priority**: `P0` (V1 launch-blocker), `P1`
  (V1 nice-to-have, ship if cheap), `P2` (V1.1).
- Where the spec deviates from the research, the row carries
  `→ research §X` and a one-line justification.

## 2. User stories

### Feature 1 — Self-serve CFI signup

> _As an independent CFI visiting EndorseKit for the first time, I can
> create an account in under 60 seconds using whichever auth method
> matches my habits._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-01 | **Given** an unauthenticated visitor on `/signup`, **when** they submit a valid email + password, **then** Supabase Auth creates the user, sends the verification email via Resend, and the visitor lands on the email-verification waiting screen. | P0 |
| AC-02 | **Given** an unverified user with a valid verification link, **when** they click it within its TTL, **then** the email is marked verified and they land on `/app/onboarding`. | P0 |
| AC-03 | **Given** a returning CFI on `/login`, **when** they submit valid credentials, **then** they receive a `Secure; HttpOnly; SameSite=Lax` session cookie and land on `/app`. | P0 |
| AC-04 | **Given** a visitor on `/signup`, **when** they click "Send me a magic link", **then** Resend delivers a single-use link valid 1 hour, and clicking it lands them on `/app/onboarding` (or `/app` if already onboarded). | P0 |
| AC-05 | **Given** a visitor on `/signup`, **when** they click "Continue with Google", **then** Supabase's OAuth flow returns them to `/app/onboarding` with email + display name pre-filled. | P0 |
| AC-06 | **Given** a forgotten-password request, **when** the user submits their email, **then** the response is **identical** for known and unknown addresses (no enumeration), and a known-email user receives a Resend reset link. | P0 |
| AC-07 | **Given** any auth endpoint, **when** more than 10 requests arrive from the same IP within 1 minute, **then** further requests return 429 with `Retry-After`. | P0 |
| AC-08 | **Given** a successful signup, **when** the user has not yet confirmed age ≥ 13, **then** onboarding shows a required checkbox and persists the acknowledgement. | P0 |

### Feature 2 — Onboarding + the aviation disclaimer acknowledgement

> _As a freshly signed-up CFI, I tell EndorseKit the few things it needs
> to autofill my endorsements and host my booking page, and I
> acknowledge that I — not EndorseKit — am the responsible party for
> every endorsement I issue._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-09 | **Given** an onboarded check on `/app`, **when** the `cfis` row has no `faa_cert_number` or no `booking_slug`, **then** the user is redirected to `/app/onboarding`. | P0 |
| AC-10 | **Given** the onboarding form, **when** the CFI submits display name, FAA certificate number, certificate expiry date, home airport, and a desired public booking slug, **then** the `cfis` row is written. | P0 |
| AC-11 | **Given** the onboarding form, **when** the CFI submits a booking slug already taken by another CFI, **then** the form rejects it and asks for another (the slug is globally unique). | P0 |
| AC-12 | **Given** the onboarding form, **when** the CFI accepts the aviation disclaimer ("EndorseKit is recordkeeping software; the CFI is solely responsible for the correctness, applicability, and currency of every endorsement under 14 CFR Part 61 and AC 61-65, and for retaining the records the regulations require"), **then** `disclaimer_acked_at` and `disclaimer_acked_version` are persisted. | P0 |
| AC-13 | **Given** any authenticated API call, **when** `disclaimer_acked_at IS NULL` (or the version is below current), **then** the Go backend returns `403 disclaimer_required` with an `ack_url` and the web tier redirects to onboarding. | P0 |
| AC-14 | **Given** a stored FAA certificate expiry date in the past, **when** the CFI opens the endorsement-issuance screen, **then** a non-blocking warning surfaces ("your CFI certificate expiry is past — verify before issuing"). EndorseKit does not block issuance; the CFI is the responsible party. | P1 |

### Feature 3 — Lesson types

> _As a CFI, I configure the kinds of lessons I teach so my booking page
> and my invoices speak aviation._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-15 | **Given** a CFI on `/app/lesson-types`, **when** they create a lesson type with a kind (`ground`/`flight`/`sim`), a label, a duration, and an optional rate, **then** a `lesson_types` row is created scoped to their `owner_cfi_id`. | P0 |
| AC-16 | **Given** a lesson-type rate, **when** it is stored, **then** it is stored as integer cents (`rate_cents`) — never a floating-point number. → research §4.2 | P0 |
| AC-17 | **Given** a second CFI, **when** they query lesson types, **then** they see only their own — never the first CFI's. _Cross-tenant contract — see AC-X01._ | P0 |

### Feature 4 — Booking availability + the public booking page

> _As a CFI, I publish a booking page my students can use without a
> back-and-forth; as a student, I book a lesson on it._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-18 | **Given** a CFI on `/app/availability`, **when** they set weekly recurring availability rules, **then** the `availability` row is written. | P0 |
| AC-19 | **Given** anyone (unauthenticated) visiting `/book/<cfiSlug>`, **when** the page loads, **then** it shows the CFI's display name, lesson types, and open booking slots — **and nothing else about the CFI** (no students, endorsements, invoices, or contact list). → `.claude/rules/security.md` | P0 |
| AC-20 | **Given** a student on `/book/<cfiSlug>`, **when** they submit a booking request (name, email, a chosen slot, a lesson type), **then** a `booking` row is created with `status='requested'` scoped to that CFI, and the student sees a "request sent" confirmation. | P0 |
| AC-21 | **Given** the public booking-submission endpoint, **when** more than 20 requests arrive from the same IP within 1 minute, **then** further requests return 429. | P0 |
| AC-22 | **Given** the public booking-submission endpoint, **when** any field is missing or malformed, **then** the request is rejected with 400 — every field is validated server-side as hostile input. | P0 |
| AC-23 | **Given** an unauthenticated visitor, **when** they request `/book/<cfiSlug>` for a non-existent slug, **then** the response is a generic 404 with no information leak about which slugs exist. | P1 |

### Feature 5 — Booking management

> _As a CFI, I see and manage my bookings, and I record Hobbs/Tach time
> when a lesson is done._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-24 | **Given** a CFI on `/app/bookings`, **when** the page loads, **then** they see their bookings grouped by status (`requested`, `confirmed`, `completed`, `cancelled`, `no_show`). | P0 |
| AC-25 | **Given** a `requested` booking, **when** the CFI confirms it, **then** its `status` becomes `confirmed` and the student receives a confirmation email. | P0 |
| AC-26 | **Given** a `requested` or `confirmed` booking, **when** the CFI cancels it, **then** its `status` becomes `cancelled`. | P0 |
| AC-27 | **Given** a `confirmed` booking, **when** the CFI marks it completed, **then** the CFI can record `hobbs_out`/`hobbs_in` and/or `tach_out`/`tach_in`, and the `status` becomes `completed`. | P0 |
| AC-28 | **Given** a completed booking with Hobbs in/out, **when** the student's training-hour tally is computed, **then** the flight time from that booking is included. → research §5.1 #9 | P1 |

### Feature 6 — Student CRM + the ACS-progress checklist

> _As a CFI, I keep a lightweight roster of my students and a coarse
> view of where each stands against the ACS._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-29 | **Given** a CFI on `/app/students`, **when** they add a student (full name, email, phone, certificate target), **then** a `students` row is created scoped to their `owner_cfi_id`. | P0 |
| AC-30 | **Given** a CFI viewing a student, **when** they update an ACS-area status (`not_started` / `in_progress` / `ready`), **then** an `acs_progress` row for that `(student, acs_area)` is upserted. → research §5.1 #8 | P0 |
| AC-31 | **Given** the student detail view, **when** it renders, **then** it shows a coarse ACS-progress checklist and a training-hour tally — **not** a full lesson-by-lesson training journal with debriefs or per-element notes. This is a deliberate scope line (the `acsready` boundary — see [01-discovery.md](01-discovery.md)). → research §10.3 | P0 |
| AC-32 | **Given** a second CFI, **when** they query students, **then** they see only their own roster — never the first CFI's. _Cross-tenant contract — see AC-X01._ | P0 |
| AC-33 | **Given** a student with no completed booking in the last N weeks, **when** the re-engagement scan runs, **then** that student is flagged for a re-engagement nudge. → research §5.1 #9 | P1 |

### Feature 7 — The AC 61-65 endorsement template catalog

> _As a CFI, I pick the endorsement I need from the FAA's published
> AC 61-65 reference list — I never have to remember or retype the
> wording._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-34 | **Given** the `endorsement_templates` reference table, **when** it is seeded, **then** each row carries an AC 61-65 paragraph reference, the 14 CFR citation, the FAA-published template text, and the AC 61-65 revision letter it was transcribed from. → research §4.4, ADR-0002 | P0 |
| AC-35 | **Given** the endorsement-template catalog, **when** the code is inspected, **then** every template's text is traceable to the named AC 61-65 revision — no template wording is invented by EndorseKit. → `.claude/rules/security.md` | P0 |
| AC-36 | **Given** a CFI on the endorsement-issuance screen, **when** they browse the catalog, **then** templates are searchable/filterable by name and certificate type. | P1 |

### Feature 8 — Endorsement issuance

> _As a CFI, I issue an endorsement in a few taps after a lesson: pick
> the reference, review the autofilled text, sign on my phone, done._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-37 | **Given** a CFI on `/app/endorsements/new`, **when** they pick an AC 61-65 template and a student, **then** EndorseKit renders the endorsement text with the CFI's certificate number + expiry and the student's name autofilled, for the CFI to review before signing. → research §3.3 | P0 |
| AC-38 | **Given** the reviewed endorsement text, **when** the CFI signs (types their name + confirms the explicit intent affirmation), **then** the backend records the signature artifact bound to the authenticated CFI identity (from the verified JWT — never a request-body field) and to the endorsement's content hash. → ADR-0003 | P0 |
| AC-39 | **Given** a signed endorsement, **when** it is issued, **then** the backend computes its `content_hash` (HMAC over the material fields), chains it to the prior endorsement's hash, `INSERT`s the row into the append-only `endorsements` table, and writes an `endorsement_audit` row — all in one transaction. → ADR-0002 | P0 |
| AC-40 | **Given** an issued endorsement, **when** the issuance transaction commits, **then** the backend renders the endorsement PDF, writes it to R2, and emails the student a signed download link. → research §3.4 | P0 |
| AC-41 | **Given** the issuance flow, **when** the CFI is on the issuance screen, **then** the aviation disclaimer is visible adjacent to the "issue" action. → `.claude/rules/security.md` | P0 |
| AC-42 | **Given** an issued endorsement, **when** it is inspected, **then** the `endorsements` row stores a faithful snapshot of the facts at issuance (CFI name + cert, student name, AC 61-65 reference, the full rendered text) — not back-references that could drift if the `cfis`/`students` rows later change. → research §4.2 | P0 |

### Feature 9 — The append-only endorsement registry

> _As a CFI, every endorsement I have ever issued is in one searchable,
> permanent, tamper-evident place — the record the FAA can ask me for._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-43 | **Given** the `endorsements` table, **when** any code path or DB role attempts an `UPDATE` or `DELETE` against it, **then** the operation is rejected — the table's grant set withholds `UPDATE`/`DELETE`, an append-only trigger raises, and no RLS `UPDATE`/`DELETE` policy exists. → ADR-0002 | P0 |
| AC-44 | **Given** a CFI must correct an issued endorsement, **when** they do so, **then** EndorseKit `INSERT`s a new record carrying `supersedes_endorsement_id`; both rows survive and the registry shows the supersession chain. No row is ever edited or deleted. → ADR-0002 | P0 |
| AC-45 | **Given** the registry, **when** the chain verifier walks a CFI's endorsement records, **then** it recomputes each `content_hash` from the row + the prior `prev_content_hash`, and a mismatch (a tampered historical row) fails verification. → ADR-0002 | P0 |
| AC-46 | **Given** the seal, **when** `ENDORSEMENT_SEAL_SECRET` has been rotated, **then** records sealed with a prior `seal_key_version` still verify against the key version stored on the row. → ADR-0002 | P0 |
| AC-47 | **Given** a CFI on `/app/registry`, **when** they search, **then** they can filter the registry by student, by endorsement type, and by date range, and see every matching record (including superseded ones). → research §5.1 #12 | P0 |
| AC-48 | **Given** a second CFI, **when** they query the registry, **then** they see only their own endorsements — never the first CFI's. _Cross-tenant contract — see AC-X01._ | P0 |

### Feature 10 — Registry export

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-49 | **Given** a CFI on `/app/registry`, **when** they request an export, **then** the backend renders the full registry (every row, including superseded ones, with every material field) to a PDF/CSV archive in R2 and returns a signed download URL. → research §5.1 #13 | P0 |
| AC-50 | **Given** the registry export, **when** it is produced, **then** it is faithful and complete — it is the CFI's durable legal copy of record. | P0 |

### Feature 11 — Endorsement-PDF generation + delivery

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-51 | **Given** an issued endorsement, **when** the PDF is rendered, **then** it is generated server-side by the Go backend (a pure-Go renderer) deterministically from the sealed `endorsements` row — the same sealed record always produces the same PDF. → ADR-0003 | P0 |
| AC-52 | **Given** the rendered endorsement PDF, **when** it is inspected, **then** it carries the endorsement text, the CFI's signature artifact, the issue date, and the aviation disclaimer footer. → `.claude/rules/security.md` | P0 |
| AC-53 | **Given** a valid endorsement-PDF download token, **when** an **anonymous** visitor GETs `/endorsement/<token>`, **then** the endpoint serves **only** that one endorsement's PDF — never the registry, never another endorsement, never any other CFI data. → `.claude/rules/security.md` | P0 |
| AC-54 | **Given** the endorsement-PDF endpoint, **when** more than the configured rate of requests arrives from one IP, **then** further requests return 429. | P0 |
| AC-55 | **Given** a CFI viewing an endorsement in the registry, **when** they choose "re-send to student", **then** the backend re-delivers the PDF link and writes an `endorsement_audit` `pdf_redelivered` row. | P1 |

### Feature 12 — Stripe Connect onboarding

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-56 | **Given** a CFI on `/app/invoicing`, **when** they start Stripe Connect onboarding, **then** the backend creates (or fetches) the CFI's **Standard** connected account and returns a Stripe-hosted account-link URL. → ADR-0004 | P0 |
| AC-57 | **Given** an `account.updated` connected-account webhook, **when** it is processed, **then** the `connected_accounts` row's `charges_enabled` / `payouts_enabled` flags are persisted. | P0 |
| AC-58 | **Given** a CFI whose connected account does not have `charges_enabled = true`, **when** they attempt to send an invoice, **then** the backend rejects it and the UI shows the onboarding-incomplete state truthfully. → ADR-0004 | P0 |

### Feature 13 — Invoicing

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-59 | **Given** an onboarded CFI on `/app/invoices/new`, **when** they create an invoice for a student with aviation line items (`ground`/`flight`/`sim`/`materials`, each with a quantity and a unit price), **then** an `invoices` + `invoice_line_items` set is created. | P0 |
| AC-60 | **Given** an invoice, **when** any amount is stored, **then** it is integer cents (`unit_cents`, `amount_cents`, `total_cents`) — never a floating-point number. → ADR-0004 | P0 |
| AC-61 | **Given** a CFI sends an invoice, **when** the backend creates the Stripe invoice/charge, **then** it is created **on the CFI's connected account** (`Stripe-Account` scoping) — never on the platform account. EndorseKit is never merchant of record for a lesson. → ADR-0004 | P0 |
| AC-62 | **Given** a sent invoice, **when** a student pays it, **then** the connected-account `invoice.paid` webhook updates the `invoices` row to `paid` and the funds settle to the CFI's connected account. | P0 |
| AC-63 | **Given** any Stripe webhook (platform or connected-account endpoint), **when** the signature is missing or fails verification against the **raw** body, **then** the handler returns 400 and writes nothing. → `.claude/rules/security.md` | P0 |
| AC-64 | **Given** any Stripe webhook, **when** it is handled, **then** `processed_webhook_events` is upserted `ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`, and state mutates only if a row was returned. | P0 |
| AC-65 | **Given** the same Stripe event arrives twice (on either endpoint), **when** both are processed, **then** the state changes exactly once. _Replay-safety — see AC-X03._ | P0 |

### Feature 14 — The CFI's own subscription + the paywall

> _Subject to Discovery Q3/Q4 — the draft assumes a 14-day trial and
> $12/mo + $120/yr (ADR-0005)._

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-66 | **Given** a CFI on `/app/upgrade`, **when** they choose "Monthly — $12" or "Annual — $120", **then** the server creates a Stripe Checkout Session **on the platform account** with the matching price and returns the session URL. → ADR-0005 | P0 |
| AC-67 | **Given** a subscriber, **when** they click "Manage billing", **then** the server creates a Customer Portal session and the browser redirects. | P0 |
| AC-68 | **Given** `checkout.session.completed` on the platform endpoint, **when** handled, **then** `subscriptions` is upserted with `status='active'`, the `plan`, and `current_period_end`. | P0 |
| AC-69 | **Given** a CFI within their 14-day trial and with no active subscription, **when** they use the app, **then** all features work and no paywall appears. | P0 |
| AC-70 | **Given** a CFI whose trial has expired with no active subscription, **when** their next page-load happens, **then** they are redirected to `/app/upgrade` and `paywall.hit` is emitted to PostHog. | P0 |
| AC-71 | **Given** a CFI with an active subscription, **when** they navigate the app, **then** the paywall is a no-op. | P0 |
| AC-72 | **Given** the billing model, **when** a student pays a CFI's invoice via Connect, **then** **no `application_fee`** is applied — the CFI keeps 100% minus Stripe's own processing fee. → ADR-0005 | P0 |

### Feature 15 — The daily reminder cron

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-73 | **Given** `POST /cron/daily`, **when** the request carries no valid OIDC token (wrong issuer or audience, or absent), **then** the endpoint returns 401 and does nothing. → research §3.4 | P0 |
| AC-74 | **Given** a valid OIDC-authed `POST /cron/daily`, **when** it runs, **then** it finds bookings happening soon and students not flown in N weeks, and per (booking × channel × send-window × recipient) attempts `INSERT … ON CONFLICT DO NOTHING RETURNING id` into `reminder_audit`. | P0 |
| AC-75 | **Given** the cron's dedupe INSERT returns a row, **when** the handler proceeds, **then** it sends the reminder email via Resend and updates the audit row's status. | P0 |
| AC-76 | **Given** the cron is run twice for the same day, **when** both runs complete, **then** each (booking × channel × window × recipient) produces exactly one `reminder_audit` row and exactly one email. _Idempotency contract — see AC-X02._ | P0 |
| AC-77 | **Given** a reminder email, **when** it is rendered, **then** its footer carries the aviation disclaimer one-liner. | P0 |

### Feature 16 — PWA + responsive

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-78 | **Given** an Android Chrome user meeting PWA install criteria, **when** they land on the site, **then** an in-app "Install EndorseKit" banner appears. | P0 |
| AC-79 | **Given** an iOS Safari user, **when** they tap a static "How do I install this?" card, **then** the card shows the Share → Add to Home Screen steps. | P0 |
| AC-80 | **Given** the manifest, **when** Lighthouse audits `/app`, **then** the PWA category score is ≥ 90 and Performance ≥ 85. | P0 |
| AC-81 | **Given** the CFI app or the public booking page at 360px viewport width, **when** it renders, **then** there is no horizontal scroll and every interactive element has a ≥ 44×44px tap target. | P0 |

### Feature 17 — Legal + the disclaimer surfaces

| ID    | Acceptance criterion                                                                                                                                                                                          | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-82 | **Given** every page footer, **when** rendered, **then** links to `/legal/terms`, `/legal/privacy`, `/legal/refund` are present and the aviation-disclaimer one-liner is visible. | P0 |
| AC-83 | **Given** the aviation disclaimer, **when** the app is audited, **then** it appears on: the signup/onboarding flow, the endorsement-issuance screen, every issued endorsement PDF, and the app footer. → `.claude/rules/security.md` | P0 |

## 3. Cross-cutting acceptance criteria

These don't map to a single feature but block launch.

| ID     | Criterion                                                                                                                                                                                                                                                                                                          | Priority |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-X01 | **Cross-tenant isolation** — for every CFI-owned table (`cfis`, `lesson_types`, `availability`, `students`, `acs_progress`, `bookings`, `endorsements`, `endorsement_audit`, `connected_accounts`, `invoices`, `invoice_line_items`, `subscriptions`), an integration test creates two CFIs, writes CFI A's data, queries as CFI B through **both** the browser-direct RLS path **and** the Go API owner-predicate path, and asserts zero rows. Extended: an endorsement-PDF signed token for one of A's records cannot be replayed to read a different record. **The single most important test in the suite.** If it flakes, the suite halts. | P0 |
| AC-X02 | **Cron idempotency** — an integration test fires `POST /cron/daily` twice for the same day and asserts each (booking × channel × window × recipient) produces exactly one audit row and one send. | P0 |
| AC-X03 | **Stripe replay safety** — an integration test posts the same Stripe event ID twice, on both the platform and the connected-account endpoint, and asserts state mutates exactly once. | P0 |
| AC-X04 | **Cron OIDC** — an integration test asserts an unauthenticated (and a wrong-audience) `POST /cron/daily` returns 401. | P0 |
| AC-X05 | **No PII in logs** — a CI grep step asserts no log call site (in `web/src` or `backend/`) references `email`, `password`, JWT, a student name, the CFI's certificate number, or endorsement text. | P0 |
| AC-X06 | **JWT verification** — a unit test asserts the Go backend's verifier rejects `alg=HS256`, expired `exp`, wrong `aud`, wrong `iss`, and tampered signatures. | P0 |
| AC-X07 | **Migration round-trip** — CI runs `migrate up → down-all → up` on an ephemeral Postgres for every PR touching `db/migrations/**`; `sqlc diff` asserts no schema/query drift. | P0 |
| AC-X08 | **Endorsement append-only** — an integration test asserts an `UPDATE` and a `DELETE` against the `endorsements` table are both rejected at the DB layer; and that a correction produces a superseding row with both rows surviving. → ADR-0002 | P0 |
| AC-X09 | **Endorsement hash-chain tamper detection** — a unit/integration test seals a chain of records, then alters a historical row directly, and asserts the chain verifier fails. → ADR-0002 | P0 |
| AC-X10 | **Stripe Connect money routing** — an integration test asserts a student-invoice charge is created on the CFI's connected account (`Stripe-Account` scoping), not the platform account; and that no `application_fee` is applied. → ADR-0004, ADR-0005 | P0 |
| AC-X11 | **Money is never float** — a CI / unit check asserts every currency value in the invoicing path (`rate_cents`, `unit_cents`, `amount_cents`, `total_cents`) is an integer minor-unit type, never `float64`. | P0 |
| AC-X12 | **CSP + HSTS headers** — an integration test against `/` asserts `Content-Security-Policy` with no `unsafe-inline`, `Strict-Transport-Security`, `X-Frame-Options: DENY`. | P0 |
| AC-X13 | **Rate limiting** — integration tests assert 429 on the 11th request/min to auth endpoints, the 21st/min to the public booking-submission endpoint, and the configured limit on `/webhooks/*` and `/endorsement/*`. | P0 |
| AC-X14 | **Health check** — a smoke test asserts `GET /healthz` returns 200 on both services. | P0 |

## 4. API contract

The formal contract is [api/openapi.yaml](api/openapi.yaml). This
section summarizes it narratively.

### 4.1 Authentication conventions

- The web tier's `/api/*` server routes require a valid Supabase session
  cookie (`Secure; HttpOnly; SameSite=Lax`).
- The Go backend's authenticated routes require `Authorization: Bearer
  <jwt>` — the SvelteKit server forwards the CFI's Supabase JWT
  (Architecture Q2). The backend verifies ES256 against the JWKS.
- `/cron/daily` requires a Google OIDC token (Cloud Scheduler).
- `/webhooks/stripe` and `/webhooks/stripe/connect` require a Stripe
  signature; `/webhooks/resend` a Resend HMAC.
- `/book/:cfiSlug` (GET + POST) is public; `/endorsement/:token`
  requires a valid signed token; no session.
- Failures: 401 (missing/invalid credential), 403 (valid but lacks the
  role/scope, or the disclaimer is not acked), 404 (no info leak), 429
  (rate-limited).

### 4.2 Error envelope

All non-2xx JSON responses follow:

```json
{
  "error": {
    "code": "string",
    "message": "human-readable summary",
    "fields": { "field_name": ["error message"] }
  }
}
```

`fields` is present only for validation failures (400).

### 4.3 Go backend surface (`endorsekit-api`)

| Method   | Path                              | Purpose                                          | Auth                | Source AC      |
| -------- | --------------------------------- | ------------------------------------------------ | ------------------- | -------------- |
| GET      | `/healthz`                        | Liveness probe                                   | none                | AC-X14         |
| GET/POST | `/me/lesson-types`                | List / create lesson types                       | CFI JWT             | AC-15–AC-17    |
| GET/PUT  | `/me/availability`                | Read / set booking availability                  | CFI JWT             | AC-18          |
| GET/POST | `/me/students`                    | List / add students                              | CFI JWT             | AC-29, AC-32   |
| PATCH    | `/me/students/:id/acs-progress`   | Update a student's ACS-progress checklist        | CFI JWT             | AC-30          |
| GET      | `/me/bookings`                    | List bookings                                    | CFI JWT             | AC-24          |
| PATCH    | `/me/bookings/:id`                | Confirm / cancel / complete (record Hobbs/Tach)  | CFI JWT             | AC-25–AC-27    |
| GET      | `/me/endorsement-templates`       | The AC 61-65 catalog                             | CFI JWT             | AC-34–AC-36    |
| POST     | `/me/endorsements`                | Issue an endorsement (sign → seal → store → PDF) | CFI JWT             | AC-37–AC-42    |
| GET      | `/me/endorsements`                | Search the registry                              | CFI JWT             | AC-47, AC-48   |
| POST     | `/me/endorsements/:id/resend`     | Re-send an endorsement PDF to the student        | CFI JWT             | AC-55          |
| GET      | `/me/endorsements/export`         | Export the full registry                         | CFI JWT             | AC-49, AC-50   |
| GET      | `/me/registry/verify`             | Run the hash-chain integrity verifier            | CFI JWT             | AC-45          |
| POST     | `/me/connect/onboard`             | Start / resume Stripe Connect onboarding         | CFI JWT             | AC-56          |
| GET/POST | `/me/invoices`                    | List / create + send a student invoice           | CFI JWT             | AC-58–AC-61    |
| POST     | `/me/billing/checkout`            | Create the CFI-subscription Checkout Session     | CFI JWT             | AC-66          |
| POST     | `/me/billing/portal`              | Create a Customer Portal session                 | CFI JWT             | AC-67          |
| GET      | `/book/:cfiSlug`                  | Public booking-page data                         | none (public)       | AC-19, AC-23   |
| POST     | `/book/:cfiSlug`                  | Submit a booking request                         | none (rate-limited) | AC-20–AC-22    |
| GET      | `/endorsement/:token`             | Download an issued endorsement PDF               | signed token        | AC-53, AC-54   |
| POST     | `/cron/daily`                     | Daily booking/lesson reminder + re-engagement    | OIDC                | AC-73–AC-77    |
| POST     | `/webhooks/stripe`                | Stripe platform billing events                   | Stripe signature    | AC-63–AC-65, AC-68 |
| POST     | `/webhooks/stripe/connect`        | Stripe connected-account events                  | Stripe signature    | AC-57, AC-62–AC-65 |
| POST     | `/webhooks/resend`                | Resend deliverability events                     | Resend HMAC         | —              |

### 4.4 Web tier page routes (`endorsekit-web`)

| Method   | Path                  | Purpose                          | Source AC           |
| -------- | --------------------- | -------------------------------- | ------------------- |
| GET      | `/`                   | Marketing landing                | —                   |
| GET/POST | `/signup`             | CFI signup form / form action    | AC-01, AC-04, AC-05 |
| GET/POST | `/login`              | Login form / form action         | AC-03               |
| GET      | `/auth/callback`      | Magic-link / OAuth callback       | AC-02, AC-04, AC-05 |
| GET/POST | `/forgot-password`    | Password-reset request           | AC-06               |
| GET      | `/app`                | The CFI dashboard                | —                   |
| GET/POST | `/app/onboarding`     | Onboarding + disclaimer ack      | AC-09–AC-14         |
| GET/POST | `/app/lesson-types`   | Configure lesson types           | AC-15               |
| GET/POST | `/app/availability`   | Set booking availability         | AC-18               |
| GET      | `/app/bookings`       | Booking management               | AC-24–AC-27         |
| GET/POST | `/app/students`       | The student roster               | AC-29               |
| GET      | `/app/students/:id`   | A student's detail + ACS checklist | AC-30, AC-31      |
| GET/POST | `/app/endorsements/new` | Issue an endorsement           | AC-37–AC-41         |
| GET      | `/app/registry`       | The endorsement registry + export | AC-47, AC-49       |
| GET/POST | `/app/invoicing`      | Stripe Connect onboarding        | AC-56, AC-58        |
| GET/POST | `/app/invoices/new`   | Create + send an invoice         | AC-59               |
| GET      | `/app/invoices`       | The CFI's invoices               | AC-62               |
| GET      | `/app/upgrade`        | Paywall / pricing                | AC-66               |
| GET/POST | `/book/:cfiSlug`      | The PUBLIC booking page          | AC-19, AC-20        |
| GET      | `/endorsement/:token` | (proxied to the Go backend)      | AC-53               |
| GET      | `/legal/terms`        | Terms of service                 | AC-82               |
| GET      | `/legal/privacy`      | Privacy policy                   | AC-82               |
| GET      | `/legal/refund`       | Refund policy                    | AC-82               |

## 5. Out of scope (spec-level cuts)

Reiterating the Discovery / research §5.4 cuts for spec clarity. These
have refusal criteria, not acceptance criteria. Asking for any of them
in a Phase 5 PR triggers `spec-guardian` → BLOCK without a superseding
ADR: a flight-school back office (multi-CFI scheduling, Part 141
records, fleet scheduling, school billing), a full student-side training
journal, an LMS, the CFI's personal logbook, 8710/IACRA filing,
inventing/editing endorsement wording, mutating/deleting an issued
endorsement, a Stripe `application_fee`, EndorseKit as merchant of
record, SMS, Web Push, native apps, ML/AI, a student login, a social
feed / CFI marketplace.

## 6. Open questions for the founder

Carried from Discovery, all still open and all affecting the spec:

- **Q1 (invoicing in V1 vs fast-follow)** — Features 12–13 (AC-56–AC-65,
  AC-X10) assume invoicing ships in V1, sequenced last. If deferred,
  those move to V1.1.
- **Q3/Q4 (free trial; paywall trigger; pricing)** — Feature 14 assumes
  a 14-day trial and $12/$120. If the founder picks a different trigger
  or price, AC-66 / AC-69 / AC-70 change.
- **Q5 (e-signature)** — AC-38 assumes the typed-name + affirmation
  approach (ADR-0003).
- **Q7 (AC 61-65 revision)** — AC-34 / AC-35 assume the catalog is
  transcribed from a specific named AC 61-65 revision.

Spec is otherwise unblocked: these are configuration-shaped decisions,
not structural ones.

---

**Phase 3 status: DRAFT — not founder-approved.** Phase 4 (Plan) draft
exists alongside this one. Phase 3 is not complete until the founder
approves this artifact and resolves the carried-forward questions.
