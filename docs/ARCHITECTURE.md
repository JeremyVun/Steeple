# Steeple — Architecture (as-built)

> The **as-built** state of the system, updated as slices land. Target-state design +
> decision log: `SYSTEM_DESIGN.md`. Wire contracts: `CONTRACTS.md` (the §-number index)
> over `docs/contracts/` (one file per seam — load only the seam you need). What's next:
> `docs/backlog/`. Flutter app design: `MOBILE_DESIGN.md`.

## Current state — ROADMAP Phases 0–5 complete (code); ratings + availability landed 2026-07-05; web v2 became the active web surface 2026-08-05

The API, mobile app, and deprecated web v1 reference implement the full two-sided loop:
geo-fenced discovery → SSO → apply → provider decision → booking with DB-enforced
no-double-booking, notifications, cancellation, and no-show handling. Active web v2 uses
the real API for catalog, application submit, and provider listing creation, but its inbox,
request decisions, and production SSO are still integration work. Admin moderates each host's
first listing; everything that host lists afterwards publishes itself.

**Phase 4** shipped the Flutter app (`/mobile`) — MOBILE_CONTRACTS seams, every organizer
screen, FCM push, and the analytics/flags client proxies. The deprecated web v1 source still
contains the `/.well-known` deep-link endpoints; web v2 does not yet serve replacements.
Remaining Phase 4 work includes that move plus release/ops (Firebase project, store setup).

**Phase 5 (code) as of 2026-07-04:** provider self-service — the **Manage** module (venue/room
CRUD, host ownership/lease-authority verification requests, real Google geocoding,
moderation-gated publish) and the **Media** module (EXIF-stripped JPEG variants → DO Spaces or
local disk) are both built; see their sections below and `CONTRACTS.md` §6 for the wire shapes.
Admin gained a moderation panel.

**Not built yet:** WebP image variants (deferred — SYSTEM_DESIGN §17), flags SDK
wiring (config-backed `IFeatureFlags` interim, in Api/Admin), mobile client-side Turnstile
(apply sends an empty token; only enforced where a secret is configured), mobile `manage`
screens (data layer + contracts exist; screens are the in-progress fast-follow — ROADMAP
Phase 5), **web analytics** (the `IWebAnalytics` server-side emitter belonged to v1; web v2
posts no events to `/api/v1/events` at all), and the `/.well-known` deep-link files on v2.
*(Search day/time availability filters are built — `AvailabilityFilter` +
`WhenFilterBinder`; the old "not built" note predated the 2026-07-05 availability work.)*

## Solution layout

```
Steeple.slnx
├─ db/changelog            — Liquibase formatted SQL: schema + seed (owns the DB; no app migrates)
├─ src/Steeple.Persistence — entities, value objects, enums, SteepleDbContext, EF Configurations/
├─ src/Steeple.Api         — the one JSON API. Module subfolders inside each of:
│    Contracts/ Controllers/ Services/ (ports) Proxies/ (adapters) Configuration/ Extensions/ Utils/
├─ src/Steeple.Web.v2      — active Vite + vanilla JS + Leaflet SPA; nginx container proxies /api.
├─ src/Steeple.Web.v1      — deprecated MVC + HTMX implementation, retained as reference only.
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
| `INotificationRepository` | `EfNotificationRepository` (cursor paging, caller-scoped mark-read) |
| `INotificationDispatcher` | `NotificationDispatcher` (inbox row first, then best-effort email + FCM data-message push per recipient) |
| `IEmailGateway` | `ResendEmailGateway` (HTTP API; log-only without `Email:ApiKey`) |
| `IPushGateway` | `FcmPushGateway` (FirebaseAdmin, data messages, dead-token cleanup) / `LoggingPushGateway` when unconfigured |
| `IDeviceRegistry` | `EfDeviceRegistry` (token upsert, ownership-scoped unregister) |
| `IBookingRepository` | `EfBookingRepository` (exclusion-violation-aware atomic save) |
| `IPaymentGateway` | `MockPaymentGateway` (mock era — instant success, synthetic ids, card ending 0002 declines; the Stripe adapter is the drop-in at Stripe-time) |
| `IPaymentRepository` | `EfPaymentRepository` (claim-first payment rows under the one-live-payment partial unique index; SQLSTATE 23505 → lost claim; session advisory lock for the sweep) |
| `IVenueManagerRepository` / `IManageRepository` | `EfVenueManagerRepository` (read-only — Admin writes the venue↔manager links) / `EfManageRepository` (venue/room CRUD, venue-manager-scoped) |
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
`Pending → NeedsInfo ⇄ → CounterOffered ⇄ → Approved | Declined | Withdrawn | Expired`; the
*thread* drives NeedsInfo (provider message parks it, organizer answer returns it), while
CounterOffered is driven by the counter-offer endpoints (host suggests a time → organizer
accepts = booking on the counter schedule, or declines = back to Pending; messages never
flip it; behind `booking.counter_offers`). Party-scoped reads —
non-parties 404, and unknown ≡ unpublished on submit (no existence leak). Decisions
restricted to `venue_managers`. 14-day expiry is a **lazy sweep on read** (no worker).
`GET /manage/venues` tells clients whether to show a provider surface.

**Notifications** — dispatcher writes the inbox row first (inbox = truth), then
fire-and-forget plain-text email (optional HTML alternative part). The dispatcher composes
each email's closing CTA from the payload's own `deepLink` —
`{Email:WebBaseUrl}/?goto=<url-encoded deepLink>` — so email, push and the inbox row can never
point at different things, and no composition site builds URLs. `GET /me/notifications` is
cursor-paginated (opaque `(CreatedAtUtc, Id)` cursor); `POST /me/notifications/read` is
caller-scoped. In Development (`Email:DevMailboxEnabled`, omitted from base appsettings) a
decorator captures every send to a file-backed **dev mailbox** browsable at `/dev/mailbox`
(`.json` for harnesses) so local CTAs are actually clickable.

**Reminders** — the API's one `BackgroundService` (default cadence 15 min, `Reminders:`
options). For confirmed bookings it sends a "coming up" nudge 7 days before the booking's
**first** upcoming occurrence and a "tomorrow" nudge 1 day before **every** occurrence
(asymmetric on purpose: a weekly booking would otherwise collect two emails a week), to the
organizer *and* the venue's managers, through the normal dispatcher. Each send is claimed in
the `booking_reminders` ledger (unique `(OccurrenceId, Kind)`) before it goes out, so a double
run can't double-send; a failed dispatch releases its claim for the next sweep. Bookings and
occurrences are read-only to this module.

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

**Payments** (built 2026-08-05 — mock-gateway era; wire truth `docs/contracts/payments.md`,
design `docs/backlog/payments.md` + charge timing `docs/backlog/booking-modes.md`; behind the
`payments.enabled` flag) — guest method-on-file (`/me/payments/*`; display brand/last4 only,
never a PAN), the apply-time 402 gate, price snapshot at confirmation, per-occurrence charging
(first occurrence at confirmation, later ones at T−48h), the failure ladder (notify → paced
retries → auto-cancel at T−24h → 2 consecutive cancels end the term), the declarative refund
rule (every charge on a cancelled occurrence refunds in full — host rescinds and guest ≥48h
cancels both reduce to it), and the venue payout-onboarding stub. Double-charge is impossible
by construction: a charge *claims* its occurrence with a Pending `payments` row under the
partial unique index before the gateway is called, and the gateway idempotency key is the
occurrence id. **`PaymentSweeper` is the system's first background worker** (SYSTEM_DESIGN
§17): ~5-min `IHostedService` under a Postgres advisory lock — charges due occurrences,
returns the ladder's auto-cancels (executed through the Bookings service — Payments never
mutates occurrences), and re-runs the refund rule crash-safely. **Booking modes** ride the
same slice: `venues.BookingMode` (instant default, host-set via Manage) makes an instant
venue's submit *be* the booking transaction — same one-`SaveChanges` machinery and exclusion
constraint as approval; a lost race answers `409 slot_taken` with nothing persisted. Public
listing detail emits the *effective* mode (manual while the flag is off).

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
externally-hosted/signed document links only, not raw deed/lease/ID contents. A submission has
no decision of its own any more: it is evidence shown inside the first-listing review, and the
listing decision marks it decided. Slugs (`Utils/Slugs.cs`) are derived once from the name and
**immutable** — renames never break a shared listing URL.
**Moderation model** (single gate, `v2_migration` D2, 2026-08-05): the human gate is a
**host's first listing**, not every listing, and the whole rule lives in `ManageService` —
Admin only performs the decision. A publish request that clears the automatic gates (≥1 photo,
open hours behind `manage.open_hours_required`, geofence) either:
publishes immediately when the caller is a **trusted host** — derived, not stored: they
manage ≥1 room with `FirstPublishedAtUtc` set (`IManageRepository.IsTrustedHostAsync`) — or
stamps `PublishRequestedAtUtc` and waits in the Admin review queue. Admin's approval sets
`Published` + `FirstPublishedAtUtc` (once, ever), which is what makes the host trusted.
**Invariant: published ⇒ venue verified** — every route to `Published` sets
`Venue.IsIdentityVerified`, in `ManageService` and in Admin's decision alike. Auto-publishes
emit `listing_moderated` with `actor: "auto:trusted_host"` so the moderation funnel stays
complete. After first publish, unlist/relist is entirely provider-controlled — no further
gate; the operator's only listing lever is Admin's Unlist takedown. Edits to an
already-published
room apply immediately but stamp `ProviderEditedAtUtc`, which is Admin's after-the-fact review
signal, not a block. Both timestamp columns (006-manage.sql) carry partial indexes so the
Admin queue/feed scans stay cheap. Writes run behind the `manage` rate-limit policy
(30/min/account).
**Idempotent creates** (`v2_migration` D2's sibling D8, 2026-08-05): both create endpoints
honor `Idempotency-Key`; a replay by the same user returns the original as `200` (first create
is `201`). The store is `idempotency_records` (016), keyed `(UserId, Scope, Key) → ResourceId`,
written in the same `SaveChanges` as the resource — so the primary key is the race guard and a
timed-out-then-retried create can't leave a host with two venues. Applications' older per-row
`IdempotencyKey` column (004) stays as it is; venues have no owner column to hang one off.
Semantics for clients: `docs/contracts/manage.md`.

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

**Web SPA** — `Steeple.Web.v2` is the deployed web surface. Vite produces static assets and
the nginx host serves them while proxying same-origin `/api` requests to the API container;
the API still emits no CORS headers. Hash routes own navigation. `src/data/api.js` is the
wire seam and `src/data/session.js` stores the API token pair in localStorage with
single-flight refresh and one 401 retry. Catalog reads, application submit, and the host
venue/room/photo/publish chain use the real API. Sign-in is still the Development-only dev
provider; guest inbox/letters and host request decisions still use the local demo store.
The deprecated v1 BFF remains in source for reference but is excluded from the solution,
Compose, and Bake builds.

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
Reduced 2026-08-05 to what an operator actually does (`v2_migration` D3) — three action
surfaces plus one takedown lever, over four screens:

- **Review queue** (`/admin/review`) — the steady-state screen. One card per room with a
  pending `PublishRequestedAtUtc`: listing preview (photos, description, capacity, price),
  venue address, the linked host accounts, and any ownership/lease evidence the host
  submitted, folded in (there is no separate verification decision). **One decision:**
  approve publishes the room, stamps `FirstPublishedAtUtc`, sets `Venue.IsIdentityVerified`
  and clears `ProviderEditedAtUtc`; decline just clears the request. Either way the venue's
  pending evidence submission is marked decided (so a declined host can resubmit), and every
  venue manager gets a `listingApproved`/`listingDeclined` inbox row written directly (Admin
  has no email/push fan-out — the inbox row is the whole notification). Also hosts the
  review-comment hide/unhide lever.
- **Listings** (`/admin/listings`) — read-only inventory plus a single-room **Unlist**
  takedown for abuse/DMCA. Honors the listing lifecycle: a room with upcoming confirmed
  occurrences can't leave Published (cancel first); the host can relist themselves.
- **Venue managers** (`/admin/venue-managers`) — linking by sign-in email, the concierge
  step that makes a church account a provider.
- **Overview** (`/admin`) — four real counts and a pointer at the queue.

Decisions log `listing_moderated` / `listing_unlisted_by_operator` stdout lines in the same
shape as `IAnalyticsSink`, attributed to the forwarded `Remote-User` header (falling back to
`"local-dev"` locally). Listing photos come from the media origin, so Admin's CSP `img-src`
is config-pinned (`Admin:MediaImageOrigins`) — a queue whose photos are blocked is a decision
made blind. Deleted with the reduction: users/analytics/feature-flag panels, login/MFA/
trusted-device theater, application force-status repair, bulk listing-status writes (they
bypassed the verified invariant), and the `ProviderEditedAtUtc` review feed — the column and
its stamping stay as the dormant abuse-response seam.

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
                        Room: capacity, price (NOT NULL, CHECK > 0), house rules, flags enums as
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
users 1─* idempotency_records (016: PK (UserId, Scope, Key) → ResourceId; manage creates)

rooms 1─* applications *─1 users (organizer)
  ActivityType, GroupSize, venue-local schedule (dates/times + optional DayOfWeek),
  IntentText, Status, ExpiresAtUtc; unique filtered (OrganizerId, IdempotencyKey)
  applications 1─* application_messages (the "ask" thread)

applications 1─0..1 bookings (created by approval or an instant-mode submit; unique ApplicationId;
  EndDate always bounded; + PricePerOccurrence?/Currency? price snapshot at confirmation — 014)
  bookings 1─* booking_occurrences (denormalized RoomId; UTC StartUtc/EndUtc; venue-local LocalDate)
    EXCLUDE USING gist ("RoomId" WITH =, tstzrange("StartUtc","EndUtc") WITH &&)
      WHERE ("Status" <> 3)      ← cancelled rows leave the constraint = cancellation frees slots
  bookings 1─* ratings (unique (BookingId, RateeType); Stars 1..5; Comment?; HiddenAtUtc?; VenueId/OrganizerId denormalized)

venues + BookingMode (013: instant DEFAULT | manual)   venues 1─0..1 venue_payment_accounts (014)
users + PaymentCustomerId?/method display cache (014)
booking_occurrences 1─* payments (014; partial unique (OccurrenceId) WHERE Status <> Failed
  ← at most one live payment per occurrence — the no-double-charge invariant)
```

- **No double-booking:** occurrence rows exist only for confirmed bookings; the
  `btree_gist` exclusion constraint rejects overlap atomically; applications never hold
  slots. The constraint is an *expression* over two `timestamptz` columns (no range
  column) so Persistence stays provider-agnostic.
- **Bounded recurrence:** occurrences are a finite set materialized at approval; renewal
  = a *new* booking re-checking availability.
- **Timezone correctness:** schedules are venue-local wall-clock, materialized per-date
  in `venues.Timezone` — never by adding fixed UTC intervals.
- **Published ⇒ venue verified:** every path that sets a room to `Published` also sets
  `Venue.IsIdentityVerified` — the badge means "belongs to a vetted host", and after the
  single-gate change (D2) every publish route *is* that vetting. Enforced in
  `ManageService` and Admin's decision; nothing else may write `RoomStatus.Published`.
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

Web: `/` plus hash routes for map browsing, venue/room panels, apply, guest correspondence,
account, and host management (see `src/Steeple.Web.v2/README.md`).
Admin: `/admin` (overview), `/admin/review` (first-listing decisions + review-comment
hide/unhide), `/admin/listings` (Unlist takedown), `/admin/venue-managers` (linking).

API: full specs in `CONTRACTS.md` — Discovery §3, Identity §4, Applications /
Notifications / Bookings §5, Manage §6.

## Deployment — reverse proxy & sub-path hosting

Web + Admin can sit under a sub-path (e.g. `jeremyvun.com/steeple`) or a domain root:

- Web's Vite assets and API base are document-relative. Caddy's `handle_path /steeple/*`
  strips the prefix before forwarding, so `/steeple/api/v1/...` reaches nginx as
  `/api/v1/...` and is proxied to `api:8080`.
- Admin maps `X-Forwarded-Prefix` into `Request.PathBase`; its emitted links derive from
  `PathBase` with `~/…` helpers and route-based redirects.
- With no `X-Forwarded-Prefix` (local runs) everything resolves at `/` — the prefix
  lives only in the proxy config.
- Proxy rules (admin first — more specific): Web `handle_path /steeple/*` (strips the
  whole prefix); Admin `handle /steeple/admin*` + `uri strip_prefix /steeple` (keeps the
  app's own `/admin` segment). Admin receives `X-Forwarded-Prefix: /steeple`.

> **Trust note:** the ASP.NET apps clear `KnownProxies`/`KnownIPNetworks`, so forwarded headers
> are trusted from any source. Keep the containers reachable **only via caddy** (don't
> publish dev host ports publicly) so the prefix can't be spoofed.

Compose runs the ASP.NET containers in **Production** and serves web from nginx; only
web/admin publish general host ports. nginx proxies `/api` over the private Compose network.
The api is compose-internal, **except** a `127.0.0.1`-bound loopback port
(`API_PORT`, default 8081) that exists purely so browsers can fetch photo URLs when the dev
stack has no Spaces credentials configured and falls back to `LocalDiskMediaStore` (which the
API serves itself at `/media`). It's dev-only, not reachable off the host, and unnecessary once
`MEDIA_*` env vars point at real Spaces (deviation from the "api compose-internal" rule —
SYSTEM_DESIGN §17). The api's `steeple_api_media` volume backs that local-disk store.
