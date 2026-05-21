# 0002. The endorsement registry is append-only, sealed, and hash-chained

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

An endorsement is a **legal document**. Under 14 CFR 61.189 a flight
instructor must sign the logbook of each person they give training or an
endorsement to and **keep a record** of each endorsement issued;
AC 61-65 reinforces this and the FAA's guidance is to retain those
records for at least **3 years**. Endorsement records surface in FAA
certificate actions and enforcement proceedings — a CFI who cannot
produce them is exposed.

EndorseKit's central promise is to *be* that system of record. That
makes the `endorsements` table fundamentally different from ordinary
application data:

- An issued endorsement must never be silently altered. If the registry
  could be edited, its evidentiary value collapses — and a
  compromised account or a buggy migration could rewrite history.
- A genuine correction (a wrong date, a mis-picked reference) must still
  be possible — but it must be visible *as a correction*, the way a
  paper endorsement is corrected by lining out and re-writing, never by
  erasing.
- A CFI (and, in a dispute, an FAA inspector) must be able to trust that
  what the registry shows is what was issued, unchanged.

How should the registry be structured so that immutability is a
*property of the system*, not a matter of trusting application code to
never run an `UPDATE`?

## Decision drivers

- **Immutability must be enforced at the lowest layer possible.** A
  convention ("we just don't write UPDATE statements") fails the moment
  a future PR, a cascade, or a compromised credential does. The database
  itself should refuse to mutate the table.
- **Corrections must remain possible and auditable.** Append-only cannot
  mean "errors are permanent and unfixable" — it means errors are fixed
  by *adding* a superseding record.
- **Tampering must be detectable.** Even if the storage layer is
  bypassed (a direct DB write with elevated privilege), a reader should
  be able to tell that a historical row was altered.
- **The seal must survive key rotation.** Security hygiene rotates HMAC
  keys; rotating the seal key must not invalidate years of already-
  sealed records.
- **It must be cheap.** EndorseKit is a free-tier solo product; the
  mechanism cannot require a separate ledger service or blockchain.

## Considered options

1. **Convention only.** A normal table; "don't write UPDATE/DELETE" is a
   code-review rule.
2. **Append-only at the DB layer + supersession.** The `endorsements`
   table accepts `INSERT` only — the application role's grant set
   withholds `UPDATE`/`DELETE`, an append-only trigger raises on either,
   and RLS has INSERT + own-SELECT policies only. A correction is a new
   `INSERT` linked via `supersedes_endorsement_id`.
3. **Append-only + supersession + a per-record HMAC seal hash-chained to
   the prior record.** Option 2, plus each row carries a content hash
   over its material fields, HMAC-keyed, with the prior record's hash
   folded into the input — a chain. A verifier can walk the chain.
4. **An external immutable ledger / blockchain.** Write each endorsement
   to a third-party append-only ledger or a blockchain.

## Decision outcome

Chosen option: **Option 3 — append-only at the DB layer, corrections by
supersession, and a per-record HMAC seal chained to the prior record.**

The `endorsements` table:

- Accepts `INSERT` only. The migration that creates it **withholds
  `UPDATE` and `DELETE`** from the application DB role, installs an
  **append-only trigger** that raises on `UPDATE`/`DELETE` (defense in
  depth), and its **RLS policy set is INSERT + own-`SELECT` only — there
  is no `UPDATE`/`DELETE` policy at all**.
- Has **no `updated_at` column** — a row is never updated.
- A **correction is a new `INSERT`** carrying `supersedes_endorsement_id`
  pointing at the row it replaces. Both rows survive forever; the
  registry UI shows the supersession chain. This mirrors the FAA's
  expectation for correcting a paper endorsement (line out, do not
  erase).

Each row carries a **seal**:

- `content_hash` — an HMAC (keyed with `ENDORSEMENT_SEAL_SECRET`) over
  the material fields: CFI identity snapshot, student identity snapshot,
  AC 61-65 reference, the full rendered endorsement text, the issue
  date, and the signature artifact reference.
- `prev_content_hash` — the `content_hash` of the immediately prior
  endorsement row for that CFI (null for the first). The current row's
  hash input **includes** the prior hash → a chain.
- `seal_algo` and `seal_key_version` — stored per row, so
  `ENDORSEMENT_SEAL_SECRET` can be rotated; old records still verify
  against the key version they were sealed with.

A **chain verifier** walks a CFI's records in order and recomputes each
hash; a mismatch means a historical row was tampered with. The verifier
runs on demand (a CFI can prove integrity) and as part of the
backup-restore drill.

These four enforcement layers are intentionally redundant: the DB grant
set, the trigger, the RLS policy shape, and — at the change-review level
— the `endorsement-immutability` CI heuristic and the
`endorsement-registry-auditor` subagent.

### Positive consequences

- Immutability is a property of the database, not a hope about code.
- Corrections remain possible and are *visibly* corrections.
- Tampering is detectable even by an actor who bypasses the application
  layer — the hash chain breaks.
- Key rotation is safe — the per-row key version preserves old seals.
- No external service, no blockchain — it is plain Postgres + an HMAC.

### Negative consequences

- A wrong endorsement cannot be "deleted" — only superseded. This is the
  *correct* behavior for a legal record, but it must be clearly
  explained in the UI so a CFI is not confused.
- The hash chain adds a small ordering constraint to inserts (a row
  needs the prior row's hash). At EndorseKit's volume (a CFI issues a
  handful of endorsements a week) this is trivial.
- The down-migration that drops/re-adds the grant withholding + trigger
  is only safe on a fresh DB; documented in the migration's `.down.sql`.

## Pros and cons of each option

### Option 1 — convention only

- 👍 Zero mechanism to build.
- 👎 One future PR, cascade, or compromised credential rewrites a legal
  record. Unacceptable for the product's central promise.

### Option 2 — append-only DB + supersession

- 👍 Real enforcement; corrections work.
- 👎 An actor with elevated DB privilege could still alter a row
  undetectably — no tamper-evidence.

### Option 3 — append-only + supersession + hash chain (chosen)

- 👍 Enforcement AND tamper-evidence; corrections work; cheap.
- 👎 Slightly more to build (the seal + the verifier) and to explain.

### Option 4 — external ledger / blockchain

- 👍 Strong tamper-evidence.
- 👎 A new external dependency and cost; over-engineered for a solo
  free-tier product; a blockchain adds latency and complexity for no
  benefit a keyed hash chain doesn't already provide.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §3.3
  (the endorsement registry), §4.2 (the `endorsements` schema), §7
  (testing — the seal is a priority).
- Related ADRs: [0001](0001-go-backend-for-endorsements-and-jobs.md)
  (the Go service that writes the registry),
  [0003](0003-endorsement-pdf-and-esignature.md) (the e-signature that
  is part of the sealed content).
- External: 14 CFR 61.189 (flight-instructor recordkeeping), AC 61-65
  (Certification: Pilots and Flight and Ground Instructors — endorsement
  templates and the recordkeeping guidance).
