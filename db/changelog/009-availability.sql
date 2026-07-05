--liquibase formatted sql

-- Availability uplift (SYSTEM_DESIGN §17): rooms gain host-declared open hours and blackout
-- dates, and applications gain host counter-offers. Open hours and blackouts are *soft* rules —
-- the booking_occurrences exclusion constraint (005) remains the only authority on
-- double-booking; everything here feeds advisory computation and submit-time validation.
-- Hand-maintained SQL is the source of truth; EF configurations mirror column-for-column.

--changeset steeple:009-open-hours
-- Weekly open windows, venue-local wall clock. Multiple windows per weekday are allowed
-- (e.g. morning + evening); intra-day overlap is rejected by the Manage service (replace-all
-- PUT, single writer per room) — Postgres has no native range type over "time", and an
-- expression exclusion constraint isn't worth the complexity for an advisory table.
CREATE TABLE room_open_hours (
    "Id" uuid NOT NULL,
    "RoomId" uuid NOT NULL,
    -- .NET DayOfWeek int: 0 = Sunday … 6 = Saturday (same convention as applications/bookings).
    "DayOfWeek" integer NOT NULL,
    "StartTime" time without time zone NOT NULL,
    "EndTime" time without time zone NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_room_open_hours" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_room_open_hours_rooms_RoomId" FOREIGN KEY ("RoomId") REFERENCES rooms ("Id") ON DELETE CASCADE,
    -- Windows never cross midnight in v1 (a booking still may; that reads as advisory noise).
    CONSTRAINT "CK_room_open_hours_range" CHECK ("EndTime" > "StartTime"),
    CONSTRAINT "CK_room_open_hours_day" CHECK ("DayOfWeek" BETWEEN 0 AND 6)
);
-- Availability reads and the time-first search prefilter join on (room, weekday).
CREATE INDEX "IX_room_open_hours_RoomId_DayOfWeek" ON room_open_hours ("RoomId", "DayOfWeek");

-- Whole venue-local dates a room is closed regardless of open hours (holidays, own events).
CREATE TABLE room_blackout_dates (
    "Id" uuid NOT NULL,
    "RoomId" uuid NOT NULL,
    "Date" date NOT NULL,
    "Reason" character varying(200),
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_room_blackout_dates" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_room_blackout_dates_rooms_RoomId" FOREIGN KEY ("RoomId") REFERENCES rooms ("Id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "IX_room_blackout_dates_RoomId_Date" ON room_blackout_dates ("RoomId", "Date");
--rollback DROP TABLE room_blackout_dates;
--rollback DROP TABLE room_open_hours;

--changeset steeple:009-open-hours-backfill
-- Publishing requires open hours from this phase on. Every already-Published room gets a
-- generous default (daily 08:00–22:00) so nothing unpublishes and the gate is instantly
-- satisfied; the founder tightens per room via Manage. Draft/Unlisted rooms set theirs
-- before (re)publishing.
INSERT INTO room_open_hours ("Id", "RoomId", "DayOfWeek", "StartTime", "EndTime", "CreatedAtUtc")
SELECT gen_random_uuid(), r."Id", d.dow, TIME '08:00', TIME '22:00', now()
FROM rooms r
CROSS JOIN generate_series(0, 6) AS d(dow)
WHERE r."Status" = 1; -- Published
--rollback DELETE FROM room_open_hours;

--changeset steeple:009-counter-offers
-- A venue manager's alternative schedule proposed on a pending application. A separate table
-- (not columns on applications) because counters can be superseded and the thread wants
-- history. Accepting runs the normal booking transaction on the counter schedule — the
-- exclusion constraint still arbitrates races.
CREATE TABLE application_counter_offers (
    "Id" uuid NOT NULL,
    "ApplicationId" uuid NOT NULL,
    "ProposedByUserId" uuid NOT NULL,
    -- Venue-local counter schedule, same shape as applications. 0 = OneOff, 1 = RecurringWeekly.
    "Frequency" integer NOT NULL,
    "StartDate" date NOT NULL,
    "EndDate" date,
    -- Bit n = .NET DayOfWeek n (Sunday = bit 0); null for one-off schedules.
    "DaysOfWeekMask" integer,
    "StartTime" time without time zone NOT NULL,
    "EndTime" time without time zone NOT NULL,
    "Message" character varying(2000),
    -- 0 = Open, 1 = Accepted, 2 = DeclinedByOrganizer, 3 = Superseded, 4 = Lapsed.
    "Status" integer NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "RespondedAtUtc" timestamp with time zone,
    CONSTRAINT "PK_application_counter_offers" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_application_counter_offers_applications_ApplicationId" FOREIGN KEY ("ApplicationId") REFERENCES applications ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_application_counter_offers_users_ProposedByUserId" FOREIGN KEY ("ProposedByUserId") REFERENCES users ("Id") ON DELETE CASCADE,
    CONSTRAINT "CK_application_counter_offers_range" CHECK ("EndTime" > "StartTime")
);
-- At most one live counter per application; superseded/answered rows keep the thread honest.
CREATE UNIQUE INDEX "IX_application_counter_offers_ApplicationId_Open"
    ON application_counter_offers ("ApplicationId") WHERE "Status" = 0;
CREATE INDEX "IX_application_counter_offers_ApplicationId_CreatedAtUtc"
    ON application_counter_offers ("ApplicationId", "CreatedAtUtc");
--rollback DROP TABLE application_counter_offers;
