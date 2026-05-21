# Journal

Operational memory for EndorseKit. The rules that govern this directory
live in [`.claude/rules/journal.md`](../.claude/rules/journal.md) — read
that first.

## Files

| File                  | What it carries                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `decisions.md`        | Append-only one-line log of routine decisions + every self-merged PR.        |
| `open-questions.md`   | Questions awaiting founder input, each with a default-decision-by date.      |
| `milestones.md`       | A section per ≥10% progress crossing — the milestone report.                 |
| `YYYY-MM-DD.md`       | Narrative day-files for phase-artifact sessions only (Discovery → Deploy).    |

## Reading order at session start

1. `open-questions.md` — anything unresolved still relevant.
2. `decisions.md` — last ~20 lines for recent context.
3. The most recent `YYYY-MM-DD.md` day-file — its "Reminders carried
   forward" and "Deferred" sections.

Surface anything still open at the top of the first response.

## What does NOT go here

- Anything already in git log, PR descriptions, or ADRs — link instead.
- Code, config, or secrets.
- Permanent conventions — those live in `.claude/rules/` or `CLAUDE.md`.
