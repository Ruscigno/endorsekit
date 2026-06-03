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

This slice deliberately renders a working product surface **without** taking a
dependency on the still-in-flight Go backend (the sealed/hash-chained issuance
path), shared Postgres, or any new package.

## 3. What this PR delivers

| Area | File(s) | Notes |
|---|---|---|
| Calendar math | `web/src/lib/endorsements/dates.ts` (+test) | UTC-only; 90-day day-windows (61.87(n)/(p), 61.93) vs. 24-calendar-month windows (61.56-style) modeled separately. |
| Domain types | `web/src/lib/endorsements/types.ts` | Two-table shape: a validity `rule` per template, an `IssuedEndorsement` per registry row, the per-student rollup. |
| Engine | `web/src/lib/endorsements/engine.ts` (+test) | `computeStatuses(...)`, one cited function per rule; status band + per-student worst-band rollup. |
| Data seam | `web/src/lib/repo/repository.ts`, `seed.ts` | `EndorsementRepository` interface (read-only) + deterministic in-memory adapter. (`repo/`, not `data/`, which the repo-root `.gitignore` excludes.) |
| Registry screen | `web/src/routes/+page.server.ts`, `+page.svelte` | Registry grouped by student, status badges + expiry dates + the calibrated disclaimer. |
| CI: web isolation | `web/pnpm-workspace.yaml`, `web/pnpm-lock.yaml` | Isolates `web/` as its own pnpm root so the `web/**` lane installs. |
| CI: single-author hardening | `.woodpecker/pr.yml` | Replaced the base-walking `git merge-base` check (exits 128 on the local backend's shallow clone) with a tip-only Co-Authored-By check. |

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

- **The repository seam is read-only.** The append-only registry is the legal-
  record heart of the product (ADR-0002); issuance must go through the Go
  backend that seals and hash-chains each row — never a write path in `web/`.
  `EndorsementRepository` therefore exposes only `listStudents` /
  `listEndorsements`. The route depends on the interface, not a driver; swapping
  the in-memory adapter for a real (read-side) one is a one-file change. **Trade-
  off:** the screen shows demo data until the real adapter lands — acceptable
  for a first slice and clearly labeled.

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

- **Hardened the `single-author` CI step.** The old step did a base-ref fetch +
  `git merge-base` + `git rev-list` walk, which exits 128 on the local
  Woodpecker backend's shallow clone — a false red unrelated to the code. It now
  inspects the PR tip commit directly for a `Co-Authored-By:` trailer (mirrors
  the sibling repos). The single-author policy is unchanged; only the mechanism
  is.

- **No new dependencies.** Everything uses the scaffold's pinned toolchain, so
  this PR needs no founder dependency approval. Coverage instrumentation
  (`@vitest/coverage-v8`) is intentionally deferred — CI's `pnpm test --coverage`
  no-ops because of the `--` passthrough, and the tests run green under plain
  `vitest run`.

## 6. Out of scope (next phases)

The sealed/hash-chained issuance flow + the AC 61-65 template catalog (Weeks
2–3), the real read-side Postgres adapter behind `EndorsementRepository`,
endorsement-PDF rendering, the student CRM / ACS checklist, the booking surface,
Stripe Connect, and the daily reminder cron — all remain per
`product-research.md` §5/§6. The disclaimer is rendered on the registry surface
here but not yet persisted/versioned at signup.

## 7. Acceptance criteria met

- `computeStatuses` is pure and total; every validity rule carries its 14 CFR
  citation in code and in the rendered detail line.
- Each validity rule and each status band (active / expiring-soon / expired /
  no-expiry) plus the per-student rollup has a table-driven test.
- The registry screen renders the registry grouped by student with status badges
  + expiry dates and the calibrated disclaimer on the verdict surface
  (`.claude/rules/security.md` requirement).
- `web/` lint + check + build pass; the `web/**` CI lane can install (committed
  `web/pnpm-lock.yaml`).
