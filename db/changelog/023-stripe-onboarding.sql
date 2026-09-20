--liquibase formatted sql

--changeset steeple:023-stripe-onboarding
ALTER TABLE venue_payment_accounts ALTER COLUMN "ProviderAccountId" DROP NOT NULL;
ALTER TABLE venue_payment_accounts ADD COLUMN "ProvisioningKey" uuid;
UPDATE venue_payment_accounts SET "ProvisioningKey" = "VenueId" WHERE "ProvisioningKey" IS NULL;
ALTER TABLE venue_payment_accounts ALTER COLUMN "ProvisioningKey" SET NOT NULL;
ALTER TABLE venue_payment_accounts ADD COLUMN "Provider" character varying(20) NOT NULL DEFAULT 'mock';
ALTER TABLE venue_payment_accounts ADD COLUMN "RequirementsDue" text[] NOT NULL DEFAULT '{}';
ALTER TABLE venue_payment_accounts ADD COLUMN "DisabledReason" character varying(255);
CREATE UNIQUE INDEX "IX_venue_payment_accounts_ProvisioningKey" ON venue_payment_accounts ("ProvisioningKey");

CREATE TABLE payment_webhook_events (
    "Source" character varying(20) NOT NULL,
    "ProviderEventId" character varying(255) NOT NULL,
    "Type" character varying(100) NOT NULL,
    "ProviderAccountId" character varying(255),
    "ProviderObjectId" character varying(255),
    "ReceivedAtUtc" timestamp with time zone NOT NULL,
    "ProcessedAtUtc" timestamp with time zone,
    "Attempts" integer NOT NULL DEFAULT 0,
    "LastError" character varying(255),
    CONSTRAINT "PK_payment_webhook_events" PRIMARY KEY ("Source", "ProviderEventId")
);
CREATE INDEX "IX_payment_webhook_events_ProcessedAtUtc" ON payment_webhook_events ("ProcessedAtUtc");

--rollback DROP TABLE payment_webhook_events;
--rollback DROP INDEX "IX_venue_payment_accounts_ProvisioningKey";
--rollback ALTER TABLE venue_payment_accounts DROP COLUMN "DisabledReason";
--rollback ALTER TABLE venue_payment_accounts DROP COLUMN "RequirementsDue";
--rollback ALTER TABLE venue_payment_accounts DROP COLUMN "ProvisioningKey";
--rollback ALTER TABLE venue_payment_accounts DROP COLUMN "Provider";
--rollback DELETE FROM venue_payment_accounts WHERE "ProviderAccountId" IS NULL;
--rollback ALTER TABLE venue_payment_accounts ALTER COLUMN "ProviderAccountId" SET NOT NULL;
