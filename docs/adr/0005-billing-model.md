# 0005. Billing model — a flat CFI subscription, no per-transaction fee

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

EndorseKit must decide how it makes money. Two facts shape the choice:

1. The **CFI is the paying customer** — EndorseKit is a tool the CFI
   uses to run their business.
2. EndorseKit also sits in the path of the **CFI's money** — via Stripe
   Connect ([ADR-0004](0004-stripe-connect-invoicing.md)) it helps the
   CFI invoice students. A platform in that position *can* take an
   `application_fee` on every CFI→student charge.

So there are two distinct monetization levers: a **subscription** the
CFI pays, and a **per-transaction fee** skimmed from student payments.
Which does EndorseKit V1 use — one, the other, or both? The research
(§5 Opportunity 3) frames the product as "a single $12–15/mo
subscription," but the decision should be made explicitly, because once
billing ships, changing it is disruptive.

## Decision drivers

- **The research's framing.** Opportunity 3 is explicitly "a single
  $12–15/mo subscription that replaces three tools." The pitch is a
  predictable, tax-deductible monthly cost — not a cut of the CFI's
  income.
- **Trust.** Independent CFIs are price-sensitive and protective of
  thin margins (research §5). A tool that skims a percentage of every
  lesson payment reads as a tax on their livelihood; a flat subscription
  reads as a business expense they control.
- **Simplicity of build and of the mental model.** A flat subscription
  is one Stripe Billing integration. An `application_fee` adds
  reconciliation, fee disclosure, and a more complex Connect charge
  model — for revenue that, at a $12 subscription's scale, is marginal.
- **Stripe terms + competitive framing.** "Keep 100% of what you charge
  your students" is a clean, honest marketing line. Per-transaction
  skimming invites comparison to Pilot Partner CFI Pay's "free + 3.9% +
  $0.50."
- **Optionality.** A flat subscription does not foreclose a future
  usage-based tier; the reverse (un-skimming after CFIs are used to it)
  is far harder.

## Considered options

1. **Flat subscription only; no `application_fee`.** The CFI pays
   $12/mo (or $120/yr). Student invoicing via Connect takes no platform
   fee — the CFI keeps 100% minus Stripe's own processing fee.
2. **Per-transaction `application_fee` only; no subscription.** The
   product is "free"; EndorseKit takes a cut of every student payment.
3. **Both — a (lower) subscription plus an `application_fee`.**
4. **Freemium — a free tier plus a paid subscription.**

## Decision outcome

Chosen option: **Option 1 — a flat subscription, no `application_fee`.**

- **Pricing:** $12/mo or $120/yr (the annual offer at a ~17% discount).
  $12 is the bottom of the research's $12–15 band — chosen to win the
  price-sensitive independent CFI; the annual price gives a reason to
  commit. The subscription is tax-deductible for the CFI as a business
  expense.
- **The Connect path takes no `application_fee`.** When a student pays a
  CFI's invoice, the CFI keeps 100% of the amount minus Stripe's own
  standard processing fee. EndorseKit's marketing line is honest: *"keep
  everything you charge your students."*
- **No permanent free tier.** A free tier sets a $0 anchor for the whole
  category (research §8) and the marginal free user is unlikely to
  convert. V1 uses a **time-boxed trial** instead; the exact trial
  length and the paywall trigger are a Phase 1 decision (see
  `docs/01-discovery.md` open questions) — the *model* (trial → flat
  paid subscription, no free tier, no skim) is what this ADR fixes.

Introducing an `application_fee` later, or a usage-based tier, is a
**billing-model change that supersedes this ADR** and is a founder-only
decision.

### Positive consequences

- A predictable, controllable, tax-deductible cost — exactly the pitch
  research §5 frames.
- "Keep 100% of what you charge your students" is a clean trust signal
  and a competitive differentiator.
- The simplest billing build: one Stripe Billing integration on the
  platform account; the Connect path needs no fee logic, no fee
  disclosure, no fee reconciliation.
- Revenue is predictable MRR, not a function of how much each CFI
  invoices — easier to forecast for a solo founder.

### Negative consequences

- EndorseKit leaves per-transaction revenue on the table. At a $12
  subscription this is an acceptable trade for trust and simplicity; the
  research's unit economics (1–2% of 30–50k independent CFIs at $12–15)
  already work on subscription alone.
- A flat fee is the same for a CFI who invoices $200/mo and one who
  invoices $5,000/mo — no value-based price capture. Acceptable for V1;
  a usage-based tier is a deliberate post-PMF option.

## Pros and cons of each option

### Option 1 — flat subscription, no fee (chosen)

- 👍 Matches the research framing; trust-building; simplest build;
  predictable MRR.
- 👎 Leaves per-transaction revenue on the table.

### Option 2 — `application_fee` only, no subscription

- 👍 "Free to start" lowers the signup barrier.
- 👎 Revenue depends on CFI invoice volume — unpredictable; the skim
  reads as a tax on the CFI's livelihood; invites the Pilot-Partner-style
  "free + %" comparison; contradicts the research's subscription pitch.

### Option 3 — both

- 👍 Two revenue levers.
- 👎 The most complex build and the worst trust optics — a CFI pays a
  subscription *and* gets skimmed. Combines the downsides.

### Option 4 — freemium

- 👍 A free tier can aid acquisition.
- 👎 A free tier sets a $0 category anchor (research §8); the free user
  rarely converts; more product surface to gate. A time-boxed trial
  achieves the acquisition benefit without the anchor.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §5
  (Opportunity 3 — the subscription framing), §9.4 (pricing).
- Related ADRs: [0004](0004-stripe-connect-invoicing.md) (the Connect
  integration this ADR decides takes no fee).
- External: research §5 Opportunity 3 (the $12–15/mo subscription
  framing) and §8 (the free-tier-sets-a-$0-anchor argument).
