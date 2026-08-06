--liquibase formatted sql

-- Durable operator takedowns and mock-payment cleanup. Provider Unlisted remains a reversible
-- listing state; OperatorUnlistedAtUtc is an independent operator-controlled suspension marker.

--changeset steeple:017-security-hardening
ALTER TABLE rooms ADD COLUMN "OperatorUnlistedAtUtc" timestamp with time zone;
ALTER TABLE rooms ADD COLUMN "OperatorUnlistedBy" character varying(320);
CREATE INDEX "IX_rooms_OperatorUnlistedAtUtc" ON rooms ("OperatorUnlistedAtUtc")
    WHERE "OperatorUnlistedAtUtc" IS NOT NULL;
ALTER TABLE rooms ADD CONSTRAINT "CK_rooms_operator_unlisted_not_published"
    CHECK ("Status" <> 1 OR "OperatorUnlistedAtUtc" IS NULL);

-- Synthetic provider state must not become eligible when a real payment gateway replaces mock.
-- No real adapter has existed before this changeset, so every row in these tables is synthetic;
-- failed mock charges have no ProviderPaymentId and cannot be selected safely by prefix.
DELETE FROM payments;
DELETE FROM venue_payment_accounts;
UPDATE users
SET "PaymentCustomerId" = NULL,
    "PaymentMethodBrand" = NULL,
    "PaymentMethodLast4" = NULL,
    "PaymentMethodSetAtUtc" = NULL
WHERE "PaymentCustomerId" LIKE 'cus_mock_%';

--rollback UPDATE rooms SET "OperatorUnlistedAtUtc" = NULL, "OperatorUnlistedBy" = NULL;
--rollback ALTER TABLE rooms DROP CONSTRAINT "CK_rooms_operator_unlisted_not_published";
--rollback DROP INDEX "IX_rooms_OperatorUnlistedAtUtc";
--rollback ALTER TABLE rooms DROP COLUMN "OperatorUnlistedBy";
--rollback ALTER TABLE rooms DROP COLUMN "OperatorUnlistedAtUtc";
