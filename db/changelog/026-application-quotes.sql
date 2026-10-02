--liquibase formatted sql

--changeset steeple:026-application-quotes
-- Existing applications and bookings deliberately remain legacy: no past room rate or rules are
-- inferred. A pending legacy application must be reviewed and resubmitted before confirmation.
ALTER TABLE applications
    ADD COLUMN "QuotedPricePerHour" numeric(12,2),
    ADD COLUMN "QuotedCurrency" varchar(3),
    ADD COLUMN "QuotedHouseRules" text;

ALTER TABLE bookings
    ADD COLUMN "QuotedPricePerHour" numeric(12,2),
    ADD COLUMN "QuotedHouseRules" text;
