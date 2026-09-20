# Contracts — Payments (CONTRACTS §10)

> **Scope:** the payments rails built 2026-08-05 (mock-gateway era of `docs/backlog/payments.md`,
> charge timing per `docs/backlog/booking-modes.md`): the guest method-on-file loop, the apply
> gate, per-occurrence charging + the failure ladder, refunds, and venue payout onboarding.
> Booking-mode exposure on other seams: `discovery.md` (RoomDetail), `manage.md` (venue CRUD),
> `applications.md` (submit semantics + booking payment fields).
> Conventions/governance: `conventions.md`. Legend: ✅ built & live · 🔲 planned (Stripe-time).

## The mock era, honestly

Guest payment setup, charging, and refunds remain **machinery over a mock gateway**
(`MockPaymentGateway`); no real guest payments are implemented. Guest endpoints remain
Development-only and `payments.enabled` cannot be enabled with mock in Production.
**Host onboarding now supports Stripe sandbox**, through a separate service/controller and
`payments.onboarding` flag (see below). Host setup never activates guest charging.
The remaining Stripe payment-state/port changes are in `docs/backlog/payments.md`; this is
not just an adapter swap. Changeset 017 removes earlier synthetic state before rollout.

**Behavioral switch:** config flag **`payments.enabled`** (off in base config, on in
Development). Off = no 402 gate, offline collection, sweeper idle. Since 2026-08-08 the flag
no longer touches booking modes: instant book confirms either way (offline, uncharged) and
`RoomDetail.bookingMode` emits the host's stored choice — the uncarded spam caps in
`applications.md` are the guest-side guard the card was standing in for.
Every new booking snapshots its per-session price and currency, including offline bookings.
`Booking.InAppPayment` freezes the collection mode independently. A booking confirmed while
the flag was off **stays offline forever**, including after payments are enabled. The charge
repository and charge service both require in-app mode. Migration 024 backfills the old mode;
legacy offline prices remain unknown rather than being guessed from today's listing rate.
`BookingPaymentDto` keeps its existing shape: offline bookings now carry nullable
`perOccurrenceAmount` and `currency`; `nextChargeAtUtc` stays null. Web and mobile show the
snapshot and say to arrange payment directly. An edited listing rate never replaces it.
Turning the flag off also hides the guest payment endpoints and pauses charge/refund kicks and the
sweeper; historical payment state remains readable, and paid-mode work resumes only when the
flag returns.

**Non-negotiables enforced here:** no card data ever touches the API or DB (display
brand/last4 only — there is no request field a PAN could ride in, and last4 must be exactly
four digits); no gateway call inside any booking/approval transaction (charges kick
post-commit); the DB's one-live-payment-per-occurrence index + idempotency key = occurrence id
make double-charging impossible by construction.

## Guest method-on-file ✅

Compose forwards `STRIPE_PUBLISHABLE_KEY` from the root `.env` to
`Payments:PublishableKey`, defaulting to `pk_mock_steeple` when unset. For direct
`dotnet run`, export `Payments__PublishableKey` in the process environment. A real
publishable key alone does not select a Stripe gateway or enable payments.

All endpoints below return 404 while `payments.enabled=false`; the web also omits the account
payment block, so an unavailable setup flow has no visible entrance.

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

## Venue payout onboarding ✅ (Stripe sandbox, 2026-09-06)

`payments.onboarding` independently exposes host setup while `payments.enabled=false`.
Development retains the legacy mock host flow when only `payments.enabled` is on. Production
requires `Payments:Connect:Mode=stripe` for onboarding. Only sandbox `sk_test_` keys are
accepted; an opted-in sandbox account does not activate live booking payments.

Every host endpoint is authenticated and manager-scoped; inaccessible venues return 404.
Writes use the `manage` rate limit. State reads refresh the connected account from Stripe;
provider failures return `503 payment_provider_unavailable`, never raw Stripe error details.

| Method/path under `/api/v1/manage/venues/{id}/payments` | Result |
|---|---|
| `GET` | Current `VenuePaymentState` below |
| `POST /onboarding` | `{url, mock}`; create/recover one Express account, mint a fresh hosted link |
| `PUT /opt-in` with `{optedIn: bool}` | Updated state; true requires readiness, else `409 payment_account_not_ready`; false works despite lost readiness/provider outage |
| `POST /dashboard` | `{url, mock:false}`; on-demand Express login link after details submitted; unavailable state → 409 |
| `POST /onboarding/mock-complete` | Development/mock-only legacy completion; real Stripe never trusts client completion |

`VenuePaymentState` retains `onboardingStarted`, `detailsSubmitted`, `chargesEnabled`,
`payoutsEnabled`, `optedIn`, `dashboardUrl:null`, and `mock`. Additive fields:

- `status`: `notStarted | incomplete | pending | restricted | ready` (shared wire registry).
- `requirementsDue`: provider requirement names, no submitted values; `disabledReason`: nullable provider token.
- `testMode:true`; `canOpenDashboard`: true for a real account with submitted details.
- `onlinePaymentsAvailable:false`: explicit onboarding-only scope, even when opted in.

Ready requires submitted details, enabled charges/payouts, no currently due requirements,
and no disabled reason. Provider updates preserve the manager's separate opt-in timestamp.
Completing Stripe setup never opts a venue in. Mock completion retains its old collapse for
Development harnesses only. Offline bookings remain offline.

The configured public web base owns callbacks (HTTPS, or loopback HTTP for testing):
`desk?paymentVenue={id}&paymentReturn=return|refresh`. It includes any deployment prefix.
Web restores auth and matches the venue against managed venues before reading or requesting
a new link. Return refreshes state; refresh consumes the one-use marker before generating a
replacement link. Both clients accept only HTTPS `connect.stripe.com` destinations without
credentials or non-default ports. Mobile uses the external browser and refreshes on foreground.
Never persist client secrets, account/login-link URLs, bank details, identity documents, or
raw webhook bodies. The existing `dashboardUrl` field stays null; links are minted only by POST.

### Account identity and webhooks

Changeset 023 adds a provider discriminator (`mock` or `stripe`), a durable unique
`ProvisioningKey`, nullable provider account id while
creation is unresolved, and readiness requirements to `venue_payment_accounts`. Stripe
metadata plus a stable create idempotency key recover ambiguous creation responses; metadata
lookup also covers retries after Stripe evicts an idempotency key. First Stripe setup can
replace synthetic mock onboarding state with a new provisioning identity and cleared opt-in;
mock mode never claims or completes a Stripe account. Database account-state
locks serialize provider retrieval and persistence, preventing stale concurrent updates.

`POST /api/v1/payments/webhook` is anonymous with Stripe signature verification, a 64 KiB
body limit, and 120/min/IP limiter. It remains available when the onboarding flag is off.
Only sandbox `account.updated` is processed; other verified sandbox event types are acknowledged.
Missing signing configuration returns 503; bad signatures/live events return 400
`invalid_webhook_signature`. The minimal `payment_webhook_events` ledger deduplicates event
id/source and records account/object ids, type, timestamps, attempts, and safe failure code.
Retrieve current Stripe state before applying; duplicates/order never establish readiness.
Processing is inline and non-2xx invites Stripe retry; no background replay worker ships here.

The platform is Australian. Country/capability choices come from Stripe-hosted onboarding and
platform Dashboard configuration; no AU/US country is forced. Sandbox readiness is not evidence
of live AU-to-US payout eligibility. Configuration, callback recovery, and operator setup:
[`runbooks/stripe.md`](../runbooks/stripe.md).

## Ports & module

`Services/Payments` owns: `IPaymentGateway` (EnsureCustomer, CreateSetupIntent,
ChargeOccurrence, Refund), `IPaymentRepository`, `IPaymentService`
(includes the reads other modules project: `GetOccurrenceStatusesAsync`,
`HasPaymentMethodAsync`), `ChargePlanner` (pure window/ladder policy), `PaymentSweeper`.
Host onboarding uses `IHostPaymentOnboardingService` and `IConnectOnboardingGateway`;
adapters in `Proxies/Payments` are `StripeConnectOnboardingGateway`, `MockPaymentGateway`,
and `EfPaymentRepository`. Stripe.net 52.4.1 supplies Connect API and signature verification. Module rules:
Payments reads occurrences, never mutates them (auto-cancels go through
`IBookingService.CancelOccurrencesForPaymentFailureAsync`); Bookings triggers refunds through
`IPaymentService.RefundCancelledForBookingAsync`; Manage venue payment state is read through
the Payments service.

## Stripe-time additions (decided in payments.md, deliberately not built)

Extend the existing account-only webhook ledger/edge with durable payment-event recovery; `paymentActionRequired` (3DS) notification; `ApplicationFee` becomes the real
commission (column exists, 0 today); Stripe email receipts; disputes; reconciliation report;
ToS/refund-policy pages. `payments` rows keep `ProviderPaymentId` only on success — a failed
attempt's provider id is not retained (the failure code is the history).
