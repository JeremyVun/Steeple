--liquibase formatted sql

-- Free listings are removed from the product (SYSTEM_DESIGN §17): every room carries a
-- required positive hourly price. Seeded free rooms are repriced first, then the column
-- tightens to NOT NULL + CHECK (> 0) so the invariant is DB-enforced like the rest of the
-- booking integrity rules. Application-level validation mirrors this in ManageService.

--changeset steeple:010-reprice-free-rooms
UPDATE rooms SET
    "PricePerHour" = 15.00,
    "Description" = 'A carpeted multipurpose room ideal for children''s programs, tutoring, and small group activities.'
WHERE "Id" = '10000000-0000-0000-0000-000000000002';

UPDATE rooms SET
    "PricePerHour" = 20.00,
    "Description" = 'A calm, light-filled room overlooking the church garden — a natural fit for support groups and small community meetings.'
WHERE "Id" = '20000000-0000-0000-0000-000000000002';

UPDATE rooms SET
    "PricePerHour" = 18.00,
    "Description" = 'Cozy lounge with comfortable seating and a coffee station — a favorite of neighborhood associations and support groups.'
WHERE "Id" = '40000000-0000-0000-0000-000000000002';

-- Safety net for any non-seed rows created before this changeset ran.
UPDATE rooms SET "PricePerHour" = 15.00 WHERE "PricePerHour" IS NULL OR "PricePerHour" <= 0;

--changeset steeple:010-price-not-null
ALTER TABLE rooms ALTER COLUMN "PricePerHour" SET NOT NULL;
ALTER TABLE rooms ADD CONSTRAINT rooms_price_per_hour_positive CHECK ("PricePerHour" > 0);
