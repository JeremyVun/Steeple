--liquibase formatted sql
--changeset steeple:025-availability-configured
ALTER TABLE rooms ADD COLUMN "AvailabilityConfiguredAtUtc" timestamptz;
UPDATE rooms r SET "AvailabilityConfiguredAtUtc" = r."UpdatedAtUtc"
WHERE EXISTS (SELECT 1 FROM room_open_hours h WHERE h."RoomId" = r."Id")
   OR EXISTS (SELECT 1 FROM room_blackout_dates b WHERE b."RoomId" = r."Id");
