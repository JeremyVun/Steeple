# Contracts — Steeple.Api internal architecture (ports & modules)

> **Scope:** the API's *internal* contract — which module owns what, every port interface and
> the adapter that implements it, and the rules a new module must follow. Wire shapes are in
> `discovery.md` / `identity.md` / `applications.md` / `manage.md`;
> conventions/governance: see `conventions.md`. Verified against
> `src/Steeple.Api/Extensions/ServiceCollectionExtensions.cs` (2026-08-05).

## Layering

```
controller (thin HTTP edge) → service (use-case logic + port interfaces) → proxy (adapter)
```

`Services/` own use-case logic and **define** the port interface for anything external;
`Proxies/` implement them. `AddSteepleApi` (`Extensions/ServiceCollectionExtensions.cs`) is the
composition root and the only place adapters are chosen. Cross-cutting pipeline: forwarded
headers (real client IPs + `X-Forwarded-Prefix` behind caddy) → rate limiting → JwtBearer auth
(`MapInboundClaims=false`, so `sub`/`sid` survive) → ProblemDetails errors.

Every one of `Contracts/ Controllers/ Services/ Proxies/ Configuration/ Extensions/ Utils/`
grows by **module subfolder** (e.g. `Services/Applications/`). Folder-matched namespaces are
project-wide global usings — `Namespace = Project.Folder`, no per-file usings.

## Module map

| Module | Owns | Key services / ports |
|---|---|---|
| Discovery | search, listing detail by id/slug, suburbs, sitemap, geofence endpoint (`Controllers/ListingsApiController.cs`, route `api/v1`) | `IListingService`, `IRoomRepository`, `IGeofencePolicy` |
| Identity | SSO verification, own token issue/rotation, `/me`, agreements, deletion, devices (`Controllers/Identity/`) | `IIdentityService`, `IIdentityRepository`, `IIdTokenVerifier` (×2, +dev), `IAccessTokenIssuer`, `ITurnstileVerifier` |
| Applications | apply → message → counter-offer → decide state machine; venue-manager authz reads (`Controllers/Applications/`) | `IApplicationService`, `IApplicationRepository`, `IVenueManagerRepository` |
| Bookings | approval-as-transaction, occurrences, cancel, no-show, lazy sweeps (`Controllers/Bookings/`) | `IBookingService`, `IBookingRepository`, `ScheduleMaterializer` (pure) |
| Ratings | double-blind ratings + public review reads (`Controllers/Ratings/`) | `IRatingService`, `IRatingRepository` |
| Notifications | inbox rows (= truth), cursor paging, email/push fan-out (`Controllers/Notifications/`) | `INotificationService`, `INotificationRepository`, `INotificationDispatcher`, `IEmailGateway`, `IPushGateway`, `IDeviceRegistry` |
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
| `IGeofencePolicy` | `GeofencePolicy` (pure logic over the `Geofence` config section; singleton) |
| `IGeocodingGateway` | `GoogleGeocodingGateway` (typed HttpClient, US-scoped) when `Geocoding:GoogleApiKey` is set, else `StubGeocodingGateway` (every address → beachhead centre) |
| `IAnalyticsSink` | `StdoutLogAnalyticsSink` (one structured JSON line → stdout → Promtail/Loki) |
| `IIdTokenVerifier` ×2 (+1) | `GoogleIdTokenVerifier` / `AppleIdTokenVerifier` (JWKS via cached OIDC discovery, fail-closed without client ids); `DevIdTokenVerifier` registered **only** when `Auth:DevLoginEnabled` |
| `IIdentityRepository` | `EfIdentityRepository` (users, logins, refresh tokens, agreements) |
| `IAccessTokenIssuer` | `JwtAccessTokenIssuer` (HS256; `Auth:Jwt:SigningKey` required at startup) |
| `ITurnstileVerifier` | `CloudflareTurnstileVerifier` (disabled when no secret configured — dev) |
| `IApplicationRepository` | `EfApplicationRepository` (full display-graph loads) |
| `IVenueManagerRepository` | `EfVenueManagerRepository` (read-only; Admin writes the links) |
| `IManageRepository` | `EfManageRepository` (venue/room CRUD, venue-manager-scoped) |
| `IAvailabilityRepository` | `EfAvailabilityRepository` |
| `IBookingRepository` | `EfBookingRepository` (exclusion-violation-aware atomic save; translates SQLSTATE 23P01) |
| `IRatingRepository` | `EfRatingRepository` |
| `INotificationRepository` | `EfNotificationRepository` (cursor paging, caller-scoped mark-read) |
| `INotificationDispatcher` | `NotificationDispatcher` (inbox row first, then best-effort email + FCM push per recipient) |
| `IEmailGateway` | `ResendEmailGateway` (typed HttpClient; log-only without `Email:ApiKey`) |
| `IPushGateway` | `FcmPushGateway` (FirebaseAdmin, data messages, dead-token cleanup) when a service account is configured, else `LoggingPushGateway` |
| `IDeviceRegistry` | `EfDeviceRegistry` (token upsert, ownership-scoped unregister) |
| `IImageProcessor` | `ImageSharpImageProcessor` (decode-as-validation, auto-orient, full metadata strip, 400/800/1600px JPEG variants, SHA-256 content-addressed keys; ImageSharp pinned to 3.1.x — SYSTEM_DESIGN §17) |
| `IMediaStore` | `S3MediaStore` (DO Spaces, public-read/CDN) when `MediaOptions.UseObjectStorage`, else `LocalDiskMediaStore` (dev; served by the API at `/media`) |
| `IFeatureFlags` | `ConfigFeatureFlags` (reads the `Flags:` config section — never a network call) |
| `IPublicFlagsService` | `PublicFlagsService` (hardcoded public allowlist — see `infra.md`) |
| `IEventIngestService` | `EventIngestService` (validate/allowlist/enrich, no persistence of its own) |

Lifetimes follow one rule: anything touching `SteepleDbContext` is **scoped**; pure/config-derived
and cache-holding things (geofence policy, analytics sink, token issuer, JWKS verifiers, image
processor, media store, flags) are **singletons**.

## Rate-limit policies (`Extensions/RateLimitingExtensions.cs`)

Fixed 1-minute windows: `auth` 10/min per IP · `apply` 5/min per account, per-IP fallback
(submits, thread messages, counter-offers, ratings) · `manage` 30/min per account ·
`media` 12/min per account · `availability` 30/min per IP · `events` 60/min per IP.
All answer `429` + `Retry-After` with ProblemDetails `code: rate_limited`.

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
