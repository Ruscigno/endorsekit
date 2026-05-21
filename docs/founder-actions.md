# Founder action checklist

> **Purpose.** Operational checklist for everything that doesn't get done by
> code in a PR — accounts to create, credentials to capture, DNS records to
> publish, services to verify. Engineering work that depends on these items
> is blocked until the matching action is ✅.
>
> **Source of truth.** This document mirrors the founder-track items
> implied by [docs/product-research.md](product-research.md) §6 (Week 0 +
> the week-by-week plan) and §9 (launch plan). ADRs that change scope are
> applied throughout.
>
> **How to use it.** Work top-to-bottom. Tick ☐ → ✅ when an action is
> fully done (credentials captured **and** stored in the agreed location
> where CI/runtime will read them). Each entry tells you exactly what to
> capture and which env var or secret name to use — keep those names
> verbatim so the runtime + workflows just work.

---

## Dashboard

| ID       | Action                                                        | Status | Unblocks                                            | Cost                                       | Time          |
| -------- | ------------------------------------------------------------- | ------ | --------------------------------------------------- | ------------------------------------------ | ------------- |
| F-01     | Domain + Cloudflare DNS                                        | ☐      | F-05 (R2 hostname), F-06 (Resend sender), prod URLs, the public booking page | ~$10/yr (booking page is customer-facing)  | 30 min        |
| F-02     | GCP project + Workload Identity Federation                     | ☐      | M3 deploy, M-launch                                 | $0 (set $5 budget alert)                   | 2 h           |
| F-03     | Supabase project (Postgres + Auth + Google OAuth)              | ☐      | M1 first migration, M1 signup/login                 | $0                                         | 1 h           |
| F-04     | Cloud Scheduler job for the daily booking/lesson reminder cron | ☐      | M5 reminder pipeline                                | $0 (1 of 3 free jobs)                      | 30 min        |
| F-05     | Cloudflare R2 bucket + API token + custom hostname             | ☐      | M2 endorsement PDFs, M6 invoice PDFs, registry export | $0                                       | 1 h + 24h DNS |
| F-06     | Resend account + sender domain SPF/DKIM/DMARC                  | ☐      | M1 email verification, M2 endorsement-PDF delivery, M5 reminders | $0                            | 1 h + 24h DNS |
| F-07     | Stripe account — platform billing + Stripe Connect enabled     | ☐      | M6 invoicing + the CFI's subscription               | $0 (test mode)                             | 2 h           |
| F-08     | Sentry projects (web + Go backend SDKs)                        | ☐      | M3 deploy with error capture                        | $0                                         | 30 min        |
| F-09     | PostHog Cloud project + funnel + feature flags                 | ☐      | M3 deploy with analytics                            | $0                                         | 30 min        |
| F-10     | Privacy Policy + Terms of Service + Refund policy + the CFI/endorsement disclaimer | ☐ | **M6 Stripe verification + M-launch**          | $0 (TermsFeed free)                        | 3 h           |
| F-11     | iac-tickerbeats Woodpecker bootstrap on Mac                    | ☐      | First CI run                                        | $0                                         | 30 min        |
| F-12     | Cloudflare Tunnel `endorsekit-ci` + GitHub OAuth app           | ☐      | F-13                                                | $0                                         | 10 min        |
| F-13     | Enable endorsekit repo in Woodpecker UI + verify a build       | ☐      | unblocks all queued PRs                             | $0                                         | 5 min         |
| F-14     | UptimeRobot or equivalent for `/healthz` + landing page        | ☐      | M-launch                                            | $0                                         | 15 min        |

**Dependency map** (read top-down):

```
F-01 ──┬─→ F-05 (R2 public hostname needs DNS)
       └─→ F-06 (Resend sender domain needs DNS)

F-02 ──┬─→ M3 deploy
       └─→ F-04 (Cloud Scheduler lives in the same GCP project)
F-03 ──→ depends on F-01 only for the prod OAuth redirect URI
        (local dev works against localhost without F-01)
F-07 ──→ F-10 (Stripe verification — platform AND Connect — requires TOS + Privacy)
F-08, F-09, F-10 — independent
F-11 ──→ F-12 ──→ F-13 (Woodpecker chain)
F-14 — after first staging deploy
```

**Recommendation: start in this order**

1. **F-10 today** (TermsFeed Free Generator + ~3h customization).
   Required by Stripe verification, no external dependency. The refund
   policy, the CFI-responsibility / endorsement disclaimer wording, and
   the Stripe Connect platform-agreement points all land here.
2. **F-01** (domain + Cloudflare DNS) — fan-out gate for F-05 and F-06,
   and the public booking page is a customer-facing URL.
3. **F-02 + F-03 in parallel** (each 1-2 h, independent for local dev) —
   unblock M1 + M3.
4. **F-04, F-05, F-06** — after F-01 / F-02.
5. **F-07** — Stripe Connect enablement takes longer than ordinary
   Stripe; start it well before M6.
6. **F-08, F-09** — anytime; needed by M3.
7. **F-11 → F-12 → F-13** — get CI live before the first feature PR.

---

## F-01. Domain + Cloudflare DNS

**Why.** Email sender, R2 public hostname, OAuth callbacks, the public
**booking-page URLs the CFI shares with students**, endorsement-PDF
download links, and the production app URL all need a stable hostname
under Cloudflare DNS for free DDoS protection and CDN cache. The booking
page is customer-facing — a clean apex domain reads professionally.

**Steps.**

1. Register `endorsekit.app` (Cloudflare Registrar or Porkbun) — or
   decide on a subdomain; see the open question in
   `journal/open-questions.md`. The default recommendation is the apex
   domain because the booking page is shown to the CFI's students.
2. On Cloudflare Dashboard, confirm the zone is on the Free plan with
   SSL/TLS mode **Full (strict)**.
3. Do **not** create DNS records yet — each downstream founder action
   writes its own (F-05 R2 hostname, F-06 sender SPF/DKIM/DMARC, F-02
   Cloud Run domain mappings).

**Capture.** Domain decision + Cloudflare zone ID in `journal/decisions.md`.

---

## F-02. GCP project + Workload Identity Federation

**Why.** Cloud Run hosts both EndorseKit services (web + Go API). Cloud
Scheduler (F-04) runs the daily reminder cron. WIF lets CI deploy
without a long-lived service-account JSON in secrets.

**Steps.** _(Expanded during M3.)_

1. Create GCP project `endorsekit-prod`. Link billing.
2. Set a $5 budget alert via Cloud Billing.
3. Enable APIs: Cloud Run, Artifact Registry, Cloud Build, Cloud
   Scheduler, Secret Manager, Cloud Logging.
4. Create Artifact Registry repo
   `us-central1-docker.pkg.dev/endorsekit-prod/endorsekit`.
5. Configure Workload Identity Federation between GitHub and GCP.
6. Create a dedicated cron service account
   (`endorsekit-cron@...`) — Cloud Scheduler uses it to mint the OIDC
   token the Go backend verifies.
7. Create Secret Manager secrets for each production env var.

**Capture.** `GCP_PROJECT_ID`, WIF provider resource name, the deploy
service account email, the cron service account email.

---

## F-03. Supabase project (Postgres + Auth + Google OAuth)

**Why.** Single backend datastore + identity. One Supabase project hosts
the Postgres database (all app data including the endorsement registry),
GoTrue auth (sign-up / login / magic-link / Google OAuth for the CFI),
and the PostgREST auto-API that `@supabase/supabase-js` addresses
browser-direct. RLS gates browser CRUD; the Go backend connects via
`pgxpool` and verifies GoTrue JWTs.

**Steps.**

1. Sign up at [supabase.com](https://supabase.com), create project
   `endorsekit` in the closest region to us-central1.
2. Enable auth providers: Email + Password (verification on), Magic
   Link, Google OAuth. The Google OAuth Client ID + Secret come from
   Google Cloud Console. Add redirect URIs:
   `http://localhost:5173/auth/callback` (local web),
   `http://localhost:54321/auth/v1/callback` (local Supabase CLI),
   `https://<prod-domain>/auth/callback` (added once F-01 lands).
3. From **Project Settings → API**, capture:
   - `PUBLIC_SUPABASE_URL` (Project URL)
   - `PUBLIC_SUPABASE_ANON_KEY` (anon / public key)
   - `SUPABASE_SERVICE_ROLE_KEY` (service-role key — **server-only**)
   - The JWKS URL (`<project>/auth/v1/.well-known/jwks.json`) →
     `SUPABASE_JWT_JWKS_URL`, used by the Go backend to verify tokens.
4. From **Project Settings → Database → Connection string**, capture:
   - `SUPABASE_DB_URL` / `DATABASE_URL` (the **direct** connection
     string for migrations + the Go backend's `pgxpool`).
5. **Disable Storage** (we use Cloudflare R2). Leave Realtime + Edge
   Functions disabled until/unless V2 uses them.
6. Create a second project for staging — the free tier allows 2 active
   projects.

**Capture.** All env vars above. Store in Google Secret Manager (prod) +
`.env` (local).

**Note.** Local dev uses `supabase start` (Supabase CLI) — a full local
stack. The hosted project from F-03 is for staging + prod only.

---

## F-04. Cloud Scheduler job for the daily booking/lesson reminder cron

**Why.** EndorseKit reminds a CFI of an upcoming lesson and (where the
CFI opted in) nudges a student about an approaching booking. Cloud
Scheduler posts an OIDC-authed request to the Go backend's
`/cron/daily` once a day.

**Steps.** _(Expanded during M5.)_

1. In the GCP project, create a Cloud Scheduler job
   `endorsekit-daily-cron`.
2. Schedule: once daily at a fixed UTC slot (default 13:00 UTC =
   09:00 ET / 06:00 PT — morning across the contiguous US).
3. Target: HTTP POST to the Cloud Run `endorsekit-api` service URL
   `/cron/daily`.
4. Auth: OIDC token, using the `endorsekit-cron@...` service account
   from F-02. The audience must equal the Cloud Run service URL.

**Capture.** `CRON_OIDC_AUDIENCE` (the service URL),
`CRON_OIDC_SERVICE_ACCOUNT`.

---

## F-05. Cloudflare R2 bucket

**Why.** Server-generated **endorsement PDFs** (the legal artifact
emailed to each student), **invoice PDFs**, and the **registry export
archive** (the durable legal copy of record) live in R2; clients fetch
them via signed GET URLs.

**Steps.**

1. On Cloudflare Dashboard → R2, create bucket `endorsekit-files`.
2. Create an R2 API token (access key + secret) scoped to that bucket.
3. Enable object versioning + a retention/lifecycle policy that protects
   the endorsement-PDF and registry-export prefixes from accidental
   deletion (these are legal records).
4. After F-01, set up a public hostname `files.endorsekit.app` (or
   equivalent) via the R2 → Custom Domain workflow.

**Capture.** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_HOSTNAME`.

---

## F-06. Resend transactional + endorsement-delivery + reminder email

**Why.** Email verification, magic links, password reset (for the CFI),
**delivery of the endorsement PDF to the student**, and the daily
booking/lesson reminders. Resend free tier: 100/day, 3 000/month, 1
verified domain.

**Steps.**

1. Sign up at resend.com.
2. Add the sender domain (e.g. `hello@endorsekit.app`).
3. Publish SPF, DKIM, DMARC TXT records via Cloudflare DNS. Wait ~24 h
   for verification. Deliverability matters here — an endorsement email
   landing in spam is a real product failure.
4. Create an API key.
5. Configure the deliverability webhook (bounce / complaint) pointed at
   the Go backend's `/webhooks/resend` — capture the signing secret.

**Capture.** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`,
`RESEND_WEBHOOK_SECRET`.

---

## F-07. Stripe — platform billing + Stripe Connect

**Why.** Two distinct Stripe relationships (see
[ADR-0004](adr/0004-stripe-connect-invoicing.md)):
(1) the CFI's **own subscription** to EndorseKit ($12/mo) — standard
Checkout + Customer Portal + Billing on the **platform** account;
(2) the CFI **invoicing students** via **Stripe Connect** — funds settle
to the CFI's **connected** account.

**Steps.**

1. Create a Stripe account in test mode.
2. Create products → prices for the CFI's subscription:
   - Monthly: $12/mo recurring → `STRIPE_PRICE_MONTHLY`
   - Annual: $120/yr recurring → `STRIPE_PRICE_ANNUAL`
3. **Enable Stripe Connect** in the Stripe dashboard. Choose the account
   type per ADR-0004 (Standard accounts are the V1 default — the CFI
   gets a full Stripe dashboard and Stripe handles their tax/compliance
   onboarding). Capture the Connect client ID → `STRIPE_CONNECT_CLIENT_ID`.
4. Create **two** webhook endpoints:
   - Platform endpoint → `/webhooks/stripe` → `STRIPE_WEBHOOK_SECRET`.
   - Connected-account endpoint → `/webhooks/stripe/connect` →
     `STRIPE_CONNECT_WEBHOOK_SECRET`.
   In dev, use `stripe listen` forwards.
5. **Blocks on F-10** — Stripe will not enable live mode (platform or
   Connect) until business info + TOS + Privacy are in place. Connect
   live-mode review can take additional time — start early.

**Capture.** `STRIPE_SECRET_KEY`, `PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`,
`STRIPE_CONNECT_CLIENT_ID`, the two price IDs.

---

## F-08. Sentry

**Why.** Error capture across both deployables — the SvelteKit web tier
and the Go backend.

**Steps.** Create an org + two projects (`endorsekit-web`,
`endorsekit-api`). Capture DSNs. Create `SENTRY_AUTH_TOKEN` for
sourcemap / release tagging.

**Capture.** `PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_DSN_BACKEND`,
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

---

## F-09. PostHog Cloud

**Why.** Analytics + session replay + feature flags + funnel
instrumentation from M3.

**Steps.** Create project `endorsekit`. Enable session replay (5k
replays free). Configure EU-compatible privacy defaults to avoid a
cookie banner.

**Capture.** `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST`.

---

## F-10. Legal docs

**Why.** Stripe live-mode verification (platform AND Connect) requires
Terms of Service + Privacy Policy at minimum. EndorseKit also needs a
clear **Refund policy** and a prominent **CFI-responsibility /
endorsement disclaimer**.

**Steps.**

1. Generate base docs via the TermsFeed Free Generator.
2. Customize the aviation disclaimer wording — it must be unambiguous
   that EndorseKit is recordkeeping software, that the CFI remains the
   responsible party for the correctness and applicability of every
   endorsement under 14 CFR Part 61 / AC 61-65, and that EndorseKit
   carries no FAA endorsement and gives no legal/regulatory/tax advice
   (see `.claude/rules/security.md` — the aviation-domain risk section).
3. Cover the **Stripe Connect platform relationship** in the Terms — the
   CFI invoices their own students through their own connected account;
   EndorseKit is the platform, not the merchant of record for a lesson;
   payment disputes between a CFI and a student are between them.
4. Add the age-confirmation (≥13 COPPA) requirement — implemented in the
   M1 signup flow.

**Capture.** Hosted URLs (e.g. `endorsekit.app/terms`, `/privacy`,
`/refund`) — linked from the app footer.

---

## F-11. iac-tickerbeats Woodpecker bootstrap

**Why.** Self-hosted CI on the founder's Mac (matches the sibling
repos). Runner infra lives in
[`iac-tickerbeats`](https://github.com/Ruscigno/iac-tickerbeats).

**Steps.** Follow the `iac-tickerbeats` README to run `bootstrap.sh` on
the macOS host. Verifies Colima, gitleaks, semgrep, pnpm, Go,
golang-migrate, golangci-lint, etc. are in place.

---

## F-12. Cloudflare Tunnel for Woodpecker

**Why.** GitHub webhooks need to reach the Woodpecker server on the
founder's Mac.

**Steps.** `cloudflared tunnel login` → create the `endorsekit-ci`
tunnel → publish under `ci.endorsekit.app` or equivalent → create a
GitHub OAuth app for Woodpecker login.

---

## F-13. Enable repo in Woodpecker UI + first build

**Why.** Closing the loop — once enabled, the next push triggers
`.woodpecker/pr.yml`.

**Steps.** Woodpecker dashboard → enable the `endorsekit` repo → push a
tiny no-op commit on `epic/01-discovery` → confirm the pipeline runs +
green.

---

## F-14. UptimeRobot

**Why.** Synthetic checks on `/healthz` (both services), the landing
page, and a representative public booking page. 50 monitors, 5-min
interval, free.

**Steps.** Sign up. Add monitors for the prod URLs once the launch
milestone ships.
