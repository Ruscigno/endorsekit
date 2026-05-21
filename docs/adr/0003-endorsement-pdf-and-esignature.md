# 0003. Endorsement PDF — pure-Go server-side rendering; e-signature is a typed-name affirmation bound to the sealed content

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

Issuing an endorsement produces a PDF — the artifact emailed to the
student and the human-readable form of the legal record. Two coupled
decisions must be made:

1. **How is the PDF rendered?** It must be deterministic (the same
   sealed record always produces the same document), it must render from
   the *sealed* endorsement data (not a fresh, possibly-divergent
   assembly), and the renderer must fit EndorseKit's deployment — a Go
   service in a `distroless/static` image on Cloud Run.
2. **What is the CFI's signature?** The CFI "signs on their phone." The
   signature must be **attributable** (provably the CFI's), **bound** to
   the exact endorsement content it signs, and **simple enough to build
   in V1** without a drawing-canvas's edge cases (touch vs mouse,
   image-size handling, blank-signature detection).

Both are part of the legal-record contract from
[ADR-0002](0002-endorsement-record-immutability.md): the signature is
one of the material fields the seal covers, and the PDF is the
human-readable rendering of the sealed row.

## Decision drivers

- **The distroless/static image must stay valid.** A renderer that needs
  cgo, a system library, or a headless Chromium breaks the small,
  no-cgo Cloud Run image and adds a large attack surface.
- **Determinism.** Re-rendering a sealed record (e.g. a CFI re-downloads
  an endorsement a year later) must produce the identical PDF.
- **The signature must be attributable and bound.** It must tie to the
  authenticated CFI (the verified JWT identity, never a request-body
  field) and to the endorsement's content hash — a signature that floats
  free of the content is worthless as evidence.
- **V1 simplicity.** A drawn-signature canvas has real edge cases; the
  V1 build budget (~12 weeks) should not spend a week on signature-image
  plumbing when a simpler approach is legally sound.
- **Legal soundness.** A typed name plus an explicit intent affirmation
  is a recognized form of electronic signature; what matters is intent,
  attribution, and integrity — not that it looks like ink.

## Considered options

### PDF rendering

- **A) Pure-Go PDF library.** Render the PDF in Go with a
  no-cgo library (e.g. a maintained `fpdf`-style library). Deterministic
  layout from the sealed record.
- **B) Headless Chromium / HTML-to-PDF.** Render an HTML template to PDF
  via a headless browser.
- **C) Client-side PDF generation.** Generate the PDF in the browser.

### E-signature

- **D) Typed name + explicit intent affirmation**, captured server-side,
  bound to the content hash and the authenticated CFI identity.
- **E) Drawn-signature image** on a canvas, stored as an image,
  referenced by the record.
- **F) A third-party e-signature provider** (DocuSign-style).

## Decision outcome

**PDF rendering: Option A — a pure-Go PDF library.** The endorsement-PDF
and invoice-PDF renderer lives in `backend/internal/pdf`, uses a
maintained pure-Go (no-cgo) PDF library, and renders deterministically
from the sealed `endorsements` row. The specific library is pinned when
the dependency is first added (a founder-only new-dependency PR); the
constraint is *pure Go, no cgo, actively maintained*. This keeps the
`distroless/static:nonroot` image valid and small and keeps rendering
deterministic and testable.

**E-signature: Option D — a typed-name + explicit intent affirmation,
bound to the sealed content.** When the CFI issues an endorsement they
type their name and confirm an explicit affirmation — e.g. *"I, <name>,
CFI <certificate #>, affirm that I am issuing this endorsement."* The
record stores:

- the **authenticated CFI identity** taken from the verified JWT (never
  from a request-body field),
- a **timestamp**,
- the **signature artifact** (the typed name + the affirmation text +
  the affirmation version),
- the **content hash** of the endorsement the signature is bound to.

The signature artifact is one of the material fields
[ADR-0002](0002-endorsement-record-immutability.md)'s seal covers, so
the signature and the content are cryptographically bound: the signed
content cannot change after signing without breaking the seal.

A **drawn-signature image (Option E) is deferred to V1.1** as a
presentation nicety — it can be added as an additional signature artifact
without changing the legal model.

### Positive consequences

- The Cloud Run image stays `distroless/static`, small, no-cgo, low
  attack surface.
- PDF rendering is deterministic and unit-testable.
- The signature is attributable (JWT identity), bound (content hash),
  and legally sound (typed name + explicit intent) — without a
  drawing-canvas's edge cases.
- No third-party e-signature dependency, no per-signature cost.

### Negative consequences

- A typed-name affirmation looks less "signature-like" than ink — a
  cosmetic, not a legal, shortfall. V1.1's drawn-signature image closes
  the cosmetic gap.
- The chosen pure-Go PDF library may have layout limitations vs an
  HTML/CSS renderer. Acceptable — an endorsement is a short, structured
  document, not a designed brochure.

## Pros and cons of each option

### PDF — A) pure-Go library (chosen)

- 👍 Keeps the distroless/static image valid; deterministic; testable.
- 👎 Less layout flexibility than HTML/CSS.

### PDF — B) headless Chromium

- 👍 Rich HTML/CSS layout.
- 👎 A large binary + a big attack surface; breaks the static image;
  slow cold starts. Overkill for a one-page legal document.

### PDF — C) client-side generation

- 👍 No server CPU.
- 👎 The legal artifact would be assembled in an untrusted environment,
  divorced from the sealed record. Unacceptable for a legal document.

### E-signature — D) typed name + affirmation (chosen)

- 👍 Attributable, bound to content, legally sound, simple to build.
- 👎 Less visually "signature-like".

### E-signature — E) drawn-signature image

- 👍 Looks like a signature.
- 👎 Canvas edge cases (touch/mouse, sizing, blank detection); an image
  alone is weaker evidence than a JWT-attributed affirmation unless also
  bound to the content. Better as a V1.1 add-on artifact.

### E-signature — F) third-party provider

- 👍 Strong audit trail, familiar UX.
- 👎 A new external dependency + per-signature cost; over-engineered for
  a CFI signing their own endorsement; against free-tier discipline.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §2.1
  (the pure-Go PDF constraint), §3.3 (the e-signature), §3.4 (the
  issuance flow).
- Related ADRs: [0001](0001-go-backend-for-endorsements-and-jobs.md)
  (the Go service hosting the renderer),
  [0002](0002-endorsement-record-immutability.md) (the seal the
  signature is bound into).
- External: AC 61-65 (endorsement templates), 14 CFR 61.189
  (recordkeeping). General electronic-signature soundness: intent +
  attribution + integrity.
