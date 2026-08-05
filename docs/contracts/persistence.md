# Contracts — persistence: domain model & invariants

> **Scope:** the shape of the data and the rules the **database itself** enforces — entity
> graph, invariants, the geofence, and the Liquibase-owns-schema / database-first EF working
> rule. Wire shapes are in the endpoint seam files; conventions: see `conventions.md`.
> Verified against `db/changelog/001–012` and `src/Steeple.Persistence/` (2026-08-05).

## Ownership rule (non-negotiable)

- **Postgres is the system of record.** Local dev: compose, Postgres 18, host port **5433**.
- **Liquibase owns the schema and the seed** (`db/changelog/`, formatted SQL, run by a one-shot
  `migrate` service between postgres-healthy and the apps). **No application ever migrates.**
- **EF Core 10 + Npgsql, database-first:** `Steeple.Persistence` mirrors the Liquibase schema
  **by hand**, column-for-column. Connection string key `SteepleDb`.
- **Recipe for a schema change:** add a *new* `--changeset author:id` block to
  `db/changelog/00X-*.sql` (never edit an applied changeset — checksums must not move) →
  update the matching entity in `Models/` + config in `Configurations/` → `docker compose up -d
  migrate` (or full reset). Indexes and constraints live in SQL first.
- EF is pinned to **10.0.4** (Npgsql provider constraint) — do not bump above it.

## Domain model

```
Venue 1─* Room 1─* RoomPhoto
  slug, address, lat/long (indexed), IsIdentityVerified, venue type, Timezone (IANA),
  UpdatedAtUtc, ProviderEditedAtUtc
                        Room: capacity, price (NOT NULL, CHECK > 0), house rules, flags enums as
                        int bitmasks (Amenity / AccessibilityFeature / ActivityType),
                        Status (Draft/Published/Unlisted), UpdatedAtUtc,
                        PublishRequestedAtUtc / FirstPublishedAtUtc / ProviderEditedAtUtc
                        (moderation state — see manage.md)
                                RoomPhoto: legacy Url (full-size, always populated) +
                                StorageKey/ThumbUrl/CardUrl/CreatedAtUtc (upload pipeline)

users 1─* user_logins (unique (Provider, Subject))    users 1─* refresh_tokens (hashed, rotating)
users 1─* user_agreements (per-version ToS/Privacy)   users 1─* notifications (inbox = truth)
users 1─* devices                                     venues 1─* venue_managers *─1 users
venues 1─* venue_verification_requests 1─* venue_verification_documents

rooms 1─* room_open_hours (per-weekday [start,end) windows)
rooms 1─* room_blackout_dates (unique (RoomId, Date))

rooms 1─* applications *─1 users (organizer)
  ActivityType, GroupSize, venue-local schedule (dates/times + optional DayOfWeek),
  IntentText, OrganizationName?, Status, ExpiresAtUtc;
  unique filtered (OrganizerId, IdempotencyKey)
  applications 1─* application_messages (the "ask" thread)
  applications 1─* application_counter_offers (history kept; partial unique index =
    at most one Status=0 (open) counter per application)

applications 1─0..1 bookings (created only by approval; unique ApplicationId; EndDate always bounded)
  bookings 1─* booking_occurrences (denormalized RoomId; UTC StartUtc/EndUtc; venue-local LocalDate)
    EXCLUDE USING gist ("RoomId" WITH =, tstzrange("StartUtc","EndUtc") WITH &&)
      WHERE ("Status" <> 3)      ← cancelled rows leave the constraint = cancellation frees slots
  bookings 1─* ratings (unique (BookingId, RateeType); Stars 1..5; Comment ≤1000; HiddenAtUtc?;
    VenueId/OrganizerId denormalized)

analytics_events — legacy table (001); the live analytics path is stdout → Promtail → Loki.
```

## DB-enforced invariants

- **No double-booking:** occurrence rows exist only for confirmed bookings; the `btree_gist`
  exclusion constraint rejects overlap atomically; applications never hold slots. The
  constraint is an *expression* over two `timestamptz` columns (no range column) so Persistence
  stays provider-agnostic. `CK_booking_occurrences_range` additionally requires `EndUtc >
  StartUtc`. `[)` semantics let back-to-back slots coexist.
- **One booking per application, ever:** unique `bookings.ApplicationId`.
- **Idempotent submit:** filtered unique `(OrganizerId, IdempotencyKey)` on `applications`.
- **One open counter-offer per application:** partial unique index on
  `application_counter_offers (ApplicationId) WHERE Status = 0`.
- **Priced listings only:** `rooms."PricePerHour"` NOT NULL + `CHECK (> 0)` (010 — free
  listings were removed from the product).
- **One rating per direction:** unique `(BookingId, RateeType)`, `Stars` CHECK 1..5.
- **Slug uniqueness:** unique `venues.Slug`, unique `rooms (VenueId, Slug)`; slugs are derived
  once from the name and never change.
- **Identity:** unique `user_logins (Provider, Subject)`; refresh tokens stored only as SHA-256
  hashes; unique `devices.FcmToken`.
- **Cheap operator queues:** partial indexes on `rooms.PublishRequestedAtUtc`,
  `rooms.ProviderEditedAtUtc`, `venues.ProviderEditedAtUtc` (all `WHERE … IS NOT NULL`), and
  on visible (`HiddenAtUtc IS NULL`) ratings by venue/organizer.

## Rules enforced in services (not the DB)

- **State machines** (`Pending → NeedsInfo ⇄ → CounterOffered ⇄ → Approved | Declined |
  Withdrawn | Expired`) are validated in services; statuses are stored as `int` and emitted as
  stable camelCase strings.
- **Timezone correctness:** schedules are venue-local wall-clock, materialized per-date in
  `venues.Timezone` by `ScheduleMaterializer` — **never** by adding fixed UTC intervals.
  DST rules are pinned by unit tests.
- **Bounded recurrence:** occurrences are a finite set materialized at approval; renewal is a
  *new* booking that re-checks availability.
- **Flags-enum filtering** is a bitwise mask in SQL; multi-value matching is **AND** ("room
  accepts *all* requested").
- **Availability rules are advisory shaping** for guests and hosts; the exclusion constraint is
  the only booking authority.
- **Only Published rooms are publicly visible** — search filters status in SQL *and*
  `ListingService` gates direct id/slug lookups (Draft/Unlisted → 404).

## Geofence

One hardcoded beachhead, config section `Geofence` in the API's appsettings — currently
`"Vienna & nearby (Northern Virginia)"`, lat 38.84–38.96, lng −77.34–−77.12, centre
38.9012 / −77.2653. `GeofencePolicy` clamps any requested viewport/radius into the beachhead
(out-of-area → **empty results, not errors**) and rejects out-of-area detail lookups (404).
Launch-suburb swap = one config change. Search is bounding-box + haversine — no PostGIS at
one-suburb scale.

> Dev hazard: without `Geocoding:GoogleApiKey`, `StubGeocodingGateway` resolves **every**
> address to the beachhead centre, so geofence-rejection paths are locally unreachable.
