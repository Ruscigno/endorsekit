# Engineering rules

## Phase gates

We work in seven named phases. Each ends with a reviewable artifact + a stop-and-confirm handshake **at the phase-artifact level**. Per-ticket implementation work inside Phase 5 (Implement) does NOT require per-PR stop-and-confirm — see [Working contract](../../docs/working-contract.md) for the self-merge protocol.

| #   | Phase        | Artifact                                          | What it produces                                                                        |
| --- | ------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Discovery    | `docs/01-discovery.md`                            | Problem, users (ICP + anti-personas), in/out of scope, success criteria, open questions |
| 2   | Architecture | `docs/02-architecture.md` + `docs/adr/000N-*.md`  | C4 diagrams, refined data model, critical flows, STRIDE threat model                    |
| 3   | Spec         | `docs/03-spec.md` + `docs/api/openapi.yaml`       | User stories, acceptance criteria, formal API contract                                  |
| 4   | Plan         | `docs/04-plan.md`                                 | Sliced tickets (EK-NNN), dependencies, milestones, risk register                        |
| 5   | Implement    | code in `web/`, `backend/`, `db/migrations/`      | One PR per coherent capability slice; agent self-merges per the working contract        |
| 6   | Harden       | `docs/06-security.md`                             | OWASP ASVS L2 walkthrough, ZAP scan, residual risks                                     |
| 7   | Deploy       | live URL + `docs/07-runbook.md`                   | Production cutover + operational runbook                                                |

**At every phase-artifact gate** the agent:

1. Stops. Does not auto-advance to the next phase.
2. Writes a chat summary: what was produced, where it lives, what's open.
3. Lists open questions for the founder at the bottom of the artifact.
4. Asks: _"Approve to advance to Phase N+1, or do you want changes here first?"_

Decisions resolved in chat get captured in the journal or promoted to an ADR if architectural.

## Stack conventions

### Web — SvelteKit (Svelte 5 runes) / pnpm

- **Package manager:** `pnpm`. Lockfile committed. `packageManager` field in `package.json` pins the version.
- **Linting:** ESLint flat config + `prettier`. TypeScript `strict: true`. `svelte-check` is the typecheck gate.
- **Components:** Svelte 5 runes (`$state`, `$derived`, `$effect`). Tailwind for styling; daisyUI or shadcn-svelte for primitives.
- **Server routes:** `+page.server.ts` for loaders, `+server.ts` for API endpoints. SvelteKit server routes exist for **paths that need a server secret OR that proxy to the Go backend** — Stripe Checkout/Portal session creation, R2 presign, and the proxy layer that forwards authenticated calls to the Go service. All simple user-owned CRUD that doesn't need the backend goes browser-direct via `@supabase/supabase-js` with RLS doing the authorization.
- **DB clients (web):**
  - **Primary**: `@supabase/supabase-js` (browser) + `@supabase/ssr` (server SSR). Goes through PostgREST + RLS.
  - The web tier has **no direct Postgres connection.** Anything needing privileged or cross-table SQL — and **everything touching the endorsement registry, PDF generation, the reminder cron, or Stripe Connect** — goes through the Go backend, not a service-role pool in `web/`.
- **PWA:** `@vite-pwa/sveltekit` plugin; manifest + service worker + maskable icons committed under `web/static/`.
- **No `dangerouslySetInnerHTML` / `{@html ...}` on user content.** Ever.

### Backend — Go 1.25 (the endorsement-PDF + reminder-cron + Stripe-Connect service)

Per [ADR-0001](../../docs/adr/0001-go-backend-for-endorsements-and-jobs.md), EndorseKit has a Go service on Cloud Run. Conventions mirror the sibling `tail-number-radar` repo:

- **Routing:** stdlib `net/http.ServeMux` (Go 1.22+ enhanced patterns). **No chi, gin, echo, fiber.**
- **DB:** `pgx/v5` + `sqlc`-generated queries. **No GORM. Never `database/sql` directly.** Queries live in `backend/internal/db/queries/*.sql`; `sqlc generate` produces typed Go. `sqlc diff` in CI catches schema drift.
- **Migrations:** `golang-migrate`, sequential `db/migrations/NNNN_<name>.up.sql` / `*.down.sql` — shared with the web tier, applied once. Up + down + up validation runs in CI on every PR touching `db/migrations/**`.
- **Logging:** `slog`, structured JSON. No PII in logs — never the CFI's certificate number, never a student's name or email.
- **Auth:** the Go service verifies Supabase-issued ES256 JWTs against the JWKS endpoint (fetched once at boot, cached, refresh on `kid` mismatch). HS256 rejected; `aud='authenticated'` enforced.
- **Money is never `float64`.** Invoice line-item amounts use integer minor units (cents) or a decimal type. `sqlc` overrides enforce this.
- **No global `init()` for anything DI-able.** Construct dependencies in `main()` / `run()` and pass them down (see TNR's `cmd/server/main.go` pattern).
- **Cron:** the daily booking/lesson reminder cron is `POST /cron/daily`, OIDC-authed (Cloud Scheduler calls it). Reminder dedupe is a DB UNIQUE constraint, not application logic.
- **The endorsement registry is append-only.** Per [ADR-0002](../../docs/adr/0002-endorsement-record-immutability.md): the `endorsements` table accepts `INSERT` only. There is no `sqlc` query that does `UPDATE` or `DELETE` on it; a correction is a new superseding `INSERT`. Each row carries a content hash chained to the prior record (an HMAC-sealed audit trail). The DB grant set and an append-only trigger enforce this at the storage layer.

### Database + Auth — Single Supabase

- **One Supabase project** hosts Postgres + GoTrue + PostgREST + RLS.
- **Connections:**
  - Web tier: public anon connection via `@supabase/supabase-js` — RLS-gated.
  - Go backend: direct `pgxpool` connection via `DATABASE_URL`. The backend is a trusted server; it authorizes per request from the verified JWT's `sub` claim **and** RLS is still enabled as defense-in-depth. The cron path and the Stripe-webhook path use an app-admin role deliberately.
  - Migrations: direct connection via `SUPABASE_DB_URL`.
- **Cross-tenant isolation** is enforced two ways: RLS policies on every CFI-owned table (`auth.uid()`-keyed), AND the Go backend's per-request `WHERE owner_cfi_id = $jwt_sub` predicate. The cross-tenant regression test exercises both layers.
- **Local dev:** `supabase start` (Supabase CLI) runs Postgres + GoTrue + Studio + Inbucket via Docker.

### Auth — Supabase Auth

- Email + password (with verification on), magic link, Google OAuth. No phone/SMS in V1.
- **Browser:** `@supabase/supabase-js` handles sign-up / login / OAuth callback / session refresh.
- **Web SSR:** `@supabase/ssr` `createServerClient` + `safeGetSession()` in `hooks.server.ts`.
- **Go backend:** verifies the `Authorization: Bearer <jwt>` header on every authenticated route.
- **The student is not a paying account.** A student interacts with EndorseKit only through unauthenticated, signed-token surfaces (the public booking page, a booking-confirmation page, an endorsement-PDF download link) — never a logged-in app session. The CFI is the only authenticated, paying principal in V1.

## Branching strategy & stacked epics

- **Phase artifacts:** `epic/NN-slug` (e.g., `epic/01-discovery`).
- **Implementation tickets:** `feat/EK-NNN-slug` (e.g., `feat/EK-001-endorsement-issuance`).
- **Meta / chores:** `chore/<slug>`.
- **Fixes:** `fix/<slug>`.

### Stacking rules

1. **Cut from the parent.** New branch off the previous unmerged dependency, not `main`.
2. **PR targets the parent.** Re-target to `main` when the parent merges.
3. **`--force-with-lease`, never bare `--force`.**
4. Use `scripts/new-epic-branch.sh <NN-slug>` to cut new epic branches stacked on the most recent unmerged epic.

## PR conventions

- **PR per coherent capability slice**, not per ticket. A slice may bundle multiple EK-NNN tickets when they form one capability or unblock each other on the critical path.
- **No hard LOC cap.** Use judgment on coherence.
- **Conventional commits.** `feat(scope): …`, `fix(scope): …`, `chore(scope): …`, `docs(scope): …`.
- **Single author per commit — founder only.** Never add `Co-Authored-By:` trailers (Claude, agent, or otherwise). Enforced locally by a `commit-msg` pre-commit hook and in CI by the `single-author` step; do not bypass with `--no-verify`.
- **Failing test added before code** for any business logic — especially endorsement-template rendering, the seal/hash-chain logic, and the Stripe-webhook dispatcher. Trivial wiring is exempt.
- **Coverage gate ≥ 80% on changed business-logic files.** The endorsement-issuance + registry-seal packages and the Stripe-Connect package target ≥ 90%. Generated code (`sqlc`) excluded.
- **PR body:** title + 3-bullet "what changed and why" + verbatim auditor output. Spec citations live in commit messages, not PR bodies.

## Definition of done (per PR)

1. CI green (lint, typecheck, tests, SAST, secret scan, coverage, `sqlc diff`, migration round-trip if applicable, `govulncheck`, endorsement-immutability heuristic).
2. Acceptance criteria from the user story(ies) verifiable by automated or manual test.
3. All applicable auditor subagents (see triggers below) run on the staged diff before push; PASS/CONCERN/BLOCK output goes verbatim into the PR body.
4. **Self-merge** if all checks pass AND the PR does NOT touch any founder-only category (see [Working contract](../../docs/working-contract.md)). Otherwise, push with `FOUNDER APPROVAL REQUIRED — <category>` header.
5. Append one line to `journal/decisions.md` on merge: `YYYY-MM-DD | scope | what | why`.

## Subagent invocation triggers

The agent runs these on the **staged diff before pushing**, not after the PR opens. Output goes verbatim into the PR body.

- **`spec-guardian`** — **every PR with code changes.** Always runs. Catches scope creep against `docs/product-research.md` + the load-bearing-decisions block, and the EndorseKit ↔ acsready boundary.
- **`endorsement-registry-auditor`** — runs when the diff touches `backend/internal/endorsements/**`, the `endorsements` / endorsement-template tables or migrations, the endorsement-PDF renderer, the e-signature capture path, or any code that writes an endorsement record. Verifies the registry is append-only, the hash-chain seal is correct, every AC 61-65 template carries its citation, and the aviation disclaimer surfaces.
- **`stripe-connect-auditor`** — runs when the diff touches `backend/internal/billing/**`, the Stripe webhook receivers, `connected_accounts` / `invoices` / `subscriptions` tables, or Checkout/Connect onboarding code. Verifies webhook signature-on-raw-body + idempotency, the platform-vs-connected-account boundary, that money is never `float64`, and that the platform never becomes merchant of record.
- **`rls-and-tenancy-auditor`** — runs when the diff touches `db/migrations/**`, any RLS policy, a Go handler reading CFI-owned rows, a SvelteKit server route, or a public signed-token surface. Verifies RLS on every CFI-owned table, the Go backend's per-request owner predicate, and that public student-facing surfaces expose only what the signed token scopes.

If any auditor returns **BLOCK**: do not push. Fix the underlying issue and re-run. If a CONCERN: include it in the PR body; founder may review.

## Self-merge protocol

For PRs that do NOT touch a founder-only category:

1. CI green on all required checks.
2. All applicable auditor subagents returned PASS or CONCERN (never BLOCK).
3. No open question in `journal/open-questions.md` blocks the slice.
4. Merge via `gh pr merge --squash <N>`.
5. Append one line to `journal/decisions.md`: `YYYY-MM-DD | EK-NNN / area | what merged | one-line why`.

For PRs that touch a founder-only category:

1. Same auditors run.
2. Push the branch and open the PR with header `FOUNDER APPROVAL REQUIRED — <category>`.
3. Add to `journal/open-questions.md` if not already raised.
4. Wait. The founder merges (or rejects).

## Anti-patterns

- ❌ Auto-advancing **phase artifacts** without approval. (Per-PR self-merge inside Phase 5 is allowed.)
- ❌ Editing `docs/product-research.md` post-bootstrap (write an ADR that supersedes the row).
- ❌ Re-litigating a load-bearing decision in `CLAUDE.md` without a documented blocker.
- ❌ Self-merging a PR that touches a founder-only category.
- ❌ Skipping the auditor pre-push gate.
- ❌ An `UPDATE` or `DELETE` against the `endorsements` table — the registry is append-only (ADR-0002). A correction is a new superseding `INSERT`.
- ❌ An AC 61-65 endorsement template with no `AC 61-65` / `14 CFR` citation in the seed data or code comment.
- ❌ Storing money as `float64` anywhere in the invoicing path.
- ❌ The platform account becoming merchant of record for a CFI↔student transaction — the CFI is paid through their own Connect account.
- ❌ A migration that adds a CFI-owned table without `enable row level security` + at least own-read / own-write policies in the same migration.
- ❌ Stripe webhook signature verified against re-serialized JSON instead of the raw request body.
- ❌ Reaching for chi/gin/GORM in the Go backend, or Next.js in the web tier.
- ❌ Growing the student CRM into a full student-side training journal — that is the sibling product `acsready`. `spec-guardian` BLOCKs it.
- ❌ Pinned-to-`latest` deps. Pin exact versions; Dependabot is on.
