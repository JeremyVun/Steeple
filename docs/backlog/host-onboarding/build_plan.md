# Host onboarding build

Scope and wire contract: [design](design.md); durable contract: [payments](../../contracts/payments.md).
Owner chose Stripe Connect on 2026-09-06 and confirmed an Australian platform account.

- [x] Backend: separate host controller/service, Stripe SDK adapter, sandbox configuration,
  provisioning identity, account-state synchronization, verified account webhooks, opt-in/dashboard.
- [x] Web: extend existing desk/payout UI, auth-restored Stripe returns, independent host flag,
  status/recovery, preference, dashboard, safe redirects.
- [x] Mobile: models/fixtures, repository, venue entry, external browser, foreground recovery.
- [x] Verification: full .NET suite and real database races, web real-event host and legacy
  payment journeys, Flutter analyze/tests, configuration validation, integration review fixes.
- [x] Closeout: update durable contracts/runbook, record remaining Stripe-dashboard setup and
  live AU-to-US payout eligibility boundary. Real Stripe smoke requires operator configuration.


Verification evidence so far (2026-09-06): full backend run passed 604 API and 163 integration
tests, including booking integrity. Root/prefix host browser harness passed 22/22 each.
Flutter full suite passed 110 tests; `flutter analyze` has no issues. Compose mapping validated
with synthetic values and explicit `/dev/null` environment input, without loading `.env`.
Final backend focused tests passed 30/30; persistence/concurrency checks passed 4/4.
Legacy payment browser regression passed 69/69. Web npm test, lint, typecheck, and
build:flat:debug passed. Disposable API/web/database containers and listeners were removed;
normal Compose was untouched. Actual Stripe sandbox smoke and normal-stack migration/restart
remain operator setup steps, documented in the runbook.

Existing Playtest host journeys were not run: their init resets the normal steeple-postgres
container and their configured actor model is unavailable. The isolated real-event browser
harness is the verification rail for this change; no Playtest spec or baseline was altered.
