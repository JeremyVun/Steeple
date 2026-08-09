# Contracts — persistence: domain model & invariants

> **Scope:** the shape of the data and the rules the **database itself** enforces — entity
> graph, invariants, the geofence, and the Liquibase-owns-schema / database-first EF working
> rule. Wire shapes are in the endpoint seam files; conventions: see `conventions.md`.
> Verified against `db/changelog/001–021` and `src/Steeple.Persistence/` (2026-08-09).

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
  BookingMode (013: int, 0=Instant DEFAULT, 1=Manual — host-chosen, read at submit time),
  UpdatedAtUtc, ProviderEditedAtUtc
                        Room: capacity, price (NOT NULL, CHECK > 0), house rules, flags enums as
                        int bitmasks (Amenity / AccessibilityFeature / ActivityType),
                        Status (Draft/Published/Unlisted), UpdatedAtUtc,
                        PublishRequestedAtUtc / FirstPublishedAtUtc / ProviderEditedAtUtc /
                        OperatorUnlistedAtUtc / OperatorUnlistedBy
                        (moderation state — see manage.md)
                                RoomPhoto: legacy Url (full-size, always populated) +
                                StorageKey/ThumbUrl/CardUrl/CreatedAtUtc (upload pipeline)

users 1─* user_logins (unique (Provider, Subject))    users 1─* refresh_tokens (hashed, rotating)
users 1─* user_agreements (per-version ToS/Privacy)   users 1─* notifications (inbox = truth)
users 1─* devices                                     venues 1─* venue_managers *─1 users
venues 1─* venue_verification_requests 1─* venue_verification_documents

notification_outbox — durable email/push envelopes written atomically with inbox rows;
  due-row partial index, lease attempts, delivered/terminal-failure stamps (020)

users 1─* idempotency_records (016: PK (UserId, Scope, Key) → ResourceId, CreatedAtUtc;
  the spent-key ledger for manage creates)

data-retention indexes (021) — global oldest-first scans for terminal tokens, notifications,
  replay keys, private correspondence, and terminal outbox rows

rooms 1─* room_open_hours (per-weekday [start,end) windows)
rooms 1─* room_blackout_dates (unique (RoomId, Date))

rooms 1─* applications *─1 users (organizer)
  ActivityType, GroupSize, venue-local schedule (dates/times + optional DaysOfWeek mask),
  IntentText, OrganizationName?, Status, ExpiresAtUtc;
  unique filtered (OrganizerId, IdempotencyKey)
  applications 1─* application_messages (the "ask" thread)
  applications 1─* application_counter_offers (history kept; partial unique index =
    at most one Status=0 (open) counter per application)

applications 1─0..1 bookings (created by instant submit, manual approval, or accepted counter;
  unique ApplicationId; EndDate always bounded)
  bookings 1─* booking_occurrences (denormalized RoomId; UTC StartUtc/EndUtc; venue-local LocalDate)
    EXCLUDE USING gist ("RoomId" WITH =, tstzrange("StartUtc","EndUtc") WITH &&)
      WHERE ("Status" <> 3)      ← cancelled rows leave the constraint = cancellation frees slots
    booking_occurrences 1─* booking_reminders (sent-ledger; unique (OccurrenceId, Kind);
      Kind 0 = comingUp (T−7d, first upcoming occurrence), 1 = tomorrow (T−1d, every one))
  bookings 1─* ratings (unique (BookingId, RateeType); Stars 1..5; Comment ≤1000; HiddenAtUtc?;
    VenueId/OrganizerId denormalized)

users + PaymentCustomerId?, PaymentMethodBrand?, PaymentMethodLast4?, PaymentMethodSetAtUtc?
  (014 — provider customer id + a DISPLAY cache of the saved method; never a PAN)
bookings + PricePerOccurrence?, Currency? (014 — price snapshot at confirmation; both null =
  legacy/offline booking, nothing ever charges)
venues 1─0..1 venue_payment_accounts (014: ProviderAccountId unique, DetailsSubmitted,
  ChargesEnabled, PayoutsEnabled, OptedInAtUtc? — payout onboarding state, mock era)
booking_occurrences 1─* payments (014: Amount, Currency, ApplicationFee, ProviderPaymentId
  unique-when-set, Status int (0 Pending|1 RequiresAction|2 Succeeded|3 Failed|4 Refunded|
  5 Disputed), FailureCode?, RefundedAtUtc?; BookingId denormalized;
  partial unique (OccurrenceId) WHERE Status <> 3   ← at most one LIVE payment per occurrence;
  failed attempts are superseded history, never deleted)

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
- **Idempotent manage creates:** `idempotency_records` PK `(UserId, Scope, Key)` → `ResourceId`
  (016). Written in the same transaction as the venue/room it bought, so the PK *is* the race
  guard: two overlapping creates with one key can only land one, and the loser rolls its
  resource back with it. `Scope` ∈ `manage.venue.create` | `manage.room.create` — persisted
  strings, never renamed without a data migration. Rows are retained for 30 days, as are
  applications' per-row keys; the bounded retention sweep then removes the replay key without
  touching the created resource. Venues have no owner column (ownership is `venue_managers`),
  which is why this is a table rather than the applications module's per-row column
  (`contracts/manage.md`).
- **One open counter-offer per application:** partial unique index on
  `application_counter_offers (ApplicationId) WHERE Status = 0`.
- **Priced listings only:** `rooms."PricePerHour"` NOT NULL + `CHECK (> 0)` (010 — free
  listings were removed from the product).
- **Durable takedowns:** `CK_rooms_operator_unlisted_not_published` rejects `Status=Published`
  whenever `OperatorUnlistedAtUtc` is set, closing stale/concurrent service-write races.
- **One rating per direction:** unique `(BookingId, RateeType)`, `Stars` CHECK 1..5.
- **One reminder per occurrence per kind:** unique `booking_reminders (OccurrenceId, Kind)` —
  the sweep claims the row (`INSERT … ON CONFLICT DO NOTHING`) *before* dispatching, so a
  double run, a restart mid-sweep or a second replica cannot double-send (015).
- **No double-charging:** partial unique `payments (OccurrenceId) WHERE Status <> 3` — a
  charge claims its occurrence with a Pending row *before* the gateway is called, so a
  concurrent sweeper/request loses the insert, not the money; failed attempts leave the
  predicate so retries can claim again (`contracts/payments.md`).
- **Slug uniqueness:** unique `venues.Slug`, unique `rooms (VenueId, Slug)`; slugs are derived
  once from the name and never change.
- **Identity:** unique `user_logins (Provider, Subject)`; refresh tokens stored only as SHA-256
  hashes; unique `devices.FcmToken`.
- **Cheap operator queues:** partial indexes on `rooms.PublishRequestedAtUtc`,
  `rooms.ProviderEditedAtUtc`, `rooms.OperatorUnlistedAtUtc`, `venues.ProviderEditedAtUtc`
  (all `WHERE … IS NOT NULL`), and
  on visible (`HiddenAtUtc IS NULL`) ratings by venue/organizer.

## Rules enforced in services (not the DB)

- **State machines** (`Pending → NeedsInfo ⇄ → CounterOffered ⇄ → Approved | Declined |
  Withdrawn | Expired`) are validated in services; statuses are stored as `int` and emitted as
  stable camelCase strings.
- **Timezone correctness:** schedules are venue-local wall-clock, materialized per-date in
  `venues.Timezone` by `ScheduleMaterializer` — **never** by adding fixed UTC intervals.
  DST rules are pinned by unit tests.
- **Bounded recurrence:** occurrences are a finite set materialized at booking confirmation;
  renewal is a
  *new* booking that re-checks availability.
- **Flags-enum filtering** is a bitwise mask in SQL; multi-value matching is **AND** ("room
  accepts *all* requested").
- **Availability rules are enforced** when a schedule is checked or committed; the exclusion
  constraint remains the final concurrency authority for confirmed-slot races.
- **Only Published rooms are publicly visible** — search filters status in SQL *and*
  `ListingService` gates direct id/slug lookups (Draft/Unlisted → 404).
- **Operator takedowns are manager-proof:** `OperatorUnlistedAtUtc` is only written by Admin;
  Manage refuses every transition back to Published while it remains set.

## Geofence

One hardcoded beachhead, config section `Geofence` in the API's appsettings — currently
`"Vienna & nearby (Northern Virginia)"`, lat 38.84–38.96, lng −77.34–−77.12, centre
38.9012 / −77.2653. `GeofencePolicy` clamps any requested viewport/radius into the beachhead
(out-of-area → **empty results, not errors**) and rejects out-of-area detail lookups (404).
Launch-suburb swap = one config change. Search is bounding-box + haversine — no PostGIS at
one-suburb scale.

> Dev hazard: without `Geocoding:GoogleApiKey`, `StubGeocodingGateway` resolves **every**
> address to the beachhead centre, so geofence-rejection paths are locally unreachable.
