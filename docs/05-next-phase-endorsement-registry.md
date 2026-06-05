# Phase 5 — Next phase: the endorsement expiry engine + registry first vertical slice

> Status: **implemented in this PR** (stacked on `feat/web-app-platform-integration`).
> Authority for scope: [`docs/product-research.md`](product-research.md) §3.3, §4, §5.1, §6 (Weeks 2–4).
> This document details the next phase and records the architectural choices
> and trade-offs made delivering it.

## 1. Where the gear was

The open scaffold PR (`feat/web-app-platform-integration`, #4) landed an empty
SvelteKit app under `web/`: locale resolution, the Cortex access guard, a
`+layout` that requires active access, and a placeholder home page whose body
read _"Product surface lands here."_ No product logic existed and the `web/**`
CI lane could not pass — `web/` had no committed lockfile, so
`pnpm install --frozen-lockfile` failed before any check ran.

## 2. What "next phase" means here

EndorseKit's load-bearing heart is the **append-only endorsement registry**
(`product-research.md` §3.3, ADR-0002) — every endorsement a CFI issues is a
legal record kept 3+ years (14 CFR 61.189 / AC 61-65). The first pure engine
that surface needs is the **expiry engine**: given the endorsements a CFI has
issued (student, type, issue date, the type's validity rule), compute each
endorsement's status — active / expiring-soon / expired / no-expiry — and roll
it up per student. That is a pure function of `(endorsements, students, asOf)`,
no clock, no DB, every validity window cited to the FAR. So the natural first
vertical slice — the genuine next phase after an empty shell — is:

1. the **expiry engine** itself, as pure TypeScript in the web tier;
2. its **table-driven test suite**, one cited case per validity rule and per
   status band;
3. a **read-only repository seam** so the engine's inputs have a swappable
   source (issuance — the write path — stays in the sealed Go backend); and
4. the **registry screen** — the home route — rendering the registry grouped by
   student with status badges + expiry dates through that seam.

This slice renders a working product surface **without** taking a dependency on
the still-in-flight Go backend (the sealed/hash-chained issuance path). It now
also lands the **read-side persistence**: the gear's own `endorsekit` tables in
the shared Cortex Postgres and a Postgres-backed `EndorsementRepository`, with
the in-memory seed kept as the fallback for local dev and the DB-less CI `web`
lane. (The WRITE path — sealed issuance — still stays in the Go backend.)

## 3. What this PR delivers

| Area | File(s) | Notes |
|---|---|---|
| Calendar math | `web/src/lib/endorsements/dates.ts` (+test) | UTC-only; 90-day day-windows (61.87(n)/(p), 61.93) vs. 24-calendar-month windows (61.56-style) modeled separately. |
| Domain types | `web/src/lib/endorsements/types.ts` | Two-table shape: a validity `rule` per template, an `IssuedEndorsement` per registry row, the per-student rollup. |
| Engine | `web/src/lib/endorsements/engine.ts` (+test) | `computeStatuses(...)`, one cited function per rule; status band + per-student worst-band rollup. |
| Data seam | `web/src/lib/repo/repository.ts`, `seed.ts` | `EndorsementRepository` interface (read-only) + deterministic in-memory adapter. (`repo/`, not `data/`, which the repo-root `.gitignore` excludes.) |
| **Persistence** | `db/migrations/0001_endorsekit_core.{up,down}.sql`, `web/src/lib/repo/postgres.ts` (+test) | Real `endorsekit.student` + `endorsekit.endorsement` tables in the shared Cortex Postgres + a Postgres-backed (read-side) `EndorsementRepository` (postgres.js), scoped by `owner_user_id` on every query. |
| Registry screen | `web/src/routes/+page.server.ts`, `+page.svelte` | Registry grouped by student, status badges + expiry dates + an empty state (no students yet) + the calibrated disclaimer. Uses Postgres when `DATABASE_URL` is set, else the seed. |
| CI: web isolation | `web/pnpm-workspace.yaml`, `web/pnpm-lock.yaml` | Isolates `web/` as its own pnpm root so the `web/**` lane installs. |
| CI: single-author hardening | `.woodpecker/pr.yml` | Walks **every non-merge commit** in the PR range for a `Co-Authored-By` trailer. The base is resolved robustly (PR base env var → `feat/web-app-platform-integration` → `main`) and the step **fails loud** if no base resolves, so it never silently degrades to a tip-only check. |

## 4. Validity rules modeled (each cited; no invented rules)

EndorseKit ships only **well-established** validity windows and cites the FAR
for each (CLAUDE.md "Working with the spec" / `.claude/rules/communication.md`).
It does **not** invent endorsement wording or rules.

- **14 CFR 61.87(n)** — student-pilot solo, specific make & model, given
  "within the 90 days preceding the date of the flight" → a 90-day day-window.
- **14 CFR 61.87(p)** — the additional 90-day solo endorsement for the make and
  model, renewed every 90 days → same 90-day day-window.
- **14 CFR 61.93(c)** — the (repeated) solo cross-country authorization, which
  rides on the same pre-solo 90-day currency → 90-day day-window. (The
  per-flight 61.93(c)(3) review endorsement is a single-flight artifact and is
  deliberately **not** modeled as a recurring registry item.)
- **14 CFR 61.56-style** — a flight-review-style item, **24 calendar months**,
  validity to the end of the target month → calendar-month window.
- **14 CFR 61.35 / 61.87(b)** — the pre-solo aeronautical-knowledge / written-
  test endorsement record → **no expiry** (a one-time record). The FAA's own
  knowledge-*test report* has a separate 24-calendar-month validity for the
  practical test under 14 CFR 61.39 — that is the FAA's clock on the test
  result, not this endorsement record, and is out of scope for this slice (noted
  in `engine.ts`).

## 5. Architectural choices & trade-offs

- **Engine in TypeScript in the web tier, not Go (yet).** `product-research.md`
  puts the canonical issuance + seal logic in `backend/internal/endorsements`.
  There is no Go backend on disk yet, and this slice is **read-side only** — it
  computes expiry status for display, it does not issue, seal, or mutate any
  record. Putting the pure expiry math in `web/src/lib/endorsements` ships a
  working registry screen now and keeps it a portable, I/O-free function.
  **Trade-off:** if/when an expiry-reminder cron needs the same math
  server-side, the rules must be ported to Go (or the cron must call the web
  tier). Mitigated by keeping the engine I/O-free and its tests behavioural, so
  a port is a mechanical mirror.

- **The repository seam is read-only, with two adapters — real Postgres + seed
  fallback.** The append-only registry is the legal-record heart of the product
  (ADR-0002); issuance must go through the Go backend that seals and
  hash-chains each row — never a write path in `web/`. `EndorsementRepository`
  therefore exposes only `listStudents` / `listEndorsements`. The route depends
  on the interface, not a driver: `+page.server.ts` picks `postgresRepository`
  when `DATABASE_URL` is set, else `seedRepository`. The Postgres adapter
  connects with the gear's `endorsekit_app` role and reads the `endorsekit`
  schema, scoping every query `WHERE owner_user_id = $cfi`. The pure row→domain
  mappers are exported and unit-tested (the CI `web` lane has no DB; the `db`
  lane round-trips the migration separately). **Trade-off:** the seed renders
  demo data when `DATABASE_URL` is unset (local dev / CI), which is intended —
  the same contract drives both, so the surface is identical either way.

- **The gear owns its tables via its own migration.** `db/migrations/0001_endorsekit_core`
  creates `endorsekit.student` and `endorsekit.endorsement` with
  `CREATE SCHEMA IF NOT EXISTS endorsekit` first, so the migration is
  self-contained and the CI `db`-round-trip lane (`up → down-all → up`) applies
  it against an empty ephemeral Postgres without the platform migrations. The
  Cortex platform migration only creates the empty `endorsekit` namespace and
  grants the `endorsekit_app` role ownership; the `down` migration drops the two
  TABLES only, never the schema (the platform owns the namespace). No
  cross-schema FK to `cortex.users` is declared — the gear schema can SELECT
  `cortex.*` but must stay applyable in isolation. Validated locally:
  `up → down-all → up` round-trips clean on Postgres 16. **Trade-off:** the
  read-side table set carries only the columns the expiry engine needs
  (`owner_user_id`, `student_id`, `rule`, `label`, `scope`, `issued_on`); the
  sealed/hash-chained seal/audit columns (ADR-0002) land with the Go issuance
  path in a later, founder-reviewed migration.

- **`owner_user_id` predicate, not RLS, as the gear-tier control.** The
  `endorsekit_app` role *owns* its schema, so Postgres RLS would not gate it
  (table owners bypass RLS). The real control here is server-side scoping by the
  authenticated Cortex user id (the CFI) on every query — `WHERE owner_user_id =
  ${ownerCfiId}` — mirroring the Go backend's per-request owner predicate
  (product-research §4.3). **Trade-off:** RLS-as-defense-in-depth is deferred to
  the Go backend tier (which can run under a non-owning role); for this
  read-only web adapter the owner predicate is the single, audited gate.

- **One new dependency — `postgres` (postgres.js).** A pure-JS, zero-native-deps,
  server-only Postgres client for the persistence adapter, landed in
  `dependencies` (not dev) with the lockfile committed. New external
  dependencies are a founder-only category — this one is **founder-authorized**
  for the persistence work. Server-only: imported from
  `+page.server.ts` / `repo/postgres.ts`, never client code, so the browser
  never sees the connection string.

- **14-day "expiring soon" amber band.** Tighter than CurrencyHub's 30-day band
  because the dominant endorsement window is the 90-day solo: a 30-day amber
  band would paint a third of the whole window amber. 14 days gives a CFI a
  clear two-week re-endorsement runway without crying wolf. **Trade-off:** a
  per-rule threshold (as CurrencyHub uses) was considered overkill here since
  every expiring rule shares the 90-day/24-month cadence; revisit if a short-
  window endorsement is ever added.

- **No-expiry is a first-class band, not a null hack.** The knowledge-test
  endorsement does not lapse; it renders as a distinct "No expiry" badge rather
  than a misleading "expired"/"active". `daysRemaining` / `expiresOn` are `null`
  for it and the rollup treats it as the lowest severity.

- **`web/` isolated as its own pnpm root.** The gear root carries a
  `pnpm-workspace.yaml` for the legacy app, which hijacked
  `cd web && pnpm install`. Adding `web/pnpm-workspace.yaml` makes `web/`
  self-contained with its own lockfile so CI's `web` lane passes. **Trade-off:**
  `web/` is not part of a monorepo workspace; if the legacy root is later
  retired in favour of a real workspace, this file is removed in that PR.

- **Hardened the `single-author` CI step.** The original step hard-coded
  `git fetch origin main`, which exits 128 on this repo (no `main` branch) /
  the local Woodpecker backend's shallow clone — a false red unrelated to the
  code. The step now **walks every non-merge commit** in the PR range
  (`$MB..HEAD`), resolving the base robustly (the `CI_COMMIT_PULL_REQUEST_BASE_BRANCH`
  env var → `feat/web-app-platform-integration` → `main`) and **failing loud** if
  no base resolves — so an intermediate `Co-Authored-By:` trailer can no longer
  slip through and the check never silently degrades to tip-only. The
  single-author policy is unchanged; only the mechanism is.

- **Exactly one new dependency (`postgres`), founder-authorized.** Beyond the
  persistence client (see the postgres.js trade-off above) the slice uses the
  scaffold's pinned toolchain. Coverage instrumentation (`@vitest/coverage-v8`)
  is intentionally deferred — CI's `pnpm test --coverage` no-ops because of the
  `--` passthrough, and the tests run green under plain `vitest run`.

## 6. Out of scope (next phases)

The sealed/hash-chained issuance flow + the AC 61-65 template catalog (Weeks
2–3) — i.e. the WRITE path that populates `endorsekit.endorsement` and adds the
seal/audit columns + append-only trigger — plus endorsement-PDF rendering, the
student CRM / ACS checklist, the booking surface, Stripe Connect, and the daily
reminder cron — all remain per `product-research.md` §5/§6. The read-side
Postgres adapter lands in this PR; the student/endorsement CRUD UI does not (the
gear has no rows until the Go issuance path writes them, hence the empty state).
The disclaimer is rendered on the registry surface here but not yet
persisted/versioned at signup.

## 7. Acceptance criteria met

- `computeStatuses` is pure and total; every validity rule carries its 14 CFR
  citation in code and in the rendered detail line.
- Each validity rule and each status band (active / expiring-soon / expired /
  no-expiry) plus the per-student rollup has a table-driven test.
- The registry screen renders the registry grouped by student with status badges
  + expiry dates, an empty state when the CFI has no students yet, and the
  calibrated disclaimer on the verdict surface (`.claude/rules/security.md`
  requirement).
- The gear's `endorsekit.student` / `endorsekit.endorsement` migration
  round-trips (`up → down-all → up`) on Postgres 16; the pure row→domain mappers
  (`repo/postgres.ts`) are unit-tested without a live DB.
- `web/` lint + check + test + build pass; the `web/**` CI lane can install
  (committed `web/pnpm-lock.yaml`, with `postgres` in `dependencies`).
