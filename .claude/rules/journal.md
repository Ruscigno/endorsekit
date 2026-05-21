# Journal rules

Operational memory lives under `journal/`:

| File                        | Purpose                                                                                                                                                                                     | Append cadence                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `journal/decisions.md`      | Running, append-only log of routine decisions (one line per entry: `YYYY-MM-DD \| scope \| what \| why`). One entry per self-merged PR + any non-architectural decision made along the way. | Every self-merged PR; agent appends without notifying.                                      |
| `journal/open-questions.md` | Running queue of questions for the founder (with default-decision-by date so work is never blocked).                                                                                        | When a question for the founder is identified; agent batches into the next periodic report. |
| `journal/milestones.md`     | Milestone reports at every ≥10% overall progress. One section per milestone crossing.                                                                                                       | Triggered automatically when the threshold is crossed.                                      |
| `journal/YYYY-MM-DD.md`     | Day-files for **phase-artifact** sessions only (Discovery, Architecture, Spec, Plan, Harden, Deploy gates) — narrative entries.                                                             | At every phase-artifact gate. Not for per-PR work.                                          |

## Purpose

Operational memory carries things that don't belong in commit messages, PR descriptions, or ADRs but matter for future sessions:

- What was decided and why, when not architectural enough for an ADR.
- Reminders to bring up later.
- Blockers encountered or cleared.
- Things deferred with intent.
- The "I wonder why we did X" answer-in-three-months.

## When to append (which file)

| Event                                               | File                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Self-merged PR                                      | `journal/decisions.md` — one line                                 |
| Routine non-architectural decision (EK-NNN scope)   | `journal/decisions.md` — one line                                 |
| Question that needs founder input                   | `journal/open-questions.md` — entry with default-decision-by date |
| Crossed ≥10% overall progress                       | `journal/milestones.md` — milestone-report section                |
| Reached a phase-artifact gate                       | `journal/YYYY-MM-DD.md` — narrative entry                         |
| Discovered a non-obvious library / service property | `journal/YYYY-MM-DD.md` — narrative entry (carries forward)       |

## What NOT to put in any journal file

- Anything already in git log, PR descriptions, or ADRs (link to those instead).
- Code or config (belongs in the source tree).
- Secrets.
- Verbose narration of routine actions.
- Permanent project conventions (those go in `.claude/rules/` or `CLAUDE.md`).

## Templates

**`journal/decisions.md`** — append-only, one line per entry:

```
YYYY-MM-DD | EK-NNN or area | one-line decision | one-line rationale
```

**`journal/open-questions.md`** — append-only, per question:

```
## YYYY-MM-DD — <one-line question>
Context: <one sentence>
Default (if no answer by YYYY-MM-DD): <what I'll do absent input>
```

**`journal/milestones.md`** — one section per milestone:

```
## <percentage>% — YYYY-MM-DD
Tickets merged this milestone: EK-NNN through EK-MMM
Highlights: <2-3 bullets>
Re-prioritization recommendation: <if any>
Open ADRs to consider: <if any>
```

**`journal/YYYY-MM-DD.md`** (phase-artifact gates only):

```markdown
# YYYY-MM-DD

## HH:MM — <topic>

### What happened

- <concrete actions, with commit short SHAs and PR numbers>

### Decisions made

- <non-trivial choices with rationale; ADR-worthy → write an ADR instead>

### Deferred

- <intentionally not done; revisit-by date if known>

### Blockers

- <external dependencies>

### Reminders carried forward

- <items to surface in future sessions>
```

## Reading at session start

When Claude Code starts a new session, scan in this order:

1. `journal/open-questions.md` — any unresolved questions still relevant.
2. `journal/decisions.md` — last ~20 lines for recent context.
3. The most recent phase-artifact day-file (`journal/YYYY-MM-DD.md`) if any — for **Reminders carried forward** and **Deferred** sections.

Surface anything still open at the top of the first response.

## EndorseKit-specific things worth journaling

- **AC 61-65 interpretation calls** — wherever an endorsement's template
  text or applicability is genuinely ambiguous against the current
  AC 61-65 revision, and the catalog had to pick wording. These belong
  in the journal AND in a code/seed comment; a contentious one becomes
  an ADR. Note the AC 61-65 revision letter in use (e.g. `AC 61-65J`).
- **Endorsement-record schema decisions** — anything affecting what is
  sealed into the append-only registry (which fields are in the content
  hash, the supersession-chain shape) — these touch a legal-record
  contract; surface them, don't bury them.
- **Stripe Connect gotchas** — Standard vs Express account choice
  consequences, `Stripe-Account` header usage, account-link expiry,
  `account.updated` / `capability` event handling, the
  separate-charges-and-transfers vs destination-charges decision,
  payout timing, the platform's liability posture.
- `pgx/v5` + `sqlc` gotchas (CITEXT overrides, NULL pointer handling,
  NUMERIC/money handling for invoice line items, timestamp tz behavior).
- Supabase JWKS quirks when the Go backend verifies tokens (kid rotation timing).
- Cloud Scheduler OIDC audience mismatches (the most common cron-auth failure).
- Resend webhook event-shape changes; Stripe event-type renames.
- SvelteKit 2 / Svelte 5 runes gotchas (load lifecycle, form-action progressive enhancement).
- PostHog event schema drift (renaming a property breaks every dashboard built against it).
