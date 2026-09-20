--liquibase formatted sql

--changeset steeple:024-offline-booking-prices
-- Existing priced bookings used in-app collection; existing unpriced bookings stay offline.
-- Historical offline prices cannot be reconstructed from today's room rate.
ALTER TABLE bookings ADD COLUMN "InAppPayment" boolean NOT NULL DEFAULT false;
UPDATE bookings SET "InAppPayment" = true WHERE "PricePerOccurrence" IS NOT NULL;
ALTER TABLE bookings ADD CONSTRAINT "CK_bookings_InAppPayment_price"
    CHECK (NOT "InAppPayment" OR ("PricePerOccurrence" IS NOT NULL AND "Currency" IS NOT NULL));
-- Irreversible: dropping the mode would make new offline snapshots look chargeable to old code.
-- Restore a backup when rolling back the application across this migration.
