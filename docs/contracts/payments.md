# Contracts — Payments (CONTRACTS §10)

> **Scope:** the payments rails built 2026-08-05 (mock-gateway era of `docs/backlog/payments.md`,
> charge timing per `docs/backlog/booking-modes.md`): the guest method-on-file loop, the apply
> gate, per-occurrence charging + the failure ladder, refunds, and venue payout onboarding.
> Booking-mode exposure on other seams: `discovery.md` (RoomDetail), `manage.md` (venue CRUD),
> `applications.md` (submit semantics + booking payment fields).
> Conventions/governance: `conventions.md`. Legend: ✅ built & live · 🔲 planned (Stripe-time).

## The mock era, honestly

Everything below is **live machinery over a mock gateway** (`MockPaymentGateway`): no money
exists anywhere, ids are synthetic (`cus_mock_… / seti_mock_… / pi_mock_… / acct_mock_…`), and
one lever makes failure paths testable — **a saved card ending `0002` declines every charge**
(Stripe's decline test card, so the convention survives the swap). Swapping in
`StripePaymentGateway` behind the same `IPaymentGateway` port is the entire Stripe cost; every
non-`mock-*` wire shape below is final. While mock is the only registered gateway, the entire
Payments controller is mapped only in Development; Production exposes no synthetic provider
surface. Startup also fails when `payments.enabled=true` while
`Payments:Gateway=mock`, and migration 017 removes synthetic provider state before rollout.

**Behavioral switch:** config flag **`payments.enabled`** (off in base config, on in
Development). Off = the pre-payments request→approve loop exactly as before: no 402 gate, no
instant book, no price snapshot, sweeper idle, `RoomDetail.bookingMode` emits `manual`.
Bookings confirmed while the flag was off have no price snapshot and **stay offline forever**;
bookings confirmed while on keep charging even if the flag later flips off (mode is frozen at
confirmation — payments.md §4).

**Non-negotiables enforced here:** no card data ever touches the API or DB (display
brand/last4 only — there is no request field a PAN could ride in, and last4 must be exactly
four digits); no gateway call inside any booking/approval transaction (charges kick
post-commit); the DB's one-live-payment-per-occurrence index + idempotency key = occurrence id
make double-charging impossible by construction.

## Guest method-on-file ✅

- `POST /api/v1/me/payments/setup` ✅ (auth, `payments` limit: 10/min/account) → `{clientSecret, publishableKey,
  mock: true}`. Ensures the caller's provider customer and opens a setup intent. At
  Stripe-time the same two fields feed Stripe Elements; `mock: true` tells clients to render
  the mock card form instead.
- `POST /api/v1/me/payments/setup/mock-confirm` ✅ *(Development-only — Elements' confirm step
  replaces it)* — `{clientSecret, brand, last4}` → `200 MyPayments`. Records display data
  only. Errors: `400 invalid_payment` (bad last4/brand/unknown clientSecret).
- `GET /api/v1/me/payments` ✅ → `MyPayments`: `{hasPaymentMethod, method?{brand, last4,
  setAtUtc}, mock: true}`.

One method per user (the default); saving again replaces it. `DELETE` is deliberately absent
in v1 — replacing is the recovery path, and a method is required to book at all.

## The apply gate + instant book ✅ (semantics on `applications.md`)

While `payments.enabled`: **every** `POST /listings/{roomId}/applications` requires a method
on file → **`402 payment_method_required`** otherwise (card-at-request, booking-modes.md).
`Application` carries additive `hasPaymentMethod` (host-visible trust signal). On an
**instant** venue the submit *is* the booking transaction — see `applications.md`.

## Charge timing + failure ladder ✅ (booking-modes.md, supersedes payments.md §5 in part)

- Price snapshot at confirmation: `bookings.PricePerOccurrence = room.pricePerHour × schedule
  hours`, `Currency` — frozen for the booking's life. Column writes only, inside the booking
  transaction; the gateway is never called there.
- **First occurrence charges at confirmation** (post-commit kick; a one-off is the
  single-occurrence case). **Later occurrences charge at T−48h** via the `PaymentSweeper`
  (`IHostedService`, ~5 min cadence, Postgres advisory lock; intervals in the `Payments`
  config section: `SweepIntervalSeconds`, `RetryIntervalSeconds`, `ChargeWindowHours`,
  `CancelDeadlineHours`).
- Charge flow per occurrence: **claim** (insert a Pending `payments` row under the partial
  unique index — a concurrent claimer loses and skips) → gateway charge with **idempotency
  key = occurrence id** → record Succeeded/Failed. Stale Pending rows (crash between claim
  and outcome) are re-driven under the same key.
- **Failure ladder:** first failure → organizer notified (`paymentFailed`, inbox + email,
  `deepLink: /bookings/{id}`) → sweeper retries (paced by `RetryIntervalSeconds`) → still
  unpaid at **T−24h** with a failure on record → that occurrence auto-cancels **through the
  Bookings service** (Payments never mutates occurrences), slot freed, both parties notified
  (`bookingCancelled`) → **2 consecutive** payment-failure auto-cancels cancel the remaining
  term (`CancelledBy: null` = system).

## Refunds ✅ — one declarative rule

**Every succeeded charge on a cancelled occurrence refunds in full, automatically.** The
booking-modes.md refund table reduces to it (recorded in SYSTEM_DESIGN §17):

| Event | Occurrences | Money |
|---|---|---|
| Host cancels/rescinds, any time | **All** scheduled occurrences freed (the notice window binds only guests) | Full refund of every charge on the freed occurrences |
| Guest cancels, occurrence ≥48h out | Freed | Full refund |
| Guest cancels, occurrence <48h out | Stands (notice was owed) | Charge stands |
| Payment failure at T−24h | Auto-cancelled | Never succeeded — nothing to refund |

Refunds run immediately post-cancel *and* every sweep pass (crash-safe: a missed refund is
re-attempted, never lost). Organizer notified per refund (`occurrenceRefunded`); wire state:
the occurrence's `paymentStatus` becomes `refunded`. Not yet built (Stripe-time with the
policy page): venue-no-show auto-refund, goodwill refund endpoint
(`POST /manage/occurrences/{id}/refund`), partial refunds.

## Venue payout onboarding ✅ (stub — display-only in the mock era)

- `POST /api/v1/manage/venues/{id}/payments/onboarding` ✅ (manager-scoped, `manage` limit) →
  `{url, mock: true}`. Creates/reuses the connected account. The mock `url`
  (`mock-onboarding:acct_mock_…`) is **not navigable** — mock-era clients render their own
  screen and complete via the endpoint below; at Stripe-time `url` is the Stripe-hosted
  account-link URL, consumed unchanged.
- `POST /api/v1/manage/venues/{id}/payments/onboarding/mock-complete` ✅ *(Development-only)* —
  one call collapses hosted KYC
  + `account.updated` webhooks + the opt-in switch: flips `detailsSubmitted/chargesEnabled/
  payoutsEnabled` and stamps the opt-in. `400 invalid_payment` before onboarding starts.
- `GET /api/v1/manage/venues/{id}/payments` ✅ → `{onboardingStarted, detailsSubmitted,
  chargesEnabled, payoutsEnabled,
  optedIn, dashboardUrl: null, mock: true}` (payments.md §9 fields, so Stripe slots in).

⚠ **Mock-era simplification (deliberate, documented):** payout state **gates nothing** —
priced bookings charge regardless of venue onboarding, so the whole loop is drivable against
seed data. At Stripe-time this becomes the payments.md §4 gate (charges+payouts enabled and
opted in ⇒ snapshot at confirmation; otherwise offline), decided at confirmation time.

## Ports & module

`Services/Payments` owns: `IPaymentGateway` (EnsureCustomer, CreateSetupIntent,
ChargeOccurrence, Refund, CreateConnectedAccount, CreateAccountLink — webhook
verification joins the port at Stripe-time), `IPaymentRepository`, `IPaymentService`
(includes the reads other modules project: `GetOccurrenceStatusesAsync`,
`HasPaymentMethodAsync`), `ChargePlanner` (pure window/ladder policy), `PaymentSweeper`.
Adapters in `Proxies/Payments`: `MockPaymentGateway`, `EfPaymentRepository`. Module rules:
Payments reads occurrences, never mutates them (auto-cancels go through
`IBookingService.CancelOccurrencesForPaymentFailureAsync`); Bookings triggers refunds through
`IPaymentService.RefundCancelledForBookingAsync`; Manage venue payment state is read through
the Payments service.

## Stripe-time additions (decided in payments.md, deliberately not built)

`webhook_events` table + `POST /api/v1/payments/webhook` (signature-verified, allowlist,
dedup); `paymentActionRequired` (3DS) notification; `ApplicationFee` becomes the real
commission (column exists, 0 today); Stripe email receipts; disputes; reconciliation report;
ToS/refund-policy pages. `payments` rows keep `ProviderPaymentId` only on success — a failed
attempt's provider id is not retained (the failure code is the history).
