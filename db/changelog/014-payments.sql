--liquibase formatted sql

-- Payments rails (docs/backlog/payments.md §7, adapted for the mock-gateway era —
-- docs/contracts/payments.md). Column naming is provider-agnostic (ProviderAccountId,
-- ProviderPaymentId, PaymentCustomerId): the mock adapter and the later Stripe adapter share
-- the same schema. NO card data is ever stored — brand + last4 are display data only; payment
-- identity lives with the provider (Stripe at Stripe-time; synthetic ids under the mock).
-- webhook_events (payments.md §7) is deliberately absent: the mock has no webhooks — it is a
-- Stripe-time addition recorded in docs/contracts/payments.md.

--changeset steeple:014-payments
-- Payout-side state per venue (payments.md §4). One row per venue that started onboarding.
CREATE TABLE venue_payment_accounts (
    "VenueId" uuid NOT NULL,
    "ProviderAccountId" character varying(255) NOT NULL,
    "DetailsSubmitted" boolean NOT NULL DEFAULT false,
    "ChargesEnabled" boolean NOT NULL DEFAULT false,
    "PayoutsEnabled" boolean NOT NULL DEFAULT false,
    -- Explicit host opt-in, separate from provider-side readiness (KYC completion must never
    -- silently flip live bookings to in-app payment).
    "OptedInAtUtc" timestamp with time zone,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "UpdatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_venue_payment_accounts" PRIMARY KEY ("VenueId"),
    CONSTRAINT "FK_venue_payment_accounts_venues_VenueId" FOREIGN KEY ("VenueId") REFERENCES venues ("Id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "IX_venue_payment_accounts_ProviderAccountId" ON venue_payment_accounts ("ProviderAccountId");

-- Guest-side payment identity: the provider customer id plus a display cache of the saved
-- default method (brand/last4 ONLY — never a PAN; the provider is the method's system of record).
ALTER TABLE users ADD COLUMN "PaymentCustomerId" character varying(255);
ALTER TABLE users ADD COLUMN "PaymentMethodBrand" character varying(20);
ALTER TABLE users ADD COLUMN "PaymentMethodLast4" character varying(4);
ALTER TABLE users ADD COLUMN "PaymentMethodSetAtUtc" timestamp with time zone;

-- Price snapshot written at confirmation (booking-modes.md charge timing): room pricePerHour ×
-- schedule duration, frozen for the booking's life. BOTH null = legacy/offline booking created
-- before the payments rails (nothing charges).
ALTER TABLE bookings ADD COLUMN "PricePerOccurrence" numeric(12,2);
ALTER TABLE bookings ADD COLUMN "Currency" character varying(3);

-- One row per charge/refund attempt on an occurrence. Failed attempts are superseded, never
-- deleted — the partial unique index below is what makes double-charging impossible even under
-- concurrent sweepers (claim the occurrence with a Pending row first, then call the gateway).
CREATE TABLE payments (
    "Id" uuid NOT NULL,
    "OccurrenceId" uuid NOT NULL,
    "BookingId" uuid NOT NULL,
    "Amount" numeric(12,2) NOT NULL,
    "Currency" character varying(3) NOT NULL,
    -- The platform's cut, declared on the charge (0 under the mock; real at Stripe-time).
    "ApplicationFee" numeric(12,2) NOT NULL DEFAULT 0,
    "ProviderPaymentId" character varying(255),
    -- 0 = Pending, 1 = RequiresAction, 2 = Succeeded, 3 = Failed, 4 = Refunded, 5 = Disputed.
    "Status" integer NOT NULL,
    "FailureCode" character varying(100),
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "UpdatedAtUtc" timestamp with time zone NOT NULL,
    "RefundedAtUtc" timestamp with time zone,
    CONSTRAINT "PK_payments" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_payments_booking_occurrences_OccurrenceId" FOREIGN KEY ("OccurrenceId") REFERENCES booking_occurrences ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_payments_bookings_BookingId" FOREIGN KEY ("BookingId") REFERENCES bookings ("Id") ON DELETE CASCADE
);

-- THE payments invariant: at most one live (non-failed) payment per occurrence. A second
-- concurrent claim hits this index and loses; failed attempts fall out of the predicate so a
-- retry can claim again. Combined with idempotency key = occurrence id at the gateway,
-- double-charging is impossible by construction (payments.md §13).
CREATE UNIQUE INDEX "UX_payments_OccurrenceId_live" ON payments ("OccurrenceId") WHERE ("Status" <> 3);
CREATE INDEX "IX_payments_BookingId" ON payments ("BookingId");
CREATE UNIQUE INDEX "IX_payments_ProviderPaymentId" ON payments ("ProviderPaymentId") WHERE ("ProviderPaymentId" IS NOT NULL);
--rollback DROP TABLE payments;
--rollback ALTER TABLE bookings DROP COLUMN "Currency";
--rollback ALTER TABLE bookings DROP COLUMN "PricePerOccurrence";
--rollback ALTER TABLE users DROP COLUMN "PaymentMethodSetAtUtc";
--rollback ALTER TABLE users DROP COLUMN "PaymentMethodLast4";
--rollback ALTER TABLE users DROP COLUMN "PaymentMethodBrand";
--rollback ALTER TABLE users DROP COLUMN "PaymentCustomerId";
--rollback DROP TABLE venue_payment_accounts;
