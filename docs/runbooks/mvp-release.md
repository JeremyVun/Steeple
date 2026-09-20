# First MVP release

Status: local hardening completed; not deployed. Updated 2026-09-20.

The first release can be a small, supported web pilot with payment arranged directly with
venues. Live Stripe collection and native app-store release are separate gates.

## Fixed locally

| Release issue | Implemented behavior |
|---|---|
| An API outage showed demo spaces as available | Production shows a retry state with no demo listings, provisional map pins or seed descriptions. Development retains its demo fallback. |
| Clients could bypass the agreement screen | API commitment routes require current terms/privacy acceptance. Unknown, old and invented versions are rejected. Reads, declines, withdrawal, unlisting, cancellation and deletion remain available. |
| Offline booking prices changed with a listing | Every new booking freezes its per-session price and currency. Migration 024 stores collection mode separately; enabling payments later cannot charge an offline booking. Historical unsaved prices remain unknown. |
| Mobile omitted price and agreement handling | Booking details show the snapshot. Commitment actions ask for explicit acceptance; Profile opens both legal documents and offers agreement review. |
| Product copy overstated payments and identity checks | Legal preview now describes direct payment and the cancellation window. SSO labels say “Signed in”; venue verification remains a separate claim. Document version is 2026-09-20 across API/web/mobile. |
| Health stayed green with the database down | `/health/ready` checks the database and required booking schema, returning 503 on failure. API container health uses readiness; `/health` remains liveness. |
| A failed database dump could be reported successful | Shared-infra backup checks dump, compression and configured upload separately. Rotation happens after success; private temporary files are removed. Cron environment matching includes the actual variable names. |
| Deployment migrations lagged behind code | Infra now includes 022–024 and optional, disabled-by-default Stripe sandbox config. The parity tool preserves historical production differences and excludes local seed migrations. |
| SSE tests failed under load | Initial frame, heartbeat and expiry tests advance a controlled clock. |

NuGet reports no vulnerable packages across the solution after the test-only SSH.NET dependency was pinned to 2026.0.0, which contains fixes for the two
reported SCP advisories. [Upstream release](https://github.com/sshnet/SSH.NET/releases/tag/2026.0.0).

## Verification record

- Full .NET run: 610 API unit tests and 165 integration tests passed, including the five-minute
  SSE test. After adding the withdrawal exception, 15 targeted HTTP/payment/booking-integrity
  tests passed, including the additional HTTP test.
- Web: unit/regression tests, lint, typecheck and production build passed. A real browser
  against the production build with an unavailable API showed the retry state and zero demo
  cards/pins; Google and Apple controls rendered. The browser consent suite passed all seven
  scenarios, including dismissal, reload, acceptance persistence and hosting continuation. Its
  click helper now waits for enabled controls. This does not prove provider authentication.
- Mobile: final analysis and all 114 tests passed, including consent refusal/failure and the
  host approval flow.
- Liquibase 4.31 applied all 24 changesets from the production bundle to clean Postgres 18.
  The parity check covers 21 SQL files; three development fixture files are excluded and
  migration 010's seed repricing is intentionally absent in production.
- Backup failure injection passed for dump and upload errors. A real backup made by the
  repaired script restored into a fresh Postgres instance with all 24 migration records and
  a synthetic user intact. This was local, with offsite upload disabled.

## Remaining gates for a web pilot

1. **Deployment.** Build matching API/web/admin images from the reviewed release and deploy
   them with the corresponding `projects` infra changes. Both `main` checkouts must be clean
   before deployment. No deployment was attempted during this hardening work.
2. **Real supply.** Select and verify the first participating venues, obtain accurate prices,
   photos, hours and rules, and remove/unpublish sample inventory from the public database.
   Agree who responds to requests and handles cancellations or disputes.
3. **Support and legal approval.** Supply a monitored booking-support/privacy address, publish
   it in the UI/legal pages, and approve the final terms/privacy text. These pages still label
   themselves as preview policies; the factual corrections are not legal approval. If text
   changes after anyone accepts it, bump the versions across all three clients and the API.
4. **Real provider journey.** Verify Google and Apple sign-in, Turnstile, and delivered email
   on the actual release origin. Run one real host/guest request, decision, cancellation and
   support escalation with consenting pilot participants. Confirm expected alerts reach the
   operator. Local mocks and rendered sign-in buttons do not establish this.
5. **Production recovery.** Deploy the backup fix, verify the scheduled job and offsite object,
   restore a production backup into an isolated database, and record recovery time and owner.
   The local restore drill does not establish the current production backup state.

Keep `payments.enabled=false`. Sandbox host onboarding does not authorize live collection.
Native apply/manage remain disabled until native Turnstile, provider setup, push, deep links,
and store requirements have been verified. They do not need to delay a web-only pilot.

## Coordinated rollout

Migration 024 changes how payment mode is interpreted. **Do not roll back to an older API
against a database containing new offline price snapshots**: older code treats any saved
price as in-app collection. Keep payment collection disabled, stop the old API during this
schema/API rollout, and bring up the matching API and web together. Use a reviewed forward
fix or a coordinated database/application restore if rollback is needed. A database restore
can lose later writes and is an operator decision.

Useful local checks (none reads environment files):

```sh
python3 tools/check-deploy-migrations.py
dotnet test Steeple.slnx --verbosity minimal
npm test --prefix src/Steeple.Web.v2
npm run smoke:providers --prefix src/Steeple.Web.v2
```

From `mobile/`, run `flutter analyze` and `flutter test --concurrency=1`. In the infra repo,
run `sh stacks/postgres/scripts/test-pg-backup.sh`. Follow the existing provider runbooks
and the deploy-stack workflow for the actual release after `main` is clean.
