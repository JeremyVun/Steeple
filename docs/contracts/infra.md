# Contracts — infra integrations (was CONTRACTS §8–§9)

> **Scope:** the contracts with things Steeple does not own — the deployed feature-flags
> service and the client flags proxy; and the non-API integration contracts (Admin edge auth,
> sub-path hosting, deep links, push payload).
> Conventions/governance: see `conventions.md`. Legend: ✅ built & live · 🔲 planned.

## 8. Feature flags service (deployed infra)

- `GET /flags` → snapshot `[{key, enabled/rule-set …}]`; `GET /flags/stream` → SSE updates.
  Steeple services consume via `Steeple.FlagsSdk` (in-memory cache, local evaluation,
  Perchd rule semantics: ordered condition rules, AND groups, default rule, deterministic
  percentage rollouts). Never block a request on the flags service.
- **Mobile/web-client flags** are proxied: `GET /api/v1/flags?platform=ios|android|web&build=<int>` ✅
  *(built 2026-07-04 — ROADMAP Phase 4)* returns the **public** flags evaluated for the caller's
  context as `{key: bool}` — clients never talk to the flags service directly, and private/ops
  flags never leave the backend. The public set is an explicit hardcoded allowlist in
  `PublicFlagsService`: `payments.enabled`, `payments.onboarding`, `mobile.apply_enabled`, `mobile.manage_enabled`,
  `mobile.force_upgrade`. Web uses `payments.enabled` to omit the account's payment-method
  block, including **Add a card**, when the payments rails are off; a missing flag snapshot
  fails closed.
  The `platform`/`build` query params feed rule conditions server-side, so value-shaped concerns
  stay boolean on the wire — today only `mobile.force_upgrade` reads `build` (a config-backed
  `Flags:MobileMinSupportedBuild` threshold: enabled when `build` is present and below it). Like
  Web's flags (CLAUDE.md carry-over), the Api's `IFeatureFlags` is config-backed
  (`Flags:<key>` section) until the flags SDK has a home in this repo — evaluation is local
  config reads only, never a network call either way.
- Naming: `<surface|domain>.<feature>` — e.g. `web.apply_from_browser`,
  `booking.recurring_materialization`, `trust.phone_otp_stepup`.

Flags read by the API today (as-built, `Flags:` config section): server-side gates
`listing.availability`, `manage.first_listing_review_required`, `manage.open_hours_required`, `booking.counter_offers`,
`payments.enabled`, `payments.onboarding` plus the three
public `mobile.*` rows. `manage.first_listing_review_required` defaults **on** as the safe
operating mode and can be disabled in Compose with `FIRST_LISTING_REVIEW_REQUIRED=false`; the
other server-side rollout flags default **off** in `appsettings.json`. Development enables all
of them so the dev loop exercises each gated path.

### Production configuration gate

`ProductionConfigurationValidator` runs before adapter registration and reports every invalid
capability in one startup error. Production requires explicit modes for Google/Apple SSO,
Turnstile, email, geocoding, media, and push; Apple, Resend, a real geocoder, and object storage
are mandatory. Turnstile may be explicitly `disabled` before general release, and push may be
explicitly `disabled`. The gate also requires an HTTPS SEO base, a non-development database
password, a non-repository JWT key, and `payments.enabled=false` while the gateway is mock.
Development is exempt and retains credential inference for local adapter testing.

General release requires Turnstile enabled on both web and API; token rejection or verifier
failure must fail sign-in/application submission closed. Apple SSO is a required Production
provider: the web build needs its Services ID and exact HTTPS redirect URI, the API must accept
that same Services ID as an audience, and the domain/return URL must match Apple Developer.
`src/Steeple.Web.v2/tools/provider-smoke-test.mjs` is the build gate proving the Production graph
exposes both Google and Apple controls; real-provider sign-in remains a deployment smoke because
it depends on the provider configuration outside this repository.

## 9. Non-API integration contracts

- **Admin edge auth (authelia):** Admin is only reachable through the authelia-gated
  hostname; it trusts the forwarded identity header (`Remote-User`) for audit
  attribution. Containers must not be reachable except via the edge proxy.
- **Forwarded headers:** caddy overwrites client forwarding headers; nginx trusts real-IP data
  only from the private Docker range, replaces `X-Forwarded-For` with one canonical address,
  and the API accepts one hop only from loopback/private Docker peers. Directly supplied
  forwarding headers are ignored. nginx applies a 5 req/s API ceiling (burst 30); the API adds
  a 300/min global account/IP ceiling plus 120/min/IP on discovery reads.
- **Sub-path hosting:** web v2 uses document-relative build assets and API URLs behind a
  stripped proxy prefix; since the clean routes (2026-08-08) `index.html` carries
  `<base href="./">`, which the client router freezes to its absolute prefix before the first
  history write, and API-rendered documents emit an explicit prefix-aware `<base>`.
  **Crawler-facing URLs (canonicals, `og:url`, sitemap locs, the robots `Sitemap:` line) come
  only from `Seo:PublicBaseUrl` — a prefix deployment requires it; forwarded headers are never
  consulted** (`docs/contracts/seo.md`). Admin maps `X-Forwarded-Prefix` to `PathBase` and
  derives emitted URLs from `~/`-relative helpers — see CLAUDE.md.
- **Web deep links** ✅ *(2026-08-08)*: a shared `/space/{venueSlug}/{roomSlug}` URL is a real
  server document that opens the map product at that URL (`docs/contracts/seo.md`); email CTAs
  keep the `?goto=` grammar because the rest of the registry's paths (`/inbox/...`,
  `/bookings/{id}`) are deliberately not web routes. Unknown web paths are a real 404, never
  the shell at 200.
- **Mobile universal links** 🔲: the deployed web surface must serve
  `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`, config-driven
  (`DeepLinks:AppleAppId`, `DeepLinks:AndroidPackage`, `DeepLinks:AndroidSha256Fingerprints`) —
  absent config 404s both rather than serving a bogus association (dev default, until the mobile
  app is registered). AASA covers `applinks.details[].paths: ["/space/*"]`. The canonical listing
  URL `https://<host>/space/{venueSlug}/{roomSlug}` must open the app's listing screen when
  installed (fallback: web page). Custom scheme `steeple://` for auth callbacks only.
- **Push payload** ✅ *(built 2026-07-04 — ROADMAP Phase 4, `IPushGateway`)*: FCM data messages
  `{notificationId, type, deepLink}`; render from the inbox, never trust push content as the
  record. `deepLink` is a **path-only canonical path** from the client deep-link registry
  (`mobile.md` §7): `/inbox/applications/{id}`, `/bookings/{id}`, `/inbox`,
  `/space/{venueSlug}/{roomSlug}`. Clients route unknown values to browse, never an error.
- **Media object ownership** ✅ *(hardened 2026-08-09)*: each uploaded `room_photos` row
  owns one immutable prefix, `rooms/{roomId}/{photoId}`, with `400.jpg`, `800.jpg`, and
  `1600.jpg` beneath it. Upload writes are compensated on partial variant or database failure.
  PostgreSQL enforces unique non-null `StorageKey`, unique `(RoomId, SortOrder)`, and at most
  one `IsPrimary` row per room; concurrent placement retries only those named position
  conflicts. Those indexes are not deferrable, so every multi-row placement write (reorder,
  make-primary, delete-and-promote) is staged in phases inside one transaction — positions vacate
  to a private negative range and the old cover is demoted or deleted before the new one claims
  it — rather than trusting EF's statement order within a `SaveChanges`.
  Changelog 019 preserves formerly shared content-hash images as URL-only legacy
  rows (`StorageKey = null`), so deleting either row cannot delete bytes another row renders.

## Inbox SSE delivery (2026-09-06)

`GET /api/v1/me/notifications/stream` flushes event-stream bytes with
`X-Accel-Buffering: no` and `Cache-Control: no-store, no-transform`; keep its responses
out of compression/buffering transforms. Preserve nginx IP/global request limiting,
forwarded-prefix behavior and document-relative web URLs. Verify bytes while the response
remains open at `/` and a stripped prefix; header visibility alone is not evidence.
Deploy migration 022 before API, then the web bundle. Mobile stays on FCM plus snapshots.
Local proxy evidence and the separate deployed-Caddy smoke gate live in
[the stream runbook](../runbooks/notification-stream.md).

## Stripe host setup (2026-09-06)

`payments.onboarding` controls host setup independently from guest payment intake. Compose
forwards the sandbox secret through `Payments:Connect:SecretKey`; it is never a web build arg.
Callback URLs use `Payments:Connect:WebBaseUrl`, including any stripped hosting prefix.
Live keys are rejected in this slice. The signature-verified account webhook remains enabled
with configured Stripe credentials even when the onboarding UI flag is off. Full variable map,
Stripe Dashboard requirements, and AU platform limitation: [Stripe runbook](../runbooks/stripe.md).

## Release readiness (2026-09-20)

`GET /health` is process liveness. `GET /health/ready` checks database access and the booking
schema (including migration 024), with a three-second database deadline. It returns 503 on
failure without exposing connection details. Local and deployment API health checks use it.
The API still never migrates. Deploy schema, API and web as a coordinated release; migration
024 requires its matching API because older code inferred collection mode from price presence.
The infra migration bundle includes 022–024 and omits only local fixture migrations 002/012/018.
`python3 tools/check-deploy-migrations.py` verifies SQL and changeset parity without reading env files; historical comment differences and the intentionally omitted 010 seed repricing are preserved.
