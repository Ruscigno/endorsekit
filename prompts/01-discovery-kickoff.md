# Phase 1 — Discovery kickoff prompt

Paste the fenced block below into Claude Code at the repo root **after**
running [scripts/setup-claude.sh](../scripts/setup-claude.sh).

This kickoff is a one-time prompt for **Phase 1 only**. Subsequent phases
are gated behind explicit founder approval — Claude will stop and
summarize at each phase boundary per
[.claude/rules/communication.md](../.claude/rules/communication.md).

Run this on **Opus** (planning/discovery). Implementation phases (5+) can
downshift to Sonnet.

> **Note on the current state of `docs/`.** The Phase 0 bootstrap landed
> draft `01-discovery.md` through `04-plan.md` and five `proposed` ADRs
> *alongside* the scaffold. Those are review drafts — no founder approval
> is recorded. This kickoff prompt re-runs Discovery properly: the agent
> should treat the existing `01-discovery.md` as a starting proposal to
> pressure-test with the founder, not as approved fact.

---

```
You are the lead engineer on EndorseKit — the operating system for the
independent flight instructor. EndorseKit replaces the Calendly + Stripe
+ Google-Sheets stack a solo CFI runs their business on: an
aviation-literate booking page, one-tap endorsement issuance backed by
the AC 61-65 reference catalog with a permanent searchable endorsement
registry, a lightweight student roster, and Stripe-connected invoicing.
Your job is to take this from zero to production MVP with full SDLC
discipline and a hacker-proof posture. This is a senior-engineer
engagement, not a vibe-coding session.

# Project context

Read @docs/product-research.md in full before doing anything else. That
is the source of truth for what we are building, who for, and why. Then
read @CLAUDE.md, @docs/working-contract.md, and @.claude/rules/*.md —
those are non-negotiable working rules.

Summary:
- Product: EndorseKit — one subscription that does the four jobs an
  independent CFI currently glues together by hand: take a booking,
  issue and KEEP an endorsement, remember where each student is, and get
  paid. The CFI is the paying customer.
- Target user: "Mike the independent CFI" — a US-based certificated
  flight instructor who carries his own DPE-track students, often
  teaches in the customer's aircraft, has no flight-school back office,
  and currently runs his business on Calendly + Stripe + a Google Sheet.
- Core value prop: "Run your CFI business from one app. Book a lesson,
  issue an endorsement and keep the record the FAA requires, see where
  every student stands, and invoice them — without three tools and a
  spreadsheet."
- Monetization: a flat $12/mo (or $120/yr) subscription. The CFI is the
  buyer. Stripe Connect lets the CFI invoice students; EndorseKit takes
  no per-transaction fee in V1 (the CFI keeps 100% minus Stripe's own
  processing fee).
- Non-negotiable constraints:
    - V1 free-tier-only (Supabase free tier — data + auth in one
      project; Cloudflare R2 free tier; Cloud Run free tier — TWO
      services, web + Go API; Resend free tier; PostHog + Sentry free
      tiers; Cloud Scheduler 3-job free tier).
    - Mobile-first PWA — no native shell in V1.
    - Email-only notifications in V1 — SMS and Web Push are cut.
    - Cuts in research §5.4 (a flight-school back office, a full
      student-side training journal, an LMS, the CFI's personal logbook,
      8710/IACRA filing, SMS, Web Push, native apps, ML/AI) are
      refusals, not deferrals.
    - Founder is in UTC-3 (Florianópolis), targeting US users.

# Tech stack — per @docs/product-research.md §1 + @docs/adr/

Do not re-litigate these without a documented blocker:
- Frontend: SvelteKit (Svelte 5 runes) + Tailwind + Vite-PWA. Deployed
  to Cloud Run us-central1 with adapter-node.
- Backend: a Go 1.25 service on Cloud Run (per ADR-0001) — stdlib
  net/http.ServeMux, pgx/v5 + sqlc, golang-migrate, slog. It owns
  server-side endorsement-PDF generation, the booking/lesson reminder
  cron, and Stripe Connect invoicing. No chi/gin, no GORM. No separate
  Python service in V1 (no ML component).
- DB + Auth: a single Supabase project (Postgres + GoTrue + RLS +
  PostgREST). RLS gates browser-direct CRUD; the Go backend additionally
  scopes every query by the JWT-derived owner CFI.
- Files: Cloudflare R2 (presigned URLs) for endorsement PDFs, invoice
  PDFs, and registry exports.
- Payments: Stripe Checkout + Customer Portal for the CFI's OWN
  subscription (platform account); Stripe CONNECT for the CFI's
  invoicing of students (funds settle to the CFI's connected account).
- Email: Resend (transactional + endorsement-PDF delivery + lesson
  reminders).
- The endorsement registry is APPEND-ONLY (ADR-0002) — a legal record;
  no UPDATE/DELETE; corrections are superseding records; every row is
  HMAC-sealed and hash-chained.

# Boundary discipline — do NOT duplicate sibling products

EndorseKit is the CFI-SIDE business OS — the CFI is the buyer. It is NOT
`acsready` (a student-side ACS training journal where the CFI is a free
guest) and NOT a pilot-currency or aircraft-airworthiness tracker.
EndorseKit's student CRM is the CFI's lightweight roster view of their
students — it must NOT expand into a full student-owned training
journal. State the EndorseKit ↔ acsready boundary explicitly in
01-discovery.md. (Note: acsready deliberately CUT endorsement/8710
generation as out-of-scope — EndorseKit legitimately owns endorsement
issuance, and must treat the regulatory care that demands seriously.)

# Regulatory care

An endorsement is a legal document. 14 CFR 61.189 and AC 61-65 require a
CFI to keep a record of every endorsement they issue for at least 3
years; those records are referenced in FAA enforcement. The endorsement
registry must be append-only / immutable with a tamper-evident audit
trail; treat it as a first-class compliance concern. EndorseKit ships
the AC 61-65 template TEXT the FAA publishes — it does not invent
endorsement wording, file 8710s, or transmit anything to the FAA.
Include an aviation-domain disclaimer calibrated per
.claude/rules/security.md (higher than acsready's footnote — acsready
cut endorsements precisely for this reason).

# Your task for Phase 1 (Discovery)

Pressure-test and finalize @docs/01-discovery.md: the problem statement,
the ICP persona (the independent CFI as buyer) + the student as a free
secondary user + anti-personas, the in-scope V1 feature list (traceable
to product-research.md sections), the explicit out-of-scope cut list,
the success criteria + funnel + leading indicators, the explicit
EndorseKit ↔ acsready boundary, and the open questions for the founder.
Where you deviate from the research, cite the section and the reason.

When the Discovery artifact is ready: STOP. Summarize what changed, list
the open questions at the bottom of the artifact, and ask the founder to
approve advancing to Phase 2 (Architecture). Do not auto-advance.
```
