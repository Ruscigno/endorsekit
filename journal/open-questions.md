# Open questions for the founder

Append-only queue. Each question carries a default-decision-by date so
work is never blocked waiting on an answer. Format:

```
## YYYY-MM-DD — <one-line question>
Context: <one sentence>
Default (if no answer by YYYY-MM-DD): <what I'll do absent input>
```

---

## 2026-05-21 — Domain choice for EndorseKit

Context: the app, email sender, R2 public hostname, public booking-page
URLs, and endorsement-PDF links all need a stable hostname —
`endorsekit.app` (new registration) vs `endorsekit.tickerbeats.com`
(subdomain of an existing zone). A CFI's public booking page is a
marketing surface their students see — a clean apex domain reads more
professional than a subdomain.
Default (if no answer by F-01 execution): register `endorsekit.app` —
the booking page is customer-facing and worth the ~$10/yr; this is the
one product in the portfolio where the public URL is shown to the
paying customer's customers.

## 2026-05-21 — V1 pricing point ($12 vs $15 monthly) + annual

Context: research §5 Opportunity 3 gives a $12–15/mo band; the draft
product-research.md picks $12/mo. Pricing is a founder call.
Default (if no answer by Phase 3 sign-off): $12/mo + $120/yr (annual at
a ~17% discount, slightly under the research's stated $144 to make the
annual offer compelling). No `application_fee` on the Connect path.

## 2026-05-21 — Does the platform take an application_fee on student invoices?

Context: Stripe Connect lets the platform skim an `application_fee` on
each CFI→student charge. V1's billing model is a flat subscription, so
the draft takes no fee — the CFI keeps 100% (minus Stripe's own
processing fee). A per-transaction fee is a different, usage-based
business model.
Default (if no answer by Phase 2 sign-off): no `application_fee` in V1 —
flat subscription only (recorded in ADR-0005). Revisit post-PMF.

## 2026-05-21 — Is invoicing in V1 scope, or a fast-follow?

Context: research §5 says "V1 can ship without invoicing if needed."
Stripe Connect onboarding + the invoice surface is a meaningful build
(it is milestone M6 in the draft plan). Booking + endorsements +
registry + CRM are the irreducible core.
Default (if no answer by Phase 1 sign-off): keep invoicing in V1 but as
the LAST milestone (M6) — so if the ~10-12 week budget slips, invoicing
is the clean cut line and the product still ships its core four jobs.

## 2026-05-21 — E-signature approach for endorsements

Context: the CFI signs an endorsement on their phone. Options range
from a drawn-signature image, to a typed-name + explicit intent
affirmation, to a more formal e-signature standard. This is a
legal-record decision (see ADR-0003).
Default (if no answer by Phase 2 sign-off): typed-name + an explicit
"I, <name>, CFI <cert#>, affirm I am issuing this endorsement"
affirmation, bound to the sealed content hash and the authenticated CFI
identity — simplest to build, legally attributable, no drawing-canvas
edge cases. A drawn-signature image is a V1.1 nicety.

## 2026-05-21 — Endorsement-PDF link lifetime for students

Context: the student receives a signed link to download their
endorsement PDF. A student may want to retrieve it months later (e.g.
for a checkride). A long-lived link is convenient but a larger exposure
window; a short-lived one is safer but may frustrate.
Default (if no answer by Phase 3 sign-off): the emailed link is valid
for 1 year (an endorsement is often needed at a checkride months out),
HMAC-signed and scoped to exactly one record; the PDF is also
re-sendable by the CFI from the registry at any time.

## 2026-05-21 — Which AC 61-65 revision does the template catalog transcribe?

Context: AC 61-65 is revised periodically (current series letter ~J).
The endorsement template catalog must be transcribed from a specific,
named revision, and a process is needed to refresh it when the FAA
publishes a new one.
Default (if no answer by Phase 2 sign-off): transcribe the current
AC 61-65 revision in force on the transcription date, record the
revision letter in the seed file header, and treat a future revision
as a tracked maintenance task (a new seed version + an opt-in migration
for CFIs).
