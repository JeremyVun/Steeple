# Steeple — Payments design (inbound & outbound)

> **Status:** Design adopted 2026-07-04; **build gated on the Phase 7 trigger** — real
> money observably moving offline through the platform (`phase-7-growth-seams.md`).
> Expands SYSTEM_DESIGN §15 (which stays the one-paragraph seam summary) into the full
> design: provider onboarding & payouts (outbound), organizer charging (inbound),
> **recurring payments for recurring bookings**, and the **refund & cancellation
> policy**. Decisions here are made now so opening the seam is execution; the numbers
> (commission %, badge pricing) stay founder launch-time decisions per the PRD.

## 1. Scope & non-negotiables

**In scope when built:** paid bookings end-to-end — church onboards for payouts,
organizer pays in-app, Steeple takes the invisible commission, refunds/cancellations
follow a published policy. **Free bookings are untouched** — no card, no new friction,
forever (free is the acquisition engine, not a payments edge case).

Non-negotiables (all inherited from PRD/SYSTEM_DESIGN, restated as constraints):

1. **Steeple never custodies funds, card data, or KYC documents.** Stripe holds payment
   identity; funds flow Stripe → church. This is what keeps Steeple out of
   money-transmitter territory and PCI scope beyond SAQ-A.
2. **Commission is invisible to organizers** (folded into the listed price,
   Airbnb-style, never made salient). Churches necessarily see it (their dashboard shows
   net) — "invisible" means never *surfaced*, not hidden from the counterparty.
3. **Per-venue opt-in.** A church that prefers today's offline handling keeps it —
   payments must never be a listing prerequisite.
4. **Booking integrity invariants stand.** Approval remains one transaction guarded by
   the exclusion constraint; **no Stripe call ever executes inside the approval
   transaction** (a slow/failed network call must not hold row locks or fail a booking).
   `BookingIntegrityTests` stays green throughout.
5. Cost ceiling honored: no fixed-monthly vendor fees beyond Stripe's per-active-account
   charges (§13).

## 2. Provider decision — Stripe Connect (Express, destination charges)

Reaffirming SYSTEM_DESIGN §15: **Stripe Connect** with **Express** accounts for churches
and **destination charges** with `application_fee_amount` as the commission.

| Option | Verdict |
|---|---|
| Stripe Connect Express + destination charges | **Chosen.** Stripe owns KYC/AML, payouts, 1099-K, fraud tooling; Express gives churches a Stripe-hosted dashboard with near-zero UI to build; destination charges keep one charge object per payment with the fee split declared on it |
| Stripe direct charges (church = merchant of record) | Escape hatch if destination-charge fee economics turn hostile (§3) — same accounts, different charge call; kept cheap by the `IPaymentGateway` port |
| PayPal / Adyen / Square | Rejected: weaker marketplace KYC delegation story at this scale, second vendor surface for zero benefit; Stripe Identity synergy (Phase 7 badges) also lost |

Stripe is the one deliberate deep vendor dependency in the system. That's acceptable
because it's precisely the "managed vendors only where they remove liability" case
(SYSTEM_DESIGN §2) — and the port keeps the blast radius one adapter.

## 3. Money flow & fee economics

```
 organizer card ──► PaymentIntent (platform, destination charge)
                        │  application_fee_amount = commission ──► Steeple platform balance
                        ▼
                 church's Express account (price − commission)
                        ▼
                 Stripe payout ──► church bank account   (outbound side: zero custom code)
```

- **Organizer pays the listed price.** Church receives price − commission. Commission %
  is a founder launch-time decision (PRD deferred decision) — but it has a **floor**: on
  destination charges the *platform* pays Stripe's processing fee (~2.9% + 30¢), so
  commission < that is negative margin per transaction. Worked example at $40/occurrence:
  Stripe ≈ $1.46; a 10% commission ($4.00) nets Steeple ≈ $2.54; a 5% commission ($2.00)
  nets ≈ $0.54. Set the % accordingly, or flip to direct charges (church bears Stripe
  fees; commission becomes pure) — the port makes that a build-time economics call, not a
  redesign.
- **Minimum charge floor:** tiny amounts drown in the 30¢ fixed fee. Policy: rooms priced
  under a floor (~$5/occurrence) are treated as free-tier for payments (offline
  handling); revisit with data.
- **Outbound (payouts):** entirely Stripe's. Default payout schedule; churches view
  earnings/payouts in the Express dashboard (deep-linked from `/manage`). No custom
  payout ledger, statement, or reporting in v1 — the dashboard *is* the reporting.
- **Currency:** USD only in v1 (`Currency` columns exist and stay honest).

## 4. Provider onboarding (outbound side)

1. Venue manager opens Payments in `/manage` → `POST /api/v1/manage/venues/{id}/payments/onboarding`
   → API creates (or reuses) the Express account and returns a one-time **account-link
   URL** → church completes Stripe-hosted KYC (charity/nonprofit entity types included).
2. `account.updated` webhooks drive local state: `ChargesEnabled`, `PayoutsEnabled`,
   `DetailsSubmitted`, requirements-due. UI shows onboarding state + "resume onboarding"
   (links expire) + Express dashboard link once live.
3. A venue is **payments-enabled** when charges + payouts are both enabled and the
   manager has explicitly opted the venue in (separate switch — KYC completion must not
   silently flip live bookings to in-app payment).
4. Payments-enabled changes affect **new approvals only** — in-flight bookings keep the
   payment mode they were approved with (mode is snapshotted on the booking, §7).

## 5. Inbound — when money moves (the core design)

### Card on file at apply; charge per occurrence at commitment

- **At apply** (paid room on a payments-enabled venue): the organizer saves a payment
  method — a **SetupIntent** via Stripe Elements (web) / PaymentSheet (mobile); the card
  never touches the API. The application then carries a "payment method on file ✓"
  signal to the provider — the PRD's credit-card trust effect, recovered without charging
  anything.
- **At approval:** the booking transaction snapshots price (§7) and creates occurrences
  exactly as today. **No charge yet** (non-negotiable #4).
- **The unified charge rule: each occurrence is charged off-session when it enters the
  48h notice window** — the moment it becomes non-cancellable under the existing
  cancellation rule. One-off bookings are the single-occurrence case of the same rule;
  approval already inside the window charges immediately.

Why this rule earns its place:

1. **Money moves exactly when commitment becomes binding.** The payment schedule and the
   cancellation policy are the *same* 48h line — cancellations with proper notice touch
   occurrences that were never charged, so the refund surface collapses (§6).
2. **Recurring bookings get recurring payments for free.** A 15-week term is 15 small
   charges, one per week at T−48h — no scary upfront sum, no proration math, and a
   renewal term (Phase 6 rebook) just keeps the machinery running.
3. **Terms can end early without money cleanup.** Cancel the term → future occurrences
   were never charged; nothing to unwind.

Trade-off, stated honestly: the church is paid per-occurrence just ahead of use, not
upfront — acceptable for community-priced space, and the on-file card + reputation system
covers the "will they really come" anxiety the deposit would have. Revisit (deposit /
first-occurrence-upfront option) only if providers ask.

### Charge orchestration — the first real background worker

Charging cannot be a lazy sweep on read: **money movement must not depend on someone
opening a page.** This is the trigger the lazy-sweep decision log entry reserved — record
the deviation in SYSTEM_DESIGN §17 at build time.

- A `PaymentSweeper` `IHostedService` inside the API (no new infra, no scheduler to
  operate): every ~5 min, select occurrences that are `scheduled`, priced, inside the
  charge window, and without an active payment row; create an **off-session
  PaymentIntent** per occurrence with **idempotency key = occurrence id** (retries and
  crashes can never double-charge).
- A Postgres advisory lock serializes sweepers (correct today on one instance,
  safe if instances ever multiply).
- pg_cron was considered and rejected: the charge needs the Stripe SDK + app config;
  SQL can't make that call.

### Payment failure ladder

Cards die between apply and a week-12 occurrence. Statuses live on the payment row (§7);
transitions are webhook-driven.

1. Charge fails or requires action (3DS) → payment `failed`/`requiresAction`; organizer
   notified (inbox + email + push, `deepLink: /bookings/{id}`) with a hosted
   confirmation/update-card link.
2. Sweeper retries on its cadence while the organizer fixes payment — **grace until
   T−24h**.
3. Still unpaid at T−24h → **that occurrence is auto-cancelled** (through the Bookings
   service — Payments never mutates booking rows; module-ownership rule), slot freed,
   both parties notified. The term itself survives; repeated failures (2 consecutive
   auto-cancels) cancel the remaining term.
4. Payment-failure cancellations are tracked on the organizer's record (distinct from
   no-shows) and feed the trust summary if chronic.

## 6. Refund & cancellation policy

The published policy (a versioned legal doc alongside ToS/Privacy — §11) and its
mechanics. The 48h charge rule makes most rows trivially "never charged":

| Event | Occurrence outcome | Money outcome |
|---|---|---|
| Organizer cancels, ≥48h notice | Freed (existing rule) | Never charged — nothing to refund |
| Organizer cancels, <48h | Stands (existing rule — notice was owed) | Charge stands; church keeps it |
| Provider cancels, ≥48h notice | Freed (existing rule) | Never charged |
| **Provider cancels, <48h** | **Freed — new asymmetry (below)** | **Automatic full refund** |
| Organizer no-show | Marked (existing) | Charge stands — the no-show deterrent gains teeth |
| **Venue no-show** (organizer marks) | Marked (existing) | **Automatic full refund** of that occurrence |
| Payment failure at T−24h | Auto-cancelled (§5) | Never succeeded — nothing to refund |
| Goodwill | Untouched | Provider-initiated refund, any past occurrence (§8 endpoint), full-amount only in v1 |

**The provider-cancel asymmetry (decision).** Today's rule is symmetric: either party's
cancellation leaves <48h occurrences standing. With money attached, symmetry produces
theater: the church cancels Tuesday's session on Monday, the organizer is charged for a
room they're told not to come to, and must wait to mark a venue no-show to get paid back.
So: **when the *provider* cancels, all requested occurrences cancel and charged ones
refund in full — the notice window binds only organizer-initiated cancellations.** The
window existed to protect the counterparty; a provider breaking their own commitment is
the case it must not protect. Provider late cancellations are counted and surfaced with
their responsiveness stats (Phase 6) — the reputational cost survives. Ship the semantics
change for free bookings too (same PR, same rationale, no money leg); supersedes the
2026-07-04 symmetric-window decision — record in SYSTEM_DESIGN §17.

**Refund mechanics:** Stripe refund on the occurrence's PaymentIntent with
`reverse_transfer: true` + `refund_application_fee: true` — the church's share claws back
from the connected account (Stripe debits future transfers/bank if already paid out;
enable `debit_negative_balances` on Express) and Steeple returns its commission. Stripe's
processing fee is not returned to the platform on refunds — Steeple eats ~2.9% + 30¢ per
refunded charge; at expected volume this is noise, but it's a watch-item if provider-side
cancellations turn chronic.

**Disputes/chargebacks:** `charge.dispute.created` → payment `disputed`, organizer's
payments paused pending outcome, Admin surfaced. Evidence package is what the product
already records: application intent + thread, approval, occurrence timeline, no-show
marks. Dispute fee (~$15, platform-borne on destination charges) noted as cost of doing
business. Repeated lost disputes → suspend the organizer from paid bookings (Admin
action, not automation, at this scale).

## 7. Data model — changeset `00X-payments.sql`

```
venue_payment_accounts: VenueId PK/FK, StripeAccountId unique, DetailsSubmitted,
                        ChargesEnabled, PayoutsEnabled, OptedInAtUtc?,
                        CreatedAtUtc, UpdatedAtUtc

users               +  StripeCustomerId?          (payment methods live in Stripe, on the Customer)

bookings            +  PricePerOccurrence numeric?, Currency?   ← snapshot at approval:
                       room pricePerHour × schedule duration; BOTH null = free/offline
                       booking (venue not payments-enabled at approval — mode is frozen
                       for the booking's life)

payments: Id, OccurrenceId FK, BookingId FK, Amount, Currency, ApplicationFee,
          StripePaymentIntentId unique, Status int
          (pending | requiresAction | succeeded | failed | refunded | disputed),
          FailureCode?, CreatedAtUtc, UpdatedAtUtc, RefundedAtUtc?
          partial unique (OccurrenceId) WHERE Status NOT IN (failed)   ← one live payment
          per occurrence; failed attempts are superseded, never deleted

webhook_events: StripeEventId unique, Type, ReceivedAtUtc, ProcessedAtUtc?
          ← webhook idempotency ledger (Stripe redelivers; handlers must be replay-safe)
```

EF configs mirrored by hand per the schema recipe; price snapshot columns are the only
touch on existing tables, so the approval transaction's shape is unchanged.

## 8. Module & ports

New **Payments** module, standard layout (`Contracts/Payments`, `Controllers/Payments`,
`Services/Payments`, `Proxies/Payments`):

| Port | Duties | Adapter |
|---|---|---|
| `IPaymentGateway` | EnsureCustomer, CreateSetupIntent, ChargeOccurrence (off-session PI, idempotency key), Refund, CreateConnectedAccount, CreateAccountLink, VerifyAndParseWebhook | `StripePaymentGateway` (official Stripe .NET SDK — Apache-2.0, $0; the one heavy vendor is Stripe itself, which is the point of the port) |
| `IPaymentRepository` | payment rows, webhook-event ledger, venue account state | EF adapter |

Module-ownership rules hold: Payments reads occurrences but **never mutates them** —
auto-cancel on payment failure and "occurrence charged" state transitions go through the
Bookings service interface; venue payment state is Payments-owned and read by Manage
through the Payments service. Webhook edge is a Payments controller
(`POST /api/v1/payments/webhook`) — supersedes §15's "under Ingest" sketch (the module
owns its own edge; record in §17).

## 9. Wire contracts (preview — final shapes land in CONTRACTS at build, §1 checklist)

- `POST /api/v1/manage/venues/{id}/payments/onboarding` → `{url}` ·
  `GET /api/v1/manage/venues/{id}/payments` → `{detailsSubmitted, chargesEnabled,
  payoutsEnabled, optedIn, dashboardUrl?}` · `POST …/payments/opt-in` / `opt-out`
  (opt-out affects new approvals only).
- `POST /api/v1/me/payments/setup` → `{clientSecret, publishableKey}` (SetupIntent);
  `GET /api/v1/me/payments` → saved-method summary (brand + last4 only — display data,
  never PAN).
- Apply on a paid, payments-enabled room **requires a method on file** → new error
  `402 payment_method_required`; `RoomDetail` gains `paymentsEnabled` +
  `estimatedPerOccurrence` so the form can render cost before the gate.
- `Application` gains `hasPaymentMethod` (provider-visible trust signal).
- `Booking` gains `payment {mode: "inApp"|"offline", perOccurrenceAmount?, currency?,
  nextChargeAtUtc?}`; occurrence rows in the detail fetch gain
  `paymentStatus?` — all additive.
- `POST /api/v1/manage/occurrences/{id}/refund` — venue-manager-scoped goodwill refund.
- `POST /api/v1/payments/webhook` — anonymous, `Stripe-Signature` verified over the raw
  body, event-type allowlist (`account.updated`, `setup_intent.succeeded`,
  `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`,
  `charge.dispute.*`), dedup via `webhook_events`, fast-200.
- Receipts: Stripe email receipts enabled — no receipt/PDF machinery in-app.
- Clients: Stripe.js/Elements on Web (external script — unavoidable for SAQ-A; document
  as the sanctioned exception to self-hosted-only assets), `flutter_stripe` PaymentSheet
  on mobile (MOBILE_CONTRACTS gains the seam at build).
- Analytics taxonomy additions (all server-authoritative): `payment_succeeded`,
  `payment_failed`, `refund_issued`, `payout_onboarding_started`,
  `payout_onboarding_completed` (+ `booking_confirmed` gains `isPaid`).
- Notification types (additive): `paymentActionRequired`, `paymentFailed`,
  `occurrenceRefunded` — payloads follow the §5 conventions, `deepLink: /bookings/{id}`.

## 10. Trust-stack synergies (why this module earns more than commission)

- **Payment method on file** = the PRD's delegated credit-card trust gate, now real; the
  same SetupIntent machinery later powers **refundable no-show holds** for high-stakes
  free bookings (PRD trust tier — deferred, but the seam is this module).
- **Stripe Identity** rides the same vendor, SDK, and webhook plumbing → verified badges
  (`phase-7-growth-seams.md` §1).
- The commission floor math (§3) is what finally prices the **verified badge and
  premium tiers** — trust revenue doesn't carry a per-transaction Stripe floor.

## 11. Legal, tax & compliance

| Concern | Position |
|---|---|
| Money transmission | Avoided: funds flow through Stripe to the church; Steeple's balance only ever holds its own fee |
| KYC / AML / payouts / **1099-K** | Stripe Connect owns all of it (SYSTEM_DESIGN §14 row resolved) — including nonprofit/church entity onboarding |
| PCI | SAQ-A: card data touches Stripe surfaces only (Elements/PaymentSheet); the API sees tokens and ids, never PANs |
| ToS | Version bump introducing the payments terms + commission disclosure + refund policy; re-acceptance via the existing `user_agreements` machinery (`docType` additions — the §14 seam built for exactly this) |
| Refund policy | Published, versioned page (this doc's §6 table is the source); linked from every paid listing and the apply form |
| Sales/occupancy tax on room rental (VA) | **Legal research item before build** — taxability of meeting-space rental varies; if collection is required, Stripe Tax is the delegation-consistent lever (priced per-calculation; confirm) |
| Church-side tax (UBIT etc.) | The church's concern, not the platform's — FAQ/help-page material only; Steeple gives no tax advice |

## 12. Rollout

1. **Slice A — rails:** changeset, Payments module, Express onboarding + webhook state,
   `/manage` payments screen. Nothing charges yet. Flag `payments.enabled` off in prod.
2. **Slice B — inbound:** SetupIntent at apply, price snapshot at approval,
   `PaymentSweeper` + failure ladder, webhook-driven payment rows. Stripe test-mode E2E
   (test clocks for the T−48h window).
3. **Slice C — policy:** provider-cancel asymmetry + auto-refunds (incl. venue no-show),
   goodwill refund endpoint, refund-policy page + ToS bump, dispute handling surface in
   Admin.
4. **Slice D — pilot:** one real church, flag-gated; reconciliation report (nightly
   compare of Stripe PaymentIntents vs `payments` rows — catches missed webhooks);
   runbook: webhook replay, refund-after-payout, account-disabled-mid-term.
5. Integration tests: charge-window selection, idempotent sweeps (double-run = no double
   charge), refund paths, webhook replay; `BookingIntegrityTests` green throughout
   (approval path gains only column writes).

## 13. Failure modes & cost watch

| Failure | Handling |
|---|---|
| Webhook outage / missed events | Redelivery (Stripe retries for days) + nightly reconciliation report (Slice D) |
| Double charge | Impossible by construction: idempotency key = occurrence id + partial unique payment row |
| Church's Stripe account disabled mid-term | `account.updated` → venue payments-paused → in-flight occurrences inside the window can't charge → treated as provider-side interruption: occurrences freed + refunds per §6, parties notified, Admin alerted |
| Stripe API down at charge time | Sweeper cadence retries; the T−48h → T−24h grace absorbs hours of outage |
| Refund after payout | `reverse_transfer` + negative-balance debit (Express setting) — Stripe's problem by design |
| Card expires mid-term | Failure ladder (§5); Stripe network card-updater helps silently |

**Cost:** no fixed monthly platform fee; ~$2/mo per *active* Express account +
0.25% payout volume + processing fees (verify current pricing at build). At pilot volume
this is dollars, inside the ceiling; commission floor (§3) keeps unit economics
non-negative.

## 14. Open decisions (deliberately deferred to launch of this feature)

- **Commission %** — founder decision when the trigger fires (PRD); bounded below by §3.
- **Minimum-price floor** value ($5/occurrence starting point).
- **Verified-badge pricing** (`phase-7-growth-seams.md` §1) — same decision moment.
- Upfront/deposit option for providers who ask — only with evidence.
- Stripe Tax adoption — pending the §11 research outcome.
