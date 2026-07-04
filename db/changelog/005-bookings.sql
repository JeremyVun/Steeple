--liquibase formatted sql

-- Booking integrity (ROADMAP Phase 3, SYSTEM_DESIGN §5/§7): approval materializes an
-- application's venue-local schedule into a confirmed booking with a finite set of UTC
-- occurrences, and the database — not the application — makes double-booking impossible via a
-- btree_gist exclusion constraint. Hand-maintained SQL is the source of truth; the EF
-- configurations in Steeple.Persistence mirror these tables column-for-column.

--changeset steeple:005-bookings
-- btree_gist lets the exclusion constraint combine an equality column (RoomId) with a range
-- overlap (&&). Trusted extension since PG13, so the app database owner may create it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Venue-local schedules ("9am Tuesday") only become UTC instants relative to the venue's IANA
-- timezone — materialization is per-date so DST transitions land correctly (SYSTEM_DESIGN §5).
ALTER TABLE venues ADD COLUMN "Timezone" character varying(64) NOT NULL DEFAULT 'America/New_York';

-- SEO sitemap lastmod (docs/SEO.md) rides along with this phase: real modification stamps on
-- the listing aggregate. Existing rows inherit their creation time.
ALTER TABLE venues ADD COLUMN "UpdatedAtUtc" timestamp with time zone;
UPDATE venues SET "UpdatedAtUtc" = "CreatedAtUtc";
ALTER TABLE venues ALTER COLUMN "UpdatedAtUtc" SET NOT NULL;

ALTER TABLE rooms ADD COLUMN "UpdatedAtUtc" timestamp with time zone;
UPDATE rooms SET "UpdatedAtUtc" = "CreatedAtUtc";
ALTER TABLE rooms ALTER COLUMN "UpdatedAtUtc" SET NOT NULL;

-- A confirmed commitment created by approving an application (1:0..1). The schedule columns are
-- a venue-local copy of the approved application's schedule (display + renewal); the protected
-- instants live in booking_occurrences. EndDate is always set — recurrence is bounded, renewal
-- is a *new* booking (SYSTEM_DESIGN §5 invariants).
CREATE TABLE bookings (
    "Id" uuid NOT NULL,
    "ApplicationId" uuid NOT NULL,
    "RoomId" uuid NOT NULL,
    "OrganizerId" uuid NOT NULL,
    -- 0 = OneOff, 1 = Recurring.
    "Type" integer NOT NULL,
    "StartDate" date NOT NULL,
    "EndDate" date NOT NULL,
    "DayOfWeek" integer,
    "StartTime" time without time zone NOT NULL,
    "EndTime" time without time zone NOT NULL,
    -- Confirmed → Completed | Cancelled; transitions validated in the Bookings service.
    "Status" integer NOT NULL,
    "CancelledBy" uuid,
    "CancelledAtUtc" timestamp with time zone,
    "CancelReason" character varying(500),
    -- Stamped when the renewal-due nudge notification is sent (lazy, on read — no worker).
    "RenewalNudgeSentAtUtc" timestamp with time zone,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_bookings" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_bookings_applications_ApplicationId" FOREIGN KEY ("ApplicationId") REFERENCES applications ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_bookings_rooms_RoomId" FOREIGN KEY ("RoomId") REFERENCES rooms ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_bookings_users_OrganizerId" FOREIGN KEY ("OrganizerId") REFERENCES users ("Id") ON DELETE CASCADE
);

-- The finite, materialized set of UTC instants a confirmed booking occupies. RoomId is
-- denormalized so the exclusion constraint can pair it with the time range. Occurrence rows
-- exist only for confirmed bookings; applications never hold slots.
CREATE TABLE booking_occurrences (
    "Id" uuid NOT NULL,
    "BookingId" uuid NOT NULL,
    "RoomId" uuid NOT NULL,
    "StartUtc" timestamp with time zone NOT NULL,
    "EndUtc" timestamp with time zone NOT NULL,
    -- The venue-local date this occurrence renders as (avoids re-deriving across DST).
    "LocalDate" date NOT NULL,
    -- 0 = Scheduled, 1 = Occurred, 2 = NoShow, 3 = Cancelled.
    "Status" integer NOT NULL,
    "NoShowMarkedBy" uuid,
    CONSTRAINT "PK_booking_occurrences" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_booking_occurrences_bookings_BookingId" FOREIGN KEY ("BookingId") REFERENCES bookings ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_booking_occurrences_rooms_RoomId" FOREIGN KEY ("RoomId") REFERENCES rooms ("Id") ON DELETE CASCADE,
    CONSTRAINT "CK_booking_occurrences_range" CHECK ("EndUtc" > "StartUtc"),
    -- THE Phase 3 invariant: no two live occurrences of the same room may overlap in time.
    -- '[)' range semantics let back-to-back slots (…–11:00, 11:00–…) coexist. Cancelled rows
    -- (Status = 3) leave the constraint, which is exactly how cancellation frees slots.
    -- Approval inserts all occurrences in one transaction; a violation aborts the whole
    -- approval atomically → first-approval-wins for free (SYSTEM_DESIGN §5).
    CONSTRAINT "EX_booking_occurrences_no_overlap" EXCLUDE USING gist (
        "RoomId" WITH =,
        tstzrange("StartUtc", "EndUtc") WITH &&
    ) WHERE ("Status" <> 3)
);

-- One booking per application, ever (approval is idempotent at the DB level too).
CREATE UNIQUE INDEX "IX_bookings_ApplicationId" ON bookings ("ApplicationId");
-- Organizer "my bookings" and provider (via room → venue) lists, newest first.
CREATE INDEX "IX_bookings_OrganizerId_CreatedAtUtc" ON bookings ("OrganizerId", "CreatedAtUtc");
CREATE INDEX "IX_bookings_RoomId_CreatedAtUtc" ON bookings ("RoomId", "CreatedAtUtc");
-- The lazy renewal-due sweep scans confirmed bookings by their term end.
CREATE INDEX "IX_bookings_Status_EndDate" ON bookings ("Status", "EndDate");
CREATE INDEX "IX_booking_occurrences_BookingId_StartUtc" ON booking_occurrences ("BookingId", "StartUtc");
-- The listing lifecycle guard ("future confirmed occurrences?") and calendar reads.
CREATE INDEX "IX_booking_occurrences_RoomId_StartUtc" ON booking_occurrences ("RoomId", "StartUtc");
--rollback DROP TABLE booking_occurrences;
--rollback DROP TABLE bookings;
--rollback ALTER TABLE rooms DROP COLUMN "UpdatedAtUtc";
--rollback ALTER TABLE venues DROP COLUMN "UpdatedAtUtc";
--rollback ALTER TABLE venues DROP COLUMN "Timezone";
