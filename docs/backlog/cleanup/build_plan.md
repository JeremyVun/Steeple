# Cleanup and hardening — build plan (completed 2026-08-09)

> **Status: executed to completion, 2026-08-09.** This is the dated history stub the
> plan required of itself. The full work orders are superseded by what shipped.
> [`design.md`](design.md) remains the evidence and owner-decision record;
> [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) and the owning
> [`../../contracts/`](../../contracts/) files describe current behavior.

## How it landed

- **P1 — shrink first.** The retired Web.v1 source and diorama renderer were deleted;
  Atlas is the sole village renderer and the flat/world-off fallback remains. The
  production npm advisory was cleared and `audit:prod` became a standard gate.
- **P2 — browser-storage privacy.** The web store, user profile, location, correspondence,
  and drafts moved to module memory. Boot and sign-out purge legacy keys; the refresh
  credential is an httpOnly cookie, the access token/profile are memory-only, and tabs
  exchange opaque state over `BroadcastChannel`.
- **P3 — photo integrity.** Changeset `019-photo-integrity.sql` repaired legacy ordering
  and duplicate primaries, isolated shared legacy objects as URL-only rows, and added
  unique storage-key, room-order, and single-primary constraints. New uploads own a
  row-specific object prefix and compensate partial object/database failures.
- **P4 — API correctness.** Calendar and conflict reads now use the same effective-expiry
  policy as application presentation; agreement version bounds and duplicate handling are
  honest; refresh reuse-grace returns only a committed rotation; bulk notification reads
  cap IDs and request size.
- **P5 — durable delivery.** Changeset `020-notification-outbox.sql` and
  `NotificationOutboxWorker` replaced request-scoped fire-and-forget email/push work with
  transactional envelopes, bounded leases, retry/backoff, and observable terminal failure.
- **P6 — bounded discovery.** Time-filtered discovery evaluates at most 300 deterministic
  SQL candidates; page arithmetic is bounded, slug comparisons remain sargable, and the
  suburb list respects the geofence.
- **P7 — retention.** Changeset `021-data-retention-indexes.sql` supports one daily,
  config-backed worker with a 500-row per-class ceiling. It applies the accepted refresh,
  notification, replay-key, private-correspondence, and terminal-outbox policies while
  leaving legal acceptances and the financial graph intact.
- **P8 — production configuration.** One startup validator now fails closed on incomplete
  external capabilities, development adapters, weak database/JWT configuration, Apple/SSO,
  ambiguous Turnstile mode, push, and mock payments. Payments-off behavior, deployment
  ignores, exact image tags, compose mappings, and a production Google+Apple button smoke
  are covered by tests.
- **P9 — structural/static gates.** The web store and host listing workflow were split
  behind their existing seams. PostCSS scopes guest/host CSS without changing load order;
  a surface-ownership test guards shared chrome. ESLint, JSDoc/checkJs, production audit,
  and accessibility checks are part of `npm run check`.
- **P10 — application service.** `ApplicationService` became an orchestrator over focused
  transition, schedule, expiry, notification, and presentation components without changing
  controllers, ports, or the booking transaction.
- **P11 — wire-token contract.** `tests/fixtures/wire-tokens.json` is the single hand-kept
  token table. API, web, and mobile golden tests cover every emitted enum family and feature
  flag; the audit also filled eight notification kinds missing from mobile. No code generator
  or new toolchain was introduced.
- **P12 — documentation and closeout.** Active backlog is separated from historical
  rationale, superseded decisions use dated pointers, retired references were removed or
  explicitly preserved as history, endpoint status marks were checked against controllers,
  and every phase's owning-doc updates were walked. A separate verifier ran the closing gates.

## Closing verification

- .NET: **533/533 unit** and **143/143 integration** tests passed, with zero failures or
  skips.
- Web static gates: `npm test`, ESLint, JSDoc typecheck, and `audit:prod` all passed;
  the production audit reported zero vulnerabilities. Accessibility passed **4/4** and
  photo integrity passed **18/18**.
- The isolated real-flow suite passed **108/108**: search → sign-in → apply or instant
  book → host questions/counter/decision → booking → notifications → double-blind rating
  and reveal from both sides.
- Both debug bundles built. The complete sequential Web.v2 live matrix then passed across
  account/agreements, discovery/map/routes/SEO, correspondence/bookings/payments, session
  races, host listing/offline/session/publish flows, input/hit testing, accessibility, photos,
  surface ownership, and flat/world boots. Named counts included host publish **156/156**,
  host session **25/25**, discovery **58/58**, payments **69/69**, input **71/71**, surface
  **60/60**, session tabs **39/39**, SEO routes **97/97**, and the flat debug bundle **23/23**.
  Only the pre-recorded stale sets remained: guest **41/45**, exactly six Atlas world checks,
  and the retired seed/manual assumption from booking-flow §5 (the 108/108 correspondence
  suite is the live gate for both booking modes).
- The adversarial pass found and closed two product regressions: first-listing review copy now
  follows the no-exclamation-mark voice rule, and a listing whose session dies re-reads its
  already-saved availability after reauthentication before offering Publish. Stale harness
  assumptions around agreements, clean-seed counts, search readiness, anonymous refresh, and
  viewport-clipped result counts were corrected and rerun green.
- A Production-shaped stack reached healthy status with the required capability names.
  The negative smoke enabled Turnstile with an empty secret and exited before startup with
  the named validator error: `Turnstile: enabled mode requires SecretKey`.
- The repository and production copies of changesets 019–021 are byte-identical. P12 made
  no schema change, so it added no changeset and did not modify the production changelog.
- Repository Playtest cases remain archived Web.v1 artifacts; their README explicitly forbids
  running or refreshing them against v2, so no human-owned baseline was mutated. The live v2
  real-input gates above provide the current regression coverage.

## Deviations from the written plan

- P3 could not transactionally clone shared legacy photo bytes across PostgreSQL and the
  configured object store. Those duplicate groups retain their render URLs but have a null
  `StorageKey`, so deleting either row cannot delete shared bytes; all new rows are fully owned.
- P5 skipped the proposed interim awaited-send step and went directly to the outbox.
- P7 preserves the application/booking/ledger graph and redacts aged private message,
  counter-offer, and cancellation text. This satisfies correspondence retention without
  destroying financial or dispute records.
- P9 used compile-time selector scoping plus a live surface-ownership guard instead of
  cascade layers; existing specificity and load order stayed stable.
- P11 placed the golden table under shared test fixtures and deliberately kept hand-written
  client models; the plan's no-codegen cost/lock-in decision held.

## Still open

- Availability remains an in-memory refinement over a bounded candidate set. Move it into
  queryable/materialized data only when inventory pressure makes the 300-room bound inadequate.
- Launch operations remain in [`../reputation-and-launch.md`](../reputation-and-launch.md):
  Apple Developer/domain/return-URL setup and real provider sign-in, real email/geocoding/media
  credentials, Turnstile's general-release flip, Search Console/Bing/CWV work, supply onboarding,
  restore drill, monitoring, and mobile-store operations.
- Mobile universal-link association files, the area landing endpoint, and the client
  `address_suggestion_picked` analytics event remain explicitly planned rather than built.
- The browser harness retains only its documented historical stale sets; they are recorded in
  `src/Steeple.Web.v2/tools/HARNESS.md` and the affected suite headers, not treated as P12
  regressions.
