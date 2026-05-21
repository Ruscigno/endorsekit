# 04 — Plan

> **Status: DRAFT — awaiting founder review. No founder approval is
> recorded.** Sliced tickets, milestones, dependencies, and the risk
> register for EndorseKit V1. Phase 5 implements one capability slice
> per PR per the working contract; this file is the source of truth for
> what those slices are and the order they ship in.
>
> Cross-references:
> [03-spec.md](03-spec.md) defines the acceptance criteria each ticket
> tests against.
> [api/openapi.yaml](api/openapi.yaml) is the formal API contract.
> [founder-actions.md](founder-actions.md) is the parallel founder track.

## 1. Conventions

- Ticket IDs are `EK-NNN` (EndorseKit, sequentially numbered).
- Founder-action IDs are `F-NN` ([founder-actions.md](founder-actions.md)).
- Each ticket carries a milestone (`M1`–`M7`), an estimate (`S/M/L/XL`),
  and a critical-path flag (⚠ blocks the next milestone).
- "Deps" lists prior `EK-NNN` and `F-NN` items that must merge / clear
  first. The agent refuses to start a ticket whose deps are not satisfied.
- The working contract's per-PR self-merge rule applies inside any active
  milestone. The Phase-5 → Phase-6 boundary is a stop-and-confirm gate.

## 2. Milestones (sequenced per research §6)

| Milestone | Theme                                       | Founder-action deps                    | Gate                                                                                          |
| --------- | ------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| M1        | Skeleton + CFI auth + onboarding            | F-03 (Supabase)                        | CFI signup → onboarding → `/app` works against real Supabase                                  |
| M2        | The endorsement registry + AC 61-65 catalog + issuance | F-05 (R2), F-06 (Resend)     | The AC 61-65 catalog seeded; an endorsement can be issued, sealed, stored append-only, PDF'd, emailed |
| M3        | Registry UI + students + ACS checklist + first deploy | F-01, F-02, F-08, F-09       | Both Cloud Run services on staging; the registry searchable; the roster + ACS checklist work  |
| M4        | Booking page + booking management           | —                                      | The public booking page works end-to-end; the CFI can confirm/complete a booking             |
| M5        | The reminder cron + re-engagement nudge     | F-04 (Cloud Scheduler)                 | `/cron/daily` OIDC-authed; reminders + the re-engagement nudge send; idempotency test green   |
| M6        | Stripe Connect invoicing + the CFI's subscription + paywall | F-07 (Stripe), F-10 (Legal) | Connect onboarding + a student invoice end-to-end; the CFI's subscription + paywall enforced  |
| M7        | PWA, polish, beta, launch                   | F-11→F-13 (Woodpecker), F-14 (Uptime)  | Lighthouse PWA ≥ 90; production cutover; r/CFI launch post                                    |

> **M6 is the documented slip-buffer.** Research §5 says "V1 can ship
> without invoicing if needed"; if the ~12-week budget tightens, M6's
> invoicing tickets (EK-052–EK-058) are the clean cut to a fast-follow
> and the product still ships its core (booking, endorsements, the
> registry, the CRM). The CFI's own subscription + the paywall
> (EK-059–EK-062) must still ship — they are how EndorseKit gets paid.

## 3. Ticket list

### M1 — Skeleton + CFI auth + onboarding

| ID     | Title                                                                                                  | Spec ACs            | Deps           | Size | ⚠ |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| EK-001 | Scaffold `web/` (SvelteKit 2 / Svelte 5, TS, ESLint, Prettier, Vitest, Playwright)                     | —                   | —              | M    | ⚠ |
| EK-002 | Add Tailwind, daisyUI, `@supabase/ssr`, `@vite-pwa/sveltekit`, zod to `web/`                           | —                   | EK-001         | S    |   |
| EK-003 | Scaffold `backend/` — `go mod init`, `net/http.ServeMux`, `pgxpool`, `sqlc`, `slog`, the `run()` shape | —                   | —              | M    | ⚠ |
| EK-004 | Migration `0001_cfis` (the `cfis` table + RLS) + Makefile `db.*` wiring                                | —                   | EK-003         | S    | ⚠ |
| EK-005 | `backend` `/healthz` returning `{status:ok, db:ok}`; Dockerfile builds                                  | AC-X14              | EK-004         | S    |   |
| EK-006 | Go JWT verifier — ES256, JWKS cached, HS256/expired/wrong-aud/wrong-iss/tampered rejected               | AC-X06              | EK-003         | M    | ⚠ |
| EK-007 | `web` `hooks.server.ts` — `@supabase/ssr` session; security headers (CSP, HSTS)                        | AC-X12              | EK-002         | M    | ⚠ |
| EK-008 | CFI signup + email verification + magic link + Google OAuth + anti-enumeration password reset          | AC-01–AC-06         | EK-007, F-03   | M    | ⚠ |
| EK-009 | Login + logout + session cookie management                                                             | AC-03               | EK-008         | S    |   |
| EK-010 | Onboarding — name, FAA cert# + expiry, home airport, unique booking slug, the disclaimer ack           | AC-09–AC-14         | EK-008, EK-004 | M    | ⚠ |
| EK-011 | In-process rate limiter (auth 10/min/IP) — shared web + backend pattern                                  | AC-07               | EK-007         | S    |   |
| EK-012 | Mobile-responsive CFI app shell (top nav, bottom tab bar, 360px layout)                                  | AC-81               | EK-010         | M    |   |
| EK-013 | Structured loggers (`pino` web, `slog` backend) + the no-PII-in-logs CI grep                            | AC-X05              | EK-003         | S    |   |
| EK-014 | HMAC signed-token mint/verify helper (for the public student surfaces)                                   | —                   | EK-006         | S    | ⚠ |

**M1 critical path: EK-001/003 → EK-004 → EK-006 → EK-007 → EK-008 → EK-010.**

### M2 — The endorsement registry + AC 61-65 catalog + issuance

| ID     | Title                                                                                            | Spec ACs            | Deps           | Size | ⚠ |
| ------ | ------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| EK-015 | Transcribe the AC 61-65 endorsement-template catalog into `db/seeds/endorsement-templates.yaml`  | AC-34, AC-35        | —              | L    | ⚠ |
| EK-016 | Migration `0002_endorsement_templates` + the seed loader                                         | AC-34               | EK-004, EK-015 | M    | ⚠ |
| EK-017 | Migration `0003_endorsements` — the append-only registry (withheld grants + trigger + INSERT/SELECT-only RLS) | AC-43, AC-X08 | EK-016        | M    | ⚠ |
| EK-018 | Migration `0004_endorsement_audit` + RLS                                                         | —                   | EK-017         | S    | ⚠ |
| EK-019 | The seal — `content_hash` (HMAC over the material fields) + the `prev_content_hash` chain         | AC-39, AC-46        | EK-017         | M    | ⚠ |
| EK-020 | The chain verifier + the tamper-detection test                                                   | AC-45, AC-X09       | EK-019         | M    | ⚠ |
| EK-021 | The endorsement-text renderer — render an AC 61-65 template with autofilled fields                | AC-37, AC-42        | EK-016         | M    | ⚠ |
| EK-022 | The e-signature capture — typed-name + affirmation, bound to the content hash + the JWT identity  | AC-38               | EK-019         | M    | ⚠ |
| EK-023 | `POST /me/endorsements` — issue: render → sign → seal → INSERT → audit, in one transaction        | AC-39, AC-42, AC-X08 | EK-021, EK-022 | L   | ⚠ |
| EK-024 | The pure-Go endorsement-PDF renderer (`backend/internal/pdf`) — deterministic, from the sealed row | AC-51, AC-52       | EK-023         | L    | ⚠ |
| EK-025 | Endorsement-PDF → R2 + the Resend delivery to the student                                        | AC-40               | EK-024, F-05, F-06 | M | ⚠ |
| EK-026 | `GET /endorsement/:token` — anonymous, signed-token, serves exactly one PDF, rate-limited          | AC-53, AC-54        | EK-014, EK-024 | M    | ⚠ |
| EK-027 | The endorsement-issuance UI `/app/endorsements/new` (pick → review → sign) + the disclaimer surface | AC-37, AC-41       | EK-023         | L    | ⚠ |

### M3 — Registry UI + students + ACS checklist + first deploy

| ID     | Title                                                                                            | Spec ACs            | Deps                   | Size | ⚠ |
| ------ | ------------------------------------------------------------------------------------------------ | ------------------- | ---------------------- | ---- | - |
| EK-028 | `GET /me/endorsements` — registry search (by student / type / date range)                        | AC-47, AC-48        | EK-023                 | M    | ⚠ |
| EK-029 | The registry UI `/app/registry` — search + the supersession-chain view                           | AC-44, AC-47        | EK-028                 | M    | ⚠ |
| EK-030 | `GET /me/endorsements/export` + `GET /me/registry/verify` — the registry export + the chain verifier endpoint | AC-49, AC-50, AC-45 | EK-028, EK-020 | M | ⚠ |
| EK-031 | Migration `0005_students_and_acs_progress` + RLS                                                 | —                   | EK-004                 | S    | ⚠ |
| EK-032 | `students` CRUD + `/me/students`; `acs_progress` upsert + `/me/students/:id/acs-progress`         | AC-29, AC-30, AC-32 | EK-031                 | M    | ⚠ |
| EK-033 | The student-roster UI + the student-detail ACS-progress checklist (coarse — NOT a journal)        | AC-29, AC-30, AC-31 | EK-032                 | M    | ⚠ |
| EK-034 | The endorsement supersession (correction) flow — a new superseding `INSERT`                       | AC-44               | EK-023, EK-029         | M    |   |
| EK-035 | `web` + `backend` Dockerfiles + Cloud Run deploy scripts                                          | —                   | F-02                   | M    | ⚠ |
| EK-036 | Wire Sentry (web client+server, Go backend)                                                      | —                   | F-08                   | S    | ⚠ |
| EK-037 | Wire PostHog — the funnel events from [03-spec.md §Success criteria]                              | —                   | F-09                   | M    | ⚠ |
| EK-038 | First staging deploy of both Cloud Run services; verify Sentry + PostHog in the wild              | —                   | EK-035, EK-036, EK-037 | M    | ⚠ |
| EK-039 | **Cross-tenant isolation test harness** — two CFIs, both RLS + Go-API layers, every CFI-owned table + the signed-token replay case | AC-X01 | EK-017, EK-031 | M | ⚠ |

### M4 — Booking page + booking management

| ID     | Title                                                                                            | Spec ACs            | Deps           | Size | ⚠ |
| ------ | ------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| EK-040 | Migration `0006_lesson_types_and_availability` + RLS                                             | —                   | EK-004         | S    | ⚠ |
| EK-041 | `lesson_types` CRUD + `/me/lesson-types` (rates as integer cents) + the lesson-type UI            | AC-15–AC-17         | EK-040         | M    | ⚠ |
| EK-042 | `availability` read/set + `/me/availability` + the availability UI                               | AC-18               | EK-040         | M    | ⚠ |
| EK-043 | Migration `0007_bookings` + RLS                                                                  | —                   | EK-040         | S    | ⚠ |
| EK-044 | `GET /book/:cfiSlug` — public booking-page data (CFI public profile + lesson types + slots only)  | AC-19, AC-23        | EK-043         | M    | ⚠ |
| EK-045 | `POST /book/:cfiSlug` — the booking-submission endpoint (rate-limited, hostile-input-hardened)     | AC-20–AC-22         | EK-044, EK-011 | M    | ⚠ |
| EK-046 | The public booking-page UI `/book/:cfiSlug` + the booking-confirmation page                       | AC-19, AC-20        | EK-044         | M    | ⚠ |
| EK-047 | `PATCH /me/bookings/:id` — confirm / cancel / complete (record Hobbs/Tach)                         | AC-25–AC-27         | EK-043         | M    | ⚠ |
| EK-048 | The booking-management UI `/app/bookings`                                                         | AC-24–AC-27         | EK-047         | M    |   |
| EK-049 | Booking-confirmation email to the student                                                         | AC-25               | EK-047, F-06   | S    |   |
| EK-050 | The training-hour tally — derive flight time from completed bookings, show on the student detail   | AC-28               | EK-047, EK-033 | S    |   |

### M5 — The reminder cron + re-engagement nudge

| ID     | Title                                                                                            | Spec ACs            | Deps           | Size | ⚠ |
| ------ | ------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| EK-051 | Migration `0008_reminder_audit` — the per-(booking, channel, window, recipient) UNIQUE constraint + RLS | —             | EK-043         | S    | ⚠ |
| EK-052 | `POST /cron/daily` — OIDC verification (issuer + audience); 401 on failure                         | AC-73, AC-X04       | EK-006         | M    | ⚠ |
| EK-053 | The cron's booking-reminder scan + the dedupe `INSERT … ON CONFLICT` + the Resend fan-out          | AC-74–AC-77         | EK-052, EK-051, F-06 | L | ⚠ |
| EK-054 | The re-engagement nudge — flag students not flown in N weeks; include in the cron fan-out          | AC-33               | EK-053, EK-050 | M    |   |
| EK-055 | Cron idempotency integration test — fire twice, assert one row + one send per (booking×channel×window×recip) | AC-76, AC-X02 | EK-053         | M    | ⚠ |
| EK-056 | Reminder email templates (with the aviation disclaimer footer)                                    | AC-77               | EK-053         | S    | ⚠ |
| EK-057 | `/webhooks/resend` — deliverability webhook (bounce/complaint), HMAC-verified                      | —                   | EK-053         | S    |   |
| EK-058 | Cloud Scheduler job wired (F-04) + a staging end-to-end cron run verified                          | —                   | EK-053, F-04   | S    | ⚠ |

### M6 — Stripe Connect invoicing + the CFI's subscription + paywall

> **The invoicing tickets (EK-059–EK-065) are the documented slip-buffer
> — see §2. The subscription + paywall tickets (EK-066–EK-070) ship
> regardless: they are how EndorseKit gets paid.**

| ID     | Title                                                                                            | Spec ACs            | Deps           | Size | ⚠ |
| ------ | ------------------------------------------------------------------------------------------------ | ------------------- | -------------- | ---- | - |
| EK-059 | Migration `0009_connected_accounts` + RLS                                                        | —                   | EK-004         | S    | ⚠ |
| EK-060 | `backend` Stripe client — platform + connected-account scoping; the `Stripe-Account` boundary     | —                   | F-07           | M    | ⚠ |
| EK-061 | `POST /me/connect/onboard` — create a Standard connected account + a Stripe-hosted account link    | AC-56               | EK-059, EK-060 | M    | ⚠ |
| EK-062 | `/webhooks/stripe/connect` — connected-account events; `account.updated` drives onboarding flags  | AC-57, AC-63–AC-65  | EK-059, EK-060 | M    | ⚠ |
| EK-063 | Migration `0010_invoices` — `invoices` + `invoice_line_items` (money as integer cents) + RLS      | AC-60, AC-X11       | EK-059         | S    | ⚠ |
| EK-064 | `GET/POST /me/invoices` — create + send an invoice ON THE CONNECTED ACCOUNT; aviation line items   | AC-58–AC-62, AC-X10 | EK-063, EK-062 | L    | ⚠ |
| EK-065 | The invoicing UI `/app/invoicing` (Connect onboarding state) + `/app/invoices` + `/app/invoices/new` | AC-58, AC-59      | EK-064         | M    |   |
| EK-066 | Migration `0011_billing` — `subscriptions` + `processed_webhook_events`                          | —                   | EK-004         | S    | ⚠ |
| EK-067 | `POST /me/billing/checkout` + `POST /me/billing/portal` (the CFI's subscription, platform account) | AC-66, AC-67       | EK-060, EK-066 | M    | ⚠ |
| EK-068 | `/webhooks/stripe` — platform billing events; signature on raw body + dedupe insert + dispatcher  | AC-63–AC-65, AC-68  | EK-066, EK-060 | L    | ⚠ |
| EK-069 | Stripe replay-safety + money-routing integration tests (both endpoints; charge on connected acct) | AC-65, AC-X03, AC-X10 | EK-064, EK-068 | M  | ⚠ |
| EK-070 | Paywall — 14-day-trial check (Discovery Q3 default); redirect to `/app/upgrade` on expiry; pricing page | AC-69–AC-72    | EK-066, EK-068 | M    | ⚠ |

### M7 — PWA, polish, beta, launch

| ID     | Title                                                                                            | Spec ACs            | Deps                   | Size | ⚠ |
| ------ | ------------------------------------------------------------------------------------------------ | ------------------- | ---------------------- | ---- | - |
| EK-071 | `@vite-pwa/sveltekit` — manifest, icons (192/512/maskable/apple-touch), service worker            | AC-78, AC-80        | EK-002                 | M    | ⚠ |
| EK-072 | Install prompt banner (Android) + iOS install-instructions card                                   | AC-78, AC-79        | EK-071                 | S    |   |
| EK-073 | Empty states, loading skeletons, error boundaries, 404/500 pages                                  | —                   | —                      | M    |   |
| EK-074 | Legal pages `/legal/{terms,privacy,refund}` from F-10 + footer disclaimer on every page           | AC-82               | F-10                   | S    | ⚠ |
| EK-075 | Aviation-disclaimer surface audit — signup, the issuance screen, every endorsement PDF, the footer | AC-83              | EK-027, EK-024, EK-074 | S    | ⚠ |
| EK-076 | Lighthouse CI gate — PWA ≥ 90, Performance ≥ 85 on `/`, `/app`, `/book/:slug`                     | AC-80               | EK-071                 | M    | ⚠ |
| EK-077 | Resend sender domain SPF/DKIM/DMARC verified (F-06) + transactional email templates polished      | —                   | F-06                   | S    | ⚠ |
| EK-078 | Beta — invite 10–15 independent CFIs from the founder's network on a free code                    | —                   | All M6 tickets         | S    | ⚠ |
| EK-079 | Sentry top-issue triage from the beta week                                                        | —                   | EK-078                 | M    |   |
| EK-080 | Production cutover — both Cloud Run services + Cloudflare DNS                                      | —                   | F-01, F-02, all M6     | M    | ⚠ |
| EK-081 | UptimeRobot monitors on `/healthz` (both services) + the landing page + a sample booking page     | —                   | F-14, EK-080           | S    | ⚠ |
| EK-082 | 90-second demo video + the r/CFI / AskACFI / NAFI-channel launch post                             | —                   | EK-080                 | S    | ⚠ |

### Cross-cutting chores

| ID     | Title                                                                                            | Deps   | Size |
| ------ | ------------------------------------------------------------------------------------------------ | ------ | ---- |
| EK-X01 | Migration round-trip + `sqlc diff` in CI (wired in `.woodpecker/pr.yml`; verify after EK-004)    | EK-004 | S    |
| EK-X02 | `openapi-typescript` codegen for the web tier's API client types                                  | EK-002 | S    |
| EK-X03 | Local-dev cron escape hatch — a documented off-prod bypass token for `/cron/daily`                | EK-052 | S    |
| EK-X04 | The endorsement-immutability CI heuristic verified live (wired in `.woodpecker/pr.yml` at bootstrap) | EK-017 | S |

## 4. Dependencies (Gantt-style summary)

```
M1 ── EK-001/003 → EK-004 → EK-006 → EK-007 → EK-008 → EK-010 → [M1 gate]
              └→ EK-014 (signed tokens) ────────────────────────┐
                                                                 │
M2 ── EK-015 → EK-016 → EK-017 → EK-019 → EK-020 ───────────────┤
              EK-021/022 → EK-023 → EK-024 → EK-025/026/027 ────┤
                                                                 │
M3 ── F-01/02/08/09 → EK-028 → EK-029/030 ; EK-031 → EK-032/033 ┤
                      EK-035 → EK-038 ; EK-039 ─────────────────┤
                                                                 │
M4 ── EK-040 → EK-041/042 ; EK-043 → EK-044 → EK-045/046 ───────┤
              EK-047 → EK-048/049/050 ──────────────────────────┤
                                                                 │
M5 ── F-04 → EK-051 → EK-052 → EK-053 → EK-055 → EK-058 ────────┤
                                                                 │
M6 ── F-07/10 → EK-059 → EK-060 → EK-061/062 → EK-063 → EK-064 ─┤
              EK-066 → EK-067/068 → EK-069 → EK-070 ────────────┤
                                                                 │
M7 ── EK-071 → EK-076 → EK-074/075 → EK-078 → EK-080 → [LAUNCH]
```

## 5. Risk register

Owned items update at every milestone gate. New / Closed / Escalated
flags fire in the milestone report. This register is the canonical home
for the §11 risks from `product-research.md`.

| Risk                                                                                  | Probability | Impact       | Mitigation                                                                                                            | Owner   | Status |
| ------------------------------------------------------------------------------------- | ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| **R1** — an endorsement record is lost, mutated, or un-attributable (a legal-record defect) | Medium | Catastrophic | The append-only contract (EK-017: withheld grants + trigger + INSERT/SELECT-only RLS) + the seal/chain (EK-019/020) + the immutability CI heuristic (EK-X04) + the `endorsement-registry-auditor` + EK-X08/X09 tests | Claude | open |
| **R2** — an AC 61-65 endorsement template ships with wrong wording                    | Medium      | High         | EK-015 transcribes the FAA's *published* text once, carefully, with the revision letter recorded; a citation per template; the `endorsement-registry-auditor` checks every entry | Claude | open |
| **R3** — a student payment is mis-routed (lands on the platform account, not the CFI) | Medium      | High         | EK-060's `Stripe-Account` boundary + EK-X10 asserting the charge is on the connected account; `stripe-connect-auditor`; money as integer cents (EK-063, AC-X11) | Claude | open |
| **R4** — a Stripe webhook is replayed or its signature is mis-verified                | Medium      | High         | `processed_webhook_events` UNIQUE + dedupe-before-mutation (EK-068); raw-body verification on both endpoints; EK-069 replay test | Claude | open |
| **R5** — an RLS / owner-predicate bug leaks one CFI's students or endorsements to another | Medium  | Catastrophic | Two-layer authz; EK-039 cross-tenant test covering both layers, every table, and the signed-token replay case          | Claude  | open   |
| **R6** — Stripe Connect onboarding / live-mode review is slower than expected          | Medium      | Medium       | F-07 starts Connect enablement early; M6 invoicing (EK-059–EK-065) is the documented slip-buffer — the product ships without it if needed | founder | open |
| **R7** — the aviation disclaimer is missing from a required surface at launch          | Low         | Medium       | EK-075 is an explicit surface-audit ticket gating launch; the `endorsement-registry-auditor` flags it on relevant PRs | Claude  | open   |
| **R8** — an endorsement PDF lands in a student's spam folder                           | Medium      | Medium       | EK-077 SPF/DKIM/DMARC; the CFI can re-send from the registry (EK-055/AC-55); deliverability is a launch checklist item | founder | open   |
| **R9** — Supabase free project auto-pauses after 7 days inactivity (dev)               | High (dev)  | Medium       | Move to Pro at first paying-CFI testing; ping staging weekly                                                          | founder | open   |
| **R10** — two Cloud Run services double the deploy + secret surface                    | Low         | Low          | One `.woodpecker/deploy.yml` with path-gated steps; shared Secret Manager                                             | Claude  | open   |
| **R11** — the AC 61-65 catalog transcription (EK-015) is larger than estimated         | Medium      | Medium       | EK-015 is sized L deliberately and is the M2 first task; if it slips, M2's later tickets compress but the catalog is non-negotiable content | Claude | open |
| **R12** — Pilot Partner's free CFI Dashboard / ForeFlight bundling undercuts the price | Medium      | Medium       | Vertical depth on *independents* (incumbent CFI features assume school enrollment); the registry + invoicing are the wedge a free logbook add-on lacks | founder | open |
| **R13** — `iac-tickerbeats` Woodpecker bootstrap (F-11/12/13) isn't done before EK-001 | Medium      | Medium       | Founder prioritizes F-11→F-13 in week 1; Claude can `make ci` locally but cannot self-merge until CI runs            | founder | open   |
| **R14** — the ~12-week build over-runs (the largest schedule risk)                     | High        | High         | Narrow V1; M6 invoicing is the explicit slip-buffer; the §6 plan is paced; weekly 15-minute ops ritual               | Claude  | open   |
| **R15** — solo-developer fatigue over a ~12-week build                                 | Medium      | High         | The narrowest viable V1; the founder's own CFI as beta user #1 keeps motivation concrete                              | founder | open   |

## 6. Critical path

The end-to-end critical-path sequence to launch:

```
F-03 → EK-004 → EK-006 → EK-008 → EK-010 ──┐
EK-014 (signed tokens) ─────────────────────┤→ [M1 gate]
                                            │
EK-015 → EK-016 → EK-017 → EK-019 → EK-020 ─┤
EK-021/022 → EK-023 → EK-024 → EK-025/026 ──┤→ [M2 gate]
                                            │
F-01/02 → EK-028 → EK-035 → EK-038 ; EK-039 → [M3 gate]
                                            │
EK-040 → EK-043 → EK-044 → EK-045 ──────────→ [M4 gate]
                                            │
F-04 → EK-051 → EK-052 → EK-053 → EK-055 → EK-058 → [M5 gate]
                                            │
F-07/10 → EK-059 → EK-060 → EK-064 ; EK-066 → EK-068 → EK-070 → [M6 gate]
                                            │
EK-071 → EK-076 → EK-074/075 → EK-080 → EK-082 → [LAUNCH]
```

## 7. Founder-action timing

| Founder action          | Latest start                              | Why                                                                              |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| F-10 (Legal docs)       | **Today** — TermsFeed + ~3h customization | Stripe verification requires it; the endorsement-disclaimer + the Connect platform-agreement wording also land here |
| F-03 (Supabase)         | Before EK-008 (M1 first authenticated path) | The app can't bootstrap without the Supabase URL + keys + DB URL               |
| F-05 (R2)               | Before EK-025 (M2 endorsement-PDF delivery) | The endorsement PDF writes to R2                                               |
| F-06 (Resend)           | Before EK-025 (M2)                         | Endorsement-PDF delivery + reminders send through Resend; SPF/DKIM/DMARC need ~24h |
| F-01 (Domain DNS)       | Before EK-035 (M3 first deploy)            | Cloud Run domain mapping + the customer-facing booking-page URL                  |
| F-02 (GCP + WIF)        | Before EK-035                              | Cloud Run deploy requires it                                                     |
| F-08 (Sentry)           | Before EK-036 (M3)                         | Error capture                                                                    |
| F-09 (PostHog)          | Before EK-037 (M3)                         | Funnel events                                                                    |
| F-04 (Cloud Scheduler)  | Before EK-058 (M5)                         | The daily cron has no schedule without it                                        |
| F-07 (Stripe + Connect) | **Early** — before EK-060 (M6)             | Stripe Connect live-mode review can take extra time — start well ahead of M6     |
| F-11–F-13 (Woodpecker)  | Before the first EK-NNN PR is pushed       | Without CI the self-merge protocol can't fire                                    |
| F-14 (UptimeRobot)      | Before EK-081 (M7)                         | Monitors prod URLs that don't exist until M7                                     |

## 8. Definition of done — V1 launch (M7 close)

All P0 acceptance criteria green in CI. The endorsement registry is
append-only and proven so (EK-X08); the seal hash-chain verifier and its
tamper-detection test green (EK-X09). The cross-tenant isolation test
green for every CFI-owned table, both layers, and the signed-token
replay case (EK-039). The cron idempotency test (EK-055) and the Stripe
replay-safety + money-routing tests (EK-069) green. The aviation
disclaimer present on all four required surfaces (EK-075). Stripe Connect
verified end-to-end in test mode — a connected account onboarded, a
student invoice created on it, the charge confirmed on the connected
account. Lighthouse PWA + Performance gates green. Both Cloud Run
services live in production. Demo video + the r/CFI launch post shipped.
UptimeRobot monitors green for 24 hours.

P1 acceptance criteria are nice-to-have — ship if landed on schedule;
otherwise defer to V1.1.

## 9. Open questions for the founder

Carried from Discovery and Architecture, all still open and all
affecting this plan:

- **Q1 (invoicing in V1 vs fast-follow)** — if invoicing is deferred, M6
  tickets EK-059–EK-065 drop from V1; M6 shrinks to the subscription +
  paywall. R6 tracks this.
- **Q3/Q4 (free trial; paywall trigger; pricing)** — EK-070 assumes a
  14-day trial and $12/$120. A different trigger or price changes the
  ticket.
- **Q5 (e-signature)** — EK-022 assumes the typed-name + affirmation
  approach (ADR-0003).
- **Q7 (AC 61-65 revision)** — EK-015 transcribes a specific named
  AC 61-65 revision; the founder confirms which.
- **Architecture Q1** — Phase 4 assumes the five ADRs (0001–0005) are
  ratified `accepted` before Phase 5 begins.

---

**Phase 4 status: DRAFT — not founder-approved.** This artifact and the
draft `01`–`03` phase docs were produced together during the Phase 0
bootstrap. Phase 5 (Implement) is blocked until the founder approves
Phases 1–4 in order and ratifies ADRs 0001–0005.
