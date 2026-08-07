--liquibase formatted sql

-- Local-disk media used to persist the API's loopback origin in every photo row. Those origins
-- are machine/run details, not durable data: Vite, web nginx, Admin, and mobile now resolve the
-- same media/... path against the API/web origin they are using. CDN URLs remain absolute.

--changeset steeple:018-local-media-paths
UPDATE room_photos
SET "Url" = 'media/' || "StorageKey" || '-1600.jpg',
    "ThumbUrl" = CASE
        WHEN "ThumbUrl" IS NULL THEN NULL
        ELSE 'media/' || "StorageKey" || '-400.jpg'
    END,
    "CardUrl" = CASE
        WHEN "CardUrl" IS NULL THEN NULL
        ELSE 'media/' || "StorageKey" || '-800.jpg'
    END
WHERE "StorageKey" IS NOT NULL
  AND (
      "Url" ~* '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/media/'
      OR "Url" ~* '^https?://\[::1\](:[0-9]+)?/media/'
  );
