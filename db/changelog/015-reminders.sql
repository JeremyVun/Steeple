--liquibase formatted sql

-- Upcoming-booking reminders. A background worker nudges both parties before an occurrence
-- ("coming up" a week out, "tomorrow" the day before); this table is the sent-ledger that makes
-- the worker idempotent. The unique key on (occurrence, kind) is the guard itself, not an
-- optimisation: the worker claims a row before it dispatches, so a double run — two API replicas,
-- a restart mid-sweep, a short cadence in tests — can never send the same nudge twice.
-- Hand-maintained SQL is the source of truth; BookingReminderConfiguration mirrors it
-- column-for-column.

--changeset steeple:015-reminders
CREATE TABLE booking_reminders (
    "Id" uuid NOT NULL,
    "OccurrenceId" uuid NOT NULL,
    -- 0 = ComingUp (T-7d, first upcoming occurrence only), 1 = Tomorrow (T-1d, every occurrence).
    "Kind" integer NOT NULL,
    "SentAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_booking_reminders" PRIMARY KEY ("Id"),
    -- Cancelling a booking deletes its occurrences, and with them any claim on their reminders.
    CONSTRAINT "FK_booking_reminders_booking_occurrences_OccurrenceId" FOREIGN KEY ("OccurrenceId")
        REFERENCES booking_occurrences ("Id") ON DELETE CASCADE,
    CONSTRAINT "UQ_booking_reminders_OccurrenceId_Kind" UNIQUE ("OccurrenceId", "Kind")
);
--rollback DROP TABLE booking_reminders;
