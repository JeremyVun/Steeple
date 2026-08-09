--liquibase formatted sql

-- Durable email/push delivery. NotificationDispatcher writes these rows in the same database
-- transaction as the inbox rows; NotificationOutboxWorker leases due work before calling a
-- provider. A crashed worker leaves the row due again after its lease instead of losing it.

--changeset steeple:020-notification-outbox
CREATE TABLE notification_outbox (
    "Id" uuid NOT NULL,
    -- 0 = Email, 1 = Push.
    "Channel" integer NOT NULL,
    -- NotificationType integer; retained for operational filtering without opening PayloadJson.
    "Kind" integer NOT NULL,
    "PayloadJson" jsonb NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "Attempts" integer NOT NULL DEFAULT 0,
    "NextAttemptAtUtc" timestamp with time zone NOT NULL,
    "LastError" character varying(2000),
    "DeliveredAtUtc" timestamp with time zone,
    "FailedAtUtc" timestamp with time zone,
    CONSTRAINT "PK_notification_outbox" PRIMARY KEY ("Id"),
    CONSTRAINT "CK_notification_outbox_Channel" CHECK ("Channel" IN (0, 1)),
    CONSTRAINT "CK_notification_outbox_Attempts" CHECK ("Attempts" >= 0),
    CONSTRAINT "CK_notification_outbox_TerminalState" CHECK (
        NOT ("DeliveredAtUtc" IS NOT NULL AND "FailedAtUtc" IS NOT NULL)
    )
);

CREATE INDEX "IX_notification_outbox_Due"
    ON notification_outbox ("NextAttemptAtUtc", "CreatedAtUtc", "Id")
    WHERE "DeliveredAtUtc" IS NULL AND "FailedAtUtc" IS NULL;

--rollback DROP TABLE notification_outbox;
