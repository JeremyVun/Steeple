# Host Stripe onboarding slice — 2026-09-06

Status: historical rationale — sandbox onboarding completed 2026-09-06. Current contract:
[payments](../../contracts/payments.md); deployment setup: [Stripe runbook](../../runbooks/stripe.md).
The owner authorized Stripe Connect host onboarding and confirmed an Australian platform
account. Secrets remain in operator configuration and were not read during implementation.

Scope: sandbox Stripe Express hosted onboarding, resume/return, current account status,
explicit host opt-in/out preference, on-demand dashboard link. Guest charging remains mock
and disabled in Production. Real host onboarding has its own payments.onboarding flag.
Do not assume AU platform can pay US venues. Let hosted Stripe country selection determine
available account countries; do not force AU or US on account creation. This slice supports
sandbox only until charge model / country support is finalized.

API preserve existing host URLs and fields:
GET /api/v1/manage/venues/{id}/payments
POST /api/v1/manage/venues/{id}/payments/onboarding -> {url,mock}
POST /api/v1/manage/venues/{id}/payments/onboarding/mock-complete (Development/mock only)
Add PUT /api/v1/manage/venues/{id}/payments/opt-in {optedIn:bool} -> state
Add POST /api/v1/manage/venues/{id}/payments/dashboard -> {url,mock:false}
State retains onboardingStarted,detailsSubmitted,chargesEnabled,payoutsEnabled,optedIn,
dashboardUrl:null,mock; adds status (notStarted|incomplete|pending|restricted|ready; shared PaymentAccountStatus registry),
requirementsDue:string[], disabledReason:string|null, testMode:bool,
canOpenDashboard:bool, onlinePaymentsAvailable:bool (false for Stripe onboarding-only slice).
All manager scoped, writes rate limited, 404 for inaccessible venues. Provider failures
return safe 503 payment_provider_unavailable, unready opt-in 409 payment_account_not_ready.

Stripe return URLs use configured absolute public web base (subpath safe):
desk?paymentVenue={venueId}&paymentReturn=return or refresh. Browser restores auth and
selects managed venue by GUID. return retrieves current state; refresh obtains fresh
onboarding link only after auth/ownership checks, guards against redirect loops.
Do not treat return as completion. No keys, account-link URLs, KYC, or webhook bodies in logs.

payments.onboarding is false in base config; mock existing payments.enabled dev path stays
usable. Stripe onboarding may operate while payments.enabled=false. UI discovers via flag.
Stripe state never says it accepts real guest payments: onlinePaymentsAvailable=false.
Opt-in is future intent only with clear UI explaining online booking payments are not active.
Authenticated GET refreshes Stripe state; webhook verifies signature, retrieves current
account, persists flags idempotently, preserving host opt-in. Account creation must survive
concurrent requests and ambiguous Stripe timeouts without duplicate connected accounts.

Web extend existing payout screen/desk styling (no novel visual direction), safe redirects
only to Stripe HTTPS domains, status, continue setup, refresh, dashboard, preference.
Remove unsupported existing claims that money is safely held/owed from real onboarding path.
Mobile implement matching models/fixtures/repository, host onboarding screen launched through
external browser, resume refresh, desk/manage entry and flag. External return may use web desk;
mobile refreshes when foregrounded, no in-app webview for Stripe onboarding/dashboard.

Tests: authorization, flag independence, bad config and live keys rejected in this slice,
provider account creation idempotency, incomplete return, readiness loss, opt-in guarding,
webhook signature/replay/current-state retrieval, mock routes production hidden, safe URLs.
Real-event web harness required. Backend dotnet test (incl BookingIntegrityTests), mobile
flutter analyze + test. Never load .env for tests. No new card charging, no live activation.

Comments are rare and short, one line of why where the reason is non-obvious, never narrating what the code does.


Implementation review decisions: Provider discriminator separates mock from Stripe rows;
starting Stripe setup can promote synthetic state atomically, but mock mode never rewrites a
Stripe account. Readiness retrieval/persistence uses per-account Postgres locks. Opt-out works
without provider availability and remains visible after readiness loss. Client generations and
identity checks discard late links/state after venue switches, navigation, or sign-out. New
`payout_preference_changed` analytics records the explicit manager choice. Web and mobile reuse
`payout_step_opened`; secret keys never enter client configuration.
