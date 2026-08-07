# Steeple — Architecture (as-built)

> The **as-built** state of the system, updated as slices land. Target-state design +
> decision log: `SYSTEM_DESIGN.md`. Wire contracts: `CONTRACTS.md` (the §-number index)
> over `docs/contracts/` (one file per seam — load only the seam you need). What's next:
> `docs/backlog/`. Flutter app design: `MOBILE_DESIGN.md`.

## Current state — ROADMAP Phases 0–5 complete (code); ratings + availability landed 2026-07-05; web v2 became the active web surface 2026-08-05 and finished its real-API migration 2026-08-07

The API, web v2, and mobile app implement the full two-sided loop: geo-fenced discovery →
SSO → apply (or instant book) → decision → booking with DB-enforced no-double-booking,
payments (mock-gateway era), notifications, reminders, cancellation with auto-refund, and
no-show handling. Web v2's `v2_migration` completed 2026-08-07: identity, correspondence,
payments, hosting and moderation all run on the wire; the only demo data left is the 3D
village's scenery in dev builds. Google/Apple/Turnstile code paths are shipped and
env-gated — a build with no client id offers no button — and go live by configuration
alone (`docs/runbooks/sso-and-turnstile.md`). Admin moderates the first listing at each
newly claimed venue; later rooms at that venue publish themselves.

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
Phase 5), mobile card UI (`payments.enabled` stays off in production until it exists), a
real payment gateway (Stripe adapter + webhooks + legal review — phase-7 gated,
`docs/contracts/payments.md` rollout), and the `/.well-known` deep-link files on v2.
*(Web analytics landed 2026-08-07 — `src/data/analytics.js` batches interaction events to
`POST /api/v1/events`; the old gap note predated it.)*

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
Cross-cutting: trusted forwarded headers (one canonical client IP/proto from caddy → nginx) →
JwtBearer auth (`MapInboundClaims=false`) → rate limiting → ProblemDetails errors.

| Port | Adapter |
|---|---|
| `IRoomRepository` | `RoomRepository` (EF, bounding-box query) |
| `IGeofencePolicy` | `GeofencePolicy` (pure logic over the `Geofence` config section, incl. the served area's IANA timezone). Area-neutral port (`Bounds`/`IsServed`/`TimezoneId`) — the single-beachhead scope lives in this implementation only (SYSTEM_DESIGN §17, 2026-08-07) |
| `IGeocodingGateway` | `AppleMapsGeocodingGateway` (geocodes provider address entry **and** answers the address typeahead; US-scoped, beachhead-biased; ES256 team JWT → `/v1/token` access-token cache in singleton `AppleMapsTokenProvider`) when `Geocoding:AppleTeamId/AppleKeyId/ApplePrivateKey` are set; else `GoogleGeocodingGateway` (geocode only) on `Geocoding:GoogleApiKey`; else `StubGeocodingGateway` (beachhead centre + canned suggestions) |
| `IAnalyticsSink` | `StdoutLogAnalyticsSink` (structured JSON line → stdout → Promtail/Loki) |
| `IIdTokenVerifier` ×2 | `GoogleIdTokenVerifier` / `AppleIdTokenVerifier` (JWKS via cached OIDC discovery; fail-closed without client ids) |
| `IIdentityRepository` | `EfIdentityRepository` (users, logins, refresh tokens, agreements) |
| `IAccessTokenIssuer` | `JwtAccessTokenIssuer` (HS256; key required; known repository keys rejected in Production) |
| `ITurnstileVerifier` | `CloudflareTurnstileVerifier` (disabled when no secret configured — dev) |
| `IApplicationRepository` | `EfApplicationRepository` (full display-graph loads) |
| `INotificationRepository` | `EfNotificationRepository` (cursor paging, caller-scoped mark-read) |
| `INotificationDispatcher` | `NotificationDispatcher` (inbox row first, then best-effort email + FCM data-message push per recipient) |
| `IEmailGateway` | `ResendEmailGateway` (HTTP API; no-send/no-PII-log without `Email:ApiKey`) |
| `IPushGateway` | `FcmPushGateway` (FirebaseAdmin, data messages, dead-token cleanup) / `LoggingPushGateway` when unconfigured |
| `IDeviceRegistry` | `EfDeviceRegistry` (token upsert, ownership-scoped unregister) |
| `IBookingRepository` | `EfBookingRepository` (exclusion-violation-aware atomic save) |
| `IPaymentGateway` | `MockPaymentGateway` (mock era — instant success, synthetic ids, card ending 0002 declines; the Stripe adapter is the drop-in at Stripe-time) |
| `IPaymentRepository` | `EfPaymentRepository` (claim-first payment rows under the one-live-payment partial unique index; SQLSTATE 23505 → lost claim; session advisory lock for the sweep) |
| `IVenueManagerRepository` / `IManageRepository` | `EfVenueManagerRepository` (read-only — Admin writes the venue↔manager links) / `EfManageRepository` (venue/room CRUD, venue-manager-scoped) |
| `IImageProcessor` | `ImageSharpImageProcessor` (metadata-first 12,000px/30 MP/single-frame gate, two-slot processing cap, auto-orient, metadata strip, JPEG variants; ImageSharp 3.1.x) |
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
materialized occurrences commit in one `SaveChanges` inside a repository-owned transaction.
Same-room creates first queue on that room row so concurrent GiST checks cannot deadlock; an
exclusion violation (SQLSTATE 23P01, translated in `EfBookingRepository`) aborts it all → the
application auto-declines with notice and the provider gets `409 slot_taken`;
first-approval-wins falls out of the database transaction. `ScheduleMaterializer` (pure, unit-tested) turns
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
The Payments controller is removed from endpoint discovery outside Development while mock is
the only gateway. Production startup rejects `payments.enabled=true` with `Payments:Gateway=mock`, and changeset
017 clears synthetic provider state before a real gateway can use the tables.

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
**Moderation model** (venue-scoped gate, hardened 2026-08-06): the human gate is an
**unverified venue's first listing**, and the whole rule lives in `ManageService` — Admin only
performs the decision. A publish request that clears the automatic gates (≥1 photo, open hours
behind `manage.open_hours_required`, geofence) publishes immediately only when that venue is
already verified; otherwise it stamps `PublishRequestedAtUtc` and waits. Admin approval sets
`Published` + `FirstPublishedAtUtc` and verifies that venue, permitting its later rooms without
granting the manager global trust at unrelated venues.
**Invariant: published ⇒ venue verified** — every route to `Published` sets
`Venue.IsIdentityVerified`, in `ManageService` and in Admin's decision alike. Auto-publishes
emit `listing_moderated` with `actor: "auto:verified_venue"` so the moderation funnel stays
complete. Ordinary unlist/relist stays provider-controlled, but Admin's Unlist takedown stamps
`OperatorUnlistedAtUtc/By`; managers receive `409 operator_unlisted` until an operator clears
it. Takedowns apply even with existing bookings, which remain separate commitments. Edits to an
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
identifies headers before decoding and rejects multi-frame, >12,000px, or >30 MP sources;
only two images process concurrently. Accepted files auto-orient from EXIF, strip all metadata
(EXIF/XMP/IPTC — GPS included), and re-encode JPEG
variants at 400/800/1600px (`ImageSharpImageProcessor`, never upscaling a smaller source), and
keys the stored objects by a SHA-256 content hash. `IMediaStore` is `S3MediaStore` (DO Spaces,
public-read/CDN) when `Media:ServiceUrl`/bucket/keys are configured, else `LocalDiskMediaStore`
(dev; the API itself serves `/media` and therefore publishes a loopback port in compose — see
Deployment). `RoomPhotoDto` carries `id`/`thumbUrl`/`cardUrl` alongside the legacy `url`
(full-size, still populated for seeded picsum rows); cards prefer `cardUrl`. Metadata
edits/deletes run behind `manage`; upload behind the pricier `media` policy (12/min/account) —
10 MB cap enforced by Kestrel before the pipeline runs.

**Web SPA** — `Steeple.Web.v2` is the deployed web surface; its real-API migration
completed 2026-08-07 (`docs/backlog/v2_migration/design.md`, D1–D9). Vite produces static
assets and the nginx host serves them while proxying same-origin `/api` requests to the API
container; the API still emits no CORS headers. Hash routes own navigation, and are also
the no-JavaScript fallback: the title page's CTAs are printed in `index.html` as real links.

*Boot* is a three-state machine (P3.5; `core/intent.js` + `main.js`): **printed arrival**
(markup only — a press records its destination natively), **product-first flat boot** (any
intent or deep link before the village is ready opens the map/desk directly; no engine,
world, or Three chunk is fetched on that product path), and **live-village boot** (no early
intent — poster → canvas crossfade, the cinematic roll). A village-capable flat boot lazily
restores the poster and raises Three/world only if the visitor returns to the title;
`?world=off` and `build:flat` never do. Product reads never wait on 3D; the tile layer always
ships with the map (a grid-layer-less Leaflet map settles NaN zoom and dies on the next
`invalidateSize`).

*Seams* (`src/data/`): `api.js` — the wire, `/api/v1` names verbatim, read timeout 4s,
writes 15s, and a timeout is classified as "unknown", never "unreachable". `session.js` —
identity: the refresh token is an **httpOnly cookie** the API sets
(`refreshTransport: "cookie"`), the access token lives in module memory, localStorage holds
only `{user, reason, stamp}` for cross-tab `storage` sync; refresh is single-flight per tab
with one 401 retry, simultaneous tabs are made safe by the API's rotation grace
(`contracts/identity.md`). `providers.js` — Google/Apple, the only file that knows a third
party exists; a provider with no `VITE_*` client id is not offered, SDKs load on first
sign-in attempt, nonces bind tokens per attempt. `turnstile.js` — the widget, off without
`VITE_TURNSTILE_SITE_KEY`; both token-carrying writes send null when unkeyed.
`agreements.js` — the two legal documents at shipping versions; a first panel sign-in is
asked to agree, a session still owing one is gated until it agrees or signs out
(declining/dismissing signs out, 2026-08-07), `POST /me/agreements` records it.
`catalog.js` — product vocabulary over the wire with a bundled fallback when the API is
away. `correspondence.js` — everything after a request is written; every failure is a
verdict (`refused | offline | signedOut | unavailable`), never a guess.
`store.js` — a per-person localStorage **mirror** of steeple's answers
(`steeple-village-store:{userId}`); it decides nothing. `analytics.js` — the interaction
batcher to `POST /api/v1/events` (CONTRACTS §7); nothing user-visible ships dark.

*On the wire, end to end:* catalog, sign-in/out, agreements, the apply calendar
(`openHours` + availability), submit with `Idempotency-Key` through the 402 card step,
instant book, the guest inbox (`GET /me/applications`, paged walk that deletes only what a
finished list did not carry), threads/withdraw/counter offers, all four host decisions
(`409 slot_taken` rendered as the product moment), the desk (exists only when
`GET /manage/venues` answers; Bookings · Requests · Spaces; one read per booking per
opening), the whole hosting chain (venue → room → photo → hours → publish; first listing →
review, later rooms self-serve), payments truth on both sides (frozen price, per-date
charge state, failure ladder, rescind + refund, mock payout onboarding), reminders as
ambience (one slip + quiet inbox lines; no bell), and `?goto=` email CTAs at boot. The
demo fixture survives only as dev-build village scenery, contained by construction.

*SEO floor* (D9): `public/robots.txt`, nginx aliases `/sitemap.xml` to the API's, index
meta/OG tags; `public/terms.html` + `privacy.html` are real pages (founder's preview text —
legal review is a launch gate). Deeper crawler rendering is its own backlog entry.
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

> **Trust boundary:** caddy overwrites forwarding headers; nginx accepts real-IP input only from
> private Docker peers and emits one canonical address; the API accepts one forwarded hop only
> from loopback/private Docker networks. Directly supplied forwarding headers are ignored.

Compose runs the ASP.NET containers in **Production** and serves web from nginx; only
web/admin publish general host ports. nginx proxies `/api` over the private Compose network.
The api is compose-internal, **except** a `127.0.0.1`-bound loopback port
(`API_PORT`, default 8081) that exists purely so browsers can fetch photo URLs when the dev
stack has no Spaces credentials configured and falls back to `LocalDiskMediaStore` (which the
API serves itself at `/media`). It's dev-only, not reachable off the host, and unnecessary once
`MEDIA_*` env vars point at real Spaces (deviation from the "api compose-internal" rule —
SYSTEM_DESIGN §17). The api's `steeple_api_media` volume backs that local-disk store.

For the local Development deployment, `./deploy.sh` keeps only Postgres and the one-shot
Liquibase migration in Compose, then supervises the API (prefers `:5200`), Admin (prefers
`:5198`) and the Web v2 Vite server (prefers `:5173`) as host processes. Occupied default ports
are replaced with the next free loopback port. It waits for each HTTP health endpoint before
declaring the stack ready and stops all three app processes together on Ctrl-C; Postgres stays
up for the next run. The script uses the checked-in development database credentials and does
not load a repository `.env`, so deployed credentials cannot leak into the local loop. The
`STEEPLE_{POSTGRES,API,ADMIN,WEB}_PORT` overrides force exact ports; every selected port is
propagated to connection strings, media URLs, email links, CSP and the Vite proxy.

### The web container's nginx (`src/Steeple.Web.v2/nginx.conf`)

The SPA has no server of its own, so its host sets everything a static host must
(hardened 2026-08-06):

- **Compression** — `gzip on` for CSS, JS, JSON, SVG and plain text (`gzip_vary`,
  512-byte floor). Measured on the built bundle: CSS 120.9 kB → 27.3 kB, JS 375.3 kB →
  117.2 kB. `text/html` is never listed in `gzip_types` — nginx always compresses it.
  Hashed `/assets/` keep their year-long `immutable` caching; `/` stays `no-cache`.
- **Headers** — `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a Content-Security-Policy.
  They are repeated in each app `location` because nginx's `add_header` does not merge:
  a location with any `add_header` of its own inherits none from the server block. The
  policy text itself is written once into `$csp`.
- **CSP** — `default-src 'self'`, with image exceptions
  (`https://*.tile.openstreetmap.org` map tiles, `https://images.unsplash.com` seeded room
  photography per `db/changelog/012`, `https://*.googleusercontent.com` reserved for
  provider avatars, `data:`, `blob:` for a host's local photo preview) and, since P5.3
  (2026-08-07), the three sign-in/bot-check origins written in ahead of go-live:
  `accounts.google.com`, `appleid.cdn-apple.com` and `challenges.cloudflare.com` in
  `script-src`/`frame-src` (+ `connect-src`/`form-action` where each flow needs it), so
  keying the providers needs no policy edit on the day. `style-src` carries
  `'unsafe-inline'` — the week card sets grid geometry as a `style` attribute.
  No directive names a path, so the policy is unchanged behind a stripped sub-path prefix.
  `/api/` adds no headers at all — the API answers for its own responses. nginx also
  aliases `/sitemap.xml` to the API's `GET /api/v1/sitemap.xml` (exact-match location).
- **Proxy abuse controls** — real-IP/proto input is trusted only from private Docker peers;
  nginx emits one canonical `X-Forwarded-For` value and caps `/api/` at 5 req/s (burst 30).
  The API independently applies 300/min total per account/IP and 120/min/IP to discovery.
- ⚠ **Coupling:** uploaded room photos are served from `Media:PublicBaseUrl` and stored as
  absolute URLs. While that is the web origin they are covered by `'self'`; pointing it at
  a CDN or Spaces bucket means adding that origin to `img-src` or every uploaded photo
  silently stops loading.

Verified in the real container (an isolated compose project on :8180): headers and
`Content-Encoding: gzip` by `curl`, then the app driven headless with village on and
`?world=off` — map tiles and Unsplash photographs fetched 200, a space sheet opened by a
real click, zero `securitypolicyviolation` events.
