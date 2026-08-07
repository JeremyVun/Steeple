# Contracts — Steeple.Api internal architecture (ports & modules)

> **Scope:** the API's *internal* contract — which module owns what, every port interface and
> the adapter that implements it, and the rules a new module must follow. Wire shapes are in
> `discovery.md` / `identity.md` / `applications.md` / `manage.md`;
> conventions/governance: see `conventions.md`. Verified against
> `src/Steeple.Api/Extensions/ServiceCollectionExtensions.cs` (2026-08-07).

## Layering

```
controller (thin HTTP edge) → service (use-case logic + port interfaces) → proxy (adapter)
```

`Services/` own use-case logic and **define** the port interface for anything external;
`Proxies/` implement them. `AddSteepleApi` (`Extensions/ServiceCollectionExtensions.cs`) is the
composition root and the only place adapters are chosen. Cross-cutting pipeline: trusted one-hop
forwarded headers (real client IP + proto behind caddy/nginx) → JwtBearer auth
(`MapInboundClaims=false`, so `sub`/`sid` survive) → rate limiting → ProblemDetails errors.

**The limiter runs *after* authentication, and the order is load-bearing.** The per-account
policies partition on the `sub` claim; before authentication `context.User` is still
anonymous, so every one of them silently fell back to per-IP and everyone behind one NAT
shared a single bucket — which is exactly what those policies exist to avoid. Corrected
2026-08-05 (`Program.cs`), found by driving the guest loop, invisible to the test suite.

Every one of `Contracts/ Controllers/ Services/ Proxies/ Configuration/ Extensions/ Utils/`
grows by **module subfolder** (e.g. `Services/Applications/`). Folder-matched namespaces are
project-wide global usings — `Namespace = Project.Folder`, no per-file usings.

## Module map

| Module | Owns | Key services / ports |
|---|---|---|
| Discovery | search, listing detail by id/slug, suburbs, sitemap, geofence endpoint (`Controllers/ListingsApiController.cs`, route `api/v1`) | `IListingService`, `IRoomRepository`, `IGeofencePolicy` |
| Identity | SSO verification, own token issue/rotation, `/me`, agreements, deletion, devices (`Controllers/Identity/`) | `IIdentityService`, `IIdentityRepository`, `IIdTokenVerifier` (×2, +dev), `IAccessTokenIssuer`, `ITurnstileVerifier` |
| Applications | apply → message → counter-offer → decide state machine; venue-manager authz reads (`Controllers/Applications/`) | `IApplicationService`, `IApplicationRepository`, `IVenueManagerRepository` |
| Bookings | confirmation transaction (instant submit/manual approval/counter acceptance), occurrences, cancel, no-show, lazy sweeps (`Controllers/Bookings/`) | `IBookingService`, `IBookingRepository`, `ScheduleMaterializer` (pure) |
| Ratings | double-blind ratings + public review reads (`Controllers/Ratings/`) | `IRatingService`, `IRatingRepository` |
| Payments | method-on-file, per-occurrence charging + failure ladder, refunds, payout onboarding, the `PaymentSweeper` worker (`Controllers/Payments/` — `contracts/payments.md`) | `IPaymentService`, `IPaymentRepository`, `IPaymentGateway`, `ChargePlanner` (pure) |
| Notifications | inbox rows (= truth), cursor paging, email/push fan-out (`Controllers/Notifications/`) | `INotificationService`, `INotificationRepository`, `INotificationDispatcher`, `IEmailGateway`, `IPushGateway`, `IDeviceRegistry` |
| Reminders | the T−7d / T−1d upcoming-booking sweep + its sent-ledger (no controller; its worker is enabled by `ReminderOptions.Enabled`) | `IBookingReminderService`, `IBookingReminderRepository` |
| Manage | venue/room CRUD, verification requests, publish/moderation stamps (`Controllers/Manage/`) | `IManageService`, `IManageRepository`, `IVenueManagerRepository`, `IGeocodingGateway` |
| Availability | open hours + blackouts; free-window computation for guests, hosts, and the publish gate | `IAvailabilityService`, `IAvailabilityRepository`, `AvailabilityCalculator` (pure) |
| Media | photo upload pipeline + storage | `IMediaService`, `IMediaRepository`, `IImageProcessor`, `IMediaStore` |
| Flags | config-backed flag reads + the public client allowlist (`Controllers/FlagsController.cs`) | `IFeatureFlags`, `IPublicFlagsService` |
| Analytics | client event ingest + the stdout sink every module emits through | `IEventIngestService`, `IAnalyticsSink` |

Availability is consumed by other modules **only** through `IAvailabilityService` (Manage's
publish gate and Listings' public `openHours` both go through the port).

## Port → adapter

| Port | Adapter |
|---|---|
| `IRoomRepository` | `RoomRepository` (EF, bounding-box query) |
| `IGeofencePolicy` | `GeofencePolicy` (pure logic over the `Geofence` config section; singleton). **The served-area seam**: `Bounds`/`Center`/`AreaName`/`TimezoneId`/`IsServed`/`ResolveSearchBounds` are area-neutral by design — the single beachhead is this implementation's policy, and serving more areas (or the world) is a new implementation behind this port (SYSTEM_DESIGN §17, 2026-08-07) |
| `IGeocodingGateway` | `AppleMapsGeocodingGateway` (typed HttpClient + singleton `AppleMapsTokenProvider` ES256-JWT/access-token cache; geocode **and** autocomplete, US-scoped, beachhead-biased) when `Geocoding:AppleTeamId/AppleKeyId/ApplePrivateKey` are all set; else `GoogleGeocodingGateway` (geocode only) when `Geocoding:GoogleApiKey` is set; else `StubGeocodingGateway` (every address → beachhead centre, canned suggestions) |
| `IAnalyticsSink` | `StdoutLogAnalyticsSink` (one structured JSON line → stdout → Promtail/Loki) |
| `IIdTokenVerifier` ×2 (+1) | `GoogleIdTokenVerifier` / `AppleIdTokenVerifier` (JWKS via cached OIDC discovery, fail-closed without client ids); `DevIdTokenVerifier` registered **only** when `Auth:DevLoginEnabled` |
| `IIdentityRepository` | `EfIdentityRepository` (users, logins, refresh tokens, agreements) |
| `IAccessTokenIssuer` | `JwtAccessTokenIssuer` (HS256; key required; repository-known keys rejected in Production) |
| `IRefreshRotationGrace` | `MemoryRefreshRotationGrace` (per-process successor-pair cache for concurrent browser refreshes) |
| `ITurnstileVerifier` | `CloudflareTurnstileVerifier` (disabled when no secret configured — dev) |
| `IApplicationRepository` | `EfApplicationRepository` (full display-graph loads) |
| `IVenueManagerRepository` | `EfVenueManagerRepository` (read-only; Admin writes the links) |
| `IManageRepository` | `EfManageRepository` (venue/room CRUD, venue-manager-scoped) |
| `IAvailabilityRepository` | `EfAvailabilityRepository` |
| `IBookingRepository` | `EfBookingRepository` (same-room creates queue on a transaction-scoped room-row lock before the GiST exclusion check; atomic save translates SQLSTATE 23P01) |
| `IRatingRepository` | `EfRatingRepository` |
| `IPaymentGateway` | `MockPaymentGateway` (instant success; card ending 0002 declines) — `StripePaymentGateway` is the drop-in at Stripe-time |
| `IPaymentRepository` | `EfPaymentRepository` (claim-first charge rows under the partial unique index; sweep advisory lock) |
| `INotificationRepository` | `EfNotificationRepository` (cursor paging, caller-scoped mark-read) |
| `INotificationDispatcher` | `NotificationDispatcher` (inbox row first, then best-effort email + FCM push per recipient) |
| `IEmailGateway` | `ResendEmailGateway` (typed HttpClient; no-send and no PII logging without `Email:ApiKey`); wrapped by `DevMailboxEmailGateway` when `Email:DevMailboxEnabled` (Development only) |
| `IDevMailbox` | `FileDevMailbox` (JSON-lines under the content root, capped ring; registered **only** with `Email:DevMailboxEnabled`) |
| `IBookingReminderRepository` | `EfBookingReminderRepository` (read-only over bookings/occurrences; claims via `INSERT … ON CONFLICT DO NOTHING`) |
| `IPushGateway` | `FcmPushGateway` (FirebaseAdmin, data messages, dead-token cleanup) when a service account is configured, else `LoggingPushGateway` |
| `IDeviceRegistry` | `EfDeviceRegistry` (token upsert, ownership-scoped unregister) |
| `IImageProcessor` | `ImageSharpImageProcessor` (metadata-first 12,000px/30 MP/single-frame gate, two-process concurrency cap, auto-orient, full metadata strip, 400/800/1600px JPEG variants, SHA-256 keys; ImageSharp 3.1.x) |
| `IMediaRepository` | `EfMediaRepository` (manager-scoped room/photo rows) |
| `IMediaStore` | `S3MediaStore` (DO Spaces, public-read/CDN) when `MediaOptions.UseObjectStorage`, else `LocalDiskMediaStore` (dev; served by the API at `/media`) |
| `IFeatureFlags` | `ConfigFeatureFlags` (reads the `Flags:` config section — never a network call) |
| `IPublicFlagsService` | `PublicFlagsService` (hardcoded public allowlist — see `infra.md`) |
| `IEventIngestService` | `EventIngestService` (validate/allowlist/enrich, no persistence of its own) |

Lifetimes follow one rule: anything touching `SteepleDbContext` is **scoped**; pure/config-derived
and cache-holding things (geofence policy, analytics sink, token issuer, JWKS verifiers, image
processor, media store, flags) are **singletons**.

## Rate-limit policies (`Extensions/RateLimitingExtensions.cs`)

Fixed 1-minute windows: global 300/min per account/IP · `discovery` 120/min per IP ·
`auth` 10/min per IP · `refresh` 60/min per IP · `apply` 5/min per account, per-IP fallback
(application submit/message/decision/withdraw/counter writes plus booking cancel, no-show and
ratings) · `payments` 10/min per account (putting
a card on file) · `manage` 30/min per account · `media` 12/min per account ·
`availability` 30/min per IP · `events` 60/min per IP.
All answer `429` + `Retry-After` with ProblemDetails `code: rate_limited`.

`payments` was split out of `apply` on 2026-08-05: card setup is a two-call handshake in the
*middle* of an ordinary first request (submit → `402` → setup → mock-confirm → submit), so on
the shared budget a guest had spent four of five permits before they could answer the host's
first question. Anything added here should ask the same question — is this endpoint part of
somebody's single journey, or is it the journey's repetition that needs limiting?

## Module rules (hard)

1. **Nothing mutates another module's data except through the owning module's service.**
   Cross-module reads go through a port (e.g. Manage's publish gate → `IAvailabilityService`).
2. **`Api/Contracts` must not leak Persistence types.** Wire DTOs are self-contained records;
   mapping lives in `Extensions/*Mappings.cs` (`ListingMappings`, `ApplicationMappings`,
   `BookingMappings`, `ManageMappings`, `FlagEnumExtensions`, `GeoDtoExtensions`).
3. **Controllers stay thin** — bind, call one service, map the result/problem
   (`ManageProblemExtensions` turns service outcomes into ProblemDetails `code`s).
4. **New folders keep the `Namespace = Project.Folder` convention** so the project-wide global
   usings keep working.
5. **The API never migrates the database** — Liquibase owns the schema (`persistence.md`).
