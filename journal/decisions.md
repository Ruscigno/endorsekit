# Decisions log

Append-only. One line per entry. Format:

```
YYYY-MM-DD | EK-NNN or area | one-line decision | one-line rationale
```

Architectural decisions do NOT go here — they become ADRs in
`docs/adr/`. This file is for routine, non-architectural calls and a
one-line record of every self-merged PR.

---

2026-05-21 | Phase 0 | Bootstrapped the EndorseKit repo scaffold (root config, .claude rules + 4 agents, CI, db/backend skeleton, docs) | Replicates the acsready/currency-hub template structure adapted to a Go-backed CFI-side product; Phase 1–4 draft artifacts produced alongside.
2026-05-21 | Phase 0 | Go backend skeleton dirs scaffolded (backend/cmd/server, backend/internal) with configs only, no Go code | EndorseKit needs server-side endorsement-PDF generation, a booking/lesson reminder cron, and Stripe Connect → it has a Go service per the founder's backend rule; formal call recorded in ADR-0001 (proposed).
2026-05-21 | Phase 0 | Three product-specific auditor subagents created alongside spec-guardian | endorsement-registry-auditor (append-only legal record), stripe-connect-auditor (two Stripe relationships), rls-and-tenancy-auditor (CFI tenancy + public student surfaces).
