# Security rules — "hacker-proof" posture

Operate as if a competent attacker will probe the service on day one. These controls are mandatory before any code reaches `main`. Failures here block merge.

## Threat modeling expectations

Every Phase 2 (Architecture) artifact carries a STRIDE pass against each trust boundary in the C4 Container diagram (browser ↔ web, browser ↔ Supabase, web ↔ Go backend, Go backend ↔ Supabase, Go backend ↔ R2, Go backend ↔ Stripe **platform and connected accounts**, Go backend ↔ Resend, Cloud Scheduler ↔ Go backend, anonymous student ↔ the public booking page, anonymous student ↔ the endorsement-PDF download link). Phase 6 (Harden) revisits and produces `docs/06-security.md` with OWASP ASVS L2 evidence.

## AuthN / AuthZ

- **Supabase is the identity issuer.** Browser uses `@supabase/supabase-js` for sign-up / login / OAuth / magic-link; web SSR uses `@supabase/ssr`'s `createServerClient`.
- **The Go backend verifies Supabase ES256 JWTs** against the JWKS endpoint (fetched once at boot, cached, refresh on `kid` mismatch). HS256 tokens are rejected (algorithm pinning). `aud='authenticated'` enforced.
- **The CFI is the only authenticated principal.** A student is never a logged-in account in V1 — students reach EndorseKit only through unauthenticated, signed-token surfaces (the public booking page, the booking-confirmation page, the endorsement-PDF download link). Those tokens are HMAC-signed, high-entropy, scoped, and (where appropriate) expiring.
- **AuthZ is two-layered.** (1) RLS policies on every CFI-owned table key on `auth.uid()` — the browser-direct `supabase.from(...)` calls fire them automatically. (2) The Go backend additionally scopes every query by `owner_cfi_id = <jwt sub>` derived from the verified token. The cron path and the Stripe-webhook path use an app-admin role deliberately and are the only paths that bypass per-user scoping — both are allowlisted and audited.
- **Cross-tenant isolation is a regression-test contract**, not an optional check. The cross-tenant suite creates two CFIs, signs in as CFI B, and asserts B reads zero of A's students, bookings, endorsements, invoices, and connected-account records — through both the browser-direct path (RLS) and the Go API path (owner predicate).
- **Rate-limit `/cron/*`, `/webhooks/*`, the public booking page, the booking-submission endpoint, and the endorsement-PDF download link.** Auth endpoints are gated by Supabase's built-in rate limiter; the Go backend runs an in-process token bucket on the cron receiver, the webhook receivers, and every public student-facing surface (a booking page is a public form — assume bot abuse).

## Endorsement-record integrity — a first-class concern

An endorsement is a **legal document**. 14 CFR 61.189 and AC 61-65 require a CFI to keep a record of every endorsement they give for at least **3 years**, and those records surface in FAA certificate actions and enforcement proceedings. EndorseKit's registry is therefore held to a higher bar than ordinary app data.

- **The `endorsements` table is append-only.** No code path issues `UPDATE` or `DELETE` against it. There is no `sqlc` query that mutates a row. The DB grant set withholds `UPDATE`/`DELETE` from the application role, and an append-only trigger is defense-in-depth. A migration or query that violates this is a **BLOCK** (the `endorsement-immutability` CI heuristic catches the obvious cases; `endorsement-registry-auditor` does the deep review).
- **Corrections are supersession, never mutation.** If a CFI must correct an issued endorsement, EndorseKit writes a *new* record marked as superseding the prior one. Both rows survive forever; the registry shows the chain. This mirrors how the FAA expects paper endorsement records to be corrected (line out, do not erase).
- **Every record is sealed.** Each endorsement row carries a content hash over its material fields (CFI, student, AC 61-65 reference, full endorsement text, issue date, signature artifact reference), HMAC-keyed with `ENDORSEMENT_SEAL_SECRET` and **chained to the prior record's hash**. The chain makes silent tampering detectable: altering any historical row breaks every subsequent link. The seal algorithm and key version are stored per row so the key can be rotated without invalidating sealed history.
- **The audit trail is immutable.** Endorsement issuance, supersession, and PDF (re-)delivery are written to an append-only audit log. So is e-signature capture — see below.
- **Retention exceeds the regulatory floor.** Endorsement records are retained for the CFI account's lifetime and are not purged at 3 years. On account deletion the records are not hard-deleted while the retention obligation could still be live; the deletion flow is documented in `docs/06-security.md` and exports the registry to the CFI first.
- **E-signature capture.** The CFI signs on their phone. EndorseKit records, alongside the endorsement, enough to make the signature attributable and tamper-evident: the authenticated CFI identity (from the verified JWT), a timestamp, the signature artifact (image or typed-name + intent affirmation per the chosen approach), and the content hash the signature is bound to. The exact approach is fixed in [ADR-0003](../../docs/adr/0003-endorsement-pdf-and-esignature.md); whatever it is, the signature must bind to the *sealed content*, not float free of it.

## Stripe Connect — explicit posture

EndorseKit runs **two distinct Stripe relationships** and must never confuse them:

1. **The platform's own billing** — the CFI subscribes to EndorseKit ($12/mo). Standard Stripe Checkout + Customer Portal + Billing on the **platform account**. EndorseKit is the merchant here.
2. **The CFI's invoicing of students** — via **Stripe Connect**. Each CFI onboards a **connected account**; when a student pays an invoice, the funds settle to the **CFI's** connected account. EndorseKit is the *platform*, never the merchant of record for a lesson. The platform may take an `application_fee` only if the founder decides to (see [ADR-0004](../../docs/adr/0004-stripe-connect-invoicing.md)); V1's billing model is a flat subscription, so the Connect path is typically fee-free.

Controls:

- **The platform-vs-connected boundary is enforced in code.** Calls that act on a connected account carry the `Stripe-Account` header (or the equivalent SDK scoping); platform calls do not. A test asserts a CFI's invoice charge is created *on the connected account*, not the platform account.
- **Two webhook endpoints, two signing secrets.** Platform-account events (`checkout.session.completed`, `customer.subscription.*`, `invoice.*` for the CFI's own subscription) and connected-account events (`account.updated`, `capability.updated`, `payout.*`, `charge.*`, `invoice.*` for student invoices) arrive on separate endpoints with separate `whsec_` secrets. Each verifies the signature against the **raw** body.
- **The platform never holds student card data.** Student payment is via Stripe-hosted Checkout / Payment Element on the connected account; EndorseKit stores only IDs (`connected_account_id`, `invoice_id`, `payment_intent_id`).
- **Onboarding state is verified, not assumed.** A CFI cannot send an invoice until their connected account's `charges_enabled` / `payouts_enabled` capabilities are confirmed via `account.updated` — the UI reflects onboarding status truthfully so a CFI never sends an invoice that cannot be paid.
- **Connected-account compromise is in the threat model.** A leaked CFI session must not let an attacker re-point payouts; payout destination changes happen in Stripe's own onboarding UI, not in EndorseKit.

## Webhooks

- **Stripe webhooks verify signature against the RAW request body bytes.** Never re-serialize JSON before verification. This holds for both the platform and the connected-account endpoints.
- **Resend deliverability webhooks verify the provider HMAC** against the raw body.
- **Idempotency at the DB layer**: `INSERT INTO processed_webhook_events (provider, event_id, ...) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`. Dispatch only if a row was returned.
- **Single transaction** for the dedupe insert + state mutation.
- **No retry-on-failure inside the handler.** Return 5xx and let the provider retry; the idempotency key absorbs replays.

## Notification cron security

- **`POST /cron/daily` is OIDC-authed.** Cloud Scheduler signs the request with a Google-issued OIDC token; the Go backend verifies the token's audience matches the Cloud Run service URL and the issuer is Google. An unauthenticated POST to `/cron/daily` returns 401.
- **The cron is idempotent.** Re-firing the same day must not double-send a lesson reminder. Reminder dedupe is a DB UNIQUE constraint per `(booking_id, channel, send_window_label)`. Over-firing is safe by construction.
- **No PII in cron logs.** Log booking/lesson UUIDs and counts, never a student's name, email, or the CFI's certificate number.

## Input / output

- Server-side validation on every boundary — **Zod** at every SvelteKit server endpoint, explicit struct validation at every Go handler. No `any`-shaped or unvalidated request bodies. The **public booking-submission endpoint** is the highest-exposure input — validate aggressively, rate-limit, and treat every field as hostile.
- **Parameterized queries only.** `sqlc` generates parameterized queries by construction; never hand-concatenate SQL. String-concatenated SQL is a CI failure.
- Output encoding: Svelte handles HTML escaping by default; for emails (Resend) escape at the template layer; the **endorsement-PDF renderer** must treat the CFI-entered and student-entered fields as untrusted — the rendered PDF is a legal artifact and must not be vulnerable to injection of unintended content.
- Strict CSP with no inline scripts; HSTS preloaded; `frame-ancestors 'none'`.

## Rate limiting + abuse

- In-process token bucket on `/cron/*`, `/webhooks/*`, the public booking page + booking-submission endpoint, the endorsement-PDF download link, and signup.
- 60 req/min/IP global default; tighter on auth (10/min/IP) and on the public booking surface (20/min/IP — a real student books once).
- Cloudflare WAF rules at the proxy layer if paying CFI count exceeds ~50.

## Secrets handling

- **No secrets in source tree.** `.env` is gitignored; `.env.example` is committed with placeholder names.
- **Production secrets** live in Google Secret Manager, injected into Cloud Run at runtime via `--update-secrets`.
- **`gitleaks`** runs as a pre-commit hook and in CI. Any finding blocks merge. The config carries patterns for Stripe (`sk_`, `whsec_`, `ca_`), Resend, R2, Supabase, GCP.
- **`PostToolUse` hook scans every edited file** before turn-end (`scripts/hooks/post-edit.sh`). Real `.env` files are gitignored, so the hook `git check-ignore`s first.
- **API keys never logged.** Structured loggers (`pino` in web, `slog` in Go) filter known key shapes; never log raw request bodies.
- **Rotate `URL_SIGNING_SECRET`, `ENDORSEMENT_SEAL_SECRET`, Stripe keys (platform + Connect), Resend, R2, Supabase service-role every 90 days** or immediately on suspected compromise. Note: `ENDORSEMENT_SEAL_SECRET` rotation does NOT invalidate sealed records — the per-row key version makes old seals still verifiable — but the rotation procedure is documented in `docs/operating-playbook.md`.

## File uploads & generated documents

- **Presigned PUT URLs are scoped to (cfi_id, content-type, max-size).** Server mints a fresh URL per upload; URL is short-lived (≤15 min).
- **Server-generated documents** — endorsement PDFs, invoice PDFs, registry exports — are rendered by the Go backend and written to R2. They are served via short-lived signed GET URLs (≤1h for in-app reads). The endorsement-PDF link emailed to a student is a separate, longer-lived signed token so the student can retrieve their endorsement later — its scope is exactly one endorsement record, nothing else.
- **No public-bucket access.** Every R2 read is a signed URL.

## Logging

- Structured JSON: `pino` in web, `slog` in the Go backend.
- **No PII or secrets in logs.** Hash CFI/student email addresses if logging is necessary; log row UUIDs, never the email, the student's name, or the CFI's FAA certificate number. Endorsement *text* must never be logged.
- Immutable audit trail for: auth events, billing events (`processed_webhook_events`), endorsement issuance + supersession + PDF delivery, e-signature capture, Stripe Connect onboarding state changes.

## Backups + disaster recovery

- Supabase free tier offers daily backups with 7-day retention. Pre-launch, add a nightly `pg_dump` to a Cloud Storage bucket with a 30-day lifecycle. **Because the endorsement registry is a legal record, the backup retention for it is extended** — the registry export archive in R2 is the durable copy of record and is retained well beyond the Postgres backup window.
- Restore is **tested before launch** — documented as part of `docs/07-runbook.md`, including a verification that the endorsement hash-chain still validates after a restore.

## Privacy

- Data inventory in `docs/06-security.md`. PII fields explicitly enumerated: CFI name + email + FAA certificate number + Stripe connected-account ID; student name + email + phone + the endorsements issued to them + training-hour data. The CFI's certificate number and the student's contact details are sensitive.
- Retention policy: endorsement records retained for the CFI account lifetime and beyond the 3-year regulatory floor; bookings and invoices retained for the account lifetime; webhook events kept indefinitely (small footprint, audit value). Signed student-facing tokens expire.
- DSR (data subject request): a CFI can export their full registry + roster at any time. A student-data deletion request is constrained by the CFI's *legal obligation to retain endorsement records* — the deletion flow honors that constraint and is documented in `docs/06-security.md` (a student's endorsement record is the CFI's compliance record, not solely the student's personal data).
- Cookie banner only if PostHog's auto-detect flags an EU visitor; PostHog has it built-in.
- COPPA: signup requires age ≥ 13 confirmation (a CFI is an adult, but cover yourself).

## Pre-deploy gate (Phase 6)

Before any deploy to `prod`:

1. OWASP ZAP baseline scan against staging (web + Go API + the public booking + endorsement-PDF surfaces).
2. OWASP ASVS L2 walkthrough — sign off in `docs/06-security.md` with pass/fail/N-A per item.
3. Threat model reviewed if any new external boundary was added since last deploy.
4. All `high`/`critical` Sentry issues from the last 7 days resolved or accepted with rationale.
5. Cross-tenant isolation test green in the most recent CI run (both RLS and Go-API layers).
6. Backup-restore dry run completed within last 30 days, **including endorsement hash-chain re-validation**.
7. Cron OIDC verification tested — an unauthenticated `POST /cron/daily` returns 401.
8. Stripe Connect: a connected-account onboarding + a test student-invoice payment verified end-to-end in test mode; the charge confirmed to land on the connected account.

## Aviation-domain risk — the disclaimer (calibrated)

EndorseKit issues legal endorsements and keeps the records the FAA can demand. This is a **real liability surface**, and the disclaimer treatment is calibrated **higher than ACSReady's training-journal footnote** (ACSReady deliberately cut endorsement generation precisely because of this liability) and **comparable to tail-number-radar's regulatory-record bar** — though EndorseKit's framing is "you, the CFI, remain the responsible party," not an airworthiness assertion.

The disclaimer — **"EndorseKit is recordkeeping software. The certificated flight instructor is solely responsible for the correctness, applicability, and currency of every endorsement issued under 14 CFR Part 61 and AC 61-65, and for retaining the records the regulations require. EndorseKit does not provide legal or regulatory advice and is not affiliated with the FAA."** — must appear on:

- **The signup / onboarding flow** — a checkbox acknowledgement, persisted + versioned (`disclaimer_acked_at`, `disclaimer_acked_version`). Re-ack on material text change. Missing it from signup is a **CONCERN**.
- **The endorsement-issuance screen** — adjacent to the "issue this endorsement" action, the CFI sees that they are the responsible party and that EndorseKit autofills but does not verify applicability. This is the highest-stakes surface; missing it here is a **CONCERN**.
- **Every issued endorsement PDF** — a footer line. The PDF is the legal artifact; the disclaimer rides with it.
- **The app footer** — present on every authenticated page.

Missing the disclaimer from the signup flow or the endorsement-issuance screen is a **CONCERN** that `endorsement-registry-auditor` flags. Missing it everywhere is a launch-readiness defect tracked in `docs/04-plan.md`'s risk register — it must be closed before M-launch.
