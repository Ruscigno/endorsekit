# 01 — Discovery

> **Status: DRAFT — awaiting founder review. No founder approval is
> recorded.** This artifact restates problem, users, scope, success
> criteria, and open questions in a form the rest of the team (and
> future Claude sessions) can scan in five minutes. Source of truth:
> [docs/product-research.md](product-research.md). Where this file
> deviates from the research it cites the section + reason.

## Goal

Give an independent Certificated Flight Instructor one tool that does
the four jobs they currently glue together by hand — **take a booking,
issue and keep an endorsement, remember where each student is, and get
paid** — so the CFI spends their evenings teaching, not reconciling
spreadsheets, and never loses an endorsement record the FAA can ask for.

## What this product does

- A **Hobbs/Tach-aware booking page** — a public, Calendly-style page a
  CFI shares; students book ground/flight/sim lessons; the CFI confirms.
- **Endorsement issuance** — the CFI picks an AC 61-65 reference,
  EndorseKit autofills their certificate number/expiry, the CFI signs on
  their phone, the server emails a PDF to the student and stores the
  record.
- An **append-only, searchable, exportable endorsement registry** — the
  CFI's system of record for the 3-year retention 14 CFR 61.189 /
  AC 61-65 require.
- A **lightweight student CRM** — the CFI's roster: contact, certificate
  target, an ACS-progress checklist, a training-hour tally, and a
  re-engagement nudge.
- **Stripe-connected invoicing** — the CFI invoices students with
  aviation line items; the money lands in the CFI's own account.

## What this product does NOT do

- It is **not a flight-school back office** (no multi-CFI scheduling, no
  Part 141 records, no fleet scheduling, no school billing).
- It is **not a student-side training journal** — the student CRM is the
  *CFI's* roster view; a student-owned ACS journal is the sibling
  `acsready`.
- It is **not the CFI's personal logbook** and does not track the CFI's
  own currency.
- It does **not file 8710 / IACRA applications** and does not transmit
  anything to the FAA.
- See the full V1 cut list below and [product-research.md](product-research.md)
  §5.4.

## Problem

An independent CFI — a certificated flight instructor who is not on a
flight school's staff, who often teaches in the student's own aircraft,
and who carries their own roster of DPE-track students — is running a
**small business**. That business has four recurring jobs, and today the
CFI does each with a different consumer tool that knows nothing about
aviation:

1. **Scheduling.** The CFI sends students a **Calendly** link. Calendly
   knows nothing about Hobbs/Tach time, ground vs. flight vs. sim
   lessons, or a weather-cancellation policy. The CFI re-explains
   aviation context every time.
2. **Endorsements.** The CFI issues endorsements — solo, solo
   cross-country, knowledge test, practical test, flight review, IPC —
   and is **legally required to keep a record of every one for at least
   3 years** (14 CFR 61.189, AC 61-65). Today the CFI prints endorsement
   templates from a free website (wifiCFI), writes them by hand into a
   student's logbook, and keeps their own record in a **Google Sheet**
   or a notebook — or doesn't keep one at all. ForeFlight has
   endorsement tools, but they live behind a ForeFlight Logbook + Pro
   Plus subscription and are built for the CFI's *own* logbook, not as a
   business system of record.
3. **Knowing where each student is.** The CFI tracks each student's
   progress against the ACS — what's introduced, what's ready for the
   checkride — and which students have gone quiet — in their head, in a
   notebook, or in another **Google Sheet**.
4. **Getting paid.** The CFI invoices students through **Stripe** raw,
   or PayPal, or cash/check — with no aviation-aware line items and no
   link back to the lessons they taught.

The defects are shared across all four: the tools are **consumer-generic,
not aviation-literate**, they are **disconnected** (the booking, the
endorsement, the progress note, and the invoice for the same lesson live
in four places), and — most seriously — the **endorsement record, a
legal document, lives in an editable spreadsheet** with no integrity, no
backup discipline, and no guarantee it will still exist in 3 years.

EndorseKit's wedge is being the **single, aviation-literate business OS
for the independent CFI**: one $12/mo subscription that does all four
jobs, knows what a Hobbs reading and an AC 61-65 reference are, and
treats the endorsement registry as the first-class legal record it
legally must be.

### Existing tools and why they don't fit

- **Calendly + Stripe + Google Sheets** — the de-facto stack. Each tool
  works, but none speak aviation, none connect to each other, and the
  spreadsheet is a fragile home for a legal record.
- **Flight Schedule Pro / FlightCircle / Aviatize** — built for *flight
  schools*: multi-CFI scheduling, fleet management, Part 141 records,
  school billing. Overkill and mis-shaped for a solo independent CFI;
  priced for schools.
- **Pilot Partner CFI Dashboard / CFI Pay** — free, but bundled into a
  logbook product the CFI's students may not use, and CFI Pay skims
  3.9% + $0.50 per transaction.
- **ForeFlight CFI tools** — require the CFI's students to be on
  ForeFlight; designed around the CFI's own logbook, not a business
  back-office.
- **wifiCFI** — gives away free endorsement-template PDFs, but it is a
  template printer, not a registry, not a business tool.

EndorseKit does not compete with a logbook or a flight school. It is the
**business layer** the independent CFI has never had a purpose-built
tool for.

## Boundary — what EndorseKit is NOT (and which sibling it is not)

This is load-bearing because a sibling product in the same portfolio is
adjacent:

- **EndorseKit is not `acsready`.** ACSReady is a **student-side** ACS
  training journal — the *student* is the buyer, the student logs their
  own progress against the FAA ACS task-by-task with debriefs and
  chair-fly notes, and the CFI is a *free guest* with a read-only
  comment view. EndorseKit is the inverse: the **CFI is the buyer**, and
  the student is a free, unauthenticated user who books lessons and
  receives endorsement PDFs. EndorseKit's student CRM + ACS-progress
  checklist is the **CFI's lightweight roster view of their students** —
  a coarse "introduced / in progress / ready" checklist, an hour tally,
  a re-engagement nudge. It must **not** grow into a full student-owned
  training journal with per-element debriefs, photo uploads, or a
  student login — that is `acsready`'s product. The structural line that
  holds the boundary: **the student never gets an authenticated account
  in EndorseKit.** A student touches EndorseKit only through
  unauthenticated, signed-token surfaces (the booking page, the
  endorsement-PDF link).
  - Note: ACSReady deliberately **cut** endorsement / 8710 generation as
    out-of-scope, explicitly because of its regulatory liability.
    EndorseKit **legitimately owns** endorsement issuance — and it takes
    the regulatory care that demands seriously: the registry is
    append-only, sealed, and hash-chained ([ADR-0002](adr/0002-endorsement-record-immutability.md)).
- **EndorseKit is not a flight school back office.** It is for the *solo
  independent CFI*. Multi-CFI scheduling, fleet management, Part 141
  training records, and school billing are out of scope (research §5.4).
- **EndorseKit is not the CFI's personal logbook** and does not track
  the CFI's own flight currency. MyFlightbook / ForeFlight own that.

## Users

### Primary persona (the buyer): "Mike the independent CFI"

- US-based, 25–55, holds a CFI certificate (often CFII). Not on a flight
  school's staff. Per Skyfarer Academy data, ~53% of veteran CFIs
  operate independently and ~63% of independent CFIs teach in the
  customer's aircraft — so Mike has **no flight-school back office at
  all**.
- Carries a roster of 3–10 active students at a time, on the
  Private / Instrument / Commercial track.
- Runs his CFI work as a side or primary business; his time is billable
  (often $60–100/hr), so admin time is lost income.
- Today runs on **Calendly + Stripe + a Google Sheet (or two)** and
  prints endorsement templates from a free website.
- Has had at least one "where's the record of that solo endorsement I
  signed last spring?" moment, and knows — uneasily — that the FAA can
  ask for those records for 3 years.
- Will pay **$12/mo** (tax-deductible as a business expense) for a tool
  that does all four jobs and is aviation-literate — *if* the mobile UX
  is faster than his current three-tool workflow.

### Secondary user (free, not the buyer): "Sara the student"

- Mike's student. She is **not a paying account and never logs in.**
- She interacts with EndorseKit only through three unauthenticated,
  signed-token surfaces: the **public booking page** (she books a
  lesson), the **booking-confirmation page**, and the **endorsement-PDF
  download link** (she receives her endorsement).
- EndorseKit's value to Sara is incidental — a smoother booking, a clean
  PDF of her endorsement she can keep. She is not who the product is
  designed, priced, or marketed for. Keeping her unauthenticated is the
  deliberate structural line that prevents EndorseKit from drifting into
  `acsready`'s student-side territory.

### Jobs to be done (ranked by trigger frequency, from Mike's side)

1. **After a lesson, at the airport:** "Issue the endorsement we just
   earned and make sure the record is kept." → pick the AC 61-65
   reference, autofill, sign on the phone, the student gets the PDF.
2. **Recurring, passively:** "Don't let me forget tomorrow's lesson, and
   tell me which students have gone quiet." → the daily reminder + the
   re-engagement nudge.
3. **When a student wants to book:** "Let them pick a slot without a
   back-and-forth." → share the booking page.
4. **Monthly / per-lesson:** "Invoice the student for what we flew." →
   create an invoice with aviation line items; get paid into my account.
5. **Before a lesson or a checkride:** "Where is this student against
   the ACS?" → the roster's progress checklist.
6. **Occasionally / under pressure:** "An FAA inspector / the student
   asked for an endorsement record." → search the registry, export it.

### Anti-personas (who we are NOT serving in V1)

- **Flight schools / Part 141 operators.** Multi-CFI scheduling, fleet
  management, and school records are a different product (Flight
  Schedule Pro). EndorseKit is for the solo CFI.
- **The student as a paying customer.** The student is a free,
  unauthenticated secondary user. The product, pricing, and copy address
  Mike, not Sara. A student wanting a training journal is `acsready`'s
  customer.
- **CFIs wanting a personal logbook or currency tracker.** MyFlightbook /
  ForeFlight own the logbook; the CFI's own currency is a different
  product (`currency-hub`).
- **Non-US CFIs.** EndorseKit implements the FAA's AC 61-65 / 14 CFR
  Part 61 framework. EASA / Transport Canada are different; V1 ignores
  them.
- **CFIs wanting EndorseKit to file 8710s / talk to the FAA.**
  EndorseKit issues endorsements and keeps records; it does not transmit
  to the FAA.

## In scope (V1)

The full feature list lives in [product-research.md](product-research.md)
§5.1; reproduced here for at-a-glance reading. Each row traces to a
research section.

| #   | Feature                                                          | Research § |
| --- | ---------------------------------------------------------------- | ---------- |
| 1   | Self-serve CFI signup (email/password, magic link, Google)       | §5.1 #1    |
| 2   | Onboarding (name, FAA cert number + expiry, home airport, booking slug) + the disclaimer ack | §5.1 #2 |
| 3   | Lesson types (ground / flight / sim, duration, rate)             | §5.1 #3    |
| 4   | Booking availability                                             | §5.1 #4    |
| 5   | Public, Hobbs/Tach-aware booking page                            | §5.1 #5    |
| 6   | Booking management (confirm / cancel / complete; record Hobbs/Tach) | §5.1 #6 |
| 7   | Student CRM — the CFI's roster                                   | §5.1 #7    |
| 8   | ACS-progress checklist per student                               | §5.1 #8    |
| 9   | Training-hour tally + last-flown re-engagement nudge             | §5.1 #9    |
| 10  | The AC 61-65 endorsement template catalog                        | §5.1 #10, §4.4 |
| 11  | Endorsement issuance (pick → autofill → sign → seal → store → PDF) | §5.1 #11, §3.3 |
| 12  | The append-only, searchable endorsement registry                 | §5.1 #12, §3.3 |
| 13  | Endorsement registry export                                      | §5.1 #13   |
| 14  | Server-side endorsement-PDF generation + signed download link    | §5.1 #14   |
| 15  | Stripe Connect onboarding for the CFI                            | §5.1 #15   |
| 16  | Invoicing — student invoices with aviation line items            | §5.1 #16   |
| 17  | Daily booking/lesson reminder cron + reminder emails             | §5.1 #17, §3.4 |
| 18  | Stripe Checkout (the CFI's own subscription) + Customer Portal   | §5.1 #18   |
| 19  | Paywall                                                          | §5.1 #19   |
| 20  | PWA installability                                               | §5.1 #20   |
| 21  | Mobile-responsive everything                                     | §5.1 #21   |
| 22  | Legal pages + the aviation-disclaimer surfaces                   | §5.1 #22   |

V1 architecture is per [CLAUDE.md](../CLAUDE.md)'s load-bearing block:
a SvelteKit web tier + a Go backend service, both on Cloud Run; a single
Supabase project for data + auth; R2 for server-generated documents;
Stripe Checkout for the CFI's subscription + Stripe Connect for the
CFI's invoicing of students; Resend for email; Cloud Scheduler for the
daily cron. The formal calls are [ADR-0001](adr/0001-go-backend-for-endorsements-and-jobs.md)
through [ADR-0005](adr/0005-billing-model.md).

## Explicitly out of scope (V1)

Reproduced from [product-research.md](product-research.md) §5.4. This is
a **refusal list**, not a backlog. Adding any of these in V1 requires a
founder override + an ADR superseding the row.

| Cut                                                | Reason                                                          |
| -------------------------------------------------- | --------------------------------------------------------------- |
| A flight-school back office (multi-CFI, Part 141, fleet, school billing) | EndorseKit is for the solo independent CFI |
| A full student-side training journal               | The CRM is the CFI's roster view; a student journal is `acsready` |
| An LMS / course-content hosting                    | Sporty's / King / Gleim own training content                   |
| The CFI's personal logbook / currency tracking     | MyFlightbook / ForeFlight own the logbook                      |
| 8710 / IACRA application filing                     | EndorseKit keeps records; it does not transmit to the FAA        |
| Inventing or editing endorsement wording           | EndorseKit ships the FAA's published AC 61-65 text              |
| Mutating or deleting an issued endorsement         | The registry is append-only (ADR-0002); a correction supersedes |
| A Stripe `application_fee` on student invoices     | V1's model is a flat subscription (ADR-0005)                   |
| EndorseKit as merchant of record for a lesson      | The CFI is paid via their own connected account                 |
| SMS notifications                                  | Twilio A2P 10DLC is a multi-week external dependency            |
| Web Push                                           | Service-worker push + iOS gating; V1.1                          |
| Native iOS / Android app                           | PWA covers 95% of need                                          |
| ML / AI features                                   | No ML component → no Python service in V1                       |
| A student login / student-owned authenticated account | The student is a signed-token user; an account drifts toward acsready |
| A social feed / community / CFI marketplace        | Cannot be moderated solo; a marketplace is a multi-year problem |

### Cuts I'd surface as additions to the research's list

None at this phase. The research §5.4 cut list is comprehensive. The one
item to *watch* (not cut) is a **student-facing read-only "your training
so far" summary** — research §5.2 parks it in V1.1 and flags that it
must be carefully scoped so it does NOT become a training journal.
Discovery agrees: it stays a V1.1 item, gated behind that scoping care.

## Success criteria

### Activation funnel (instrumented in PostHog from M3)

```
Visit landing  →  CFI signs up  →  Completes onboarding (cert# + booking slug)
   │                                       │
   ▼                                       ▼
First lesson type configured  →  First student added to the roster
   │                                       │
   ▼                                       ▼
First booking received  →  First endorsement issued  ← the "aha" moment
   │                                       │
   ▼                                       ▼
Stripe Connect onboarded  →  First invoice sent
   │
   ▼
Paywall hit (trigger TBD — Q3)  →  Stripe Checkout  →  Paid (monthly / annual)
```

The **first endorsement issued** is the activation "aha" — it is the job
no other tool does well, and it is what makes the registry start
compounding.

### Leading indicators (PostHog events to ship in M3+)

- `endorsement.issued` (with `template_id`) — the core activation event.
- `booking.received` / `booking.confirmed` — the scheduling-loop signal.
- `student.added` — the roster-adoption signal.
- `registry.searched` / `registry.exported` — the signal a CFI relies on
  EndorseKit as their system of record.
- `connect.onboarding_completed` — the invoicing-readiness signal.
- `invoice.sent` / `invoice.paid` — the get-paid-loop signal.
- `paywall.hit` / `upgrade.completed` (with `plan`).

### Cohort gates (what success looks like)

| Phase        | Gate                                                              |
| ------------ | ----------------------------------------------------------------- |
| Beta         | 10–15 independent CFIs from the founder's network; ≥ 60% issue at least one endorsement |
| Launch       | First paid CFI within 7 days of the r/CFI launch post            |
| 90 days      | 25 paying CFIs; ≥ 50% have issued ≥ 5 endorsements (registry stickiness) |
| 180 days     | ~$1k MRR equivalent (mix of monthly + annual)                     |
| 365 days     | PMF signal OR a deliberate sunset/pivot decision                  |

### Counter-metrics worth watching

- **Endorsement-PDF email deliverability / spam rate.** An endorsement
  PDF in a student's spam folder is a real product failure. Watch
  Resend's bounce/complaint webhook.
- **Wrong-endorsement / registry-integrity reports.** Any report of a
  wrong or missing endorsement record is a P0; target zero.
- **Stripe Connect onboarding drop-off.** If CFIs start but don't finish
  Connect onboarding, the invoicing value prop is broken — re-think the
  onboarding UX before scaling acquisition.
- **Time-to-first-endorsement.** The longer it takes a new CFI to issue
  their first endorsement, the weaker activation — instrument it.

## Open questions for the founder

These need a founder decision before Phase 2 (Architecture) is locked.
They are also tracked in [journal/open-questions.md](../journal/open-questions.md).

### Q1 — Is invoicing in V1, or a fast-follow?

Research §5 explicitly says "V1 can ship without invoicing if needed."
Booking + endorsements + the registry + the CRM are the irreducible
core; Stripe Connect onboarding + the invoice surface is a meaningful
build (milestone M6, weeks 7–8 in the §6 plan).
**Recommended:** keep invoicing in V1 but sequenced **last** — so if the
~12-week budget slips, invoicing is the clean cut to a fast-follow and
the product still ships its core four jobs. Founder confirm.

### Q2 — Is a minimal student-facing surface in V1, or V1.1?

Beyond the booking page and the endorsement-PDF link, should a student
get a read-only "your training so far" page in V1?
**Recommended:** no — V1's student surfaces are exactly the booking page,
the booking-confirmation page, and the endorsement-PDF link. A
student-facing summary is V1.1 and must be carefully scoped so it never
becomes a training journal (the `acsready` boundary). Founder confirm.

### Q3 — Free trial vs. the exact paywall trigger.

ADR-0005 fixes the *model* (a time-boxed trial → a flat paid
subscription, no free tier). The trial length and the paywall trigger
are still open.
**Recommended:** a 14-day full trial, no credit card, then the paywall —
simplest predicate, and 14 days lets a CFI run a couple of real lessons
and issue a real endorsement before deciding. Founder confirm.

### Q4 — V1 pricing point ($12 vs $15 monthly).

Research §5 gives a $12–15/mo band; ADR-0005 / the draft pick $12/mo +
$120/yr.
**Recommended:** $12/mo + $120/yr — the bottom of the band to win the
price-sensitive independent CFI, with the annual offer at a ~17%
discount. Founder confirm.

### Q5 — E-signature approach for V1.

ADR-0003 proposes a typed-name + intent affirmation bound to the sealed
content; a drawn-signature image is V1.1.
**Recommended:** ship the typed-name + affirmation in V1 — legally
attributable, no drawing-canvas edge cases. Founder confirm (this is an
ADR ratification, see below).

### Q6 — Domain choice.

`endorsekit.app` (new registration, ~$10/yr) vs
`endorsekit.tickerbeats.com` (subdomain of an existing zone, $0). The
public booking page is a customer-facing URL the CFI shares with their
students.
**Recommended:** register `endorsekit.app` — this is the one product in
the portfolio whose public URL is shown to the paying customer's
customers; a clean apex domain reads professionally and is worth ~$10/yr.
Founder confirm (also F-01 in `founder-actions.md`).

### Q7 — Which AC 61-65 revision does the template catalog transcribe?

The endorsement-template catalog must be transcribed from a specific,
named AC 61-65 revision (current series ~J), with a refresh process for
future revisions.
**Recommended:** transcribe the AC 61-65 revision in force on the
transcription date, record the revision letter in the seed file header,
and treat a future revision as a tracked maintenance task. Founder
confirm the revision to use.

---

## Reminders carried into Phase 2

- The five ADRs (`0001`–`0005`) are `Status: proposed`. Phase 2's first
  action is the founder ratifying them `proposed → accepted` and
  updating CLAUDE.md's load-bearing block to reflect the ratified state.
- The data model in research §4.2 is concrete enough to migrate from on
  day one of Phase 5; Phase 2 reviews it once for `pgx`/`sqlc`
  compatibility — and especially for the **`endorsements` table's
  append-only enforcement** (withheld grants + trigger + INSERT/SELECT-
  only RLS).
- The cross-tenant isolation regression test — covering **both** the RLS
  layer and the Go-backend owner-predicate layer, **and** the
  endorsement-PDF signed-token replay case — is the single most
  important test in the suite. Phase 3 spec must call it out as a
  top-priority acceptance test.
- The endorsement registry's seal + hash chain is the product's
  legal-record guarantee — Phase 4's plan must budget real time for it
  and its tamper-detection test, not treat it as wiring.
- The Stripe **platform-vs-connected-account boundary** is a load-bearing
  correctness property — Phase 2's STRIDE pass and Phase 3's spec must
  both treat it explicitly.

---

**Phase 1 status: DRAFT — not founder-approved.** This artifact, and the
draft `02-architecture.md` / `03-spec.md` / `04-plan.md` produced
alongside it during the Phase 0 bootstrap, are review drafts. Phase 2
work is blocked until the founder approves this Discovery artifact and
answers Q1–Q7.
