--liquibase formatted sql

-- Booking modes (docs/backlog/booking-modes.md, adopted 2026-08-05): instant book is the
-- product default; request→approve survives as a per-venue host choice. The mode lives on the
-- venue (host-level trust posture, not a per-room switch) and is read at submit time.

--changeset steeple:013-booking-modes
-- 0 = Instant (default — existing seed venues become instant-book), 1 = Manual.
ALTER TABLE venues ADD COLUMN "BookingMode" integer NOT NULL DEFAULT 0;
--rollback ALTER TABLE venues DROP COLUMN "BookingMode";
