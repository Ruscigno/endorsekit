# 0004. CFI→student invoicing uses Stripe Connect with Standard accounts; EndorseKit is the platform, never merchant of record

- Status: proposed
- Date: 2026-05-21
- Deciders: founder (draft — awaiting approval)

## Context and problem statement

EndorseKit lets an independent CFI invoice their students for lessons.
The student pays by card; the money must reach the **CFI**, not
EndorseKit. EndorseKit also bills the CFI for the CFI's own $12/mo
subscription. These are **two different money flows** and conflating
them is a serious defect:

- If a student's lesson payment ever landed in EndorseKit's own Stripe
  balance, EndorseKit would be the **merchant of record** for flight
  instruction — taking on tax, chargeback, and refund liability for a
  service it does not provide, and almost certainly violating Stripe's
  terms and tax law.
- The CFI needs the money to settle to *their* account on Stripe's
  payout schedule, and needs Stripe to handle *their* identity / tax
  onboarding (1099-K, etc.) — EndorseKit is a solo product and cannot be
  a payments-compliance department.

Stripe Connect is the standard answer to "a platform where users get
paid." But Connect has several account models (Standard, Express,
Custom) and charge models (destination charges, separate charges &
transfers, direct charges) with materially different liability,
onboarding-effort, and UX consequences. Which combination does
EndorseKit use for V1?

## Decision drivers

- **EndorseKit must never be merchant of record for a lesson.** The
  money flow must be unambiguously the CFI's.
- **Onboarding compliance must be Stripe's job, not EndorseKit's.** A
  solo founder cannot own KYC, tax reporting, and dispute handling for
  every CFI.
- **The CFI is a real small business.** A CFI invoicing students is
  running a business; many will already have, or want, a real Stripe
  account and dashboard.
- **Build cost.** Connect onboarding + the invoice surface is already a
  meaningful chunk of the V1 budget; the account model chosen should
  minimize the bespoke UI EndorseKit must build.
- **The billing model is a flat subscription** (see
  [ADR-0005](0005-billing-model.md)) — V1 takes no per-transaction cut,
  which simplifies the charge model.

## Considered options

### Account type

- **A) Standard accounts.** The CFI has (or creates) a full Stripe
  account; Stripe owns onboarding, the dashboard, disputes, and
  payouts. EndorseKit connects to it.
- **B) Express accounts.** Stripe-hosted onboarding, a lightweight
  Stripe-hosted dashboard; the platform carries more responsibility for
  the account's activity.
- **C) Custom accounts.** EndorseKit builds the entire onboarding and
  dashboard UX and owns the most platform liability.

### Charge model

- **D) Destination charges** — the charge is created on the platform
  account with a `transfer_data[destination]` to the connected account.
- **E) Direct charges on the connected account** — the charge is created
  *on* the connected account (`Stripe-Account` header); the connected
  account is the merchant of record.
- **F) Separate charges and transfers.**

## Decision outcome

Chosen: **Standard accounts (Option A) with direct charges on the
connected account (Option E).**

- Each CFI onboards a **Standard** connected account. EndorseKit starts
  a Stripe-hosted **account link**; Stripe owns the entire KYC / tax /
  identity onboarding and gives the CFI a full Stripe dashboard. The CFI
  is a real Stripe merchant.
- A student **invoice / charge is created directly on the CFI's
  connected account** (the API call carries the `Stripe-Account` header
  / account scoping). The connected account is the merchant of record;
  the funds are the CFI's; Stripe pays them out on the CFI's schedule.
- EndorseKit's role is purely the **platform**: it starts onboarding,
  reads onboarding status from `account.updated` / `capability.updated`
  webhooks, and creates invoices on the CFI's behalf via the connected
  account. EndorseKit stores only IDs (`stripe_account_id`,
  `stripe_invoice_id`, `payment_intent_id`) — never card data, never the
  student's money.
- **No `application_fee`** is taken on these charges in V1 — the billing
  model is the flat subscription (ADR-0005). The CFI keeps 100% of what
  the student pays minus Stripe's own processing fee.
- The CFI **cannot send an invoice until onboarding is verified.** The
  `account.updated` webhook drives a persisted `charges_enabled` /
  `payouts_enabled` flag; the UI reflects onboarding status truthfully so
  a CFI never sends an invoice that cannot be paid.
- **Two webhook endpoints, two signing secrets.** Platform-account
  events (the CFI's subscription) and connected-account events (student
  invoices, `account.updated`, `payout.*`) arrive separately; each
  verifies its signature against the raw body.

The CFI's *own subscription* to EndorseKit is unaffected by all of this
— it is ordinary Stripe Checkout + Billing on the **platform** account.

### Positive consequences

- EndorseKit is unambiguously the platform, never merchant of record for
  a lesson — the right tax and liability posture.
- Stripe owns CFI onboarding, KYC, tax reporting, disputes, and the
  dashboard — a solo founder cannot and should not own these.
- Standard accounts mean almost no bespoke onboarding/dashboard UI for
  EndorseKit to build — the smallest V1 surface.
- Direct charges on the connected account make the money flow obvious
  and auditable.

### Negative consequences

- The CFI must complete a Stripe onboarding flow before they can
  invoice — a step EndorseKit cannot shortcut. Mitigated by truthfully
  reflecting onboarding status and treating invoicing as the last V1
  milestone (so it is also the clean slip-buffer).
- Standard accounts give EndorseKit less control over the connected
  account's branding/UX than Express/Custom — acceptable: a CFI running
  a business is well served by a real Stripe dashboard.
- Stripe Connect live-mode review can take longer than ordinary Stripe —
  F-07 starts it early.

## Pros and cons of each option

### Account — A) Standard (chosen)

- 👍 Stripe owns onboarding/KYC/tax/disputes/dashboard; least platform
  liability; least bespoke UI.
- 👎 Less platform control over UX/branding.

### Account — B) Express

- 👍 Stripe-hosted onboarding with more platform control.
- 👎 The platform carries more responsibility for connected-account
  activity; more to build than Standard for no V1 benefit.

### Account — C) Custom

- 👍 Full UX control.
- 👎 EndorseKit would own onboarding, the dashboard, and the most
  liability — far too much for a solo V1.

### Charge — E) Direct charges on the connected account (chosen)

- 👍 The connected account is unambiguously the merchant of record; the
  money flow is obvious; pairs naturally with Standard accounts.
- 👎 Slightly less platform visibility into the charge than a
  destination charge — irrelevant when EndorseKit takes no fee.

### Charge — D) Destination charges

- 👍 The platform sees the charge on its own account.
- 👎 The charge is on the *platform* account — it muddies "who is the
  merchant of record" exactly where EndorseKit needs that line bright.

### Charge — F) Separate charges and transfers

- 👎 The most complex model; reconciliation overhead with no V1 benefit
  given there is no `application_fee`.

## Links

- Spec section: [docs/product-research.md](../product-research.md) §2.5
  (payments), §3.4 (the invoice + payout flow), §4.2 (`connected_accounts`,
  `invoices`).
- Related ADRs: [0001](0001-go-backend-for-endorsements-and-jobs.md)
  (the Go service that owns the Connect integration),
  [0005](0005-billing-model.md) (the flat-subscription billing model
  that makes the no-`application_fee` choice coherent).
- External: Stripe Connect documentation — account types (Standard /
  Express / Custom), direct charges, account links, the `Stripe-Account`
  header.
