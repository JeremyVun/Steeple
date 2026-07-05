# Steeple — Architecture (as-built)

> The **as-built** state of the system, updated as slices land. Target-state design +
> decision log: `SYSTEM_DESIGN.md`. Wire contracts: `CONTRACTS.md`. What's next:
> `docs/backlog/`. Flutter app design: `MOBILE_DESIGN.md`.

## Current state — ROADMAP Phases 0–4 complete; Phase 5 code slice landed (2026-07-04)

The full two-sided loop runs on web and mobile: geo-fenced **discovery** (search/filter/map/
detail, shareable URLs) → **SSO sign-in** (Google/Apple) → **apply** with intent + venue-local
schedule → provider **approve / ask / decline** → **booking** with DB-enforced
no-double-booking, notifications (inbox + email + push), cancellation and no-show handling.
Providers can now self-serve: create a venue, add rooms, upload photos, and request publish,
with Admin moderating only the first publish per room.

**Phase 4** shipped the Flutter app (`/mobile`) — MOBILE_CONTRACTS seams, every organizer
screen, FCM push, the analytics/flags client proxies, Web's `/.well-known` deep-link files.
Remaining Phase 4 work is release/ops, not code (Firebase project, store setup).

**Phase 5 (code) as of 2026-07-04:** provider self-service — the **Manage** module (venue/room
CRUD, host ownership/lease-authority verification requests, real Google geocoding,
moderation-gated publish) and the **Media** module (EXIF-stripped JPEG variants → DO Spaces or
local disk) are both built; see their sections below and `CONTRACTS.md` §6 for the wire shapes.
Admin gained a moderation panel.

**Not built yet:** WebP image variants (deferred — SYSTEM_DESIGN §17), flags SDK
wiring (config-backed `IFeatureFlags` interim, in Web/Api/Admin), search day/time availability
filters, mobile client-side Turnstile (apply sends an empty token; only enforced where a secret
is configured), mobile `manage` screens (data layer + contracts exist; screens are the
in-progress fast-follow — ROADMAP Phase 5).

## Solution layout

```
Steeple.slnx
├─ db/changelog            — Liquibase formatted SQL: schema + seed (owns the DB; no app migrates)
├─ src/Steeple.Persistence — entities, value objects, enums, SteepleDbContext, EF Configurations/
├─ src/Steeple.Api         — the one JSON API. Module subfolders inside each of:
│    Contracts/ Controllers/ Services/ (ports) Proxies/ (adapters) Configuration/ Extensions/ Utils/
├─ src/Steeple.Web         — MVC + HTMX + Leaflet BFF. No DB, no shared server assembly; own view models.
├─ src/Steeple.Admin       — HTMX operator dashboard; reads Postgres directly via Persistence.
├─ mobile/                 — Flutter app (HTTP → Api only). Feature-first; seams in MOBILE_CONTRACTS.md.
└─ tests/                  — Steeple.Api.Tests (unit) + Steeple.Integration.Tests (Testcontainers Postgres)
```

Strict dependency rule: `Web → HTTP → Api → Persistence ← Admin`. `Api/Contracts` are
self-contained (no Persistence types on the wire). Folder-matched namespaces are
registered as project-wide global usings per csproj.

## Layering — `controller → service (ports) → proxy (adapters)`

Controllers are thin HTTP edges; `Services/` own use-case logic and define **port**
interfaces for everything external; `Proxies/` implement them. `AddSteepleApi`
(`Extensions/ServiceCollectionExtensions.cs`) wires adapters into the container.
Cross-cutting: forwarded headers (real client IPs + `X-Forwarded-Prefix` behind caddy) →
rate limiting → JwtBearer auth (`MapInboundClaims=false`) → ProblemDetails errors.

| Port | Adapter |
|---|---|
| `IRoomRepository` | `RoomRepository` (EF, bounding-box query) |
| `IGeofencePolicy` | `GeofencePolicy` (pure logic over config) |
| `IGeocodingGateway` | `GoogleGeocodingGateway` (geocodes provider address entry, US-scoped; falls back to `StubGeocodingGateway` — beachhead centre — when `Geocoding:GoogleApiKey` is unset) |
| `IAnalyticsSink` | `StdoutLogAnalyticsSink` (structured JSON line → stdout → Promtail/Loki) |
| `IIdTokenVerifier` ×2 | `GoogleIdTokenVerifier` / `AppleIdTokenVerifier` (JWKS via cached OIDC discovery; fail-closed without client ids) |
| `IIdentityRepository` | `EfIdentityRepository` (users, logins, refresh tokens, agreements) |
| `IAccessTokenIssuer` | `JwtAccessTokenIssuer` (HS256; `Auth:Jwt:SigningKey` required at startup) |
| `ITurnstileVerifier` | `CloudflareTurnstileVerifier` (disabled when no secret configured — dev) |
| `IApplicationRepository` | `EfApplicationRepository` (full display-graph loads) |
| `IVenueManagerRepository` | `EfVenueManagerRepository` (read-only; Admin writes the links) |
| `INotificationRepository` | `EfNotificationRepository` (cursor paging, caller-scoped mark-read) |
| `INotificationDispatcher` | `NotificationDispatcher` (inbox row first, then best-effort email + FCM data-message push per recipient) |
| `IEmailGateway` | `ResendEmailGateway` (HTTP API; log-only without `Email:ApiKey`) |
| `IPushGateway` | `FcmPushGateway` (FirebaseAdmin, data messages, dead-token cleanup) / `LoggingPushGateway` when unconfigured |
| `IDeviceRegistry` | `EfDeviceRegistry` (token upsert, ownership-scoped unregister) |
| `IBookingRepository` | `EfBookingRepository` (exclusion-violation-aware atomic save) |
| `IVenueManagerRepository` / `IManageRepository` | `EfVenueManagerRepository` (read-only) / `EfManageRepository` (venue/room CRUD, venue-manager-scoped) |
| `IImageProcessor` | `ImageSharpImageProcessor` (decode-as-validation, auto-orient, full metadata strip, 400/800/1600px JPEG variants, SHA-256 content-addressed keys; pinned to ImageSharp 3.1.x — SYSTEM_DESIGN §17) |
| `IMediaStore` | `S3MediaStore` (DO Spaces, public-read/CDN) / `LocalDiskMediaStore` (dev fallback, served at `/media`) — chosen at startup by whether `Media:ServiceUrl` etc. are configured |

## Modules (as built)

**Discovery** — geo-fenced search (bounding box in SQL + in-process haversine), listing
detail by id/slug, suburbs, sitemap (lastmod = later of room/venue `UpdatedAtUtc`),
geofence endpoint. Only Published rooms are publicly visible: search filters status in
SQL *and* the service gates direct id/slug lookups (Draft/Unlisted → 404). Wire enums are
stable camelCase tokens; clients humanize.

**Identity** — `POST /auth/sessions` verifies Google/Apple ID tokens server-side, finds-
or-creates by `(Provider, Subject)`, and issues the API's **own tokens**: ~15-min HS256
access JWT (`sub` + `sid`) + opaque rotating refresh token (only the SHA-256 hash stored,
one *family* per sign-in). `POST /auth/refresh` rotates within the family; presenting a
rotated token revokes the whole family (`401 token_reuse`). Same verified email on a
second provider → `409 use_original_provider` (no auto-linking). `GET /me`,
`POST /me/agreements` (idempotent per user/doc/version), `DELETE /auth/sessions`,
`DELETE /me/sessions`, `DELETE /me` (anonymize: PII cleared, logins removed, tokens
revoked, agreements kept as legal records; row survives for booking/rating integrity).
Abuse controls: per-IP `auth` rate-limit policy (429 + `Retry-After`) + Turnstile.

**Applications** — submit requires auth + Turnstile + per-account
`apply` rate limit + `Idempotency-Key` (replays return the original). State machine
`Pending → NeedsInfo ⇄ → Approved | Declined | Withdrawn | Expired`; the *thread* drives
NeedsInfo (provider message parks it, organizer answer returns it). Party-scoped reads —
non-parties 404, and unknown ≡ unpublished on submit (no existence leak). Decisions
restricted to `venue_managers`. 14-day expiry is a **lazy sweep on read** (no worker).
`GET /manage/venues` tells clients whether to show a provider surface.

**Notifications** — dispatcher writes the inbox row first (inbox = truth), then
fire-and-forget plain-text email. `GET /me/notifications` is cursor-paginated (opaque
`(CreatedAtUtc, Id)` cursor); `POST /me/notifications/read` is caller-scoped.

**Bookings** — **approval is the booking transaction**: application flip + booking +
materialized occurrences commit in one `SaveChanges` (one DB transaction); an exclusion
violation (SQLSTATE 23P01, translated in `EfBookingRepository`) aborts it all → the
application auto-declines with notice and the provider gets `409 slot_taken`;
first-approval-wins falls out for free. `ScheduleMaterializer` (pure, unit-tested) turns
venue-local wall-clock into per-date UTC instants in the venue's IANA zone — DST-correct:
spring-forward gap times shift forward by the gap, fall-back ambiguity resolves to
standard time; `[)` ranges keep back-to-back slots compatible. Reads run **lazy sweeps**
(no workers): past `Scheduled` → `Occurred`; nothing left to hold → `Completed`; a
recurring term entering its last 14 days gets its one renewal nudge
(`RenewalNudgeSentAtUtc`). Cancel (either party): occurrences starting beyond the **48h
notice window** are freed, nearer ones stand; other party notified. No-show: either party
marks the other on a past, non-cancelled occurrence (feeds ratings in Phase 6).

**Ratings** — Phase 6 Slice 1. `POST /bookings/{id}/ratings` writes one immutable
rating per booking direction (`RateeType = Venue` for organizer→venue,
`Organizer` for venue-manager→organizer), inferred from the authenticated party. Eligibility
opens after the first `Occurred`/`NoShow` occurrence and closes 14 days after the booking's
completion/cancellation window; writes use the same `apply` rate-limit policy. Visibility is
double-blind and computed at read time: a row contributes to booking displays, listing
aggregates, and organizer summaries only once both directions exist or the window closes.
Optional comments (≤1000 chars) are immutable with the rating; public venue review pages show
revealed, non-hidden venue-directed comments newest-first. Admin can hide/unhide rating rows via
`HiddenAtUtc`; hidden rows drop out of aggregates and public/booking displays.

**Manage** (provider self-service, Phase 5) — venue-manager-scoped venue/room CRUD plus host
ownership/lease-authority verification; wire shapes and endpoint list are `CONTRACTS.md` §6.
`SaveVenueRequest`/`SaveRoomRequest` treat `null` fields as "unchanged" on PATCH. Address
create/edit geocodes via `IGeocodingGateway` and re-checks the geofence (`400
geofence_rejected` outside it). Verification requests store evidence summaries and
externally-hosted/signed document links only, not raw deed/lease/ID contents; Admin approval
sets `venues.IsIdentityVerified`. Slugs (`Utils/Slugs.cs`) are derived once from the name and
**immutable** — renames never break a shared listing URL.
**Moderation model:** a room that has never been approved (`FirstPublishedAtUtc IS NULL`)
asking for `published` instead stamps `PublishRequestedAtUtc` and waits in the Admin queue;
approval requires the venue to be verified, then sets `Published` + stamps
`FirstPublishedAtUtc` (once, ever). After that, unlist/relist is entirely provider-controlled
— no further gate. Edits to an already-published
room apply immediately but stamp `ProviderEditedAtUtc`, which is Admin's after-the-fact review
signal, not a block. Both timestamp columns (006-manage.sql) carry partial indexes so the
Admin queue/feed scans stay cheap. Writes run behind the `manage` rate-limit policy
(30/min/account).

**Availability** (availability plan, commit 4) — a room's bookable rules: open hours
(`room_open_hours`, per-weekday `[start, end)` windows) and blackout dates
(`room_blackout_dates`), venue-manager-scoped GET/PUT at
`/manage/rooms/{id}/availability` (replace-all; validation rules in CONTRACTS §6). Other
modules consume it only via `IAvailabilityService` — Manage's publish gate
(`400 no_open_hours`, behind `manage.open_hours_required`) and Listings' additive public
`openHours` both go through the port. Guest-facing computation (commit 5): the pure
`AvailabilityCalculator` does `[)` interval subtraction (open hours − blackouts −
*confirmed* booked time; pending demand never leaks) and classifies occurrences
(`blackout` > `outsideOpenHours` > `booked`); it feeds the anonymous
`GET /listings/{id}/availability` + `POST …/availability/check` endpoints (per-IP
`availability` policy, behind `listing.availability`) and the apply-time hard block
(`409 schedule_unavailable`, skipped for rooms with no rules). Host review (commit 7)
reuses the same engine: manager detail reads of undecided applications carry a
`conflicts` digest (per-date reasons + overlapping pending demand — host-only, never
organizer-visible), and `GET /manage/venues/{id}/calendar` composes confirmed occurrences
with pending-application overlays across a venue's rooms. Rules are **advisory
shaping** for guests and hosts; the `booking_occurrences` exclusion constraint remains
the only booking authority.

**Media** (Phase 5) — photo upload for managed rooms, same venue-manager scoping. `Upload`
decodes the file (failure → `400 invalid_image`, this *is* the content validation),
auto-orients from EXIF, strips all metadata (EXIF/XMP/IPTC — GPS included), re-encodes JPEG
variants at 400/800/1600px (`ImageSharpImageProcessor`, never upscaling a smaller source), and
keys the stored objects by a SHA-256 content hash. `IMediaStore` is `S3MediaStore` (DO Spaces,
public-read/CDN) when `Media:ServiceUrl`/bucket/keys are configured, else `LocalDiskMediaStore`
(dev; the API itself serves `/media` and therefore publishes a loopback port in compose — see
Deployment). `RoomPhotoDto` carries `id`/`thumbUrl`/`cardUrl` alongside the legacy `url`
(full-size, still populated for seeded picsum rows); cards prefer `cardUrl`. Metadata
edits/deletes run behind `manage`; upload behind the pricier `media` policy (12/min/account) —
10 MB cap enforced by Kestrel before the pipeline runs.

**Web BFF** — sign-in: **Google Identity Services button** (its JS callback POSTs the
credential same-origin, so the standard antiforgery token applies) and **Apple redirect +
cross-site `form_post`** (guarded by a DataProtection-signed state+nonce cookie; Apple's
one-time `user` name JSON forwarded as the `displayName` hint). The BFF exchanges the ID
token at the API and keeps the token pair inside the encrypted `steeple.auth` cookie —
the browser never sees a token; `SteepleCookieEvents` rotates the pair transparently near
expiry and signs the browser out when the family is dead. **DataProtection keys persist**
to compose volume `steeple_web_keys` (or every deploy logs everyone out). Global
`AutoValidateAntiforgeryToken` on POSTs. Surfaces: `/login` (flag `web.sign_in_enabled`),
`/account`, versioned ToS/Privacy (`LegalDocuments`; acceptance recorded at sign-in),
apply flow `/space/{v}/{r}/apply` (fillable anonymously — SSO gate at submit; the drafted
form is stashed in session and restored, its idempotency key surviving the round-trip),
organizer `/inbox` + thread, provider `/manage/applications`, `/bookings` +
`/manage/bookings` + booking detail (occurrence timeline, cancel-with-reason, quiet
no-show marking, renewal nudge card); provider listings editor `/manage/venues/{new,id}` +
room/photo forms (flag `web.manage_enabled`, 404 when off) calling the Manage/Media endpoints.

**Mobile** (`/mobile`, Flutter) — the organizer's home. Feature-first
(`presentation → application → data`), Riverpod 3 (no codegen), go_router 4-tab shell
with the MOBILE_CONTRACTS §7 route registry and redirect chain (force-upgrade flag →
splash hold → auth gate). One shared dio behind an `ApiClient` facade; every repository
failure is an `AppError` mapped from ProblemDetails. `SessionManager` owns the secure-
storage token pair with single-flight refresh and forced-sign-out on `token_reuse`.
The theme (`lib/app/theme/`) is a 1:1 binding of DESIGN_SYSTEM tokens (Lora is the one
bundled font); `core/widgets/` implements the §8 canonical component set (status chips,
listing card, rasterized map pins, skeletons, SSO sheet). All screens run against
fixture-backed fakes (`--dart-define=STEEPLE_FAKES=true`, no backend) — fixtures are
copied verbatim from CONTRACTS.md and round-trip-tested, which is the contract-drift
alarm. Push (FCM), analytics batching (`POST /events`), and the flags snapshot
(`GET /flags`) are wired behind `core/` seams; Firebase/maps/SSO keys are release-time
config (see `mobile/README.md`).

**Admin** — HTMX dashboard over Postgres via Persistence; no in-app auth **by design**
(authelia at the edge; trusts the forwarded `Remote-User` header for audit attribution).
Live listings/applications/bookings/analytics panels; venue-manager linking by sign-in
email (the concierge step that makes a church account a provider); manual application
force-status repair (operator override, no notifications); bulk listing status changes
honor bookings (rooms with upcoming confirmed occurrences can't leave Published) and
stamp `UpdatedAtUtc`. **Moderation panel** (`/admin/moderation`): lists rooms with a pending
`PublishRequestedAtUtc` (approve/decline, optional note), pending venue verification requests
(approve marks `IsIdentityVerified`, decline records the operator note), and the
`ProviderEditedAtUtc` review feed (mark-reviewed clears the stamp, no other effect). Listing
approval is blocked until the venue is verified. Every listing decision writes a
`listingApproved`/`listingDeclined` inbox row to the venue's managers directly (Admin has no
email/push fan-out of its own — the inbox row is the whole notification) and logs a
`listing_moderated` stdout line in the same shape as `IAnalyticsSink`; verification decisions
log `venue_verification_decided`. POST actions
attribute to the forwarded `Remote-User` header, falling back to `"local-dev"` when absent
(local runs have no edge proxy in front). Users/flags panels are still placeholders.

**Tests** — `Steeple.Api.Tests` (unit: geofence, geo math, listing visibility,
`ScheduleMaterializer` DST cases) and `Steeple.Integration.Tests` (Testcontainers
Postgres, Liquibase SQL applied raw). `BookingIntegrityTests` proves the headline
invariant: 6 truly concurrent approvals of the same slot on separate connections →
exactly one booking; plus DST-correct UTC asserted in the DB, back-to-back slots coexist,
cancellation frees the slot.

## Domain model & invariants

```
Venue 1─* Room 1─* RoomPhoto
  slug, address, lat/long (indexed), IsIdentityVerified, venue type, Timezone (IANA),
  UpdatedAtUtc, ProviderEditedAtUtc (Phase 5)
                        Room: capacity, price (null = FREE), house rules, flags enums as
                        int bitmasks (Amenity / AccessibilityFeature / ActivityType),
                        Status (Draft/Published/Unlisted), UpdatedAtUtc,
                        PublishRequestedAtUtc / FirstPublishedAtUtc / ProviderEditedAtUtc
                        (Phase 5 moderation state — CONTRACTS §6)
                                RoomPhoto: legacy Url (full-size, always populated) +
                                StorageKey/ThumbUrl/CardUrl/CreatedAtUtc (Phase 5 uploads)

users 1─* user_logins (unique (Provider, Subject))    users 1─* refresh_tokens (hashed, rotating)
users 1─* user_agreements (per-version ToS/Privacy)   users 1─* notifications (inbox = truth)
users 1─* devices                                     venues 1─* venue_managers *─1 users
venues 1─* venue_verification_requests 1─* venue_verification_documents

rooms 1─* applications *─1 users (organizer)
  ActivityType, GroupSize, venue-local schedule (dates/times + optional DayOfWeek),
  IntentText, Status, ExpiresAtUtc; unique filtered (OrganizerId, IdempotencyKey)
  applications 1─* application_messages (the "ask" thread)

applications 1─0..1 bookings (created only by approval; unique ApplicationId; EndDate always bounded)
  bookings 1─* booking_occurrences (denormalized RoomId; UTC StartUtc/EndUtc; venue-local LocalDate)
    EXCLUDE USING gist ("RoomId" WITH =, tstzrange("StartUtc","EndUtc") WITH &&)
      WHERE ("Status" <> 3)      ← cancelled rows leave the constraint = cancellation frees slots
  bookings 1─* ratings (unique (BookingId, RateeType); Stars 1..5; Comment?; HiddenAtUtc?; VenueId/OrganizerId denormalized)
```

- **No double-booking:** occurrence rows exist only for confirmed bookings; the
  `btree_gist` exclusion constraint rejects overlap atomically; applications never hold
  slots. The constraint is an *expression* over two `timestamptz` columns (no range
  column) so Persistence stays provider-agnostic.
- **Bounded recurrence:** occurrences are a finite set materialized at approval; renewal
  = a *new* booking re-checking availability.
- **Timezone correctness:** schedules are venue-local wall-clock, materialized per-date
  in `venues.Timezone` — never by adding fixed UTC intervals.
- **State machines** validated in services; statuses stored as int, stable camelCase
  strings on the wire.
- Flags-enum filtering is a bitwise mask in SQL; multi-value matching is **AND** ("room
  accepts *all* requested").

## Geofence

One hardcoded beachhead (config section `Geofence`) — currently Vienna & nearby, Northern
Virginia (`lat 38.84–38.96, lng -77.34–-77.12`). `GeofencePolicy` clamps any requested
viewport/radius into the beachhead (out-of-area → empty results, not errors) and rejects
out-of-area detail lookups. Launch-suburb swap = one config change.

## Data / persistence

- **Postgres = system of record** (local dev: compose, Postgres 18, host port **5433**).
- Schema + seed owned by a one-shot **Liquibase** service (`db/changelog/`, formatted
  SQL) that runs between postgres-healthy and the apps — no application migrates.
- **EF Core 10 + Npgsql, database-first**: Persistence mirrors the Liquibase schema by
  hand, kept in sync column-for-column. Connection string key `SteepleDb`.
- Search is bounding-box + haversine — no PostGIS at one-suburb scale.

## Routes

Web: `/` (map + filterable grid), `/search` (HTMX partial), `/space/{venueSlug}/{roomSlug}`
(+ `/apply`), `/listings/{id}` (canonical redirect), `/login`, `/account`, `/inbox`,
`/manage/applications`, `/bookings`, `/manage/bookings`,
`/manage/venues/{new,id}` (+ room/photo forms, flag `web.manage_enabled`).
Admin: `/admin/moderation` (publish-request decisions, venue verification, provider-edit review
feed, review-comment hide/unhide).

API: full specs in `CONTRACTS.md` — Discovery §3, Identity §4, Applications /
Notifications / Bookings §5, Manage §6.

## Deployment — reverse proxy & sub-path hosting

Web + Admin are **path-base aware** so the stack can sit under a sub-path (e.g.
`jeremyvun.com/steeple`) or a domain root:

- The edge proxy (caddy) sends `X-Forwarded-Prefix: /steeple`; both `Program.cs` map it
  into `Request.PathBase` via `ForwardedHeaders.XForwardedPrefix`.
- Every emitted link derives from `PathBase`: views use `~/…` for `href`/`action`/`src`
  and `@Url.Content("~/…")` for HTMX `hx-get`/`hx-post` and server-built paths;
  controllers use route-based redirects; `SteepleControllerBase.BaseUrl` appends
  `PathBase` so SEO (canonical/OG/sitemap/robots) carries the prefix.
- With no `X-Forwarded-Prefix` (local runs) everything resolves at `/` — the prefix
  lives only in the proxy config.
- Proxy rules (admin first — more specific): Web `handle_path /steeple/*` (strips the
  whole prefix); Admin `handle /steeple/admin*` + `uri strip_prefix /steeple` (keeps the
  app's own `/admin` segment). Both add `header_up X-Forwarded-Prefix /steeple`.

> **Trust note:** both apps clear `KnownProxies`/`KnownIPNetworks`, so forwarded headers
> are trusted from any source. Keep the containers reachable **only via caddy** (don't
> publish dev host ports publicly) so the prefix can't be spoofed.

Compose runs containers in **Production** (HSTS, secure cookies); only web/admin publish
host ports — the api is compose-internal, **except** a `127.0.0.1`-bound loopback port
(`API_PORT`, default 8081) that exists purely so browsers can fetch photo URLs when the dev
stack has no Spaces credentials configured and falls back to `LocalDiskMediaStore` (which the
API serves itself at `/media`). It's dev-only, not reachable off the host, and unnecessary once
`MEDIA_*` env vars point at real Spaces (deviation from the "api compose-internal" rule —
SYSTEM_DESIGN §17). The api's `steeple_api_media` volume backs that local-disk store.
