--liquibase formatted sql

-- Supporting indexes for DataRetentionWorker's global, oldest-first bounded scans. Existing
-- operational indexes lead with owner/application keys, while the notification-outbox due index
-- deliberately excludes the terminal rows retention removes.

--changeset steeple:021-data-retention-indexes
CREATE INDEX "IX_refresh_tokens_RetentionRevoked"
    ON refresh_tokens ("RevokedAtUtc", "Id")
    WHERE "RevokedAtUtc" IS NOT NULL;
CREATE INDEX "IX_refresh_tokens_RetentionExpired"
    ON refresh_tokens ("ExpiresAtUtc", "Id")
    WHERE "RevokedAtUtc" IS NULL;

CREATE INDEX "IX_notifications_Retention"
    ON notifications ("CreatedAtUtc", "Id");
CREATE INDEX "IX_idempotency_records_Retention"
    ON idempotency_records ("CreatedAtUtc", "UserId", "Scope", "Key");

CREATE INDEX "IX_applications_Retention"
    ON applications ("CreatedAtUtc", "Id");
CREATE INDEX "IX_application_messages_Retention"
    ON application_messages ("SentAtUtc", "Id");
CREATE INDEX "IX_application_counter_offers_RetentionMessage"
    ON application_counter_offers ("CreatedAtUtc", "Id")
    WHERE "Message" IS NOT NULL;
CREATE INDEX "IX_bookings_RetentionCancelReason"
    ON bookings ("CancelledAtUtc", "Id")
    WHERE "CancelReason" IS NOT NULL;

CREATE INDEX "IX_notification_outbox_RetentionDelivered"
    ON notification_outbox ("DeliveredAtUtc", "Id")
    WHERE "DeliveredAtUtc" IS NOT NULL;
CREATE INDEX "IX_notification_outbox_RetentionFailed"
    ON notification_outbox ("FailedAtUtc", "Id")
    WHERE "FailedAtUtc" IS NOT NULL;

--rollback DROP INDEX "IX_notification_outbox_RetentionFailed";
--rollback DROP INDEX "IX_notification_outbox_RetentionDelivered";
--rollback DROP INDEX "IX_bookings_RetentionCancelReason";
--rollback DROP INDEX "IX_application_counter_offers_RetentionMessage";
--rollback DROP INDEX "IX_application_messages_Retention";
--rollback DROP INDEX "IX_applications_Retention";
--rollback DROP INDEX "IX_idempotency_records_Retention";
--rollback DROP INDEX "IX_notifications_Retention";
--rollback DROP INDEX "IX_refresh_tokens_RetentionExpired";
--rollback DROP INDEX "IX_refresh_tokens_RetentionRevoked";
