--liquibase formatted sql

--changeset steeple:022-notification-stream splitStatements:false
CREATE FUNCTION notify_notification_inserted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_notify('steeple_notifications', NEW."UserId"::text);
    RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_notify_insert
AFTER INSERT ON notifications
FOR EACH ROW
EXECUTE FUNCTION notify_notification_inserted();

--rollback DROP TRIGGER notifications_notify_insert ON notifications;
--rollback DROP FUNCTION notify_notification_inserted();
